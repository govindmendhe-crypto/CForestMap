/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Offline Map Tile Cache Engine (IndexedDB).
 * Stores low-to-medium zoom satellite / topographic / OSM basemap tiles locally
 * so forest officers can view real terrain & canopy imagery with zero cellular data.
 */

export type TileSourceId = 'esri_satellite' | 'esri_topo' | 'osm_standard';

export interface TileSourceConfig {
  id: TileSourceId;
  labelEn: string;
  labelMr: string;
  shortEn: string;
  shortMr: string;
  attribution: string;
  avgTileKb: number;
  maxNativeZoom: number;
  buildUrl: (z: number, x: number, y: number) => string;
}

export const TILE_SOURCES: Record<TileSourceId, TileSourceConfig> = {
  esri_satellite: {
    id: 'esri_satellite',
    labelEn: 'Satellite Imagery',
    labelMr: 'उपग्रह नकाशा (Satellite)',
    shortEn: 'Satellite',
    shortMr: 'उपग्रह',
    attribution: 'Esri World Imagery',
    avgTileKb: 22,
    maxNativeZoom: 17,
    buildUrl: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  },
  esri_topo: {
    id: 'esri_topo',
    labelEn: 'Topo / Terrain',
    labelMr: 'भूप्रदेश / टेरेन (Topo)',
    shortEn: 'Topo',
    shortMr: 'भूप्रदेश',
    attribution: 'Esri World Topo Map',
    avgTileKb: 18,
    maxNativeZoom: 16,
    buildUrl: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`
  },
  osm_standard: {
    id: 'osm_standard',
    labelEn: 'OSM Forest & Roads',
    labelMr: 'OSM रस्ते व गावे',
    shortEn: 'OSM',
    shortMr: 'रस्ते',
    attribution: 'OpenStreetMap',
    avgTileKb: 15,
    maxNativeZoom: 17,
    buildUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  }
};

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface CachedTileRecord {
  key: string; // `${sourceId}/${z}/${x}/${y}`
  sourceId: TileSourceId;
  z: number;
  x: number;
  y: number;
  blob: Blob;
  sizeBytes: number;
  cachedAt: number;
}

export interface CachedRegionRecord {
  id: string;
  name: string;
  sourceId: TileSourceId;
  bounds: GeoBounds;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  sizeBytes: number;
  cachedAt: number;
}

export interface TileCacheStats {
  totalTiles: number;
  totalBytes: number;
  regions: CachedRegionRecord[];
}

export interface TileDownloadProgress {
  completed: number;
  total: number;
  downloaded: number;
  skippedCached: number;
  failed: number;
  bytesAdded: number;
}

const TILE_DB_NAME = 'forest_offline_tiles_db';
const TILE_DB_VERSION = 1;
const TILES_STORE = 'tiles';
const REGIONS_STORE = 'regions';

export const MAX_REGION_TILES = 1200;

let tileDbPromise: Promise<IDBDatabase> | null = null;

function isIdbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openTileDb(): Promise<IDBDatabase> {
  if (!isIdbAvailable()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (tileDbPromise) return tileDbPromise;

  tileDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = window.indexedDB.open(TILE_DB_NAME, TILE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TILES_STORE)) {
          const store = db.createObjectStore(TILES_STORE, { keyPath: 'key' });
          store.createIndex('sourceId', 'sourceId', { unique: false });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(REGIONS_STORE)) {
          const rStore = db.createObjectStore(REGIONS_STORE, { keyPath: 'id' });
          rStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        tileDbPromise = null;
        reject(req.error || new Error('Failed to open offline tiles DB'));
      };
    } catch (err) {
      tileDbPromise = null;
      reject(err);
    }
  });

  return tileDbPromise;
}

export function makeTileKey(sourceId: TileSourceId, z: number, x: number, y: number): string {
  return `${sourceId}/${z}/${x}/${y}`;
}

// ============================================================================
// WEB MERCATOR (EPSG:3857) SLIPPY TILE MATH
// ============================================================================

export function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

export function lonLatToTileFloat(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const clamped = clampLat(lat);
  const rad = (clamped * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function lonLatToTileXY(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const f = lonLatToTileFloat(lon, lat, z);
  return {
    x: Math.max(0, Math.min(n - 1, Math.floor(f.x))),
    y: Math.max(0, Math.min(n - 1, Math.floor(f.y)))
  };
}

export function tileXYToLonLat(x: number, y: number, z: number): { lat: number; lon: number } {
  const n = Math.pow(2, z);
  const lon = (x / n) * 360 - 180;
  const mercN = Math.PI - (2 * Math.PI * y) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercN) - Math.exp(-mercN)));
  return { lat, lon };
}

export function tileXYToBounds(x: number, y: number, z: number): GeoBounds {
  const nw = tileXYToLonLat(x, y, z);
  const se = tileXYToLonLat(x + 1, y + 1, z);
  return {
    north: nw.lat,
    west: nw.lon,
    south: se.lat,
    east: se.lon
  };
}

export function countTilesForBounds(bounds: GeoBounds, minZoom: number, maxZoom: number): number {
  const zMin = Math.max(1, Math.min(17, Math.round(minZoom)));
  const zMax = Math.max(zMin, Math.min(17, Math.round(maxZoom)));
  let total = 0;
  for (let z = zMin; z <= zMax; z++) {
    const tl = lonLatToTileXY(bounds.west, bounds.north, z);
    const br = lonLatToTileXY(bounds.east, bounds.south, z);
    const cols = Math.max(1, br.x - tl.x + 1);
    const rows = Math.max(1, br.y - tl.y + 1);
    total += cols * rows;
  }
  return total;
}

export function enumerateTilesForBounds(
  bounds: GeoBounds,
  minZoom: number,
  maxZoom: number,
  limit = MAX_REGION_TILES
): TileCoord[] {
  const zMin = Math.max(1, Math.min(17, Math.round(minZoom)));
  const zMax = Math.max(zMin, Math.min(17, Math.round(maxZoom)));
  const coords: TileCoord[] = [];
  for (let z = zMin; z <= zMax; z++) {
    const tl = lonLatToTileXY(bounds.west, bounds.north, z);
    const br = lonLatToTileXY(bounds.east, bounds.south, z);
    for (let x = tl.x; x <= br.x; x++) {
      for (let y = tl.y; y <= br.y; y++) {
        coords.push({ z, x, y });
        if (coords.length >= limit) return coords;
      }
    }
  }
  return coords;
}

export function estimateRegionSizeMb(tileCount: number, sourceId: TileSourceId): number {
  const kb = TILE_SOURCES[sourceId]?.avgTileKb ?? 20;
  return (tileCount * kb) / 1024;
}

export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// INDEXEDDB STORAGE OPERATIONS
// ============================================================================

export async function getTileBlobFromIdb(key: string): Promise<Blob | null> {
  try {
    const db = await openTileDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(TILES_STORE, 'readonly');
      const req = tx.objectStore(TILES_STORE).get(key);
      req.onsuccess = () => {
        const rec = req.result as CachedTileRecord | undefined;
        resolve(rec?.blob ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function hasTileInIdb(key: string): Promise<boolean> {
  try {
    const db = await openTileDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(TILES_STORE, 'readonly');
      const req = tx.objectStore(TILES_STORE).getKey(key);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function putTileInIdb(record: CachedTileRecord): Promise<void> {
  const db = await openTileDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TILES_STORE, 'readwrite');
    tx.objectStore(TILES_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveCachedRegionRecord(region: CachedRegionRecord): Promise<void> {
  const db = await openTileDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REGIONS_STORE, 'readwrite');
    tx.objectStore(REGIONS_STORE).put(region);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTileCacheStats(): Promise<TileCacheStats> {
  try {
    const db = await openTileDb();
    const [regions, tileSummary] = await Promise.all([
      new Promise<CachedRegionRecord[]>((resolve, reject) => {
        const tx = db.transaction(REGIONS_STORE, 'readonly');
        const req = tx.objectStore(REGIONS_STORE).getAll();
        req.onsuccess = () => {
          const list = (req.result as CachedRegionRecord[]) || [];
          list.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      }),
      new Promise<{ count: number; bytes: number }>((resolve, reject) => {
        const tx = db.transaction(TILES_STORE, 'readonly');
        const store = tx.objectStore(TILES_STORE);
        let count = 0;
        let bytes = 0;
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const val = cursor.value as CachedTileRecord;
            count += 1;
            bytes += val.sizeBytes || val.blob?.size || 0;
            cursor.continue();
          } else {
            resolve({ count, bytes });
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      })
    ]);

    return {
      totalTiles: tileSummary.count,
      totalBytes: tileSummary.bytes,
      regions
    };
  } catch {
    return { totalTiles: 0, totalBytes: 0, regions: [] };
  }
}

export async function deleteCachedRegion(regionId: string): Promise<TileCacheStats> {
  const db = await openTileDb();
  const statsBefore = await getTileCacheStats();
  const target = statsBefore.regions.find((r) => r.id === regionId);
  const remaining = statsBefore.regions.filter((r) => r.id !== regionId);

  // Build set of keys still needed by any other remaining region (same source)
  const keepKeys = new Set<string>();
  remaining.forEach((r) => {
    const coords = enumerateTilesForBounds(r.bounds, r.minZoom, r.maxZoom, MAX_REGION_TILES * 2);
    coords.forEach((c) => keepKeys.add(makeTileKey(r.sourceId, c.z, c.x, c.y)));
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([REGIONS_STORE, TILES_STORE], 'readwrite');
    tx.objectStore(REGIONS_STORE).delete(regionId);
    if (target) {
      const targetCoords = enumerateTilesForBounds(
        target.bounds,
        target.minZoom,
        target.maxZoom,
        MAX_REGION_TILES * 2
      );
      const tStore = tx.objectStore(TILES_STORE);
      targetCoords.forEach((c) => {
        const key = makeTileKey(target.sourceId, c.z, c.x, c.y);
        if (!keepKeys.has(key)) {
          tStore.delete(key);
          evictTileFromMemory(key);
        }
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return getTileCacheStats();
}

export async function clearAllOfflineTiles(): Promise<TileCacheStats> {
  const db = await openTileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([TILES_STORE, REGIONS_STORE], 'readwrite');
    tx.objectStore(TILES_STORE).clear();
    tx.objectStore(REGIONS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  clearMemoryTileCache();
  return { totalTiles: 0, totalBytes: 0, regions: [] };
}

// ============================================================================
// BATCH REGION DOWNLOADER (CONCURRENT WITH CANCEL & DEDUP)
// ============================================================================

export async function downloadRegionTiles(params: {
  name: string;
  sourceId: TileSourceId;
  bounds: GeoBounds;
  minZoom: number;
  maxZoom: number;
  signal?: AbortSignal;
  onProgress?: (progress: TileDownloadProgress) => void;
}): Promise<{ region: CachedRegionRecord | null; progress: TileDownloadProgress; cancelled: boolean }> {
  const { name, sourceId, bounds, minZoom, maxZoom, signal, onProgress } = params;
  const source = TILE_SOURCES[sourceId];
  const coords = enumerateTilesForBounds(bounds, minZoom, maxZoom, MAX_REGION_TILES);
  const progress: TileDownloadProgress = {
    completed: 0,
    total: coords.length,
    downloaded: 0,
    skippedCached: 0,
    failed: 0,
    bytesAdded: 0
  };

  onProgress?.({ ...progress });

  let cursor = 0;
  let cancelled = false;
  const CONCURRENCY = 6;

  const worker = async () => {
    while (cursor < coords.length) {
      if (signal?.aborted) {
        cancelled = true;
        return;
      }
      const idx = cursor++;
      const { z, x, y } = coords[idx];
      const key = makeTileKey(sourceId, z, x, y);

      try {
        const exists = await hasTileInIdb(key);
        if (exists) {
          progress.skippedCached += 1;
          progress.completed += 1;
          onProgress?.({ ...progress });
          continue;
        }

        const url = source.buildUrl(z, x, y);
        const resp = await fetch(url, { mode: 'cors', signal });
        if (!resp.ok) {
          progress.failed += 1;
        } else {
          const blob = await resp.blob();
          if (blob.size > 100) {
            await putTileInIdb({
              key,
              sourceId,
              z,
              x,
              y,
              blob,
              sizeBytes: blob.size,
              cachedAt: Date.now()
            });
            // Clear any negative memory marker so MapCanvas picks up the fresh tile immediately
            memoryTileCache.delete(key);
            progress.downloaded += 1;
            progress.bytesAdded += blob.size;
          } else {
            progress.failed += 1;
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal?.aborted) {
          cancelled = true;
          return;
        }
        progress.failed += 1;
      }

      progress.completed += 1;
      onProgress?.({ ...progress });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, coords.length) }, () => worker()));

  const successfulTiles = progress.downloaded + progress.skippedCached;
  if (successfulTiles === 0) {
    return { region: null, progress, cancelled };
  }

  const region: CachedRegionRecord = {
    id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `${source.shortEn} z${minZoom}-${maxZoom}`,
    sourceId,
    bounds,
    minZoom,
    maxZoom,
    tileCount: successfulTiles,
    sizeBytes: progress.bytesAdded || successfulTiles * source.avgTileKb * 1024,
    cachedAt: Date.now()
  };

  await saveCachedRegionRecord(region);
  return { region, progress, cancelled };
}

// ============================================================================
// IN-MEMORY IMAGE CACHE + OFFLINE-FIRST CANVAS TILE LOADER (WITH OVERZOOM)
// ============================================================================

type MemTileEntry =
  | { status: 'loading' }
  | { status: 'loaded'; img: HTMLImageElement; objectUrl?: string; lastUsed: number }
  | { status: 'missing'; checkedAt: number };

const memoryTileCache = new Map<string, MemTileEntry>();
const MAX_MEMORY_TILES = 360;

export function evictTileFromMemory(key: string): void {
  const entry = memoryTileCache.get(key);
  if (entry && entry.status === 'loaded' && entry.objectUrl) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // ignore
    }
  }
  memoryTileCache.delete(key);
}

export function clearMemoryTileCache(): void {
  memoryTileCache.forEach((entry) => {
    if (entry.status === 'loaded' && entry.objectUrl) {
      try {
        URL.revokeObjectURL(entry.objectUrl);
      } catch {
        // ignore
      }
    }
  });
  memoryTileCache.clear();
}

export function resetMissingTileMarkers(): void {
  for (const [k, v] of memoryTileCache.entries()) {
    if (v.status === 'missing') {
      memoryTileCache.delete(k);
    }
  }
}

function pruneMemoryCacheIfNeeded(): void {
  if (memoryTileCache.size <= MAX_MEMORY_TILES) return;
  const loadedKeys: Array<{ key: string; lastUsed: number }> = [];
  memoryTileCache.forEach((val, key) => {
    if (val.status === 'loaded') {
      loadedKeys.push({ key, lastUsed: val.lastUsed });
    }
  });
  loadedKeys.sort((a, b) => a.lastUsed - b.lastUsed);
  const toDrop = Math.max(40, memoryTileCache.size - MAX_MEMORY_TILES + 40);
  for (let i = 0; i < Math.min(toDrop, loadedKeys.length); i++) {
    evictTileFromMemory(loadedKeys[i].key);
  }
}

function decodeBlobToImage(blob: Blob): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode tile image'));
    };
    img.src = objectUrl;
  });
}

/**
 * Synchronously checks memory cache for a tile (and triggers async IndexedDB load,
 * with optional online network fallback when `allowNetworkFallback` is true).
 * Calls `onReady()` once the tile finishes decoding so the canvas can repaint cleanly.
 */
export function requestCanvasTile(
  sourceId: TileSourceId,
  z: number,
  x: number,
  y: number,
  options: { allowNetworkFallback?: boolean; onReady?: () => void } = {}
): HTMLImageElement | null {
  const { allowNetworkFallback = false, onReady } = options;
  const key = makeTileKey(sourceId, z, x, y);
  const existing = memoryTileCache.get(key);

  if (existing) {
    if (existing.status === 'loaded') {
      existing.lastUsed = Date.now();
      return existing.img;
    }
    if (existing.status === 'loading') {
      return null;
    }
    // Retry 'missing' only if network fallback is newly allowed and >4s elapsed
    if (existing.status === 'missing') {
      if (!allowNetworkFallback || Date.now() - existing.checkedAt < 4000) {
        return null;
      }
    }
  }

  memoryTileCache.set(key, { status: 'loading' });

  (async () => {
    try {
      // 1. Always check IndexedDB first (100% offline-first!)
      const blob = await getTileBlobFromIdb(key);
      if (blob) {
        const { img, objectUrl } = await decodeBlobToImage(blob);
        memoryTileCache.set(key, { status: 'loaded', img, objectUrl, lastUsed: Date.now() });
        pruneMemoryCacheIfNeeded();
        onReady?.();
        return;
      }

      // 2. Optional online preview fallback (used in region selector or when online)
      if (allowNetworkFallback && typeof navigator !== 'undefined' && navigator.onLine) {
        const source = TILE_SOURCES[sourceId];
        if (source) {
          const resp = await fetch(source.buildUrl(z, x, y), { mode: 'cors' });
          if (resp.ok) {
            const netBlob = await resp.blob();
            if (netBlob.size > 100) {
              const { img, objectUrl } = await decodeBlobToImage(netBlob);
              memoryTileCache.set(key, { status: 'loaded', img, objectUrl, lastUsed: Date.now() });
              pruneMemoryCacheIfNeeded();
              onReady?.();
              return;
            }
          }
        }
      }

      memoryTileCache.set(key, { status: 'missing', checkedAt: Date.now() });
    } catch {
      memoryTileCache.set(key, { status: 'missing', checkedAt: Date.now() });
    }
  })();

  return null;
}

/**
 * Resolves either the exact cached tile OR a cropped parent tile (up to 4 zoom levels out)
 * so zooming in on a pre-cached low/medium zoom region NEVER shows blank white squares offline!
 */
export function resolveTileWithOverzoom(
  sourceId: TileSourceId,
  z: number,
  x: number,
  y: number,
  options: { allowNetworkFallback?: boolean; onReady?: () => void; maxParentDepth?: number } = {}
): {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} | null {
  const { allowNetworkFallback = false, onReady, maxParentDepth = 4 } = options;

  const exact = requestCanvasTile(sourceId, z, x, y, { allowNetworkFallback, onReady });
  if (exact) {
    return { img: exact, sx: 0, sy: 0, sw: exact.naturalWidth || 256, sh: exact.naturalHeight || 256 };
  }

  // Walk up parent zoom levels in IndexedDB (never fetches parents over network if offline)
  for (let d = 1; d <= maxParentDepth; d++) {
    const pz = z - d;
    if (pz < 4) break;
    const scale = 1 << d;
    const px = Math.floor(x / scale);
    const py = Math.floor(y / scale);
    const parentImg = requestCanvasTile(sourceId, pz, px, py, {
      allowNetworkFallback: false,
      onReady
    });
    if (parentImg) {
      const tileW = parentImg.naturalWidth || 256;
      const tileH = parentImg.naturalHeight || 256;
      const subX = x - px * scale;
      const subY = y - py * scale;
      return {
        img: parentImg,
        sx: (subX / scale) * tileW,
        sy: (subY / scale) * tileH,
        sw: tileW / scale,
        sh: tileH / scale
      };
    }
  }

  return null;
}
