/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Capacitor Native Android Bridge.
 *
 * When running inside the compiled Android APK / Play Store AAB (Capacitor),
 * this bridge routes file downloads, WhatsApp/system sharing, GPS permissions,
 * and status bar styling through native Android APIs while keeping 100%
 * identical standard browser behavior on Web / PWA.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Geolocation } from '@capacitor/geolocation';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Configures native Android status bar appearance on app startup.
 */
export async function initNativeAndroidShell(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await StatusBar.setBackgroundColor({ color: '#064e3b' });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Non-fatal if status bar plugin is unavailable
  }
}

/**
 * Prompts Android's native runtime Location permission dialog if not yet granted.
 * Returns true when location is allowed or when running on Web (where browser handles it).
 */
export async function ensureNativeLocationPermission(): Promise<boolean> {
  if (!isNativeAndroidApp()) return true;
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted' || status.coarseLocation === 'granted') {
      return true;
    }
    const requested = await Geolocation.requestPermissions();
    return requested.location === 'granted' || requested.coarseLocation === 'granted';
  } catch {
    // Fall back to WebView geolocation prompt
    return true;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file data'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || `forest_map_${Date.now()}`;
}

function triggerWebBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Saves or shares a generated Blob (PDF, KMZ, JSON, ZIP).
 * - On Web/PWA: triggers normal browser download.
 * - On Native Android APK: writes file via Android Filesystem (Documents/ForestTreatmentMaps
 *   + Cache) and opens Android's native Share / Open sheet so users can open, print, save,
 *   or send directly via WhatsApp without WebView blob download failures.
 */
export async function saveOrShareBlobFile(
  blob: Blob,
  filename: string,
  options?: {
    title?: string;
    text?: string;
    dialogTitle?: string;
    openShareSheet?: boolean;
  }
): Promise<void> {
  const safeName = sanitizeFilename(filename);

  if (!isNativeAndroidApp()) {
    triggerWebBlobDownload(blob, safeName);
    return;
  }

  const base64Data = await blobToBase64(blob);

  // Best-effort save to Documents/ForestTreatmentMaps for easy file manager access
  try {
    await Filesystem.writeFile({
      path: `ForestTreatmentMaps/${safeName}`,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    // Continue to Cache write so sharing always works on scoped-storage Android 11+
  }

  const cached = await Filesystem.writeFile({
    path: safeName,
    data: base64Data,
    directory: Directory.Cache,
    recursive: true,
  });

  if (options?.openShareSheet !== false) {
    try {
      await Share.share({
        title: options?.title || safeName,
        text: options?.text,
        files: [cached.uri],
        dialogTitle: options?.dialogTitle || 'Save or Share File',
      });
    } catch (err: any) {
      // Ignore user dismissing the share sheet
      const msg = String(err?.message || '').toLowerCase();
      if (!msg.includes('cancel') && !msg.includes('dismiss')) {
        throw err;
      }
    }
  }
}

/**
 * Shares multiple generated files (e.g., PDF + KMZ together) through Android's
 * native share sheet (WhatsApp, Drive, Email, Bluetooth, Nearby Share).
 * Returns true if handled natively, false on Web so browser fallback runs.
 */
export async function shareMultipleFilesNative(
  items: Array<{ blob: Blob; filename: string }>,
  title: string,
  text: string
): Promise<boolean> {
  if (!isNativeAndroidApp() || items.length === 0) return false;

  const uris: string[] = [];
  for (const item of items) {
    const safeName = sanitizeFilename(item.filename);
    const base64Data = await blobToBase64(item.blob);

    // Also archive a copy in Documents/ForestTreatmentMaps
    try {
      await Filesystem.writeFile({
        path: `ForestTreatmentMaps/${safeName}`,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch {
      // Non-fatal
    }

    const cached = await Filesystem.writeFile({
      path: safeName,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true,
    });
    uris.push(cached.uri);
  }

  try {
    await Share.share({
      title,
      text,
      files: uris,
      dialogTitle: 'Share Forest Treatment Map',
    });
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (!msg.includes('cancel') && !msg.includes('dismiss')) {
      throw err;
    }
  }

  return true;
}
