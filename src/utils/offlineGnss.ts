/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resilient Offline Hardware GNSS Engine (Zero-Internet Forest Satellite Lock).
 *
 * Why standard browser watchPosition fails offline in forests:
 * 1. Online devices use A-GPS / Cell / Wi-Fi (~2s fix). Offline devices must acquire
 *    raw GPS / GLONASS / NavIC / Galileo satellites from hardware GNSS, which takes 20–60s
 *    under forest canopy.
 * 2. Short timeouts (10–15s) fire TIMEOUT (code 3) before satellites lock.
 * 3. Android Chrome often emits a transient POSITION_UNAVAILABLE (code 2) when mobile data
 *    is off and Fused Location falls back from network to hardware GNSS.
 * 4. Stopping watchPosition on code 2 / code 3 powers off the GNSS chip before it locks.
 *
 * This engine keeps the hardware GNSS chip continuously powered & auto-recovers on
 * transient errors, screen wake-ups, and offline cold starts — only stopping on explicit
 * user stop or PERMISSION_DENIED (code 1).
 */

import { ensureNativeLocationPermission, isNativeAndroidApp } from './nativeBridge';

export interface OfflineGnssFix {
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  isCachedBootstrap: boolean;
}

export interface OfflineGnssStatus {
  state: 'searching' | 'locked' | 'retrying' | 'permission_denied' | 'unsupported';
  isOffline: boolean;
  elapsedSearchSec: number;
  retryCount: number;
  lastErrorCode?: number;
}

export interface ResilientGnssWatchOptions {
  onFix: (fix: OfflineGnssFix) => void;
  onStatus?: (status: OfflineGnssStatus) => void;
  onPermissionDenied?: () => void;
  /** Allow an immediate cached/coarse OS position while waiting for the first high-accuracy satellite lock */
  allowCachedBootstrap?: boolean;
}

export interface ResilientGnssHandle {
  stop: () => void;
  forceRetry: () => void;
}

let latestHardwareFix: OfflineGnssFix | null = null;

/**
 * Returns the freshest hardware GNSS fix captured recently (default within 15s),
 * allowing instant offline corner pinning / pillar stamping without waiting for a cold getCurrentPosition().
 */
export function getRecentGnssFix(maxAgeMs = 15000): OfflineGnssFix | null {
  if (!latestHardwareFix) return null;
  if (Date.now() - latestHardwareFix.timestamp > maxAgeMs) return null;
  return latestHardwareFix;
}

function toFix(pos: GeolocationPosition, isCachedBootstrap = false): OfflineGnssFix {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 50,
    altitude: typeof pos.coords.altitude === 'number' && Number.isFinite(pos.coords.altitude)
      ? pos.coords.altitude
      : null,
    heading: typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
      ? pos.coords.heading
      : null,
    speed: typeof pos.coords.speed === 'number' && Number.isFinite(pos.coords.speed)
      ? pos.coords.speed
      : null,
    timestamp: pos.timestamp || Date.now(),
    isCachedBootstrap
  };
}

/**
 * Starts a resilient, offline-safe hardware GNSS watch that works with ZERO internet
 * (even in Airplane Mode with Device Location/GPS turned ON).
 */
export function startResilientGnssWatch(options: ResilientGnssWatchOptions): ResilientGnssHandle {
  const { onFix, onStatus, onPermissionDenied, allowCachedBootstrap = true } = options;

  const isOfflineNow = typeof navigator !== 'undefined' ? !navigator.onLine : true;

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onStatus?.({
      state: 'unsupported',
      isOffline: isOfflineNow,
      elapsedSearchSec: 0,
      retryCount: 0
    });
    return { stop: () => {}, forceRetry: () => {} };
  }

  let stopped = false;
  let watchId: number | null = null;
  let retryTimerId: number | null = null;
  let tickerId: number | null = null;
  let hasRealHighAccFix = false;
  let lastFixReceivedAt = 0;
  let retryCount = 0;
  const startedAt = Date.now();

  const emitStatus = (
    state: OfflineGnssStatus['state'],
    lastErrorCode?: number
  ) => {
    if (stopped) return;
    onStatus?.({
      state,
      isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
      elapsedSearchSec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      retryCount,
      lastErrorCode
    });
  };

  const clearCurrentWatch = () => {
    if (watchId !== null) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // Ignore browser clearWatch errors
      }
      watchId = null;
    }
    if (retryTimerId !== null) {
      window.clearTimeout(retryTimerId);
      retryTimerId = null;
    }
  };

  const bindHardwareWatch = () => {
    if (stopped) return;
    clearCurrentWatch();

    emitStatus(retryCount > 0 ? 'retrying' : 'searching');

    // Primary Hardware GNSS Watch:
    // - enableHighAccuracy: true forces direct GPS/GLONASS/NavIC satellite chip usage (works 100% offline!)
    // - timeout: 60000 gives cold-start forest satellite lock a full 60s window per cycle
    // - maximumAge: 5000 lets Android hand over a warm hardware satellite fix immediately instead of re-warming
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (stopped) return;
        hasRealHighAccFix = true;
        lastFixReceivedAt = Date.now();
        retryCount = 0;
        const fix = toFix(pos, false);
        latestHardwareFix = fix;
        emitStatus('locked');
        onFix(fix);
      },
      (err) => {
        if (stopped) return;

        // Only PERMISSION_DENIED (code 1) is fatal — stop immediately and inform user.
        if (err.code === 1) {
          stopped = true;
          clearCurrentWatch();
          if (tickerId !== null) {
            window.clearInterval(tickerId);
            tickerId = null;
          }
          emitStatus('permission_denied', 1);
          onPermissionDenied?.();
          return;
        }

        // For POSITION_UNAVAILABLE (code 2) or TIMEOUT (code 3):
        // DO NOT KILL GPS! This is completely normal offline while hardware GNSS acquires satellites.
        // Re-bind the watcher smoothly after a short backoff so Android's GNSS radio stays awake.
        retryCount += 1;
        emitStatus('retrying', err.code);
        clearCurrentWatch();
        const backoffMs = Math.min(4000, 1200 + retryCount * 400);
        retryTimerId = window.setTimeout(() => {
          if (!stopped) {
            bindHardwareWatch();
          }
        }, backoffMs);
      },
      {
        enableHighAccuracy: true,
        timeout: 60000,
        maximumAge: 5000
      }
    );
  };

  // Optional non-blocking bootstrap probe: if OS already has a recent cached GNSS position
  // (e.g. from 10–90 seconds ago before entering thick canopy), show it immediately while
  // the primary high-accuracy satellite watcher continues locking live satellites.
  if (allowCachedBootstrap) {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (stopped || hasRealHighAccFix) return;
          const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 999;
          // Only accept reasonable cached fixes (<= 80m) so wildly stale cell locations aren't shown
          if (acc <= 80) {
            const fix = toFix(pos, true);
            if (!latestHardwareFix) {
              latestHardwareFix = fix;
            }
            lastFixReceivedAt = Date.now();
            onFix(fix);
          }
        },
        () => {
          // Completely ignore bootstrap errors — primary hardware GNSS watcher is already running
        },
        {
          enableHighAccuracy: false,
          maximumAge: 120000,
          timeout: 8000
        }
      );
    } catch {
      // Ignore
    }
  }

  // Start primary hardware satellite watch immediately (requesting native Android runtime permission first if inside APK)
  if (isNativeAndroidApp()) {
    void ensureNativeLocationPermission().then((granted) => {
      if (stopped) return;
      if (!granted) {
        stopped = true;
        clearCurrentWatch();
        if (tickerId !== null) {
          window.clearInterval(tickerId);
          tickerId = null;
        }
        emitStatus('permission_denied', 1);
        onPermissionDenied?.();
        return;
      }
      bindHardwareWatch();
    });
  } else {
    bindHardwareWatch();
  }

  // Keep UI elapsed-search timer ticking every second until first lock, and detect OS stalls
  tickerId = window.setInterval(() => {
    if (stopped) return;
    if (!hasRealHighAccFix) {
      emitStatus(retryCount > 0 ? 'retrying' : 'searching');
    } else if (lastFixReceivedAt > 0 && Date.now() - lastFixReceivedAt > 25000) {
      // If Android silently paused GNSS callbacks (e.g. power-save dip), gently re-bind
      retryCount += 1;
      bindHardwareWatch();
    }
  }, 1500);

  // Re-bind GNSS cleanly whenever officer wakes their phone screen back up in the forest
  const handleVisibility = () => {
    if (stopped || document.visibilityState !== 'visible') return;
    if (!hasRealHighAccFix || Date.now() - lastFixReceivedAt > 12000) {
      bindHardwareWatch();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Immediately reflect network transitions when walking into/out of forest mobile coverage
  const handleNetworkChange = () => {
    if (stopped) return;
    emitStatus(hasRealHighAccFix ? 'locked' : (retryCount > 0 ? 'retrying' : 'searching'));
  };
  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);

  return {
    stop: () => {
      stopped = true;
      clearCurrentWatch();
      if (tickerId !== null) {
        window.clearInterval(tickerId);
        tickerId = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    },
    forceRetry: () => {
      if (stopped) return;
      retryCount = 0;
      bindHardwareWatch();
    }
  };
}

/**
 * Offline-safe single-point GNSS capture (for Pin Corner / Add Road Point):
 * 1. If a fresh live hardware fix (< 8s old) already exists from the active watcher, returns it INSTANTLY!
 * 2. Otherwise waits up to 35s with hardware GNSS (`enableHighAccuracy: true, maximumAge: 10000`),
 *    falling back cleanly to a cached fix if timed out.
 */
export function getOfflineSafeCurrentFix(
  maxCachedAgeMs = 8000
): Promise<OfflineGnssFix> {
  const recent = getRecentGnssFix(maxCachedAgeMs);
  if (recent && !recent.isCachedBootstrap) {
    return Promise.resolve(recent);
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const runFix = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix = toFix(pos, false);
          latestHardwareFix = fix;
          resolve(fix);
        },
        (err) => {
          // If permission denied, propagate immediately
          if (err.code === 1) {
            reject(err);
            return;
          }
          // Fallback: try slightly older cached OS fix before failing
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              const fix = toFix(fallbackPos, true);
              resolve(fix);
            },
            () => reject(err),
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
          );
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 35000 }
      );
    };

    if (isNativeAndroidApp()) {
      void ensureNativeLocationPermission().then((granted) => {
        if (!granted) {
          reject(Object.assign(new Error('Location permission denied'), { code: 1 }));
          return;
        }
        runFix();
      });
    } else {
      runFix();
    }
  });
}
