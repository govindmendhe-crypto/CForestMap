/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interactive 'Pre-cache Map Tiles' Modal:
 * Allows forest officers to select a region on a base map, choose low-to-medium zoom
 * levels and imagery style (Satellite / Topo / OSM), and download tiles into IndexedDB
 * for 100% offline forest visualization.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  X,
  Download,
  Trash2,
  Layers,
  Crosshair,
  MapPin,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  HardDrive,
  Eye,
  EyeOff,
  SquareDashedMousePointer
} from 'lucide-react';
import {
  TileSourceId,
  TILE_SOURCES,
  GeoBounds,
  TileCacheStats,
  TileDownloadProgress,
  MAX_REGION_TILES,
  lonLatToTileFloat,
  tileXYToLonLat,
  countTilesForBounds,
  estimateRegionSizeMb,
  formatBytesCompact,
  getTileCacheStats,
  downloadRegionTiles,
  deleteCachedRegion,
  clearAllOfflineTiles,
  resolveTileWithOverzoom,
  resetMissingTileMarkers
} from '../utils/offlineTileCache';
import { GeoRef, Point2D, UserLocation } from '../types/mapTypes';
import { meterToLatLon } from '../utils/geoUtils';
import { getOfflineSafeCurrentFix } from '../utils/offlineGnss';

interface OfflineTilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
  geoRef: GeoRef;
  rawWorkingPoints: Point2D[];
  userLocation: UserLocation | null;
  suggestedRegionName: string;
  showOfflineBasemap: boolean;
  onToggleOfflineBasemap: (val: boolean) => void;
  activeSource: TileSourceId;
  onChangeSource: (src: TileSourceId) => void;
  basemapOpacity: number;
  onChangeOpacity: (opacity: number) => void;
  onTilesUpdated: (stats: TileCacheStats) => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'map' | null;

const ZOOM_PRESETS = [
  { id: 'overview', minZ: 10, maxZ: 13, en: 'Wide Beat (z10–13)', mr: 'विस्तृत क्षेत्र (z10–13)' },
  { id: 'medium', minZ: 11, maxZ: 14, en: 'Forest Standard (z11–14)', mr: 'वन मानक (z11–14)' },
  { id: 'detail', minZ: 12, maxZ: 15, en: 'Coupe Detail (z12–15)', mr: 'कूप सविस्तर (z12–15)' },
  { id: 'high', minZ: 13, maxZ: 16, en: 'Canopy High (z13–16)', mr: 'अति स्पष्ट (z13–16)' }
] as const;

export const OfflineTilesModal: React.FC<OfflineTilesModalProps> = ({
  isOpen,
  onClose,
  lang,
  geoRef,
  rawWorkingPoints,
  userLocation,
  suggestedRegionName,
  showOfflineBasemap,
  onToggleOfflineBasemap,
  activeSource,
  onChangeSource,
  basemapOpacity,
  onChangeOpacity,
  onTilesUpdated
}) => {
  const isMr = lang === 'mr';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Default map center: active coupe → live GPS → Central India forest belt (Pench)
  const initialCenter = useMemo<{ lat: number; lon: number }>(() => {
    if (geoRef?.hasGeo && Number.isFinite(geoRef.centerLat) && geoRef.centerLat !== 0) {
      return { lat: geoRef.centerLat, lon: geoRef.centerLon };
    }
    if (
      userLocation &&
      typeof userLocation.lat === 'number' &&
      typeof userLocation.lon === 'number' &&
      Number.isFinite(userLocation.lat) &&
      Number.isFinite(userLocation.lon) &&
      userLocation.lat !== 0
    ) {
      return { lat: userLocation.lat, lon: userLocation.lon };
    }
    return { lat: 21.5312, lon: 79.2318 };
  }, [geoRef, userLocation]);

  const [viewCenter, setViewCenter] = useState<{ lat: number; lon: number }>(initialCenter);
  const [viewZoom, setViewZoom] = useState<number>(13);
  const [selectionBounds, setSelectionBounds] = useState<GeoBounds>(() => ({
    north: initialCenter.lat + 0.015,
    south: initialCenter.lat - 0.015,
    east: initialCenter.lon + 0.018,
    west: initialCenter.lon - 0.018
  }));

  const [sourceId, setSourceId] = useState<TileSourceId>(activeSource);
  const [minZoom, setMinZoom] = useState<number>(11);
  const [maxZoom, setMaxZoom] = useState<number>(14);
  const [regionName, setRegionName] = useState<string>('');
  const [stats, setStats] = useState<TileCacheStats>({ totalTiles: 0, totalBytes: 0, regions: [] });
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<TileDownloadProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; tone: 'ok' | 'warn' | 'err' } | null>(null);
  const [renderTick, setRenderTick] = useState<number>(0);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Pointer drag state for panning base map OR resizing selection box
  const dragRef = useRef<{
    mode: DragHandle;
    startClientX: number;
    startClientY: number;
    startCenter: { lat: number; lon: number };
    startBounds: GeoBounds;
  }>({
    mode: null,
    startClientX: 0,
    startClientY: 0,
    startCenter: initialCenter,
    startBounds: selectionBounds
  });

  // Sync online/offline indicator
  useEffect(() => {
    const syncNet = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', syncNet);
    window.addEventListener('offline', syncNet);
    return () => {
      window.removeEventListener('online', syncNet);
      window.removeEventListener('offline', syncNet);
    };
  }, []);

  // Load IndexedDB cache stats and fit selection box to active coupe when modal opens
  const fitToActiveCoupe = useCallback(() => {
    if (geoRef?.hasGeo && rawWorkingPoints.length >= 3) {
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      rawWorkingPoints.forEach((pt) => {
        const g = meterToLatLon(pt, geoRef);
        if (g.lat < minLat) minLat = g.lat;
        if (g.lat > maxLat) maxLat = g.lat;
        if (g.lon < minLon) minLon = g.lon;
        if (g.lon > maxLon) maxLon = g.lon;
      });
      // Add generous ~1 km forest buffer around the coupe for field approach & compass navigation
      const padLat = Math.max(0.009, (maxLat - minLat) * 0.45);
      const padLon = Math.max(0.011, (maxLon - minLon) * 0.45);
      const nextBounds: GeoBounds = {
        north: maxLat + padLat,
        south: minLat - padLat,
        east: maxLon + padLon,
        west: minLon - padLon
      };
      setSelectionBounds(nextBounds);
      setViewCenter({ lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 });
      setViewZoom(13);
      return true;
    }
    return false;
  }, [geoRef, rawWorkingPoints]);

  useEffect(() => {
    if (!isOpen) return;
    setSourceId(activeSource);
    setRegionName(
      suggestedRegionName ||
        (isMr ? 'वन कूप ऑफलाईन क्षेत्र' : 'Forest Coupe Offline Area')
    );
    setStatusMessage(null);
    if (!fitToActiveCoupe()) {
      setViewCenter(initialCenter);
      setSelectionBounds({
        north: initialCenter.lat + 0.016,
        south: initialCenter.lat - 0.016,
        east: initialCenter.lon + 0.02,
        west: initialCenter.lon - 0.02
      });
    }
    getTileCacheStats().then((s) => {
      setStats(s);
      onTilesUpdated(s);
    });
  }, [isOpen, activeSource, suggestedRegionName, isMr, fitToActiveCoupe, initialCenter, onTilesUpdated]);

  // Helper conversions between Lat/Lon and Selector Canvas pixels
  const geoToCanvasPx = useCallback(
    (lat: number, lon: number, width: number, height: number) => {
      const c = lonLatToTileFloat(viewCenter.lon, viewCenter.lat, viewZoom);
      const p = lonLatToTileFloat(lon, lat, viewZoom);
      return {
        x: width / 2 + (p.x - c.x) * 256,
        y: height / 2 + (p.y - c.y) * 256
      };
    },
    [viewCenter, viewZoom]
  );

  const canvasPxToGeo = useCallback(
    (px: number, py: number, width: number, height: number) => {
      const c = lonLatToTileFloat(viewCenter.lon, viewCenter.lat, viewZoom);
      const tx = c.x + (px - width / 2) / 256;
      const ty = c.y + (py - height / 2) / 256;
      return tileXYToLonLat(tx, ty, viewZoom);
    },
    [viewCenter, viewZoom]
  );

  // Render the interactive Base Map Selector Canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 560;
    const cssH = canvas.clientHeight || 280;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Subtle forest dark backdrop while tiles load
    ctx.fillStyle = '#0d231b';
    ctx.fillRect(0, 0, cssW, cssH);

    // Draw subtle coordinate graticule fallback when offline & tiles not yet cached
    ctx.strokeStyle = 'rgba(134, 239, 172, 0.10)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < cssW; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, cssH);
      ctx.stroke();
    }
    for (let gy = 0; gy < cssH; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(cssW, gy);
      ctx.stroke();
    }

    // Draw Web Mercator tiles covering viewport (IndexedDB first, live network fallback if online)
    const centerTile = lonLatToTileFloat(viewCenter.lon, viewCenter.lat, viewZoom);
    const halfCols = Math.ceil(cssW / 256 / 2) + 1;
    const halfRows = Math.ceil(cssH / 256 / 2) + 1;
    const maxTileIdx = Math.pow(2, viewZoom) - 1;
    const baseTx = Math.floor(centerTile.x);
    const baseTy = Math.floor(centerTile.y);

    let scheduledTick = false;
    const onTileReady = () => {
      if (!scheduledTick) {
        scheduledTick = true;
        requestAnimationFrame(() => setRenderTick((t) => t + 1));
      }
    };

    for (let tx = baseTx - halfCols; tx <= baseTx + halfCols; tx++) {
      if (tx < 0 || tx > maxTileIdx) continue;
      for (let ty = baseTy - halfRows; ty <= baseTy + halfRows; ty++) {
        if (ty < 0 || ty > maxTileIdx) continue;
        const resolved = resolveTileWithOverzoom(sourceId, viewZoom, tx, ty, {
          allowNetworkFallback: !isOffline,
          onReady: onTileReady,
          maxParentDepth: 4
        });
        if (resolved) {
          const dx = cssW / 2 + (tx - centerTile.x) * 256;
          const dy = cssH / 2 + (ty - centerTile.y) * 256;
          ctx.drawImage(
            resolved.img,
            resolved.sx,
            resolved.sy,
            resolved.sw,
            resolved.sh,
            dx,
            dy,
            256.8,
            256.8
          );
        }
      }
    }

    // Draw already-cached regions as emerald dashed outlines
    stats.regions
      .filter((r) => r.sourceId === sourceId)
      .forEach((reg) => {
        const nw = geoToCanvasPx(reg.bounds.north, reg.bounds.west, cssW, cssH);
        const se = geoToCanvasPx(reg.bounds.south, reg.bounds.east, cssW, cssH);
        const rw = se.x - nw.x;
        const rh = se.y - nw.y;
        if (rw > 4 && rh > 4) {
          ctx.save();
          ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
          ctx.fillRect(nw.x, nw.y, rw, rh);
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(nw.x, nw.y, rw, rh);
          ctx.restore();
        }
      });

    // Draw active coupe polygon overlay if available
    if (geoRef?.hasGeo && rawWorkingPoints.length >= 3) {
      ctx.save();
      ctx.beginPath();
      rawWorkingPoints.forEach((pt, idx) => {
        const g = meterToLatLon(pt, geoRef);
        const px = geoToCanvasPx(g.lat, g.lon, cssW, cssH);
        if (idx === 0) ctx.moveTo(px.x, px.y);
        else ctx.lineTo(px.x, px.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    }

    // Draw user GPS marker if available
    if (
      userLocation &&
      typeof userLocation.lat === 'number' &&
      typeof userLocation.lon === 'number' &&
      Number.isFinite(userLocation.lat) &&
      Number.isFinite(userLocation.lon) &&
      userLocation.lat !== 0
    ) {
      const upx = geoToCanvasPx(userLocation.lat, userLocation.lon, cssW, cssH);
      ctx.save();
      ctx.beginPath();
      ctx.arc(upx.x, upx.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Draw interactive Region Selection Rectangle + 4 draggable corner handles
    const selNW = geoToCanvasPx(selectionBounds.north, selectionBounds.west, cssW, cssH);
    const selSE = geoToCanvasPx(selectionBounds.south, selectionBounds.east, cssW, cssH);
    const sx = Math.min(selNW.x, selSE.x);
    const sy = Math.min(selNW.y, selSE.y);
    const sw = Math.abs(selSE.x - selNW.x);
    const sh = Math.abs(selSE.y - selNW.y);

    // Dim outside selection slightly for crisp visual focus
    ctx.save();
    ctx.fillStyle = 'rgba(5, 22, 16, 0.42)';
    ctx.fillRect(0, 0, cssW, sy);
    ctx.fillRect(0, sy + sh, cssW, Math.max(0, cssH - (sy + sh)));
    ctx.fillRect(0, sy, Math.max(0, sx), sh);
    ctx.fillRect(sx + sw, sy, Math.max(0, cssW - (sx + sw)), sh);

    // Crisp amber-white selection border
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx, sy, sw, sh);

    // 4 Draggable Corner Handles
    const corners = [
      { x: sx, y: sy },
      { x: sx + sw, y: sy },
      { x: sx, y: sy + sh },
      { x: sx + sw, y: sy + sh }
    ];
    corners.forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0f5132';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    // Subtle zoom & center coordinate caption inside bottom-left of selector
    ctx.fillStyle = 'rgba(6, 24, 18, 0.82)';
    ctx.fillRect(8, cssH - 24, 178, 18);
    ctx.fillStyle = '#d1fae5';
    ctx.font = '600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      `z${viewZoom} · ${viewCenter.lat.toFixed(4)}°N, ${viewCenter.lon.toFixed(4)}°E`,
      13,
      cssH - 11.5
    );
    ctx.restore();
    ctx.restore();
  }, [
    isOpen,
    viewCenter,
    viewZoom,
    sourceId,
    selectionBounds,
    stats.regions,
    geoRef,
    rawWorkingPoints,
    userLocation,
    isOffline,
    renderTick,
    geoToCanvasPx
  ]);

  // Pointer interaction on selector map: drag corners to resize region, drag inside box to move region, drag outside to pan map
  const handleSelectorPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const nw = geoToCanvasPx(selectionBounds.north, selectionBounds.west, rect.width, rect.height);
    const se = geoToCanvasPx(selectionBounds.south, selectionBounds.east, rect.width, rect.height);
    const sx = Math.min(nw.x, se.x);
    const sy = Math.min(nw.y, se.y);
    const ex = Math.max(nw.x, se.x);
    const ey = Math.max(nw.y, se.y);

    const hitR = 22;
    let mode: DragHandle = 'map';
    if (Math.hypot(px - sx, py - sy) <= hitR) mode = 'nw';
    else if (Math.hypot(px - ex, py - sy) <= hitR) mode = 'ne';
    else if (Math.hypot(px - sx, py - ey) <= hitR) mode = 'sw';
    else if (Math.hypot(px - ex, py - ey) <= hitR) mode = 'se';
    else if (px > sx && px < ex && py > sy && py < ey) mode = 'move';

    dragRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCenter: { ...viewCenter },
      startBounds: { ...selectionBounds }
    };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleSelectorPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = dragRef.current.mode;
    if (!mode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startClientX;
    const dy = e.clientY - dragRef.current.startClientY;

    if (mode === 'map') {
      const startTile = lonLatToTileFloat(
        dragRef.current.startCenter.lon,
        dragRef.current.startCenter.lat,
        viewZoom
      );
      const nextCenter = tileXYToLonLat(startTile.x - dx / 256, startTile.y - dy / 256, viewZoom);
      setViewCenter(nextCenter);
      return;
    }

    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const curGeo = canvasPxToGeo(px, py, rect.width, rect.height);
    const sb = dragRef.current.startBounds;
    const minSpan = 0.0025;

    if (mode === 'move') {
      const gStart = canvasPxToGeo(
        dragRef.current.startClientX - rect.left,
        dragRef.current.startClientY - rect.top,
        rect.width,
        rect.height
      );
      const dLat = curGeo.lat - gStart.lat;
      const dLon = curGeo.lon - gStart.lon;
      setSelectionBounds({
        north: sb.north + dLat,
        south: sb.south + dLat,
        east: sb.east + dLon,
        west: sb.west + dLon
      });
      return;
    }

    setSelectionBounds((prev) => {
      let { north, south, east, west } = prev;
      if (mode === 'nw' || mode === 'ne') north = Math.max(sb.south + minSpan, curGeo.lat);
      if (mode === 'sw' || mode === 'se') south = Math.min(sb.north - minSpan, curGeo.lat);
      if (mode === 'nw' || mode === 'sw') west = Math.min(sb.east - minSpan, curGeo.lon);
      if (mode === 'ne' || mode === 'se') east = Math.max(sb.west + minSpan, curGeo.lon);
      return { north, south, east, west };
    });
  };

  const handleSelectorPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current.mode = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Center on officer's live GPS
  const handleCenterOnGps = async () => {
    setIsLocating(true);
    try {
      const fix = await getOfflineSafeCurrentFix(10000);
      setViewCenter({ lat: fix.lat, lon: fix.lon });
      setSelectionBounds({
        north: fix.lat + 0.014,
        south: fix.lat - 0.014,
        east: fix.lon + 0.017,
        west: fix.lon - 0.017
      });
      setViewZoom(13);
    } catch {
      setStatusMessage({
        text: isMr
          ? 'GPS स्थान मिळाले नाही — मॅप ड्रॅग करून क्षेत्र निवडा.'
          : 'Could not read GPS — drag the map to select your forest region.',
        tone: 'warn'
      });
    } finally {
      setIsLocating(false);
    }
  };

  const estimatedTiles = useMemo(
    () => countTilesForBounds(selectionBounds, minZoom, maxZoom),
    [selectionBounds, minZoom, maxZoom]
  );
  const estimatedMb = useMemo(
    () => estimateRegionSizeMb(Math.min(estimatedTiles, MAX_REGION_TILES), sourceId),
    [estimatedTiles, sourceId]
  );
  const isOverLimit = estimatedTiles > MAX_REGION_TILES;

  const handleStartDownload = async () => {
    if (isDownloading) return;
    if (isOffline) {
      setStatusMessage({
        text: isMr
          ? 'टाईल्स डाऊनलोड करण्यासाठी तात्पुरते इंटरनेट चालू करा (एकदा डाऊनलोड झाल्यावर जंगलात ऑफलाईन चालतील).'
          : 'Connect to internet briefly to pre-cache tiles — once saved, they work 100% offline in the forest.',
        tone: 'warn'
      });
      return;
    }
    if (isOverLimit) {
      setStatusMessage({
        text: isMr
          ? `निवडलेले क्षेत्र खूप मोठे आहे (${estimatedTiles} टाईल्स). कृपया बॉक्स थोडा लहान करा किंवा Max Zoom कमी करा (कमाल ${MAX_REGION_TILES}).`
          : `Selected region has ${estimatedTiles} tiles (max ${MAX_REGION_TILES}). Shrink the box or lower Max Zoom.`,
        tone: 'warn'
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsDownloading(true);
    setStatusMessage(null);
    setDownloadProgress({
      completed: 0,
      total: estimatedTiles,
      downloaded: 0,
      skippedCached: 0,
      failed: 0,
      bytesAdded: 0
    });

    try {
      const res = await downloadRegionTiles({
        name: regionName || suggestedRegionName || TILE_SOURCES[sourceId].shortEn,
        sourceId,
        bounds: selectionBounds,
        minZoom,
        maxZoom,
        signal: controller.signal,
        onProgress: (p) => setDownloadProgress(p)
      });

      resetMissingTileMarkers();
      const freshStats = await getTileCacheStats();
      setStats(freshStats);
      onTilesUpdated(freshStats);

      if (res.cancelled) {
        setStatusMessage({
          text: isMr
            ? `डाऊनलोड थांबवले (${res.progress.downloaded} टाईल्स जतन झाल्या).`
            : `Download cancelled (${res.progress.downloaded} tiles saved).`,
          tone: 'warn'
        });
      } else if (res.region) {
        onChangeSource(sourceId);
        onToggleOfflineBasemap(true);
        setStatusMessage({
          text: isMr
            ? `ऑफलाईन नकाशा कॅश पूर्ण! ${res.region.tileCount} टाईल्स IndexedDB मध्ये जतन झाल्या — आता जंगलात इंटरनेटशिवाय दिसेल.`
            : `Pre-cache complete! ${res.region.tileCount} tiles saved in IndexedDB & enabled on map.`,
          tone: 'ok'
        });
      } else {
        setStatusMessage({
          text: isMr
            ? 'टाईल्स डाऊनलोड होऊ शकल्या नाहीत. नेटवर्क तपासून पुन्हा प्रयत्न करा.'
            : 'No tiles could be downloaded. Check internet connection and retry.',
          tone: 'err'
        });
      }
    } finally {
      setIsDownloading(false);
      abortRef.current = null;
      setRenderTick((t) => t + 1);
    }
  };

  const handleCancelDownload = () => {
    abortRef.current?.abort();
  };

  const handleDeleteRegion = async (id: string) => {
    const fresh = await deleteCachedRegion(id);
    setStats(fresh);
    onTilesUpdated(fresh);
    setRenderTick((t) => t + 1);
  };

  const handleClearAll = async () => {
    const fresh = await clearAllOfflineTiles();
    setStats(fresh);
    onTilesUpdated(fresh);
    setRenderTick((t) => t + 1);
    setStatusMessage({
      text: isMr ? 'सर्व कॅश केलेल्या नकाशा टाईल्स काढल्या.' : 'All cached offline map tiles cleared.',
      tone: 'ok'
    });
  };

  if (!isOpen) return null;

  const progressPct =
    downloadProgress && downloadProgress.total > 0
      ? Math.round((downloadProgress.completed / downloadProgress.total) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isMr ? 'ऑफलाईन नकाशा टाईल्स कॅश' : 'Pre-cache Map Tiles'}
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[94dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[#cce0d2] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0b3326] text-white shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold truncate">
              {isMr ? 'ऑफलाईन नकाशा टाईल्स कॅश (Pre-cache Map)' : 'Pre-cache Offline Map Tiles'}
            </h2>
            <p className="text-[11px] text-emerald-200/90 truncate mt-0.5 tabular-nums">
              {isMr
                ? `IndexedDB साठा: ${stats.totalTiles} टाईल्स · ${formatBytesCompact(stats.totalBytes)}`
                : `IndexedDB Cache: ${stats.totalTiles} tiles · ${formatBytesCompact(stats.totalBytes)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isDownloading) handleCancelDownload();
              onClose();
            }}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {/* Active Basemap Toggle Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl bg-[#f4f9f6] border border-[#d4e3d9]">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#10251c]">
                {isMr ? 'नकाशावर ऑफलाईन बॅकग्राउंड दाखवा' : 'Show Offline Basemap Under Grid'}
              </div>
              <div className="text-[11px] text-[#4c695a] leading-snug">
                {isMr
                  ? 'जंगलात इंटरनेट नसताना कॅश केलेले उपग्रह / भूप्रदेश चित्र कूप सीमेखाली दिसेल.'
                  : 'Displays cached satellite / terrain tiles under your coupe boundary & GPS dot.'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showOfflineBasemap && (
                <label className="flex items-center gap-1.5 text-[11px] text-[#355444] font-medium">
                  <span>{Math.round(basemapOpacity * 100)}%</span>
                  <input
                    type="range"
                    min={0.25}
                    max={1}
                    step={0.05}
                    value={basemapOpacity}
                    onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
                    className="w-16 accent-[#0f5132] cursor-pointer"
                    aria-label="Basemap Opacity"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => onToggleOfflineBasemap(!showOfflineBasemap)}
                className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  showOfflineBasemap
                    ? 'bg-[#0f5132] text-white'
                    : 'bg-white text-[#1a3a2b] border border-[#c8dcd0] hover:bg-[#ebf4ee]'
                }`}
              >
                {showOfflineBasemap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>
                  {showOfflineBasemap
                    ? isMr
                      ? 'चालू'
                      : 'Visible'
                    : isMr
                    ? 'बंद'
                    : 'Hidden'}
                </span>
              </button>
            </div>
          </div>

          {/* Basemap Imagery Layer Segmented Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#183829] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0f5132]" />
                {isMr ? 'इमेजरी प्रकार निवडा' : 'Imagery Layer'}
              </span>
              {isOffline && (
                <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                  <WifiOff className="w-3 h-3" />
                  {isMr ? 'ऑफलाईन मोड (फक्त कॅश)' : 'Offline (cached view)'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#ebf3ed] border border-[#d2e3d7]">
              {(['esri_satellite', 'esri_topo', 'osm_standard'] as TileSourceId[]).map((id) => {
                const cfg = TILE_SOURCES[id];
                const active = sourceId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSourceId(id);
                      onChangeSource(id);
                    }}
                    className={`min-h-[38px] px-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap truncate ${
                      active
                        ? 'bg-[#0f5132] text-white shadow-xs'
                        : 'text-[#2c4a3c] hover:bg-white/80'
                    }`}
                  >
                    {isMr ? cfg.shortMr : cfg.shortEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Base Map Region Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#183829] flex items-center gap-1.5">
                <SquareDashedMousePointer className="w-3.5 h-3.5 text-[#0f5132]" />
                {isMr
                  ? 'पिवळ्या बॉक्सचे कोपरे ओढून जंगल क्षेत्र निवडा'
                  : 'Drag box corners to choose forest area'}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {geoRef?.hasGeo && rawWorkingPoints.length >= 3 && (
                  <button
                    type="button"
                    onClick={fitToActiveCoupe}
                    className="min-h-[30px] px-2.5 rounded-lg bg-[#ebf5ee] hover:bg-[#dcf0e3] border border-[#c5dfce] text-[#0f5132] text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>{isMr ? 'कूप बसवा' : 'Fit Coupe'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCenterOnGps}
                  disabled={isLocating}
                  className="min-h-[30px] px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <Crosshair className="w-3 h-3" />
                  <span>{isLocating ? '...' : isMr ? 'माझे GPS' : 'My GPS'}</span>
                </button>
              </div>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-[#b9d4c3] bg-[#0d231b] h-[230px] sm:h-[260px] select-none touch-none">
              <canvas
                ref={canvasRef}
                onPointerDown={handleSelectorPointerDown}
                onPointerMove={handleSelectorPointerMove}
                onPointerUp={handleSelectorPointerUp}
                onPointerCancel={handleSelectorPointerUp}
                className="w-full h-full block cursor-grab active:cursor-grabbing"
              />

              {/* Selector Map Zoom +/- Controls */}
              <div className="absolute top-2.5 right-2.5 flex flex-col bg-white/95 rounded-xl shadow-md border border-slate-200 overflow-hidden divide-y divide-slate-200">
                <button
                  type="button"
                  onClick={() => setViewZoom((z) => Math.min(16, z + 1))}
                  className="w-9 h-9 flex items-center justify-center text-slate-800 hover:bg-slate-100 cursor-pointer"
                  aria-label="Zoom in selector map"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewZoom((z) => Math.max(7, z - 1))}
                  className="w-9 h-9 flex items-center justify-center text-slate-800 hover:bg-slate-100 cursor-pointer"
                  aria-label="Zoom out selector map"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Zoom Level Presets (Low-to-Medium Imagery) + Name Input */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ZOOM_PRESETS.map((p) => {
                const selected = minZoom === p.minZ && maxZoom === p.maxZ;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setMinZoom(p.minZ);
                      setMaxZoom(p.maxZ);
                    }}
                    className={`min-h-[38px] px-2 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer text-center ${
                      selected
                        ? 'bg-[#0f5132] text-white border-[#0f5132]'
                        : 'bg-white text-[#234334] border-[#d3e3d9] hover:bg-[#f2f8f4]'
                    }`}
                  >
                    {isMr ? p.mr : p.en}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#355444] mb-1">
                  {isMr ? 'कॅश क्षेत्राचे नाव' : 'Offline Region Name'}
                </label>
                <input
                  type="text"
                  value={regionName}
                  onChange={(e) => setRegionName(e.target.value)}
                  placeholder={isMr ? 'उदा. कक्ष ४२ पेंच' : 'e.g. Comp 42 Pench Beat'}
                  className="w-full h-10 px-3 rounded-xl border border-[#c7dcd0] bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f5132]/30"
                />
              </div>

              <div className="flex flex-col justify-end">
                <div className="h-10 px-3 rounded-xl bg-[#f4f9f6] border border-[#d4e3d9] flex items-center justify-between text-xs tabular-nums">
                  <span className="text-[#4a6758] font-medium">
                    {isMr ? 'अंदाज' : 'Estimate'}
                  </span>
                  <span className={`font-bold ${isOverLimit ? 'text-rose-700' : 'text-[#0f5132]'}`}>
                    {estimatedTiles} · ~{estimatedMb.toFixed(1)} MB
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Download Progress Bar */}
          {isDownloading && downloadProgress && (
            <div className="p-3 rounded-xl bg-[#eef7f1] border border-[#b9dec6] space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#0b3326] tabular-nums">
                <span>
                  {isMr
                    ? `टाईल्स जतन होत आहेत: ${downloadProgress.completed} / ${downloadProgress.total}`
                    : `Saving tiles to IndexedDB: ${downloadProgress.completed} / ${downloadProgress.total}`}
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-white overflow-hidden border border-[#c4e2ce]">
                <div
                  className="h-full bg-[#0f5132] transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.02, progressPct / 100)})` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#355745] tabular-nums">
                <span>
                  {isMr
                    ? `नवीन: ${downloadProgress.downloaded} · आधीचे: ${downloadProgress.skippedCached}`
                    : `Downloaded: ${downloadProgress.downloaded} · Already cached: ${downloadProgress.skippedCached}`}
                </span>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="text-rose-700 font-semibold hover:underline cursor-pointer"
                >
                  {isMr ? 'थांबवा' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Status Feedback Banner */}
          {statusMessage && (
            <div
              className={`px-3 py-2.5 rounded-xl text-xs font-medium flex items-start gap-2 border ${
                statusMessage.tone === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : statusMessage.tone === 'warn'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              {statusMessage.tone === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Downloaded Offline Regions List */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#153426] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#0f5132]" />
                {isMr
                  ? `डाऊनलोड केलेली ऑफलाईन क्षेत्रे (${stats.regions.length})`
                  : `Cached Offline Regions (${stats.regions.length})`}
              </h3>
              {stats.totalTiles > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={isDownloading}
                  className="text-[11px] font-semibold text-rose-700 hover:underline cursor-pointer disabled:opacity-50"
                >
                  {isMr ? 'सर्व कॅश साफ करा' : 'Clear All Cache'}
                </button>
              )}
            </div>

            {stats.regions.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                {isMr
                  ? 'अद्याप कोणतेही क्षेत्र ऑफलाईन कॅश केलेले नाही. वर क्षेत्र निवडून "टाईल्स डाऊनलोड करा" वर टॅप करा.'
                  : 'No offline regions saved yet. Position the yellow box above and tap "Download Offline Tiles".'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {stats.regions.map((reg) => {
                  const srcCfg = TILE_SOURCES[reg.sourceId];
                  return (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 transition"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSourceId(reg.sourceId);
                          onChangeSource(reg.sourceId);
                          setSelectionBounds(reg.bounds);
                          setViewCenter({
                            lat: (reg.bounds.north + reg.bounds.south) / 2,
                            lon: (reg.bounds.east + reg.bounds.west) / 2
                          });
                          setViewZoom(Math.max(11, Math.min(14, reg.minZoom + 1)));
                        }}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {reg.name}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                          {isMr ? srcCfg?.shortMr : srcCfg?.shortEn} · z{reg.minZoom}–{reg.maxZoom} ·{' '}
                          {reg.tileCount} {isMr ? 'टाईल्स' : 'tiles'} · {formatBytesCompact(reg.sizeBytes)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRegion(reg.id)}
                        disabled={isDownloading}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer transition"
                        title={isMr ? 'हे क्षेत्र काढा' : 'Delete cached region'}
                        aria-label="Delete cached region"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer CTA */}
        <div className="px-4 py-3 bg-[#f7faf8] border-t border-[#d8e6dd] flex items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer transition"
          >
            {isMr ? 'बंद करा' : 'Close'}
          </button>

          <button
            type="button"
            onClick={handleStartDownload}
            disabled={isDownloading || isOverLimit}
            className="flex-1 sm:flex-none min-h-[44px] px-5 rounded-xl bg-[#0f5132] hover:bg-[#0b3e26] disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="tabular-nums">
              {isDownloading
                ? isMr
                  ? `डाऊनलोड सुरू (${progressPct}%)...`
                  : `Downloading (${progressPct}%)...`
                : isMr
                ? `ऑफलाईन कॅश करा (${estimatedTiles} टाईल्स)`
                : `Download Offline Tiles (${estimatedTiles})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
