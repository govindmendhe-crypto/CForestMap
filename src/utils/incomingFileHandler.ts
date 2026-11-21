/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Incoming External Map File Handler for Installed PWA:
 * 1. Web Share Target API (WhatsApp -> Share -> TreatmentMap) via CacheStorage handoff
 * 2. PWA File Handling API (WhatsApp / Files -> Open With -> TreatmentMap) via window.launchQueue
 *
 * Also auto-detects KMZ (ZIP magic header PK\x03\x04) or KML (<kml) if WhatsApp strips the file extension.
 */

const SHARED_FILES_CACHE = 'forest-shared-files-v1';
const SHARED_FILE_KEY = '/__shared_map_file__';

interface LaunchParamsLike {
  files?: Array<{
    getFile: () => Promise<File>;
  }>;
}

interface LaunchQueueLike {
  setConsumer: (consumer: (launchParams: LaunchParamsLike) => void) => void;
}

declare global {
  interface Window {
    launchQueue?: LaunchQueueLike;
  }
}

/**
 * Ensures files coming from WhatsApp content URIs (which sometimes lack a .kmz/.kml extension)
 * get the proper extension based on binary magic bytes or XML/JSON header sniffing.
 */
async function normalizeIncomingMapFile(file: File): Promise<File> {
  const lower = (file.name || '').toLowerCase();
  if (
    lower.endsWith('.kmz') ||
    lower.endsWith('.kml') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.json') ||
    lower.endsWith('.geojson') ||
    lower.endsWith('.gpx')
  ) {
    return file;
  }

  try {
    const headBuf = await file.slice(0, 512).arrayBuffer();
    const bytes = new Uint8Array(headBuf);
    const baseName = (file.name || 'WhatsApp_Map').replace(/[^\w\d\u0900-\u097F-_ ]/g, '_').trim() || 'WhatsApp_Map';

    // PK\x03\x04 ZIP header -> KMZ (Google Earth compressed archive)
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return new File([file], `${baseName}.kmz`, { type: 'application/vnd.google-earth.kmz' });
    }

    const headText = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim().toLowerCase();
    if (headText.includes('<kml') || (headText.startsWith('<?xml') && !headText.includes('<gpx'))) {
      return new File([file], `${baseName}.kml`, { type: 'application/vnd.google-earth.kml+xml' });
    }
    if (headText.includes('<gpx')) {
      return new File([file], `${baseName}.gpx`, { type: 'application/gpx+xml' });
    }
    if (headText.startsWith('{')) {
      return new File([file], `${baseName}.json`, { type: 'application/json' });
    }
  } catch {
    // Fallback to original file
  }

  return file;
}

/**
 * Reads and consumes a map file queued in CacheStorage by sw-share-target.js.
 */
export async function consumePendingSharedMapFile(): Promise<File | null> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARED_FILES_CACHE);
    const response = await cache.match(SHARED_FILE_KEY);
    if (!response) return null;

    const blob = await response.blob();
    const rawHeader = response.headers.get('X-Shared-Filename') || 'WhatsApp_Map.kmz';
    let filename = 'WhatsApp_Map.kmz';
    try {
      filename = decodeURIComponent(rawHeader);
    } catch {
      filename = rawHeader;
    }

    await cache.delete(SHARED_FILE_KEY);

    // Strip ?shared=1 query param cleanly without reloading
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('shared') || url.searchParams.has('openfile')) {
        url.searchParams.delete('shared');
        url.searchParams.delete('openfile');
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      }
    } catch {
      // Ignore history API restrictions
    }

    const rawFile = new File([blob], filename, {
      type: response.headers.get('Content-Type') || 'application/octet-stream'
    });
    return await normalizeIncomingMapFile(rawFile);
  } catch {
    return null;
  }
}

/**
 * Subscribes to ALL incoming OS file launch mechanisms:
 * - Immediate check of Share Target CacheStorage (for cold launch from WhatsApp Share)
 * - Service Worker postMessage (for warm launch when app is already open)
 * - window.launchQueue (for "Open With -> TreatmentMap" via PWA File Handling API)
 */
export function registerIncomingMapFileListeners(
  onFileReceived: (file: File, origin: 'share_target' | 'file_handler') => void
): () => void {
  let disposed = false;

  const checkSharedCache = async () => {
    const file = await consumePendingSharedMapFile();
    if (!disposed && file) {
      onFileReceived(file, 'share_target');
    }
  };

  // 1. Check immediately on startup (covers cold launch from WhatsApp -> Share)
  checkSharedCache();

  // 2. Listen for warm handoff messages from sw-share-target.js
  const handleSwMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'SHARED_MAP_FILE_READY') {
      checkSharedCache();
    }
  };
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
  }

  // 3. Also re-check when app returns to foreground (e.g. Android focus-existing)
  const handleFocusOrVisible = () => {
    if (document.visibilityState === 'visible') {
      checkSharedCache();
    }
  };
  document.addEventListener('visibilitychange', handleFocusOrVisible);

  // 4. Register PWA File Handling API consumer ("Open With -> TreatmentMap")
  if (typeof window !== 'undefined' && window.launchQueue && typeof window.launchQueue.setConsumer === 'function') {
    try {
      window.launchQueue.setConsumer(async (launchParams) => {
        if (disposed || !launchParams?.files?.length) return;
        for (const handle of launchParams.files) {
          try {
            const rawFile = await handle.getFile();
            const normalized = await normalizeIncomingMapFile(rawFile);
            if (!disposed) {
              onFileReceived(normalized, 'file_handler');
            }
            break; // Open the selected map file
          } catch {
            // Skip unreadable handle
          }
        }
      });
    } catch {
      // Ignore if launchQueue unavailable
    }
  }

  return () => {
    disposed = true;
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
    document.removeEventListener('visibilitychange', handleFocusOrVisible);
  };
}
