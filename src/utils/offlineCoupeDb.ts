/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import {
  SavedCoupeProject,
  listSavedCoupes,
  upsertSavedCoupe,
  deleteSavedCoupe,
  parseProjectJsonBackup
} from './fieldTools';
import { generateKmzForSavedProject } from './kmzExport';
import { parseAppKmzForInspection } from './kmzImport';
import { formatToDMY } from './geoUtils';

const DB_NAME = 'forest_treatment_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'saved_coupes';
const MIGRATION_FLAG_KEY = 'forest_saved_coupes_idb_migrated_v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openCoupeDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error('Failed to open IndexedDB'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

function sortByNewest(items: SavedCoupeProject[]): SavedCoupeProject[] {
  return [...items].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

async function readAllFromIdb(db: IDBDatabase): Promise<SavedCoupeProject[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(sortByNewest((req.result as SavedCoupeProject[]) || []));
    req.onerror = () => reject(req.error);
  });
}

async function putItemsInIdb(db: IDBDatabase, items: SavedCoupeProject[]): Promise<void> {
  if (items.length === 0) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    items.forEach((item) => {
      store.put(item);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteItemInIdb(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads all saved coupes from IndexedDB (high-capacity offline storage).
 * Automatically migrates any legacy coupes from localStorage on first run,
 * and gracefully falls back to localStorage if IndexedDB is blocked.
 */
export async function loadAllSavedCoupesFromDb(): Promise<{
  coupes: SavedCoupeProject[];
  engine: 'indexeddb' | 'localstorage';
}> {
  try {
    const db = await openCoupeDb();
    let existing = await readAllFromIdb(db);

    // One-time seamless migration from legacy localStorage list
    const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY) === '1';
    if (!alreadyMigrated) {
      const legacy = listSavedCoupes();
      if (legacy.length > 0) {
        const existingIds = new Set(existing.map((c) => c.id));
        const toMigrate = legacy.filter((c) => !existingIds.has(c.id));
        if (toMigrate.length > 0) {
          await putItemsInIdb(db, toMigrate);
          existing = await readAllFromIdb(db);
        }
      }
      try {
        localStorage.setItem(MIGRATION_FLAG_KEY, '1');
      } catch {
        // Ignore
      }
    }

    return { coupes: existing, engine: 'indexeddb' };
  } catch {
    return { coupes: listSavedCoupes(), engine: 'localstorage' };
  }
}

export async function upsertSavedCoupeInDb(
  project: SavedCoupeProject
): Promise<SavedCoupeProject[]> {
  try {
    const db = await openCoupeDb();
    await putItemsInIdb(db, [project]);
    // Keep a lightweight copy of newest entries in localStorage as extra belt-and-suspenders
    try {
      upsertSavedCoupe(project);
    } catch {
      // Ignore quota on fallback mirror
    }
    return await readAllFromIdb(db);
  } catch {
    return upsertSavedCoupe(project);
  }
}

export async function bulkUpsertSavedCoupesInDb(
  projects: SavedCoupeProject[]
): Promise<SavedCoupeProject[]> {
  if (projects.length === 0) {
    const res = await loadAllSavedCoupesFromDb();
    return res.coupes;
  }
  try {
    const db = await openCoupeDb();
    await putItemsInIdb(db, projects);
    return await readAllFromIdb(db);
  } catch {
    let latest = listSavedCoupes();
    projects.forEach((p) => {
      latest = upsertSavedCoupe(p);
    });
    return latest;
  }
}

export async function deleteSavedCoupeInDb(id: string): Promise<SavedCoupeProject[]> {
  try {
    const db = await openCoupeDb();
    await deleteItemInIdb(db, id);
    try {
      deleteSavedCoupe(id);
    } catch {
      // Ignore
    }
    return await readAllFromIdb(db);
  } catch {
    return deleteSavedCoupe(id);
  }
}

/**
 * Packages EVERY saved coupe in the folder into a single portable `.zip` archive containing:
 * - Ready-to-open Google Earth `.kmz` file for every coupe (with embedded lossless `forest_project.json`)
 * - `folder_backup.json` full manifest for fast bulk restore on another device
 */
export async function exportEntireFolderAsZip(
  projects: SavedCoupeProject[],
  lang = 'mr'
): Promise<{ blob: Blob; filename: string; count: number }> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    try {
      const { blob, filename } = await generateKmzForSavedProject(proj, lang);
      let uniqueName = filename;
      let suffix = 2;
      while (usedNames.has(uniqueName.toLowerCase())) {
        uniqueName = filename.replace(/\.kmz$/i, `_${suffix}.kmz`);
        suffix++;
      }
      usedNames.add(uniqueName.toLowerCase());
      zip.file(`kmz/${uniqueName}`, blob);
    } catch {
      // If a saved item has no valid geoRef, still preserve its JSON backup
      const safeBase = (proj.name || `Coupe_${i + 1}`).replace(/[^\w\d-_]/g, '_').slice(0, 40);
      zip.file(`json/${safeBase}.json`, JSON.stringify(proj, null, 2));
    }
  }

  // Always include full folder manifest JSON for instantaneous bulk restore
  zip.file(
    'forest_folder_backup.json',
    JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: Date.now(),
        count: projects.length,
        projects
      },
      null,
      2
    )
  );

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const dateTag = formatToDMY().replace(/[^\d-]/g, '_');
  const filename = `Forest_KMZ_Folder_Backup_${dateTag}.zip`;
  return { blob, filename, count: projects.length };
}

/**
 * Restores multiple coupes from a multi-coupe `.zip` folder backup (or any ZIP of `.kmz`/`.json` files).
 */
export async function importFolderZipBackup(file: File): Promise<SavedCoupeProject[]> {
  const zip = await JSZip.loadAsync(file);
  const restored: SavedCoupeProject[] = [];
  const seenIds = new Set<string>();

  // 1. Fast path: check for `forest_folder_backup.json` manifest
  const manifestEntry =
    zip.file('forest_folder_backup.json') ||
    Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('forest_folder_backup.json'));

  if (manifestEntry) {
    try {
      const text = await manifestEntry.async('text');
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.projects)) {
        for (const rawItem of parsed.projects) {
          const valid = parseProjectJsonBackup(JSON.stringify(rawItem));
          if (valid && !seenIds.has(valid.id)) {
            seenIds.add(valid.id);
            restored.push(valid);
          }
        }
      }
    } catch {
      // Fallback to scanning individual KMZ/JSON entries below
    }
  }

  if (restored.length > 0) {
    return restored;
  }

  // 2. Fallback: scan individual `.kmz`, `.kml`, `.json` files inside the ZIP
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    const shortName = entry.name.split('/').pop() || entry.name;
    try {
      if (lower.endsWith('.kmz') || lower.endsWith('.kml') || lower.endsWith('.json')) {
        const blob = await entry.async('blob');
        const subFile = new File([blob], shortName);
        const res = await parseAppKmzForInspection(subFile);
        if (res?.project && !seenIds.has(res.project.id)) {
          seenIds.add(res.project.id);
          restored.push(res.project);
        }
      }
    } catch {
      // Skip unreadable entry and continue
    }
  }

  return restored;
}
