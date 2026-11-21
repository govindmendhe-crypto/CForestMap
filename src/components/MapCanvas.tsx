/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Move,
  MapPin,
  Compass,
  Copy,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  LocateFixed,
  Target,
  Ruler,
  Undo2,
  Lock,
  PencilLine,
  Map as MapIcon,
  Download
} from 'lucide-react';
import {
  Point2D,
  GeoRef,
  ScaleConfig,
  FeaturePreset,
  Orientation,
  UserLocation,
  EdgeGpsPoint,
  SectionLineData,
  TouchedGpsLocation,
  LandIdentifierType,
  NonWorkingAreaItem,
  LiveGpsTelemetry,
  LiveWorkableWalkState,
  BoundaryPillar,
  NavTarget
} from '../types/mapTypes';
import {
  isPointInPolygon,
  calcAreaHa,
  bearingToCompass,
  extract4CardinalEdgeGpsPoints,
  computeForestryCellLabel,
  generateForestrySurveyGrid,
  computeSectionLines,
  findNearestPointOnPolygon,
  meterToLatLon,
  latLonToMeter,
  toDMS,
  formatToDMY,
  computeStrictInteriorBaseline,
  calculateGeographicBearing,
  unrotatePoint,
  bufferPolylineToPolygon,
  oneSidedBufferPolylineToPolygon,
  calculatePolylineLengthM
} from '../utils/geoUtils';
import { getTranslation } from '../utils/i18n';
import { OfflineGnssStatus } from '../utils/offlineGnss';
import {
  TileSourceId,
  TILE_SOURCES,
  lonLatToTileXY,
  tileXYToBounds,
  resolveTileWithOverzoom
} from '../utils/offlineTileCache';
import { GpsQualityDashboard } from './GpsQualityDashboard';
import { MapCompassWidget } from './MapCompassWidget';

interface MapCanvasProps {
  lang: string;
  orientation: Orientation;
  activeScale: ScaleConfig;
  gridWidthM: number;
  gridHeightM: number;
  rawWorkingPoints: Point2D[];
  rawNonWorkingPolygons: Point2D[][];
  nonWorkingItems?: NonWorkingAreaItem[];
  liveRoadTrack?: {
    active: boolean;
    mode: 'gps' | 'map' | null;
    kind?: 'road' | 'nala' | 'patch';
    widthM: number;
    nalaSide?: 'left' | 'right';
    points: Point2D[];
  };
  onMapTapRoadPoint?: (pt: Point2D) => void;
  liveWorkableWalk?: LiveWorkableWalkState;
  liveGpsTelemetry?: LiveGpsTelemetry;
  onMapTapWorkablePoint?: (pt: Point2D) => void;
  geoRef: GeoRef;
  isNonWorkingNil: boolean;
  baselineOption: 'horizontal' | 'vertical' | 'grid_parallel' | 'longest_axis';
  manualBaselineOffset: Point2D;
  onUpdateBaselineOffset: (offset: Point2D) => void;
  showSectionLines: boolean;
  displayOptions: {
    showBoundary?: boolean;
    showNonWorking?: boolean;
    showLandmarks?: boolean;
    showBaseline: boolean;
    showBaselineMeas: boolean;
    showSectionLines: boolean;
    showEdgeGps: boolean;
    showGridNaming: boolean;
    showGridNumbers: boolean;
    showGridLines: boolean;
    showCompass?: boolean;
    combineTitleLines?: boolean;
  };
  features: FeaturePreset[];
  boundaryPillars?: BoundaryPillar[];
  activePlaceFeatureId: string | null;
  onPlacedFeature: (featureId: string, pt: Point2D) => void;
  userLocation: UserLocation | null;
  liveMovementTrail?: Point2D[];
  onSetUserLocation: (loc: UserLocation | null) => void;
  placeLocationMode: boolean;
  onSetPlaceLocationMode: (val: boolean) => void;

  // Header Details
  treatmentTitle: string;
  village?: string;
  landIdentifierType?: LandIdentifierType;
  landIdentifierValue?: string;
  division: string;
  subDivision: string;
  range: string;
  round: string;
  beat: string;
  compartmentNo: string;
  mapDate: string;
  totalArea: string;
  treatmentArea: string;
  nonTreatmentArea: string;
  treatmentType: string;
  customTreatmentType: string;

  // Signatures
  vanrakshak: string;
  vanpal: string;
  rfo: string;

  // Legend
  legendPos: string;
  legendLayout?: 'box' | 'strip';
  legendSize?: 'compact' | 'standard';
  legendOffset: Point2D;
  onUpdateLegendOffset: (offset: Point2D) => void;

  // Styling
  fontSize: string;
  textColor: string;
  fontFamily: string;

  // Interaction Mode
  activeInteractionMode: 'pan' | 'baseline' | 'place' | 'rotate';
  onSetInteractionMode: (mode: 'pan' | 'baseline' | 'place' | 'rotate') => void;

  // Baseline & Section Lines Controls (Directly above map)
  baselineAngleDeg?: number;
  onBaselineAngleChange?: (deg: number) => void;
  onBaselineOptionChange?: (opt: 'horizontal' | 'vertical' | 'longest_axis' | 'grid_parallel') => void;
  onResetBaselineOffset?: () => void;
  onToggleSectionLines?: (val: boolean) => void;
  sectionLineOffset?: number;
  onStepSectionLine?: (deltaM: number) => void;
  onResetSectionLineOffset?: () => void;

  // Rotation & Display Options
  rotationDeg?: number;
  onRotationChange?: (deg: number) => void;
  onToggleDisplayOption?: (key: string, val: boolean) => void;
  plantSpacingM?: number;
  targetTotalPlants?: number;

  // Canvas Reference Exporter & Mobile / Wizard Integration
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onRegisterFrame: (frame: any) => void;
  onStatusChange: (text: string) => void;
  onOpenMapSetupStep?: (focus?: 'lines' | 'landmarks') => void;
  isMobileMapExpanded?: boolean;
  onToggleMobileMapExpanded?: () => void;

  // Real-time GPS Quality Dashboard & Go-To Compass Navigation
  isWatchingGPS?: boolean;
  onToggleGPS?: () => void;
  gpsAccuracyGateM?: number;
  onGpsAccuracyGateChange?: (gateM: number) => void;
  gnssStatus?: OfflineGnssStatus | null;
  onRetryGpsLock?: () => void;
  navTarget?: NavTarget | null;
  onSelectNavTarget?: (target: NavTarget | null) => void;
  onStartGpsForNav?: () => void;

  // View-Only Lock Mode (prevents accidental dragging of imported KML/KMZ maps)
  isViewOnlyMode?: boolean;
  onExitViewOnlyMode?: () => void;

  // Offline Pre-Cached Basemap Tiles (IndexedDB)
  showOfflineBasemap?: boolean;
  onToggleOfflineBasemap?: (val: boolean) => void;
  offlineBasemapSource?: TileSourceId;
  onChangeOfflineBasemapSource?: (src: TileSourceId) => void;
  offlineBasemapOpacity?: number;
  onChangeOfflineBasemapOpacity?: (val: number) => void;
  offlineTilesVersion?: number;
  cachedTileCount?: number;
  onOpenOfflineTiles?: () => void;
}

const SF = 2; // High-resolution scale factor for Retina crispness
const MM_PX = 3.6 * SF;
const CM_PX = 36 * SF;

// ============================================================================
// MANDATORY CANVAS GRID SNAPPING & BASELINE ENGINE (Strict Non-Configurable)
// ============================================================================
// Grid Hierarchy on Canvas:
// Level 0: MM_PX       (1mm = 7.2px)  - Lightest Green (Minor fine grid) -> STRICTLY EXCLUDED
// Level 1: MM_PX * 5   (5mm = 36px)   - Intermediate Green (Secondary medium) -> SNAP TARGET
// Level 2: MM_PX * 10  (10mm = 72px)  - Intermediate Green (Secondary medium) -> SNAP TARGET
// Level 3: MM_PX * 20  (20mm = 144px) - Darkest / Thickest Green (Primary major) -> PRIMARY SNAP TARGET & BASELINE ANCHOR

export const PRIMARY_MAJOR_STEP = MM_PX * 20; // 20mm Darkest / Thickest Green line (144px at SF=2)
export const INTERMEDIATE_STEP_10 = MM_PX * 10; // 10mm Intermediate Green line (72px at SF=2)
export const INTERMEDIATE_FINE_STEP = MM_PX * 5; // 5mm Intermediate Green line (36px at SF=2)

/**
 * Snaps a pixel coordinate strictly to Darkest (20mm) and Intermediate (5mm / 10mm) green lines.
 * Strictly excludes and disables snapping to 1mm Lightest Green lines (Minor fine grid lines).
 * Includes magnetic locking to Darkest / Thickest Green lines.
 */
export function snapToAllowedGridLine(currentPx: number, originPx: number): number {
  const rel = currentPx - originPx;

  // 1. Check proximity to nearest Darkest / Thickest Green line (20mm = 144px)
  const nearestMajorRel = Math.round(rel / PRIMARY_MAJOR_STEP) * PRIMARY_MAJOR_STEP;
  const distToMajor = Math.abs(rel - nearestMajorRel);

  // Magnetic threshold for Darkest Green line (~8mm = 57.6px)
  if (distToMajor <= 8 * MM_PX) {
    return originPx + nearestMajorRel;
  }

  // 2. Otherwise snap strictly to Intermediate Green lines (5mm = 36px)
  // Covers both 5mm and 10mm intermediate lines while strictly bypassing all 1mm Lightest Green lines
  const nearestIntermediateRel = Math.round(rel / INTERMEDIATE_FINE_STEP) * INTERMEDIATE_FINE_STEP;
  return originPx + nearestIntermediateRel;
}

/**
 * Snaps a relative pixel delta or offset strictly to Darkest & Intermediate green steps.
 */
export function snapRelativeOffsetToAllowedGrid(offset: number): number {
  const nearestMajor = Math.round(offset / PRIMARY_MAJOR_STEP) * PRIMARY_MAJOR_STEP;
  if (Math.abs(offset - nearestMajor) <= 8 * MM_PX) {
    return nearestMajor;
  }
  return Math.round(offset / INTERMEDIATE_FINE_STEP) * INTERMEDIATE_FINE_STEP;
}

function distToSegmentSq(p: Point2D, a: Point2D, b: Point2D): number {
  const l2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
  if (l2 === 0) return (p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
}

export const MapCanvas: React.FC<MapCanvasProps> = (props) => {
  const { lang, canvasRef } = props;
  const t = (k: string) => getTranslation(k, lang);

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [viewPan, setViewPan] = useState<Point2D>({ x: 0, y: 0 });
  const [isPanPadOpen, setIsPanPadOpen] = useState(false);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [followGps, setFollowGps] = useState(false);
  const [panOffset, setPanOffset] = useState<Point2D>({ x: 0, y: 0 });
  const [internalRotationDeg, setInternalRotationDeg] = useState(0);
  const rotationDeg = props.rotationDeg !== undefined ? props.rotationDeg : internalRotationDeg;
  const setRotationDeg = useCallback(
    (degOrFn: number | ((prev: number) => number)) => {
      const nextDeg = typeof degOrFn === 'function' ? degOrFn(rotationDeg) : degOrFn;
      const normalized = ((Math.round(nextDeg) % 360) + 360) % 360;
      setInternalRotationDeg(normalized);
      props.onRotationChange?.(normalized);
    },
    [rotationDeg, props.onRotationChange]
  );

  // Touch tracking for pinch-to-zoom
  const touchStateRef = useRef<{
    activeTouches: Map<number, { x: number; y: number }>;
    startDistance: number;
    startZoom: number;
    startMidpoint: Point2D;
    startPan: Point2D;
  }>({
    activeTouches: new Map(),
    startDistance: 0,
    startZoom: 1.0,
    startMidpoint: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 }
  });

  const isDraggingRef = useRef(false);
  const isDraggingViewPanRef = useRef(false);
  const viewPanClientStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const viewPanStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const baselineOffsetStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const legendOffsetStartRef = useRef<Point2D>({ x: 0, y: 0 });
  const isDraggingLegendRef = useRef(false);
  const isDraggingBaselineRef = useRef(false);
  const isDraggingRotateRef = useRef(false);
  const dragStartAngleRef = useRef(0);
  const startRotationDegRef = useRef(0);
  const lastFrameKeyRef = useRef<string>('');
  const [basemapTick, setBasemapTick] = useState(0);
  const basemapTickScheduledRef = useRef(false);

  // Interactive Touched GPS on Map
  const [touchedGps, setTouchedGps] = useState<TouchedGpsLocation | null>(null);
  const [copiedGps, setCopiedGps] = useState(false);
  const pointerDownPosRef = useRef<Point2D>({ x: 0, y: 0 });

  // Quick On-Map Distance & Area Ruler (stored in true unrotated ground meters)
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Point2D[]>([]);

  // Dimensions based on orientation (Fits strictly inside A4 297×210mm / 210×297mm at exact 7.2 px/mm scale with zero cutoff)
  const isLandscape = props.orientation === 'landscape';
  const canvasWidth = isLandscape ? 2138 : 1512;
  const canvasHeight = isLandscape ? 1512 : 2138;

  // Auto-fit zoom on container resize, orientation change, or mobile expand/collapse
  const lastFittedSizeRef = useRef<{ w: number; h: number; canvasW: number; canvasH: number }>({
    w: 0,
    h: 0,
    canvasW: 0,
    canvasH: 0
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fitToBox = (force = false) => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 40 || ch <= 40) return;
      const prev = lastFittedSizeRef.current;
      const sizeChanged =
        force ||
        Math.abs(cw - prev.w) > 12 ||
        Math.abs(ch - prev.h) > 12 ||
        prev.canvasW !== canvasWidth ||
        prev.canvasH !== canvasHeight;
      if (!sizeChanged) return;

      lastFittedSizeRef.current = { w: cw, h: ch, canvasW: canvasWidth, canvasH: canvasHeight };
      const pad = cw < 500 ? 8 : 20;
      const fit = Math.min((cw - pad) / (canvasWidth / 2), (ch - pad) / (canvasHeight / 2));
      setZoomLevel(Math.max(0.11, Math.min(1.0, fit)));
      setViewPan({ x: 0, y: 0 });
    };

    const timer = setTimeout(() => fitToBox(true), 40);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => fitToBox(false))
        : null;
    observer?.observe(el);

    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [canvasWidth, canvasHeight, props.isMobileMapExpanded]);

  // Graph area aligned to whole 1cm/2cm squares: 28cm × 18cm in Landscape, 20cm × 26cm in Portrait
  const mapBounds = React.useMemo(() => {
    if (isLandscape) {
      const graphW = 28 * CM_PX; // 28 cm (280 mm)
      const graphH = 18 * CM_PX; // 18 cm (180 mm)
      const left = Math.round((canvasWidth - graphW) / 2);
      const top = 96;
      return {
        left,
        right: left + graphW,
        top,
        bottom: top + graphH
      };
    } else {
      const graphW = 20 * CM_PX; // 20 cm (200 mm)
      const graphH = 26 * CM_PX; // 26 cm (260 mm)
      const left = Math.round((canvasWidth - graphW) / 2);
      const top = 100;
      return {
        left,
        right: left + graphW,
        top,
        bottom: top + graphH
      };
    }
  }, [isLandscape, canvasWidth]);

  const gridOriginX = mapBounds.left;
  const gridOriginY = mapBounds.top;

  // Base Origin memoized deterministically: strictly anchored to Darkest / Thickest Green Line (20mm)
  const baseOrigin = React.useMemo<Point2D>(() => {
    const cX = (mapBounds.left + mapBounds.right) / 2;
    const cY = (mapBounds.top + mapBounds.bottom) / 2;
    return {
      x: gridOriginX + Math.round((cX - gridOriginX) / PRIMARY_MAJOR_STEP) * PRIMARY_MAJOR_STEP,
      y: gridOriginY + Math.round((cY - gridOriginY) / PRIMARY_MAJOR_STEP) * PRIMARY_MAJOR_STEP
    };
  }, [mapBounds, gridOriginX, gridOriginY]);

  // Transformed and rotated points memoized deterministically
  const { transformedWorking, transformedNonWorking, transformedNonWorkingItems, transformedLiveRoad, centroidMeters } = React.useMemo(() => {
    if (!props.rawWorkingPoints || props.rawWorkingPoints.length === 0) {
      const preItems: NonWorkingAreaItem[] =
        props.nonWorkingItems && props.nonWorkingItems.length > 0
          ? props.nonWorkingItems
          : (props.rawNonWorkingPolygons || []).map((pts, idx) => ({
              id: `nw_pre_${idx}`,
              fileName: `Non-Working ${idx + 1}`,
              pts,
              areaHa: 0,
              category: 'patch' as const
            }));
      return {
        transformedWorking: [] as Point2D[],
        transformedNonWorking: props.rawNonWorkingPolygons || ([] as Point2D[][]),
        transformedNonWorkingItems: preItems,
        transformedLiveRoad: props.liveRoadTrack?.points || ([] as Point2D[]),
        centroidMeters: { x: 0, y: 0 }
      };
    }

    let rcx = 0;
    let rcy = 0;
    props.rawWorkingPoints.forEach((p) => {
      rcx += p.x;
      rcy += p.y;
    });
    rcx /= props.rawWorkingPoints.length;
    rcy /= props.rawWorkingPoints.length;

    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotPt = (p: Point2D): Point2D => {
      const dx = p.x - rcx;
      const dy = p.y - rcy;
      return {
        x: Math.round((rcx + dx * cos - dy * sin) * 10) / 10,
        y: Math.round((rcy + dx * sin + dy * cos) * 10) / 10
      };
    };

    const tw = props.rawWorkingPoints.map((p) => {
      const dx = p.x - rcx;
      const dy = p.y - rcy;
      return {
        x: Math.round(rcx + dx * cos - dy * sin),
        y: Math.round(rcy + dx * sin + dy * cos)
      };
    });

    const tnw = (props.rawNonWorkingPolygons || []).map((poly) =>
      poly.map((p) => rotPt(p))
    );

    const sourceNonWorkingItems: NonWorkingAreaItem[] =
      props.nonWorkingItems && props.nonWorkingItems.length > 0
        ? props.nonWorkingItems
        : (props.rawNonWorkingPolygons || []).map((pts, idx) => ({
            id: `nw_raw_${idx}`,
            fileName: `Non-Working ${idx + 1}`,
            pts,
            areaHa: 0,
            category: 'patch' as const
          }));

    const tnwItems: NonWorkingAreaItem[] = sourceNonWorkingItems.map((it) => ({
      ...it,
      pts: it.pts.map((p) => rotPt(p)),
      centerlinePts: it.centerlinePts ? it.centerlinePts.map((p) => rotPt(p)) : undefined
    }));

    const tLiveRoad = (props.liveRoadTrack?.points || []).map((p) => rotPt(p));

    let cx = 0;
    let cy = 0;
    tw.forEach((p) => {
      cx += p.x;
      cy += p.y;
    });
    cx /= tw.length;
    cy /= tw.length;

    return {
      transformedWorking: tw,
      transformedNonWorking: tnw,
      transformedNonWorkingItems: tnwItems,
      transformedLiveRoad: tLiveRoad,
      centroidMeters: { x: cx, y: cy }
    };
  }, [props.rawWorkingPoints, props.rawNonWorkingPolygons, props.nonWorkingItems, props.liveRoadTrack?.points, rotationDeg]);

  // Baseline calculation memoized: computes strict interior baseline & exact alignment offset
  const baselineCalc = React.useMemo(() => {
    if (transformedWorking.length < 3) return null;

    const ppm = props.activeScale.pxPer100m / 100;
    return computeStrictInteriorBaseline(transformedWorking, {
      option: props.baselineOption,
      manualOffset: props.manualBaselineOffset,
      bearingDeg: props.baselineAngleDeg,
      screenSnap: {
        mapBounds,
        baseOrigin,
        panOffset,
        ppm,
        primaryMajorStep: PRIMARY_MAJOR_STEP
      }
    });
  }, [
    transformedWorking,
    props.baselineOption,
    props.manualBaselineOffset,
    props.baselineAngleDeg,
    mapBounds,
    baseOrigin,
    panOffset,
    props.activeScale.pxPer100m
  ]);

  const autoAlignOffset = baselineCalc?.autoAlignOffset || { x: 0, y: 0 };

  // Coordinate Conversion Helpers between Ground Meters and Canvas Screen Pixels
  // autoAlignOffset guarantees that the 0-metre starting point (P1) on the polygon edge lands precisely on the intersection of two darkest green lines
  const meterToPixel = useCallback(
    (mx: number, my: number): Point2D => {
      const ppm = props.activeScale.pxPer100m / 100;
      return {
        x: baseOrigin.x + panOffset.x + autoAlignOffset.x + (mx - centroidMeters.x) * ppm,
        y: baseOrigin.y + panOffset.y + autoAlignOffset.y - (my - centroidMeters.y) * ppm
      };
    },
    [baseOrigin.x, baseOrigin.y, panOffset.x, panOffset.y, autoAlignOffset.x, autoAlignOffset.y, centroidMeters.x, centroidMeters.y, props.activeScale.pxPer100m]
  );

  const pixelToMeter = useCallback(
    (px: number, py: number): Point2D => {
      const ppm = props.activeScale.pxPer100m / 100;
      return {
        x: centroidMeters.x + (px - (baseOrigin.x + panOffset.x + autoAlignOffset.x)) / ppm,
        y: centroidMeters.y - (py - (baseOrigin.y + panOffset.y + autoAlignOffset.y)) / ppm
      };
    },
    [baseOrigin.x, baseOrigin.y, panOffset.x, panOffset.y, autoAlignOffset.x, autoAlignOffset.y, centroidMeters.x, centroidMeters.y, props.activeScale.pxPer100m]
  );

  // Compute Base Line: P1 is the 0-metre starting point, touches polygon edge, and begins at crossing of two darkest green lines
  const computeBaselineCoords = useCallback(() => {
    if (!baselineCalc) return null;
    return {
      p1: baselineCalc.p1,
      p2: baselineCalc.p2,
      origin0: baselineCalc.p1,
      bearingDeg: baselineCalc.bearingDeg
    };
  }, [baselineCalc]);

  // Build categorized Go-To Compass Field Waypoints (Pillars, Boundary Corners, Base Line, Grid Pegs, Landmarks)
  const navWaypoints = React.useMemo<NavTarget[]>(() => {
    const list: NavTarget[] = [];
    const hasGeo = Boolean(props.geoRef?.hasGeo);
    const toGeo = (pt: Point2D) =>
      hasGeo ? meterToLatLon(pt, props.geoRef) : { lat: 0, lon: 0 };

    // 1. Stamped Boundary Pillars (BP-1, BP-2, ...)
    (props.boundaryPillars || []).forEach((bp, idx) => {
      list.push({
        id: `pillar_${bp.id || idx}`,
        label: bp.label || `BP-${idx + 1}`,
        sublabel: hasGeo
          ? `${bp.lat.toFixed(5)}°N, ${bp.lon.toFixed(5)}°E`
          : undefined,
        category: 'pillar',
        mx: bp.mx,
        my: bp.my,
        lat: bp.lat,
        lon: bp.lon
      });
    });

    // 2. Boundary Corners (evenly sampled to max 24 vertices for dense GPS tracks)
    if (props.rawWorkingPoints.length >= 3) {
      const pts = props.rawWorkingPoints;
      const maxCorners = 24;
      const step = pts.length > maxCorners ? Math.ceil(pts.length / maxCorners) : 1;
      let cornerNum = 1;
      for (let i = 0; i < pts.length; i += step) {
        const pt = pts[i];
        const geo = toGeo(pt);
        list.push({
          id: `corner_${i}`,
          label: lang === 'mr' ? `कोपरा C${cornerNum}` : `Corner C${cornerNum}`,
          sublabel: hasGeo
            ? `${toDMS(geo.lat, true)}, ${toDMS(geo.lon, false)}`
            : undefined,
          category: 'corner',
          mx: pt.x,
          my: pt.y,
          lat: geo.lat,
          lon: geo.lon
        });
        cornerNum++;
      }
    }

    // 3. Base Line Key Stations (Start A, Midpoint, End B)
    if (baselineCalc?.p1 && baselineCalc?.p2 && transformedWorking.length >= 3) {
      const trueP1 =
        rotationDeg !== 0
          ? unrotatePoint(baselineCalc.p1, centroidMeters, rotationDeg)
          : baselineCalc.p1;
      const trueP2 =
        rotationDeg !== 0
          ? unrotatePoint(baselineCalc.p2, centroidMeters, rotationDeg)
          : baselineCalc.p2;
      const trueMid = { x: (trueP1.x + trueP2.x) / 2, y: (trueP1.y + trueP2.y) / 2 };
      const baseLenM = Math.round(Math.hypot(trueP2.x - trueP1.x, trueP2.y - trueP1.y));

      const baseItems: Array<{ id: string; label: string; sub: string; pt: Point2D }> = [
        {
          id: 'base_start',
          label: lang === 'mr' ? 'पाया प्रारंभ A (0m)' : 'Base Start A (0m)',
          sub: lang === 'mr' ? 'मुख्य आधार रेषा प्रारंभ' : 'Base Line 0m origin',
          pt: trueP1
        },
        {
          id: 'base_mid',
          label: lang === 'mr' ? `पाया मध्य (${Math.round(baseLenM / 2)}m)` : `Base Mid (${Math.round(baseLenM / 2)}m)`,
          sub: lang === 'mr' ? 'आधार रेषेचा मध्यबिंदू' : 'Base Line midpoint',
          pt: trueMid
        },
        {
          id: 'base_end',
          label: lang === 'mr' ? `पाया शेवट B (${baseLenM}m)` : `Base End B (${baseLenM}m)`,
          sub: lang === 'mr' ? 'मुख्य आधार रेषा शेवट' : 'Base Line end station',
          pt: trueP2
        }
      ];

      baseItems.forEach((b) => {
        const geo = toGeo(b.pt);
        list.push({
          id: b.id,
          label: b.label,
          sublabel: b.sub,
          category: 'baseline',
          mx: b.pt.x,
          my: b.pt.y,
          lat: geo.lat,
          lon: geo.lon
        });
      });

      // 4. Survey Grid Station Pegs (0, A, B, AL1, AR1, ...)
      try {
        const gridRes = generateForestrySurveyGrid(
          transformedWorking,
          baselineCalc.p1,
          baselineCalc.p2,
          props.gridWidthM,
          props.gridHeightM,
          props.plantSpacingM || 2,
          props.targetTotalPlants,
          props.isNonWorkingNil ? [] : transformedNonWorking,
          props.isNonWorkingNil
        );
        const maxPegs = 80;
        const pegList = gridRes.pegs.slice(0, maxPegs);
        pegList.forEach((peg, idx) => {
          const truePt =
            rotationDeg !== 0
              ? unrotatePoint(peg.pointM, centroidMeters, rotationDeg)
              : peg.pointM;
          const geo = toGeo(truePt);
          list.push({
            id: `peg_${peg.label}_${idx}`,
            label: `${lang === 'mr' ? 'पेग' : 'Peg'} ${peg.label}`,
            sublabel: peg.isBaselineStation
              ? lang === 'mr'
                ? 'पाया रेषा स्टेशन'
                : 'Base Line Station'
              : `${peg.side === 'L' ? 'Left' : 'Right'} Row ${peg.rowNum}`,
            category: 'peg',
            mx: truePt.x,
            my: truePt.y,
            lat: geo.lat,
            lon: geo.lon
          });
        });
      } catch {
        // Ignore grid generation edge errors
      }
    }

    // 5. Placed Landmarks
    (props.features || []).forEach((feat) => {
      if (!feat.enabled || !feat.markers?.length) return;
      const featName = feat.label || (feat.key ? getTranslation(feat.key, lang) : 'Landmark');
      feat.markers.forEach((m, idx) => {
        const geo =
          typeof m.lat === 'number' && typeof m.lon === 'number'
            ? { lat: m.lat, lon: m.lon }
            : toGeo({ x: m.mx, y: m.my });
        list.push({
          id: `lm_${feat.id}_${idx}`,
          label: `${feat.symbol || '📍'} ${m.label || `${featName} ${idx + 1}`}`,
          sublabel: hasGeo
            ? `${geo.lat.toFixed(5)}°N, ${geo.lon.toFixed(5)}°E`
            : undefined,
          category: 'landmark',
          mx: m.mx,
          my: m.my,
          lat: geo.lat,
          lon: geo.lon
        });
      });
    });

    return list;
  }, [
    props.boundaryPillars,
    props.rawWorkingPoints,
    props.geoRef,
    props.gridWidthM,
    props.gridHeightM,
    props.isNonWorkingNil,
    props.plantSpacingM,
    props.targetTotalPlants,
    props.features,
    baselineCalc,
    transformedWorking,
    transformedNonWorking,
    rotationDeg,
    centroidMeters,
    lang
  ]);

  // Smart Auto-Hide Legend Content Model (shared between hit-test sizing & canvas rendering)
  const computeLegendItems = useCallback(() => {
    const showBoundaryRow = props.displayOptions.showBoundary !== false;
    const showBaselineRow = Boolean(props.displayOptions.showBaseline);
    const showGridRow = Boolean(props.displayOptions.showGridLines);
    const showSectionRow = Boolean(props.showSectionLines || props.displayOptions.showSectionLines);
    const showNonWorkingLayer = props.displayOptions.showNonWorking !== false && !props.isNonWorkingNil;

    const allNonWorkingItems = props.nonWorkingItems || [];
    const roadItems = showNonWorkingLayer
      ? allNonWorkingItems.filter((it) => it.category === 'road')
      : [];
    const nalaItems = showNonWorkingLayer
      ? allNonWorkingItems.filter((it) => it.category === 'nala')
      : [];
    const nonRoadItems = showNonWorkingLayer
      ? allNonWorkingItems.filter((it) => it.category !== 'road' && it.category !== 'nala')
      : [];
    const parsedNonWorkingArea = parseFloat(props.nonTreatmentArea || '0');
    const hasNonWorkingPatch =
      showNonWorkingLayer &&
      (nonRoadItems.length > 0 ||
        (allNonWorkingItems.length === 0 &&
          (props.rawNonWorkingPolygons.length > 0 || (!Number.isNaN(parsedNonWorkingArea) && parsedNonWorkingArea > 0))));
    const hasRoadNonWorking = showNonWorkingLayer && roadItems.length > 0;
    const hasNalaNonWorking = showNonWorkingLayer && nalaItems.length > 0;

    const showLandmarksLayer = props.displayOptions.showLandmarks !== false;
    const pillarCount = showLandmarksLayer ? (props.boundaryPillars?.length ?? 0) : 0;
    const activeFeats = showLandmarksLayer ? props.features.filter((f) => f.enabled) : [];

    const coreRowCount =
      (showBoundaryRow ? 1 : 0) +
      (showBaselineRow ? 1 : 0) +
      (showGridRow ? 1 : 0) +
      (hasNonWorkingPatch ? 1 : 0) +
      (hasRoadNonWorking ? 1 : 0) +
      (hasNalaNonWorking ? 1 : 0) +
      (showSectionRow ? 1 : 0) +
      (pillarCount > 0 ? 1 : 0);

    return {
      showBoundaryRow,
      showBaselineRow,
      showGridRow,
      showSectionRow,
      hasNonWorkingPatch,
      hasRoadNonWorking,
      hasNalaNonWorking,
      roadItems,
      nalaItems,
      pillarCount,
      activeFeats,
      coreRowCount
    };
  }, [
    props.displayOptions.showBoundary,
    props.displayOptions.showBaseline,
    props.displayOptions.showGridLines,
    props.displayOptions.showSectionLines,
    props.displayOptions.showNonWorking,
    props.displayOptions.showLandmarks,
    props.showSectionLines,
    props.isNonWorkingNil,
    props.nonWorkingItems,
    props.rawNonWorkingPolygons.length,
    props.nonTreatmentArea,
    props.boundaryPillars,
    props.features
  ]);

  // Legend size & bounds (supports compact/standard Corner Box with 4 corners + 2-col landmarks, and Horizontal Bottom Strip)
  const getLegendRect = useCallback(() => {
    const layout = props.legendLayout || 'box';
    const isCompact = (props.legendSize || 'compact') === 'compact';
    const model = computeLegendItems();

    if (layout === 'strip') {
      const totalItems = model.coreRowCount + model.activeFeats.length;
      const colsPerRow = isCompact ? 4 : 3;
      const stripRows = Math.max(1, Math.ceil(totalItems / colsPerRow));
      const rowH = (isCompact ? 13.5 : 16.5) * SF;
      const padV = (isCompact ? 5 : 6.5) * SF;
      const h = Math.max((isCompact ? 24 : 28) * SF, stripRows * rowH + padV * 2);
      const w = mapBounds.right - mapBounds.left - 12 * SF;

      const baseX = mapBounds.left + 6 * SF;
      const baseY = mapBounds.bottom - h - 6 * SF;
      const clampedY = Math.max(
        mapBounds.top + 6 * SF,
        Math.min(mapBounds.bottom - h - 4 * SF, baseY + props.legendOffset.y)
      );

      return {
        x: baseX,
        y: clampedY,
        w,
        h
      };
    }

    // Corner Box Mode (Compact survey-style default is ~45% smaller than previous 264px box)
    const w = (isCompact ? 184 : 228) * SF;
    const headerH = (isCompact ? 31 : 39) * SF;
    const rowH = (isCompact ? 14.5 : 18) * SF;
    const featRowH = (isCompact ? 13.5 : 16.5) * SF;
    const featVisualRows =
      model.activeFeats.length === 0
        ? 0
        : model.activeFeats.length >= 2
          ? Math.ceil(model.activeFeats.length / 2)
          : 1;
    const dividerPad = featVisualRows > 0 ? (isCompact ? 5 : 7) * SF : 0;
    const topBodyPad = (isCompact ? 5 : 6) * SF;
    const bottomPad = (isCompact ? 5 : 7) * SF;
    const h =
      headerH +
      topBodyPad +
      Math.max(1, model.coreRowCount) * rowH +
      dividerPad +
      featVisualRows * featRowH +
      bottomPad;

    const margin = 8 * SF;
    let baseX = mapBounds.right - w - margin;
    let baseY = mapBounds.top + margin;
    if (props.legendPos === 'top_left') {
      baseX = mapBounds.left + margin;
      baseY = mapBounds.top + margin;
    } else if (props.legendPos === 'bottom_right') {
      baseX = mapBounds.right - w - margin;
      baseY = mapBounds.bottom - h - margin;
    } else if (props.legendPos === 'bottom_left') {
      baseX = mapBounds.left + margin;
      baseY = mapBounds.bottom - h - margin;
    }

    // Default anchor snapped strictly to Darkest / Intermediate green lines
    const snappedBaseX = snapToAllowedGridLine(baseX, mapBounds.left);
    const snappedBaseY = snapToAllowedGridLine(baseY, mapBounds.top);

    const clampedX = Math.max(mapBounds.left + 4, Math.min(mapBounds.right - w - 4, snappedBaseX + props.legendOffset.x));
    const clampedY = Math.max(mapBounds.top + 4, Math.min(mapBounds.bottom - h - 4, snappedBaseY + props.legendOffset.y));

    return {
      x: clampedX,
      y: clampedY,
      w,
      h
    };
  }, [computeLegendItems, mapBounds, props.legendLayout, props.legendSize, props.legendPos, props.legendOffset]);

  // Main Canvas Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Green Graph Paper (and Optional IndexedDB Offline Basemap Imagery)
    const x0 = mapBounds.left;
    const x1 = mapBounds.right;
    const y0 = mapBounds.top;
    const y1 = mapBounds.bottom;
    const effectiveBasemapGeoRef: GeoRef | null = props.geoRef?.hasGeo
      ? props.geoRef
      : props.userLocation &&
        typeof props.userLocation.lat === 'number' &&
        typeof props.userLocation.lon === 'number' &&
        Number.isFinite(props.userLocation.lat) &&
        Number.isFinite(props.userLocation.lon) &&
        props.userLocation.lat !== 0
      ? (() => {
          const latPerM = 1 / 111320;
          const lonPerM = 1 / (111320 * Math.max(0.2, Math.cos((props.userLocation.lat * Math.PI) / 180)));
          const originLat = props.userLocation.lat - props.userLocation.my * latPerM;
          const originLon = props.userLocation.lon - props.userLocation.mx * lonPerM;
          return {
            hasGeo: true,
            centerLat: originLat,
            centerLon: originLon,
            northLat: originLat + 0.005,
            southLat: originLat - 0.005,
            eastLon: originLon + 0.005,
            westLon: originLon - 0.005
          };
        })()
      : null;

    const basemapActive = Boolean(props.showOfflineBasemap && effectiveBasemapGeoRef);
    ctx.fillStyle = basemapActive ? '#11251d' : '#f3fbf4';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // 1b. Render Pre-cached Offline Basemap Tiles from IndexedDB inside mapBounds
    if (basemapActive && effectiveBasemapGeoRef) {
      const tileSource: TileSourceId = props.offlineBasemapSource || 'esri_satellite';
      const tileAlpha = Math.max(0.2, Math.min(1, props.offlineBasemapOpacity ?? 0.82));
      const ppm = props.activeScale.pxPer100m / 100;
      const cosLat = Math.max(0.2, Math.cos((effectiveBasemapGeoRef.centerLat * Math.PI) / 180));
      const metersPerCanvasPx = 1 / Math.max(0.001, ppm);
      // Optimal Web Mercator zoom matching canvas ground resolution (clamped to low-to-medium/detail range)
      const idealZoom = Math.round(
        Math.log2((156543.03392 * cosLat) / Math.max(0.25, metersPerCanvasPx * 1.4))
      );
      const targetZ = Math.max(10, Math.min(16, idealZoom));

      // Compute geographic bounding box of the 4 corners of mapBounds
      const cornerPx = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 }
      ];
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      cornerPx.forEach((cp) => {
        const m = pixelToMeter(cp.x, cp.y);
        const unrot = rotationDeg !== 0 ? unrotatePoint(m, centroidMeters, rotationDeg) : m;
        const g = meterToLatLon(unrot, effectiveBasemapGeoRef);
        if (g.lat < minLat) minLat = g.lat;
        if (g.lat > maxLat) maxLat = g.lat;
        if (g.lon < minLon) minLon = g.lon;
        if (g.lon > maxLon) maxLon = g.lon;
      });

      const tl = lonLatToTileXY(minLon, maxLat, targetZ);
      const br = lonLatToTileXY(maxLon, minLat, targetZ);
      const cols = br.x - tl.x + 1;
      const rows = br.y - tl.y + 1;

      // Guard against excessive tile draws if zoomed extremely far out
      const effectiveZ = cols * rows > 120 ? Math.max(10, targetZ - 2) : targetZ;
      const tlEff = effectiveZ === targetZ ? tl : lonLatToTileXY(minLon, maxLat, effectiveZ);
      const brEff = effectiveZ === targetZ ? br : lonLatToTileXY(maxLon, minLat, effectiveZ);

      const latLonToCanvasPx = (lat: number, lon: number): Point2D => {
        const m = latLonToMeter({ lat, lon }, effectiveBasemapGeoRef);
        if (rotationDeg !== 0) {
          const rad = (rotationDeg * Math.PI) / 180;
          const c = Math.cos(rad);
          const s = Math.sin(rad);
          const dx = m.x - centroidMeters.x;
          const dy = m.y - centroidMeters.y;
          return meterToPixel(centroidMeters.x + dx * c - dy * s, centroidMeters.y + dx * s + dy * c);
        }
        return meterToPixel(m.x, m.y);
      };

      const onTileDecoded = () => {
        if (!basemapTickScheduledRef.current) {
          basemapTickScheduledRef.current = true;
          requestAnimationFrame(() => {
            basemapTickScheduledRef.current = false;
            setBasemapTick((v) => v + 1);
          });
        }
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ctx.globalAlpha = tileAlpha;
      ctx.imageSmoothingEnabled = true;

      const allowLive = typeof navigator !== 'undefined' && navigator.onLine;
      let drawnTileCount = 0;

      for (let tx = tlEff.x; tx <= brEff.x; tx++) {
        for (let ty = tlEff.y; ty <= brEff.y; ty++) {
          const resolved = resolveTileWithOverzoom(tileSource, effectiveZ, tx, ty, {
            allowNetworkFallback: allowLive,
            onReady: onTileDecoded,
            maxParentDepth: 5
          });
          if (!resolved) continue;
          const b = tileXYToBounds(tx, ty, effectiveZ);
          const pNW = latLonToCanvasPx(b.north, b.west);
          const pNE = latLonToCanvasPx(b.north, b.east);
          const pSW = latLonToCanvasPx(b.south, b.west);
          const ux = pNE.x - pNW.x;
          const uy = pNE.y - pNW.y;
          const vx = pSW.x - pNW.x;
          const vy = pSW.y - pNW.y;

          ctx.save();
          ctx.transform(ux / 256, uy / 256, vx / 256, vy / 256, pNW.x, pNW.y);
          ctx.drawImage(
            resolved.img,
            resolved.sx,
            resolved.sy,
            resolved.sw,
            resolved.sh,
            -0.4,
            -0.4,
            256.8,
            256.8
          );
          ctx.restore();
          drawnTileCount++;
        }
      }

      // If offline & no tiles cached for this exact region, softly keep readable graph paper tint
      if (drawnTileCount === 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f3fbf4';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }

      ctx.restore();
    }

    const gridLines = [
      { s: MM_PX, c: '#d7f2dc', w: 0.5 },
      { s: MM_PX * 5, c: '#9be0a8', w: 0.75 },
      { s: MM_PX * 10, c: '#43a054', w: 1.1 },
      { s: MM_PX * 20, c: '#277a36', w: 1.5 }
    ];
    ctx.save();
    if (basemapActive) {
      // Keep forestry green graph lines crisp yet translucent over satellite/terrain basemap
      ctx.globalAlpha = 0.34;
    }
    gridLines.forEach((L) => {
      ctx.strokeStyle = L.c;
      ctx.lineWidth = L.w * SF;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += L.s) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = y0; y <= y1; y += L.s) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    });
    ctx.restore();

    // Narrow Outer border around sheet
    const fx = 12 * SF;
    const fy = 12 * SF;
    const fw = canvasWidth - 24 * SF;
    const fh = canvasHeight - 24 * SF;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4 * SF;
    ctx.strokeRect(fx, fy, fw, fh);

    // Register strict frame for PDF (guarded against duplicate notifications to prevent render loop)
    const frameKey = `${fx}_${fy}_${fw}_${fh}`;
    if (lastFrameKeyRef.current !== frameKey) {
      lastFrameKeyRef.current = frameKey;
      if (props.onRegisterFrame) {
        const frameData = {
          x: fx,
          y: fy,
          w: fw,
          h: fh,
          wMm: fw / MM_PX,
          hMm: fh / MM_PX
        };
        setTimeout(() => {
          props.onRegisterFrame?.(frameData);
        }, 0);
      }
    }

    // 2. Draw Prominent Streamlined Map Header
    ctx.textAlign = 'center';
    const centerX = canvas.width / 2;
    const maxHeaderWidth = fw - 36 * SF; // Printable width within sheet borders

    // Helper to dynamically adjust font size if text takes more horizontal space
    const getFittedFontSize = (text: string, initialPx: number, minPx: number, weight = 'bold'): number => {
      let sz = initialPx;
      ctx.font = `${weight} ${sz}px ${props.fontFamily}`;
      while (ctx.measureText(text).width > maxHeaderWidth && sz > minPx) {
        sz -= 0.5 * SF;
        ctx.font = `${weight} ${sz}px ${props.fontFamily}`;
      }
      return sz;
    };

    const title =
      props.treatmentTitle.trim() ||
      (props.treatmentType === 'custom'
        ? props.customTreatmentType || 'कूप उपचार नकाशा (Compartment Treatment Map)'
        : t(props.treatmentType));

    const landLabel =
      props.landIdentifierType === 'survey'
        ? t('survey_no')
        : props.landIdentifierType === 'gut'
        ? t('gut_no')
        : t('compartment_no');
    const landVal = props.landIdentifierValue || props.compartmentNo || '-';
    const villagePart = props.village ? `${t('village')}: ${props.village}  |  ` : '';

    const r = props.range.trim() || '-';
    const rd = props.round.trim() || '-';
    const b = props.beat.trim() || '-';
    const adminDetails = `${villagePart}${landLabel}: ${landVal}  |  ${t('beat')}: ${b}  |  ${t('round')}: ${rd}  |  ${t('range')}: ${r}`;

    // Combine 2nd and 3rd lines by default (Space Saver) or when user preference is active
    const combineTitleLines = props.displayOptions.combineTitleLines ?? true;

    if (combineTitleLines) {
      // 2-LINE COMPACT HEADER (2nd and 3rd line written in one line to maximize graph space)
      // Line 1: Main top map/department heading (Biggest: 15 * SF px)
      const line1Text = t('pdf_header');
      const line1Size = getFittedFontSize(line1Text, 15 * SF, 11.5 * SF, '800');
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${line1Size}px ${props.fontFamily}`;
      ctx.fillText(line1Text, centerX, fy + 13 * SF);

      // Line 2: Combined 2nd (Title) & 3rd (Admin details) in one line (Smaller than Line 1: 12 * SF px)
      const combinedLine = `${title}  —  ${adminDetails}`;
      const line2Size = getFittedFontSize(combinedLine, 12 * SF, 9 * SF, 'bold');
      ctx.font = `bold ${line2Size}px ${props.fontFamily}`;

      if (ctx.measureText(combinedLine).width <= maxHeaderWidth) {
        ctx.fillStyle = '#064e3b';
        ctx.fillText(combinedLine, centerX, fy + 28 * SF);
      } else {
        // Fallback: If text is exceptionally long even after scaling down, split cleanly
        const l2Size = getFittedFontSize(title, 12.5 * SF, 10 * SF, 'bold');
        ctx.fillStyle = '#064e3b';
        ctx.font = `bold ${l2Size}px ${props.fontFamily}`;
        ctx.fillText(title, centerX, fy + 22 * SF);

        const l3Size = getFittedFontSize(adminDetails, 10.5 * SF, 8.5 * SF, 'bold');
        ctx.fillStyle = props.textColor;
        ctx.font = `bold ${l3Size}px ${props.fontFamily}`;
        ctx.fillText(adminDetails, centerX, fy + 32 * SF);
      }
    } else {
      // 3-LINE DETAILED HEADER (Strict hierarchy: Line 1 > Line 2 > Line 3)
      // Line 1: Main map heading on top (Biggest: 15 * SF px)
      const line1Text = t('pdf_header');
      const line1Size = getFittedFontSize(line1Text, 15 * SF, 11.5 * SF, '800');
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 ${line1Size}px ${props.fontFamily}`;
      ctx.fillText(line1Text, centerX, fy + 11 * SF);

      // Line 2: Coupe / Treatment Title (Little smaller than Line 1: 12.5 * SF px)
      const line2Size = getFittedFontSize(title, 12.5 * SF, 10 * SF, 'bold');
      ctx.fillStyle = '#064e3b';
      ctx.font = `bold ${line2Size}px ${props.fontFamily}`;
      ctx.fillText(title, centerX, fy + 22 * SF);

      // Line 3: Location / Admin Details (Little smaller than Line 2: 10.5 * SF px)
      const line3Size = getFittedFontSize(adminDetails, 10.5 * SF, 8.5 * SF, 'bold');
      ctx.fillStyle = props.textColor;
      ctx.font = `bold ${line3Size}px ${props.fontFamily}`;
      ctx.fillText(adminDetails, centerX, fy + 31.5 * SF);
    }

    // Top dividing line before graph
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1 * SF;
    ctx.beginPath();
    ctx.moveTo(mapBounds.left, mapBounds.top - 2.5 * SF);
    ctx.lineTo(mapBounds.right, mapBounds.top - 2.5 * SF);
    ctx.stroke();

    // Compute Base Line
    const baseline = computeBaselineCoords();
    const baseLineLenM =
      baseline?.p1 && baseline?.p2
        ? Math.hypot(baseline.p2.x - baseline.p1.x, baseline.p2.y - baseline.p1.y)
        : 0;

    // Administration side-lines
    ctx.textAlign = 'left';
    ctx.font = `bold ${11.5 * SF}px ${props.fontFamily}`;
    let adminY = mapBounds.top + 50 * SF;
    const addLine = (label: string, val: string, color?: string) => {
      if (!val) return;
      ctx.fillStyle = color || props.textColor;
      ctx.fillText(`${label} - ${val}`, mapBounds.left + 4 * SF, adminY);
      adminY += 18 * SF;
    };
    if (props.village) {
      addLine(t('village'), props.village, '#0f172a');
    }
    addLine(landLabel, landVal, '#0f172a');
    addLine(t('division'), props.division, '#0f172a');
    addLine(t('sub_division'), props.subDivision, '#0f172a');
    addLine(t('beat'), props.beat, '#0f172a');
    addLine(
      t('total_area'),
      props.totalArea ? `${props.totalArea} ${t('pdf_area_ha')}` : '',
      '#0f172a'
    );
    addLine(
      t('work_area'),
      props.treatmentArea ? `${props.treatmentArea} ${t('pdf_area_ha')}` : '',
      '#047857'
    );
    if (props.nonTreatmentArea) {
      const nw =
        props.isNonWorkingNil || props.nonTreatmentArea === t('pdf_nil')
          ? t('pdf_nil')
          : `${props.nonTreatmentArea} ${t('pdf_area_ha')}`;
      addLine(t('non_work_area'), nw, '#b45309');
    }
    if (props.mapDate) {
      ctx.fillStyle = '#334155';
      ctx.font = `bold ${11 * SF}px ${props.fontFamily}`;
      ctx.fillText(`${t('date')}: ${formatToDMY(props.mapDate)}`, mapBounds.left + 4 * SF, adminY + 4 * SF);
    }

    // Helper: Draw On-Field Workable Area Session Overlay (Pre-walked roads + live road draft + live Google-Earth polygon)
    const drawLiveWorkableSessionOverlay = () => {
      const walk = props.liveWorkableWalk;
      if (!walk || !walk.active) return;

      const rotForDisplay = (pt: Point2D): Point2D => {
        if (rotationDeg === 0 || transformedWorking.length < 3) return pt;
        const rad = (rotationDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = pt.x - centroidMeters.x;
        const dy = pt.y - centroidMeters.y;
        return {
          x: centroidMeters.x + dx * cos - dy * sin,
          y: centroidMeters.y + dx * sin + dy * cos
        };
      };

      ctx.save();

      // A. Pre-walked session non-workable items (Road, Nala, and Non-Workable Patch)
      // During outer_walk with >= 3 corners, clip filled non-workable polygons strictly INSIDE the walked boundary polygon
      // so portions outside the boundary are not taken into the map.
      if (walk.sessionRoadItems.length > 0) {
        let activeOuterClipPx: Point2D[] | null = null;
        if (walk.phase === 'outer_walk' && walk.outerPoints.length > 0) {
          const outerPtsRot = walk.outerPoints.map(rotForDisplay);
          const liveTipRot =
            walk.inputMode === 'gps' && props.userLocation && !walk.isPaused
              ? rotForDisplay({ x: props.userLocation.mx, y: props.userLocation.my })
              : null;
          const lastO = outerPtsRot[outerPtsRot.length - 1];
          const useTip = Boolean(
            liveTipRot && Math.hypot(liveTipRot.x - lastO.x, liveTipRot.y - lastO.y) >= 0.5
          );
          const combined = useTip && liveTipRot ? [...outerPtsRot, liveTipRot] : outerPtsRot;
          if (combined.length >= 3) {
            activeOuterClipPx = combined.map((p) => meterToPixel(p.x, p.y));
          }
        }

        const drawSessionNonWorkingItems = () => {
          walk.sessionRoadItems.forEach((item) => {
            const poly = item.pts.map(rotForDisplay);
            if (poly.length < 3) return;
            ctx.beginPath();
            const r0 = meterToPixel(poly[0].x, poly[0].y);
            ctx.moveTo(r0.x, r0.y);
            for (let i = 1; i < poly.length; i++) {
              const rp = meterToPixel(poly[i].x, poly[i].y);
              ctx.lineTo(rp.x, rp.y);
            }
            ctx.closePath();
            if (item.category === 'nala') {
              ctx.fillStyle = 'rgba(56, 189, 248, 0.36)';
              ctx.fill();
              ctx.strokeStyle = '#0284c7';
              ctx.lineWidth = 1.7 * SF;
              ctx.stroke();

              if (item.centerlinePts && item.centerlinePts.length >= 2) {
                const bl = item.centerlinePts.map(rotForDisplay);
                ctx.beginPath();
                const b0 = meterToPixel(bl[0].x, bl[0].y);
                ctx.moveTo(b0.x, b0.y);
                for (let i = 1; i < bl.length; i++) {
                  const bp = meterToPixel(bl[i].x, bl[i].y);
                  ctx.lineTo(bp.x, bp.y);
                }
                ctx.strokeStyle = '#0369a1';
                ctx.lineWidth = 1.6 * SF;
                ctx.setLineDash([4 * SF, 3 * SF]);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            } else if (item.category === 'road') {
              ctx.fillStyle = 'rgba(71, 85, 105, 0.48)';
              ctx.fill();
              ctx.strokeStyle = '#1e293b';
              ctx.lineWidth = 1.6 * SF;
              ctx.stroke();

              if (item.centerlinePts && item.centerlinePts.length >= 2) {
                const cl = item.centerlinePts.map(rotForDisplay);
                ctx.beginPath();
                const c0 = meterToPixel(cl[0].x, cl[0].y);
                ctx.moveTo(c0.x, c0.y);
                for (let i = 1; i < cl.length; i++) {
                  const cp = meterToPixel(cl[i].x, cl[i].y);
                  ctx.lineTo(cp.x, cp.y);
                }
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.3 * SF;
                ctx.setLineDash([5 * SF, 3.5 * SF]);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            } else {
              ctx.fillStyle = 'rgba(245, 158, 11, 0.36)';
              ctx.fill();
              ctx.strokeStyle = '#d97706';
              ctx.lineWidth = 1.7 * SF;
              ctx.stroke();
            }
          });
        };

        if (activeOuterClipPx && activeOuterClipPx.length >= 3) {
          // Draw ONLY the portion inside the walked boundary polygon in full styling
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(activeOuterClipPx[0].x, activeOuterClipPx[0].y);
          for (let i = 1; i < activeOuterClipPx.length; i++) {
            ctx.lineTo(activeOuterClipPx[i].x, activeOuterClipPx[i].y);
          }
          ctx.closePath();
          ctx.clip();
          drawSessionNonWorkingItems();
          ctx.restore();
        } else {
          // Before 3 outer boundary corners exist, show full pre-walked features for orientation
          drawSessionNonWorkingItems();
        }
      }

      // B. Active Non-Workable Draft during road_walk phase (Road / Nala One-Sided / Patch Polygon)
      if (walk.phase === 'road_walk' && walk.roadDraftPoints.length > 0) {
        const draft = walk.roadDraftPoints.map(rotForDisplay);
        const activeKind = walk.activeNonWorkingKind || 'road';

        // Include live moving GPS position as temporary rubber-band tip while walking
        const liveTipRaw =
          walk.inputMode === 'gps' && props.userLocation && !walk.isPaused
            ? rotForDisplay({ x: props.userLocation.mx, y: props.userLocation.my })
            : null;
        const lastDraftPt = draft[draft.length - 1];
        const hasLiveTip = Boolean(
          liveTipRaw && Math.hypot(liveTipRaw.x - lastDraftPt.x, liveTipRaw.y - lastDraftPt.y) >= 0.5
        );
        const draftWithLiveTip = hasLiveTip && liveTipRaw ? [...draft, liveTipRaw] : draft;

        if (activeKind === 'patch') {
          if (draftWithLiveTip.length >= 3) {
            ctx.beginPath();
            const p0 = meterToPixel(draftWithLiveTip[0].x, draftWithLiveTip[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < draftWithLiveTip.length; i++) {
              const pp = meterToPixel(draftWithLiveTip[i].x, draftWithLiveTip[i].y);
              ctx.lineTo(pp.x, pp.y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
            ctx.fill();
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 2.0 * SF;
            ctx.stroke();
          } else if (draftWithLiveTip.length === 2) {
            const p0 = meterToPixel(draftWithLiveTip[0].x, draftWithLiveTip[0].y);
            const p1 = meterToPixel(draftWithLiveTip[1].x, draftWithLiveTip[1].y);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 2.0 * SF;
            ctx.stroke();
          }
        } else if (draftWithLiveTip.length >= 2) {
          const previewPoly =
            activeKind === 'nala'
              ? oneSidedBufferPolylineToPolygon(
                  draftWithLiveTip,
                  walk.nalaWidthM || 6,
                  walk.nalaSide || 'right'
                )
              : bufferPolylineToPolygon(draftWithLiveTip, walk.roadWidthM);

          if (previewPoly.length >= 3) {
            ctx.beginPath();
            const q0 = meterToPixel(previewPoly[0].x, previewPoly[0].y);
            ctx.moveTo(q0.x, q0.y);
            for (let i = 1; i < previewPoly.length; i++) {
              const qp = meterToPixel(previewPoly[i].x, previewPoly[i].y);
              ctx.lineTo(qp.x, qp.y);
            }
            ctx.closePath();
            ctx.fillStyle =
              activeKind === 'nala' ? 'rgba(56, 189, 248, 0.34)' : 'rgba(15, 118, 110, 0.30)';
            ctx.fill();
            ctx.strokeStyle = activeKind === 'nala' ? '#0284c7' : '#0f766e';
            ctx.lineWidth = 1.6 * SF;
            ctx.stroke();
          }

          // Walked centerline (Road) or Walked bank line (Nala)
          ctx.beginPath();
          const l0 = meterToPixel(draftWithLiveTip[0].x, draftWithLiveTip[0].y);
          ctx.moveTo(l0.x, l0.y);
          for (let i = 1; i < draftWithLiveTip.length; i++) {
            const lp = meterToPixel(draftWithLiveTip[i].x, draftWithLiveTip[i].y);
            ctx.lineTo(lp.x, lp.y);
          }
          ctx.strokeStyle = activeKind === 'nala' ? '#0369a1' : '#ea580c';
          ctx.lineWidth = 2.2 * SF;
          ctx.setLineDash([6 * SF, 4 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Live rubber-band connector from last captured point to moving GPS beacon
        if (hasLiveTip && liveTipRaw) {
          const lastPx = meterToPixel(lastDraftPt.x, lastDraftPt.y);
          const tipPx = meterToPixel(liveTipRaw.x, liveTipRaw.y);
          ctx.beginPath();
          ctx.moveTo(lastPx.x, lastPx.y);
          ctx.lineTo(tipPx.x, tipPx.y);
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2.0 * SF;
          ctx.setLineDash([3.5 * SF, 3 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        draft.forEach((pt, idx) => {
          const px = meterToPixel(pt.x, pt.y);
          ctx.beginPath();
          ctx.arc(px.x, px.y, (idx === draft.length - 1 ? 5 : 3.4) * SF, 0, Math.PI * 2);
          ctx.fillStyle =
            idx === 0
              ? '#059669'
              : activeKind === 'nala'
              ? '#0284c7'
              : activeKind === 'patch'
              ? '#d97706'
              : '#ea580c';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4 * SF;
          ctx.stroke();
        });
      }

      // C. Google-Earth-Style Live Outer Workable Polygon during outer_walk phase
      if (walk.phase === 'outer_walk' && walk.outerPoints.length > 0) {
        const pts = walk.outerPoints.map(rotForDisplay);
        const pxPts = pts.map((pt) => meterToPixel(pt.x, pt.y));

        // Live moving GPS rubber-band tip so outer polygon stretches visibly with every step
        const liveOuterTipRaw =
          walk.inputMode === 'gps' && props.userLocation && !walk.isPaused
            ? rotForDisplay({ x: props.userLocation.mx, y: props.userLocation.my })
            : null;
        const lastOuterPt = pts[pts.length - 1];
        const hasLiveOuterTip = Boolean(
          liveOuterTipRaw && Math.hypot(liveOuterTipRaw.x - lastOuterPt.x, liveOuterTipRaw.y - lastOuterPt.y) >= 0.5
        );
        const liveTipPx = hasLiveOuterTip && liveOuterTipRaw ? meterToPixel(liveOuterTipRaw.x, liveOuterTipRaw.y) : null;
        const previewPxPts = liveTipPx ? [...pxPts, liveTipPx] : pxPts;

        if (previewPxPts.length >= 3) {
          // Live shaded closed polygon preview
          ctx.beginPath();
          ctx.moveTo(previewPxPts[0].x, previewPxPts[0].y);
          for (let i = 1; i < previewPxPts.length; i++) {
            ctx.lineTo(previewPxPts[i].x, previewPxPts[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(16, 185, 129, 0.20)';
          ctx.fill();
        }

        // Solid walked/tapped perimeter segments
        if (pxPts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pxPts[0].x, pxPts[0].y);
          for (let i = 1; i < pxPts.length; i++) {
            ctx.lineTo(pxPts[i].x, pxPts[i].y);
          }
          ctx.strokeStyle = '#047857';
          ctx.lineWidth = 2.6 * SF;
          ctx.stroke();
        }

        // Live dotted step line from last corner to moving GPS position
        if (liveTipPx) {
          ctx.beginPath();
          ctx.moveTo(pxPts[pxPts.length - 1].x, pxPts[pxPts.length - 1].y);
          ctx.lineTo(liveTipPx.x, liveTipPx.y);
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2.2 * SF;
          ctx.setLineDash([4 * SF, 3 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Dashed closing rubber-band edge from live tip / last vertex back to start P1
        if (previewPxPts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(previewPxPts[previewPxPts.length - 1].x, previewPxPts[previewPxPts.length - 1].y);
          ctx.lineTo(previewPxPts[0].x, previewPxPts[0].y);
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.8 * SF;
          ctx.setLineDash([6 * SF, 4 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Numbered vertex corner pins
        pxPts.forEach((px, idx) => {
          const isStart = idx === 0;
          const isLast = idx === pxPts.length - 1;
          ctx.beginPath();
          ctx.arc(px.x, px.y, (isStart || isLast ? 5.8 : 4.2) * SF, 0, Math.PI * 2);
          ctx.fillStyle = isStart ? '#047857' : isLast ? '#ea580c' : '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6 * SF;
          ctx.stroke();

          if (pxPts.length <= 24 || isStart || isLast) {
            ctx.font = `bold ${7.5 * SF}px ${props.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.lineWidth = 2.2 * SF;
            const tag = isStart ? 'START' : `P${idx + 1}`;
            ctx.strokeText(tag, px.x, px.y - 7 * SF);
            ctx.fillStyle = '#0f172a';
            ctx.fillText(tag, px.x, px.y - 7 * SF);
          }
        });

        // Live centered Google-Earth area badge inside the polygon
        if (pxPts.length >= 3) {
          let avgX = 0;
          let avgY = 0;
          pxPts.forEach((p) => {
            avgX += p.x;
            avgY += p.y;
          });
          avgX /= pxPts.length;
          avgY /= pxPts.length;

          const madeTxt = `${walk.currentGrossHa.toFixed(2)} / ${walk.targetGrossHa.toFixed(2)} Ha`;
          const remTxt =
            lang === 'mr'
              ? `शिल्लक: ${walk.remainingGrossHa.toFixed(2)} Ha`
              : `Remaining: ${walk.remainingGrossHa.toFixed(2)} Ha`;

          ctx.font = `bold ${10.5 * SF}px ${props.fontFamily}`;
          const w1 = ctx.measureText(madeTxt).width;
          ctx.font = `bold ${9 * SF}px ${props.fontFamily}`;
          const w2 = ctx.measureText(remTxt).width;
          const boxW = Math.max(w1, w2) + 20 * SF;
          const boxH = 36 * SF;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.beginPath();
          ctx.roundRect(avgX - boxW / 2, avgY - boxH / 2, boxW, boxH, 6 * SF);
          ctx.fill();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.4 * SF;
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${10.5 * SF}px ${props.fontFamily}`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(madeTxt, avgX, avgY - 7 * SF);
          ctx.font = `bold ${9 * SF}px ${props.fontFamily}`;
          ctx.fillStyle = '#6ee7b7';
          ctx.fillText(remTxt, avgX, avgY + 8 * SF);
        }
      }

      ctx.restore();
    };

    // Helper: Draw Live GPS Movement Trail, Directional Heading Cone, Beacon, Accuracy Circle, Go-To Target & Measure Ruler
    const drawLiveUserGpsOverlay = (hasPolygon: boolean) => {
      if (!props.userLocation && !props.navTarget && measurePoints.length === 0) return;

      const rotForGps = (pt: Point2D): Point2D => {
        if (rotationDeg === 0 || transformedWorking.length < 3) return pt;
        const rad = (rotationDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = pt.x - centroidMeters.x;
        const dy = pt.y - centroidMeters.y;
        return {
          x: centroidMeters.x + dx * cos - dy * sin,
          y: centroidMeters.y + dx * sin + dy * cos
        };
      };

      // 0. Draw Quick On-Map Distance & Area Ruler (Measure Tool)
      if (measurePoints.length > 0) {
        const pxPts = measurePoints.map((mp) => {
          const r = rotForGps(mp);
          return meterToPixel(r.x, r.y);
        });

        ctx.save();

        // Shaded area preview when 3+ points are dropped
        if (pxPts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pxPts[0].x, pxPts[0].y);
          for (let i = 1; i < pxPts.length; i++) {
            ctx.lineTo(pxPts[i].x, pxPts[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(2, 132, 199, 0.55)';
          ctx.lineWidth = 1.4 * SF;
          ctx.setLineDash([4 * SF, 4 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Crisp cyan measurement segments + midpoint distance/bearing badges
        if (pxPts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pxPts[0].x, pxPts[0].y);
          for (let i = 1; i < pxPts.length; i++) {
            ctx.lineTo(pxPts[i].x, pxPts[i].y);
          }
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.30)';
          ctx.lineWidth = 5.5 * SF;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(pxPts[0].x, pxPts[0].y);
          for (let i = 1; i < pxPts.length; i++) {
            ctx.lineTo(pxPts[i].x, pxPts[i].y);
          }
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2.2 * SF;
          ctx.setLineDash([6 * SF, 4 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);

          for (let i = 0; i < pxPts.length - 1; i++) {
            const pA = pxPts[i];
            const pB = pxPts[i + 1];
            const segDist = Math.hypot(
              measurePoints[i + 1].x - measurePoints[i].x,
              measurePoints[i + 1].y - measurePoints[i].y
            );
            const segBrg = calculateGeographicBearing(measurePoints[i], measurePoints[i + 1]);
            const segLabel = `${segDist >= 1000 ? `${(segDist / 1000).toFixed(2)}km` : `${segDist.toFixed(1)}m`} · ${String(Math.round(segBrg) % 360).padStart(3, '0')}°`;
            const midX = (pA.x + pB.x) / 2;
            const midY = (pA.y + pB.y) / 2;
            ctx.font = `bold ${8 * SF}px ${props.fontFamily}`;
            const sw = ctx.measureText(segLabel).width;
            ctx.fillStyle = 'rgba(12, 74, 110, 0.92)';
            ctx.beginPath();
            ctx.roundRect(midX - sw / 2 - 5 * SF, midY - 9 * SF, sw + 10 * SF, 15 * SF, 4 * SF);
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 0.9 * SF;
            ctx.stroke();
            ctx.fillStyle = '#e0f2fe';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(segLabel, midX, midY - 1.5 * SF);
            ctx.textBaseline = 'alphabetic';
          }
        }

        // Numbered vertex handles (1, 2, 3...)
        pxPts.forEach((pt, idx) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 7.2 * SF, 0, Math.PI * 2);
          ctx.fillStyle = '#0284c7';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 * SF;
          ctx.stroke();

          ctx.font = `bold ${7.5 * SF}px ${props.fontFamily}`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(idx + 1), pt.x, pt.y + 0.4 * SF);
          ctx.textBaseline = 'alphabetic';
        });

        ctx.restore();
      }

      // A. Draw Active Go-To Navigation Target Bullseye & Dashed Guidance Line
      if (props.navTarget) {
        const tgtRot = rotForGps({ x: props.navTarget.mx, y: props.navTarget.my });
        const tp = meterToPixel(tgtRot.x, tgtRot.y);
        const navDistM = props.userLocation
          ? Math.hypot(
              props.navTarget.mx - props.userLocation.mx,
              props.navTarget.my - props.userLocation.my
            )
          : null;
        const isArrived = navDistM !== null && navDistM <= 6;
        const navColor = isArrived ? '#059669' : '#d97706';
        const navHalo = isArrived ? 'rgba(16, 185, 129, 0.24)' : 'rgba(245, 158, 11, 0.26)';

        ctx.save();

        // Dashed guidance vector from User GPS -> Go-To Target
        if (props.userLocation && navDistM !== null && navDistM >= 0.5) {
          const uRot = rotForGps({ x: props.userLocation.mx, y: props.userLocation.my });
          const up = meterToPixel(uRot.x, uRot.y);
          const brgDeg = calculateGeographicBearing(
            { x: props.userLocation.mx, y: props.userLocation.my },
            { x: props.navTarget.mx, y: props.navTarget.my }
          );

          // Soft underglow stroke
          ctx.beginPath();
          ctx.moveTo(up.x, up.y);
          ctx.lineTo(tp.x, tp.y);
          ctx.strokeStyle = isArrived ? 'rgba(16, 185, 129, 0.28)' : 'rgba(245, 158, 11, 0.32)';
          ctx.lineWidth = 6 * SF;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Crisp dashed directional line
          ctx.beginPath();
          ctx.moveTo(up.x, up.y);
          ctx.lineTo(tp.x, tp.y);
          ctx.strokeStyle = navColor;
          ctx.lineWidth = 2.4 * SF;
          ctx.setLineDash([7 * SF, 5 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Midpoint live distance + bearing pill
          const mxPx = (up.x + tp.x) / 2;
          const myPx = (up.y + tp.y) / 2;
          const distStr = navDistM >= 1000 ? `${(navDistM / 1000).toFixed(2)}km` : `${Math.round(navDistM)}m`;
          const midLabel = isArrived
            ? `✓ ARRIVED (${distStr})`
            : `${distStr} · ${String(Math.round(brgDeg) % 360).padStart(3, '0')}° ${bearingToCompass(brgDeg)}`;
          ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
          const mw = ctx.measureText(midLabel).width;
          ctx.fillStyle = isArrived ? 'rgba(6, 78, 59, 0.94)' : 'rgba(15, 23, 42, 0.92)';
          ctx.beginPath();
          ctx.roundRect(mxPx - mw / 2 - 6 * SF, myPx - 10 * SF, mw + 12 * SF, 16 * SF, 5 * SF);
          ctx.fill();
          ctx.strokeStyle = isArrived ? '#34d399' : '#fbbf24';
          ctx.lineWidth = 1.1 * SF;
          ctx.stroke();
          ctx.fillStyle = isArrived ? '#a7f3d0' : '#fde68a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(midLabel, mxPx, myPx - 2 * SF);
          ctx.textBaseline = 'alphabetic';
        }

        // Target Bullseye Concentric Rings + Crosshair
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 16 * SF, 0, Math.PI * 2);
        ctx.fillStyle = navHalo;
        ctx.fill();
        ctx.strokeStyle = navColor;
        ctx.lineWidth = 1.6 * SF;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 9.5 * SF, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = navColor;
        ctx.lineWidth = 2.2 * SF;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 3.8 * SF, 0, Math.PI * 2);
        ctx.fillStyle = navColor;
        ctx.fill();

        // Target Label Tag above bullseye
        const tgtLabel = `🎯 ${props.navTarget.label}`;
        ctx.font = `bold ${9 * SF}px ${props.fontFamily}`;
        const tw = ctx.measureText(tgtLabel).width;
        ctx.fillStyle = isArrived ? 'rgba(6, 78, 59, 0.95)' : 'rgba(120, 53, 15, 0.95)';
        ctx.beginPath();
        ctx.roundRect(tp.x - tw / 2 - 6 * SF, tp.y - 34 * SF, tw + 12 * SF, 16.5 * SF, 5 * SF);
        ctx.fill();
        ctx.strokeStyle = isArrived ? '#34d399' : '#fbbf24';
        ctx.lineWidth = 1.1 * SF;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tgtLabel, tp.x, tp.y - 25.8 * SF);
        ctx.textBaseline = 'alphabetic';

        ctx.restore();
      }

      if (!props.userLocation) return;

      const userPtRot = rotForGps({ x: props.userLocation.mx, y: props.userLocation.my });
      const p = meterToPixel(userPtRot.x, userPtRot.y);
      const ppm = props.activeScale.pxPer100m / 100;
      const accM = props.liveGpsTelemetry?.filteredAccuracyM ?? props.userLocation.accuracy ?? 0;
      const accRadiusPx = accM > 0 ? Math.min(110 * SF, Math.max(14 * SF, accM * ppm)) : 16 * SF;

      ctx.save();

      // 1. Live Movement Breadcrumb Trail (only while actively walking or watching live GPS)
      const isGpsTrackingNow = Boolean(
        props.isWatchingGPS ||
          (props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'gps') ||
          (props.liveWorkableWalk?.active && props.liveWorkableWalk.inputMode === 'gps')
      );
      const trail = isGpsTrackingNow ? props.liveMovementTrail || [] : [];
      if (trail.length >= 2) {
        const trailPx = trail.map((tp) => {
          const rtp = rotForGps(tp);
          return meterToPixel(rtp.x, rtp.y);
        });

        // Soft glowing outer path
        ctx.beginPath();
        ctx.moveTo(trailPx[0].x, trailPx[0].y);
        for (let i = 1; i < trailPx.length; i++) {
          ctx.lineTo(trailPx[i].x, trailPx[i].y);
        }
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.24)';
        ctx.lineWidth = 6 * SF;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Crisp center movement path
        ctx.beginPath();
        ctx.moveTo(trailPx[0].x, trailPx[0].y);
        for (let i = 1; i < trailPx.length; i++) {
          ctx.lineTo(trailPx[i].x, trailPx[i].y);
        }
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = 'rgba(29, 78, 216, 0.85)';
        ctx.lineWidth = 2.0 * SF;
        ctx.setLineDash([4 * SF, 3 * SF]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const qualityColor =
        accM <= 5
          ? { fill: 'rgba(16, 185, 129, 0.16)', stroke: '#059669' }
          : accM <= 10
          ? { fill: 'rgba(13, 148, 136, 0.16)', stroke: '#0d9488' }
          : accM <= 20
          ? { fill: 'rgba(245, 158, 11, 0.16)', stroke: '#d97706' }
          : { fill: 'rgba(225, 29, 72, 0.16)', stroke: '#e11d48' };

      // 2. Real-world GPS accuracy circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, accRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = qualityColor.fill;
      ctx.fill();
      ctx.strokeStyle = qualityColor.stroke;
      ctx.lineWidth = 1.4 * SF;
      ctx.stroke();

      // 3. Directional Heading Cone (shows which way you are moving on the map)
      const hasHeading =
        typeof props.userLocation.headingDeg === 'number' && Number.isFinite(props.userLocation.headingDeg);
      if (hasHeading) {
        // Geographic bearing 0°=North (canvas -Y), 90°=East (+X); adjust by -rotationDeg for rotated sheets
        const screenBearingDeg = (props.userLocation.headingDeg! - (transformedWorking.length >= 3 ? rotationDeg : 0));
        const canvasAngleRad = ((screenBearingDeg - 90) * Math.PI) / 180;
        const coneR = 30 * SF;
        const spreadRad = (28 * Math.PI) / 180;

        const grad = ctx.createRadialGradient(p.x, p.y, 4 * SF, p.x, p.y, coneR);
        grad.addColorStop(0, 'rgba(37, 99, 235, 0.55)');
        grad.addColorStop(1, 'rgba(37, 99, 235, 0.02)');

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, coneR, canvasAngleRad - spreadRad, canvasAngleRad + spreadRad);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // 4. Outer Beacon Halo + Core Live GPS Marker (with directional chevron when moving)
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10.5 * SF, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 6.4 * SF, 0, Math.PI * 2);
      ctx.fillStyle = '#1d4ed8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2 * SF;
      ctx.stroke();

      if (hasHeading) {
        const screenBearingDeg = (props.userLocation.headingDeg! - (transformedWorking.length >= 3 ? rotationDeg : 0));
        const arrowRad = (screenBearingDeg * Math.PI) / 180;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(arrowRad);
        ctx.beginPath();
        ctx.moveTo(0, -4.4 * SF);
        ctx.lineTo(2.9 * SF, 2.8 * SF);
        ctx.lineTo(0, 1.3 * SF);
        ctx.lineTo(-2.9 * SF, 2.8 * SF);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      if (hasPolygon && transformedWorking.length >= 3) {
        const { nearest, dist } = findNearestPointOnPolygon(userPtRot, transformedWorking);
        const pNearest = meterToPixel(nearest.x, nearest.y);

        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5 * SF;
        ctx.setLineDash([4 * SF, 3 * SF]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(pNearest.x, pNearest.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(pNearest.x, pNearest.y, 4 * SF, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();

        const edgeMidX = (p.x + pNearest.x) / 2;
        const edgeMidY = (p.y + pNearest.y) / 2;
        ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
        ctx.fillStyle = '#1e3a8a';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(dist)} m to edge`, edgeMidX, edgeMidY - 4 * SF);
      }

      // 5. Crisp Live Tag Pill (Heading Compass + Accuracy + Inside/Outside)
      const accSuffix = accM > 0 ? ` ±${accM.toFixed(1)}m` : '';
      const dirSuffix = hasHeading ? ` · ${bearingToCompass(props.userLocation.headingDeg!)}` : '';
      const locStatus =
        hasPolygon && transformedWorking.length >= 3
          ? isPointInPolygon(userPtRot, transformedWorking)
            ? ' (Inside)'
            : ' (Outside)'
          : '';
      const label = `YOU${dirSuffix}${accSuffix}${locStatus}`;
      ctx.font = `bold ${9 * SF}px ${props.fontFamily}`;
      const w = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2 - 6 * SF, p.y - 30 * SF, w + 12 * SF, 16.5 * SF, 4 * SF);
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 0.9 * SF;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, p.y - 21.8 * SF);
      ctx.textBaseline = 'alphabetic';

      ctx.restore();
    };

    // If no outer coupe boundary loaded yet (On-Field Pre-Boundary Non-Workable & Boundary Walk Stage)
    if (transformedWorking.length < 3) {
      // A. Draw saved pre-walked Roads / Nalas / Non-Workable Patches when not already rendered inside liveWorkableWalk
      if (
        !props.liveWorkableWalk?.active &&
        !props.isNonWorkingNil &&
        transformedNonWorkingItems.length > 0
      ) {
        ctx.save();
        transformedNonWorkingItems.forEach((item) => {
          const poly = item.pts;
          if (poly.length < 3) return;
          ctx.beginPath();
          const q0 = meterToPixel(poly[0].x, poly[0].y);
          ctx.moveTo(q0.x, q0.y);
          for (let i = 1; i < poly.length; i++) {
            const p = meterToPixel(poly[i].x, poly[i].y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();

          if (item.category === 'road') {
            ctx.fillStyle = 'rgba(71, 85, 105, 0.45)';
            ctx.fill();
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.6 * SF;
            ctx.stroke();
            if (item.centerlinePts && item.centerlinePts.length >= 2) {
              ctx.beginPath();
              const c0 = meterToPixel(item.centerlinePts[0].x, item.centerlinePts[0].y);
              ctx.moveTo(c0.x, c0.y);
              for (let i = 1; i < item.centerlinePts.length; i++) {
                const cp = meterToPixel(item.centerlinePts[i].x, item.centerlinePts[i].y);
                ctx.lineTo(cp.x, cp.y);
              }
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.3 * SF;
              ctx.setLineDash([5 * SF, 3.5 * SF]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          } else if (item.category === 'nala') {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.36)';
            ctx.fill();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.7 * SF;
            ctx.stroke();
            if (item.centerlinePts && item.centerlinePts.length >= 2) {
              ctx.beginPath();
              const b0 = meterToPixel(item.centerlinePts[0].x, item.centerlinePts[0].y);
              ctx.moveTo(b0.x, b0.y);
              for (let i = 1; i < item.centerlinePts.length; i++) {
                const bp = meterToPixel(item.centerlinePts[i].x, item.centerlinePts[i].y);
                ctx.lineTo(bp.x, bp.y);
              }
              ctx.strokeStyle = '#0369a1';
              ctx.lineWidth = 1.4 * SF;
              ctx.setLineDash([4 * SF, 3 * SF]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          } else {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.fill();
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 1.8 * SF;
            ctx.stroke();
          }
        });
        ctx.restore();
      }

      // B. Draw active pre-boundary Road / One-Sided Nala / Non-Workable Patch live walk preview
      if (props.liveRoadTrack?.active && transformedLiveRoad.length > 0) {
        const liveKind = props.liveRoadTrack.kind || 'road';
        let liveRoadTip: Point2D | null = null;
        if (props.liveRoadTrack.mode === 'gps' && props.userLocation) {
          const lastPt = transformedLiveRoad[transformedLiveRoad.length - 1];
          if (Math.hypot(props.userLocation.mx - lastPt.x, props.userLocation.my - lastPt.y) >= 0.5) {
            liveRoadTip = { x: props.userLocation.mx, y: props.userLocation.my };
          }
        }
        const livePts = liveRoadTip ? [...transformedLiveRoad, liveRoadTip] : transformedLiveRoad;

        ctx.save();
        if (liveKind === 'patch') {
          if (livePts.length >= 3) {
            ctx.beginPath();
            const q0 = meterToPixel(livePts[0].x, livePts[0].y);
            ctx.moveTo(q0.x, q0.y);
            for (let i = 1; i < livePts.length; i++) {
              const p = meterToPixel(livePts[i].x, livePts[i].y);
              ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.30)';
            ctx.fill();
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 2.0 * SF;
            ctx.stroke();
          } else if (livePts.length === 2) {
            const l0 = meterToPixel(livePts[0].x, livePts[0].y);
            const l1 = meterToPixel(livePts[1].x, livePts[1].y);
            ctx.beginPath();
            ctx.moveTo(l0.x, l0.y);
            ctx.lineTo(l1.x, l1.y);
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 2.0 * SF;
            ctx.stroke();
          }
        } else if (livePts.length >= 2) {
          const previewPoly =
            liveKind === 'nala'
              ? oneSidedBufferPolylineToPolygon(
                  livePts,
                  props.liveRoadTrack.widthM,
                  props.liveRoadTrack.nalaSide || 'right'
                )
              : bufferPolylineToPolygon(livePts, props.liveRoadTrack.widthM);
          if (previewPoly.length >= 3) {
            ctx.beginPath();
            const q0 = meterToPixel(previewPoly[0].x, previewPoly[0].y);
            ctx.moveTo(q0.x, q0.y);
            for (let i = 1; i < previewPoly.length; i++) {
              const p = meterToPixel(previewPoly[i].x, previewPoly[i].y);
              ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fillStyle =
              liveKind === 'nala' ? 'rgba(56, 189, 248, 0.34)' : 'rgba(15, 118, 110, 0.28)';
            ctx.fill();
            ctx.strokeStyle = liveKind === 'nala' ? '#0284c7' : '#0f766e';
            ctx.lineWidth = 1.6 * SF;
            ctx.stroke();
          }

          ctx.beginPath();
          const l0 = meterToPixel(livePts[0].x, livePts[0].y);
          ctx.moveTo(l0.x, l0.y);
          for (let i = 1; i < livePts.length; i++) {
            const lp = meterToPixel(livePts[i].x, livePts[i].y);
            ctx.lineTo(lp.x, lp.y);
          }
          ctx.strokeStyle = liveKind === 'nala' ? '#0369a1' : '#ea580c';
          ctx.lineWidth = 2.2 * SF;
          ctx.setLineDash([6 * SF, 4 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (liveRoadTip) {
          const lastPx = meterToPixel(
            transformedLiveRoad[transformedLiveRoad.length - 1].x,
            transformedLiveRoad[transformedLiveRoad.length - 1].y
          );
          const tipPx = meterToPixel(liveRoadTip.x, liveRoadTip.y);
          ctx.beginPath();
          ctx.moveTo(lastPx.x, lastPx.y);
          ctx.lineTo(tipPx.x, tipPx.y);
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2.0 * SF;
          ctx.setLineDash([3.5 * SF, 3 * SF]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        transformedLiveRoad.forEach((pt, idx) => {
          const px = meterToPixel(pt.x, pt.y);
          ctx.beginPath();
          ctx.arc(px.x, px.y, (idx === transformedLiveRoad.length - 1 ? 4.8 : 3.2) * SF, 0, Math.PI * 2);
          ctx.fillStyle =
            idx === 0
              ? '#059669'
              : liveKind === 'nala'
              ? '#0284c7'
              : liveKind === 'patch'
              ? '#d97706'
              : '#ea580c';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4 * SF;
          ctx.stroke();
        });
        ctx.restore();
      }

      if (props.liveWorkableWalk?.active) {
        drawLiveWorkableSessionOverlay();
        drawLiveUserGpsOverlay(false);

        // Helpful prompt only before any points are recorded
        const hasAnyWalkPts =
          props.liveWorkableWalk.outerPoints.length > 0 ||
          props.liveWorkableWalk.roadDraftPoints.length > 0 ||
          props.liveWorkableWalk.sessionRoadItems.length > 0;
        if (!hasAnyWalkPts) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#065f46';
          ctx.font = `bold ${14 * SF}px ${props.fontFamily}`;
          const promptTxt =
            lang === 'mr'
              ? `लक्ष्य ${props.liveWorkableWalk.targetGrossHa.toFixed(2)} Ha — चाला किंवा नकाशावर कोपरे टॅप करा`
              : `Target ${props.liveWorkableWalk.targetGrossHa.toFixed(2)} Ha — Walk field or tap polygon corners`;
          ctx.fillText(promptTxt, canvas.width / 2, mapBounds.top + 260 * SF);
        }
      } else {
        const hasPreWalkActivity =
          Boolean(props.liveRoadTrack?.active) ||
          (!props.isNonWorkingNil && transformedNonWorkingItems.length > 0);
        if (!hasPreWalkActivity) {
          ctx.textAlign = 'center';
          ctx.fillStyle = props.textColor;
          ctx.font = `bold ${15 * SF}px ${props.fontFamily}`;
          ctx.fillText(t('canvas_empty_prompt'), canvas.width / 2, mapBounds.top + 260 * SF);
          ctx.font = `${12 * SF}px ${props.fontFamily}`;
          ctx.fillStyle = '#64748b';
          ctx.fillText(t('canvas_empty_hint'), canvas.width / 2, mapBounds.top + 288 * SF);
        }
        drawLiveUserGpsOverlay(false);
      }

      drawLegendBox(ctx);
      drawSignatures(ctx);
      ctx.restore();
      return;
    }

    // 3. Draw Non-Working Area Polygons & Walked Road Non-Workable Corridors
    if (
      props.displayOptions.showNonWorking !== false &&
      !props.isNonWorkingNil &&
      transformedNonWorkingItems.length > 0
    ) {
      ctx.save();
      ctx.beginPath();
      const p0 = meterToPixel(transformedWorking[0].x, transformedWorking[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < transformedWorking.length; i++) {
        const p = meterToPixel(transformedWorking[i].x, transformedWorking[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.clip();

      transformedNonWorkingItems.forEach((item) => {
        const poly = item.pts;
        if (poly.length < 3) return;

        ctx.beginPath();
        const q0 = meterToPixel(poly[0].x, poly[0].y);
        ctx.moveTo(q0.x, q0.y);
        for (let i = 1; i < poly.length; i++) {
          const p = meterToPixel(poly[i].x, poly[i].y);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        if (item.category === 'road') {
          // Distinct Road Corridor Styling (Slate Asphalt + Dark Double Edges + Dashed White Centerline)
          ctx.fillStyle = 'rgba(71, 85, 105, 0.42)';
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1.6 * SF;
          ctx.stroke();

          if (item.centerlinePts && item.centerlinePts.length >= 2) {
            ctx.save();
            ctx.beginPath();
            const c0 = meterToPixel(item.centerlinePts[0].x, item.centerlinePts[0].y);
            ctx.moveTo(c0.x, c0.y);
            for (let i = 1; i < item.centerlinePts.length; i++) {
              const cp = meterToPixel(item.centerlinePts[i].x, item.centerlinePts[i].y);
              ctx.lineTo(cp.x, cp.y);
            }
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.3 * SF;
            ctx.setLineDash([5 * SF, 3.5 * SF]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        } else if (item.category === 'nala') {
          // Distinct Nala / Stream Water Styling (Sky-Blue Fill + Deep Blue Banks + Dashed Walked Bank)
          ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
          ctx.fill();
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.7 * SF;
          ctx.stroke();

          if (item.centerlinePts && item.centerlinePts.length >= 2) {
            ctx.save();
            ctx.beginPath();
            const b0 = meterToPixel(item.centerlinePts[0].x, item.centerlinePts[0].y);
            ctx.moveTo(b0.x, b0.y);
            for (let i = 1; i < item.centerlinePts.length; i++) {
              const bp = meterToPixel(item.centerlinePts[i].x, item.centerlinePts[i].y);
              ctx.lineTo(bp.x, bp.y);
            }
            ctx.strokeStyle = '#0369a1';
            ctx.lineWidth = 1.4 * SF;
            ctx.setLineDash([4 * SF, 3 * SF]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        } else {
          // Standard Non-Working Patch
          ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
          ctx.fill();
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1.8 * SF;
          ctx.stroke();
        }
      });
      ctx.restore();

      // Label strictly inside the outer boundary polygon for roads, nalas, and non-working patches
      ctx.save();
      ctx.beginPath();
      const lp0 = meterToPixel(transformedWorking[0].x, transformedWorking[0].y);
      ctx.moveTo(lp0.x, lp0.y);
      for (let i = 1; i < transformedWorking.length; i++) {
        const lp = meterToPixel(transformedWorking[i].x, transformedWorking[i].y);
        ctx.lineTo(lp.x, lp.y);
      }
      ctx.closePath();
      ctx.clip();

      transformedNonWorkingItems.forEach((item) => {
        const poly = item.pts;
        if (poly.length < 3) return;

        // Compute an anchor point strictly inside the boundary polygon
        const findInsideAnchor = (candidates: Point2D[]): Point2D | null => {
          if (candidates.length === 0) return null;
          const mid = candidates[Math.floor(candidates.length / 2)];
          if (isPointInPolygon(mid, transformedWorking)) return mid;
          const insidePts = candidates.filter((pt) => isPointInPolygon(pt, transformedWorking));
          if (insidePts.length > 0) return insidePts[Math.floor(insidePts.length / 2)];
          let cx = 0;
          let cy = 0;
          poly.forEach((p) => {
            cx += p.x;
            cy += p.y;
          });
          cx /= poly.length;
          cy /= poly.length;
          return isPointInPolygon({ x: cx, y: cy }, transformedWorking) ? { x: cx, y: cy } : null;
        };

        if (item.category === 'road') {
          const refPts = item.centerlinePts && item.centerlinePts.length >= 2 ? item.centerlinePts : poly;
          const anchor = findInsideAnchor(refPts);
          if (!anchor) return;
          const c = meterToPixel(anchor.x, anchor.y);
          const roadLbl =
            lang === 'mr'
              ? `रस्ता (${item.roadWidthM ?? 4}m)`
              : `Road (${item.roadWidthM ?? 4}m)`;
          ctx.save();
          ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 2.6 * SF;
          ctx.strokeText(roadLbl, c.x, c.y - 6 * SF);
          ctx.fillStyle = '#0f172a';
          ctx.fillText(roadLbl, c.x, c.y - 6 * SF);
          ctx.restore();
        } else if (item.category === 'nala') {
          let cx = 0;
          let cy = 0;
          poly.forEach((p) => {
            cx += p.x;
            cy += p.y;
          });
          cx /= poly.length;
          cy /= poly.length;
          const anchor = isPointInPolygon({ x: cx, y: cy }, transformedWorking)
            ? { x: cx, y: cy }
            : findInsideAnchor(item.centerlinePts && item.centerlinePts.length >= 2 ? item.centerlinePts : poly);
          if (!anchor) return;
          const c = meterToPixel(anchor.x, anchor.y);
          const nalaLbl =
            lang === 'mr'
              ? `नाला (${item.roadWidthM ?? 6}m)`
              : `Nala (${item.roadWidthM ?? 6}m)`;
          ctx.save();
          ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 2.6 * SF;
          ctx.strokeText(nalaLbl, c.x, c.y);
          ctx.fillStyle = '#0369a1';
          ctx.fillText(nalaLbl, c.x, c.y);
          ctx.restore();
        } else {
          let cx = 0;
          let cy = 0;
          poly.forEach((p) => {
            cx += p.x;
            cy += p.y;
          });
          cx /= poly.length;
          cy /= poly.length;
          const c = meterToPixel(cx, cy);
          if (isPointInPolygon({ x: cx, y: cy }, transformedWorking)) {
            ctx.font = `bold ${10 * SF}px ${props.fontFamily}`;
            ctx.fillStyle = '#b45309';
            ctx.textAlign = 'center';
            ctx.fillText(t('legend_non_working'), c.x, c.y + 3 * SF);
          }
        }
      });
      ctx.restore();
    }

    // 3b. Live Standalone Non-Workable Track Recording Preview (Road / One-Sided Nala / Patch Polygon)
    if (props.liveRoadTrack?.active && transformedLiveRoad.length > 0) {
      const liveKind = props.liveRoadTrack.kind || 'road';

      // Include current live GPS position as stretching rubber-band tip while walking
      let liveRoadTip: Point2D | null = null;
      if (props.liveRoadTrack.mode === 'gps' && props.userLocation) {
        let ux = props.userLocation.mx;
        let uy = props.userLocation.my;
        if (rotationDeg !== 0 && transformedWorking.length >= 3) {
          const rad = (rotationDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const dx = ux - centroidMeters.x;
          const dy = uy - centroidMeters.y;
          ux = centroidMeters.x + dx * cos - dy * sin;
          uy = centroidMeters.y + dx * sin + dy * cos;
        }
        const lastPt = transformedLiveRoad[transformedLiveRoad.length - 1];
        if (Math.hypot(ux - lastPt.x, uy - lastPt.y) >= 0.5) {
          liveRoadTip = { x: ux, y: uy };
        }
      }
      const liveRoadPreviewPts = liveRoadTip ? [...transformedLiveRoad, liveRoadTip] : transformedLiveRoad;

      ctx.save();
      if (liveKind === 'patch') {
        if (liveRoadPreviewPts.length >= 3) {
          ctx.beginPath();
          const q0 = meterToPixel(liveRoadPreviewPts[0].x, liveRoadPreviewPts[0].y);
          ctx.moveTo(q0.x, q0.y);
          for (let i = 1; i < liveRoadPreviewPts.length; i++) {
            const p = meterToPixel(liveRoadPreviewPts[i].x, liveRoadPreviewPts[i].y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(245, 158, 11, 0.30)';
          ctx.fill();
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2.0 * SF;
          ctx.stroke();
        } else if (liveRoadPreviewPts.length === 2) {
          const l0 = meterToPixel(liveRoadPreviewPts[0].x, liveRoadPreviewPts[0].y);
          const l1 = meterToPixel(liveRoadPreviewPts[1].x, liveRoadPreviewPts[1].y);
          ctx.beginPath();
          ctx.moveTo(l0.x, l0.y);
          ctx.lineTo(l1.x, l1.y);
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2.0 * SF;
          ctx.stroke();
        }
      } else if (liveRoadPreviewPts.length >= 2) {
        const previewPoly =
          liveKind === 'nala'
            ? oneSidedBufferPolylineToPolygon(
                liveRoadPreviewPts,
                props.liveRoadTrack.widthM,
                props.liveRoadTrack.nalaSide || 'right'
              )
            : bufferPolylineToPolygon(liveRoadPreviewPts, props.liveRoadTrack.widthM);
        if (previewPoly.length >= 3) {
          ctx.beginPath();
          const q0 = meterToPixel(previewPoly[0].x, previewPoly[0].y);
          ctx.moveTo(q0.x, q0.y);
          for (let i = 1; i < previewPoly.length; i++) {
            const p = meterToPixel(previewPoly[i].x, previewPoly[i].y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fillStyle =
            liveKind === 'nala' ? 'rgba(56, 189, 248, 0.34)' : 'rgba(15, 118, 110, 0.28)';
          ctx.fill();
          ctx.strokeStyle = liveKind === 'nala' ? '#0284c7' : '#0f766e';
          ctx.lineWidth = 1.6 * SF;
          ctx.stroke();
        }

        // Live dashed centerline / walked bank
        ctx.beginPath();
        const l0 = meterToPixel(liveRoadPreviewPts[0].x, liveRoadPreviewPts[0].y);
        ctx.moveTo(l0.x, l0.y);
        for (let i = 1; i < liveRoadPreviewPts.length; i++) {
          const lp = meterToPixel(liveRoadPreviewPts[i].x, liveRoadPreviewPts[i].y);
          ctx.lineTo(lp.x, lp.y);
        }
        ctx.strokeStyle = liveKind === 'nala' ? '#0369a1' : '#ea580c';
        ctx.lineWidth = 2.2 * SF;
        ctx.setLineDash([6 * SF, 4 * SF]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Live rubber-band step connector to current GPS position
      if (liveRoadTip) {
        const lastPx = meterToPixel(
          transformedLiveRoad[transformedLiveRoad.length - 1].x,
          transformedLiveRoad[transformedLiveRoad.length - 1].y
        );
        const tipPx = meterToPixel(liveRoadTip.x, liveRoadTip.y);
        ctx.beginPath();
        ctx.moveTo(lastPx.x, lastPx.y);
        ctx.lineTo(tipPx.x, tipPx.y);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.0 * SF;
        ctx.setLineDash([3.5 * SF, 3 * SF]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Recorded track waypoints
      transformedLiveRoad.forEach((pt, idx) => {
        const px = meterToPixel(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(px.x, px.y, (idx === transformedLiveRoad.length - 1 ? 4.8 : 3.2) * SF, 0, Math.PI * 2);
        ctx.fillStyle =
          idx === 0
            ? '#059669'
            : liveKind === 'nala'
            ? '#0284c7'
            : liveKind === 'patch'
            ? '#d97706'
            : '#ea580c';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4 * SF;
        ctx.stroke();
      });
      ctx.restore();
    }

    // 3c. Live On-Field Workable Area Session Overlay (when mapping over an existing map)
    if (props.liveWorkableWalk?.active) {
      drawLiveWorkableSessionOverlay();
    }

    // 4. Forestry Coupe Survey Grid & Station Pegs (0L1, 0L2... AL1, AL2... 0R1, 0R2... AR1, AR4...)
    // Maharashtra Forest Dept survey pattern: Baseline stations (0, A, B, C...) + perpendicular peg stations + cell numbers
    const targetHa = parseFloat(props.treatmentArea) || parseFloat(props.totalArea) || undefined;
    const surveyGrid =
      baseline?.p1 && baseline?.p2
        ? generateForestrySurveyGrid(
            transformedWorking,
            baseline.p1,
            baseline.p2,
            props.gridWidthM,
            props.gridHeightM,
            props.plantSpacingM || 3,
            props.targetTotalPlants || 7777,
            transformedNonWorking,
            props.isNonWorkingNil,
            targetHa,
            baseline.origin0
          )
        : { pegs: [], gridLines: [], cells: [], totalEstimatedPlants: 0 };

    // 4a. Draw Green Grid Lines (Clipped to Polygon)
    if (props.displayOptions.showGridLines && surveyGrid.gridLines.length > 0) {
      ctx.save();
      // Clip grid lines inside polygon boundary
      ctx.beginPath();
      const p0 = meterToPixel(transformedWorking[0].x, transformedWorking[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < transformedWorking.length; i++) {
        const p = meterToPixel(transformedWorking[i].x, transformedWorking[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.clip();

      // High-contrast, bold forestry green grid lines for sharp print visibility
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 2.2 * SF;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      surveyGrid.gridLines.forEach((line) => {
        if (line.type === 'baseline') return; // Baseline drawn with red highlight in section 7
        const pA = meterToPixel(line.p1.x, line.p1.y);
        const pB = meterToPixel(line.p2.x, line.p2.y);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      });

      ctx.restore();
    }

    // 4b. Draw Sequential Grid Cell Numbers (1, 2, 3... 21) in center of each block (Requirement C: all cells visibly numbered)
    if (props.displayOptions.showGridNumbers && surveyGrid.cells.length > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      surveyGrid.cells.forEach((cell) => {
        const c = meterToPixel(cell.centerM.x, cell.centerM.y);
        const label = String(cell.cellNumber);

        // Prominent white halo with dark bold numbers for crisp readability over highlighted grid
        ctx.font = `bold ${10 * SF}px ${props.fontFamily}`;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 * SF;
        ctx.strokeText(label, c.x, c.y);
        ctx.fillStyle = '#064e3b'; // Solid dark green-slate for high print contrast
        ctx.fillText(label, c.x, c.y);
      });
      ctx.restore();
    }

    // 4c. Draw Survey Peg Nodes & Station Labels (0L1, 0L2, AL1, AL2, 0R1, 0R2, AR1, AR4...)
    // Pattern: beside the station, with line end points explicitly marked
    if (props.displayOptions.showGridNaming && surveyGrid.pegs.length > 0) {
      ctx.save();
      surveyGrid.pegs.forEach((peg) => {
        const p = meterToPixel(peg.pointM.x, peg.pointM.y);

        if (peg.isBaselineStation) {
          // 1. Letters on ABOVE-RIGHT corner of grid line and base line
          ctx.font = `bold ${9.5 * SF}px ${props.fontFamily}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.4 * SF;
          ctx.strokeText(peg.label, p.x + 6 * SF, p.y - 4 * SF);
          ctx.fillStyle = '#dc2626';
          ctx.fillText(peg.label, p.x + 6 * SF, p.y - 4 * SF);

          // 2. Measurement of base line on DOWN-LEFT corner of base line and grid line
          if (props.displayOptions.showBaselineMeas) {
            const distM = peg.colIndex * props.gridWidthM;
            const measText = distM >= 0 ? `${distM}m` : `-${Math.abs(distM)}m`;
            ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.2 * SF;
            ctx.strokeText(measText, p.x - 6 * SF, p.y + 4 * SF);
            ctx.fillStyle = '#991b1b';
            ctx.fillText(measText, p.x - 6 * SF, p.y + 4 * SF);
          }
        } else {
          // Grid Peg Node (Survey Station Pin)
          ctx.beginPath();
          ctx.arc(p.x, p.y, peg.isEndPointOfLine ? 3.6 * SF : 2.8 * SF, 0, Math.PI * 2);
          ctx.fillStyle = peg.isEndPointOfLine ? '#0f172a' : '#1e293b';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1 * SF;
          ctx.stroke();

          // Position label beside the peg
          const isLeft = peg.side === 'L';
          const offsetX = 5 * SF;
          const offsetY = isLeft ? -4 * SF : 5 * SF;

          ctx.font = `bold ${peg.isEndPointOfLine ? 9 : 8.5 * SF}px ${props.fontFamily}`;
          ctx.textAlign = 'left';

          // White text shadow halo for transparent background readability
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
          ctx.lineWidth = 2.2 * SF;
          ctx.strokeText(peg.label, p.x + offsetX, p.y + offsetY);

          ctx.fillStyle = peg.isEndPointOfLine ? '#1e3a8a' : '#065f46';
          ctx.fillText(peg.label, p.x + offsetX, p.y + offsetY);
        }
      });
      ctx.restore();
    }

    // 6. Section Line (विभाग रेषा - Auto-placed strictly on the middle grid line ~50% of baseline)
    const isSectionLineActive = Boolean(props.showSectionLines || props.displayOptions.showSectionLines);
    if (isSectionLineActive && baseline?.p1 && baseline?.p2) {
      const sections = computeSectionLines(
        baseline.p1,
        baseline.p2,
        transformedWorking,
        props.gridWidthM,
        props.sectionLineOffset ?? 0
      );

      ctx.save();
      // Clip strictly to polygon boundary
      ctx.beginPath();
      const p0 = meterToPixel(transformedWorking[0].x, transformedWorking[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < transformedWorking.length; i++) {
        const p = meterToPixel(transformedWorking[i].x, transformedWorking[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.clip();

      ctx.strokeStyle = '#9333ea'; // Purple section line
      ctx.lineWidth = 2.4 * SF;
      ctx.setLineDash([6 * SF, 3 * SF]);

      sections.forEach((sec) => {
        const pA = meterToPixel(sec.p1.x, sec.p1.y);
        const pB = meterToPixel(sec.p2.x, sec.p2.y);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      });

      ctx.setLineDash([]);
      ctx.restore();
    }

    // 7. Base Line (Clipped and draggable)
    if (props.displayOptions.showBaseline && baseline?.p1 && baseline?.p2) {
      const p1 = meterToPixel(baseline.p1.x, baseline.p1.y);
      const p2 = meterToPixel(baseline.p2.x, baseline.p2.y);

      if (props.baselineOption === 'grid_parallel' || props.baselineOption === 'horizontal' || !props.baselineOption) {
        p2.y = p1.y;
      } else if (props.baselineOption === 'vertical') {
        p2.x = p1.x;
      }

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 3 * SF;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Arrow head at P-2
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - 12 * SF * Math.cos(angle - 0.4),
        p2.y - 12 * SF * Math.sin(angle - 0.4)
      );
      ctx.lineTo(
        p2.x - 12 * SF * Math.cos(angle + 0.4),
        p2.y - 12 * SF * Math.sin(angle + 0.4)
      );
      ctx.closePath();
      ctx.fill();

      // P-1 and P-2 point markers
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 4 * SF, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 4 * SF, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      // P-1 (0-metre starting point) marker: begins exactly at the crossing point where two darkest green lines intersect on the polygon edge
      ctx.save();
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 4.8 * SF, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8 * SF;
      ctx.stroke();
      ctx.restore();

      // P-2 (Exit edge point) marker
      ctx.save();
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 4 * SF, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4 * SF;
      ctx.stroke();
      ctx.restore();

      // Perpendicular tick marks along base line from P1 (0m) to P2
      if (props.displayOptions.showBaselineMeas) {
        const distM = Math.hypot(baseline.p2.x - baseline.p1.x, baseline.p2.y - baseline.p1.y);
        const step = Math.max(25, props.gridWidthM);

        for (let d = 0; d <= distM + 0.5; d += step) {
          const tt = distM === 0 ? 0 : Math.min(1, d / distM);
          const cx = p1.x + tt * (p2.x - p1.x);
          const cy = p1.y + tt * (p2.y - p1.y);
          const px = -Math.sin(angle) * 6 * SF;
          const py = Math.cos(angle) * 6 * SF;

          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.6 * SF;
          ctx.beginPath();
          ctx.moveTo(cx - px, cy - py);
          ctx.lineTo(cx + px, cy + py);
          ctx.stroke();
        }
      }

      // Clean Base Line: No blocking tag or pill text on map/PDF.
      // Only show a tiny subtle circular anchor when Base Line drag mode is explicitly active.
      if (props.activeInteractionMode === 'baseline') {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(midX, midY, 7 * SF, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.30)';
        ctx.fill();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.4 * SF;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 8. Draw Boundary Perimeter & Edge Nodes (respecting Layer Visibility)
    if (props.displayOptions.showBoundary !== false) {
      ctx.beginPath();
      const p0 = meterToPixel(transformedWorking[0].x, transformedWorking[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < transformedWorking.length; i++) {
        const p = meterToPixel(transformedWorking[i].x, transformedWorking[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4 * SF;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Corner vertex nodes
      transformedWorking.forEach((pt) => {
        const p = meterToPixel(pt.x, pt.y);
        ctx.fillStyle = '#065f46';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5 * SF, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 9. Edge GPS Coordinates: EXACTLY 4 locations on North, South, East, and West edges without disturbing map area
    if (props.displayOptions.showEdgeGps && transformedWorking.length >= 3) {
      const edgePoints = extract4CardinalEdgeGpsPoints(
        props.rawWorkingPoints,
        transformedWorking,
        props.geoRef
      );

      edgePoints.forEach((ep) => {
        const p = meterToPixel(ep.point.x, ep.point.y);

        // Cardinal Dot on edge vertex
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5 * SF, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 * SF;
        ctx.stroke();

        // Directional offset outside the polygon perimeter (well clear of boundary edge)
        const offsetDist = 38 * SF;
        let rawTagX = p.x + ep.normalX * offsetDist;
        let rawTagY = p.y + ep.normalY * offsetDist;

        // Compact two-line GPS Coordinates badge (Never cut off, perfectly adjusted)
        const line1 = ep.dmsLat;
        const line2 = ep.dmsLon;

        ctx.font = `bold ${8 * SF}px ${props.fontFamily}`;
        const w1 = ctx.measureText(line1).width;
        const w2 = ctx.measureText(line2).width;
        const boxW = Math.max(w1, w2) + 14 * SF;
        const boxH = 26 * SF;

        // Safe padding clamp to prevent any clipping by map bounds, canvas edges, or PDF page boundary
        const padX = 12 * SF;
        const padY = 12 * SF;
        const tagX = Math.max(mapBounds.left + boxW / 2 + padX, Math.min(mapBounds.right - boxW / 2 - padX, rawTagX));
        const tagY = Math.max(mapBounds.top + boxH / 2 + padY, Math.min(mapBounds.bottom - boxH / 2 - padY, rawTagY));

        // Pointer line (dashed, clear connection to vertex)
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.2 * SF;
        ctx.setLineDash([3 * SF, 3 * SF]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tagX, tagY);
        ctx.stroke();
        ctx.setLineDash([]);

        // High-contrast clean white card with subtle sky-blue border
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.2 * SF;
        ctx.beginPath();
        ctx.roundRect(tagX - boxW / 2, tagY - boxH / 2, boxW, boxH, 4 * SF);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${8 * SF}px ${props.fontFamily}`;
        ctx.fillStyle = '#0369a1';
        ctx.fillText(line1, tagX, tagY - 6 * SF);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(line2, tagX, tagY + 6 * SF);
        ctx.restore();
      });
    }

    // Interactive Touched GPS Point (When user taps/clicks any point on map)
    if (touchedGps) {
      const p = meterToPixel(touchedGps.mx, touchedGps.my);

      // Glowing touch ring (translucent)
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 * SF, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(234, 88, 12, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.8)';
      ctx.lineWidth = 1.8 * SF;
      ctx.stroke();

      // Pin center
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * SF, 0, Math.PI * 2);
      ctx.fillStyle = '#ea580c';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * SF;
      ctx.stroke();

      // Tapped location callout card (Transparent glassmorphism so map beneath is visible)
      const calloutText1 = `📍 ${touchedGps.dmsLat}, ${touchedGps.dmsLon}`;
      const calloutText2 = `Grid: ${touchedGps.gridCode} · ${Math.round(touchedGps.distToEdge)}m to edge`;
      ctx.font = `bold ${9 * SF}px ${props.fontFamily}`;
      const cW = Math.max(ctx.measureText(calloutText1).width, ctx.measureText(calloutText2).width) + 14 * SF;
      const cH = 28 * SF;
      const cX = p.x;
      const cY = p.y - 32 * SF;

      // Safe clamp inside canvas bounds
      const pad = 10 * SF;
      const safeCX = Math.max(mapBounds.left + cW / 2 + pad, Math.min(mapBounds.right - cW / 2 - pad, cX));
      const safeCY = Math.max(mapBounds.top + cH / 2 + pad, Math.min(mapBounds.bottom - cH / 2 - pad, cY));

      // Transparent see-through card background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.7)';
      ctx.lineWidth = 1.4 * SF;
      ctx.beginPath();
      ctx.roundRect(safeCX - cW / 2, safeCY - cH / 2, cW, cH, 5 * SF);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fed7aa';
      ctx.textAlign = 'center';
      ctx.font = `bold ${8 * SF}px ${props.fontFamily}`;
      ctx.fillText(calloutText1, safeCX, safeCY - 4 * SF);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
      ctx.fillText(calloutText2, safeCX, safeCY + 8 * SF);
    }

    // 10. Draw Landmark Feature Markers & Stamped GPS Boundary Pillars (BP-1, BP-2...)
    if (props.displayOptions.showLandmarks !== false) {
      props.features.forEach((f) => {
        if (!f.enabled) return;
        f.markers.forEach((mk) => {
          let drawMx = mk.mx;
          let drawMy = mk.my;
          if (mk.lat !== undefined && mk.lon !== undefined && props.geoRef?.hasGeo) {
            const geoPt = latLonToMeter({ lat: mk.lat, lon: mk.lon }, props.geoRef);
            if (rotationDeg !== 0) {
              const rad = (rotationDeg * Math.PI) / 180;
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const dx = geoPt.x - centroidMeters.x;
              const dy = geoPt.y - centroidMeters.y;
              drawMx = centroidMeters.x + dx * cos - dy * sin;
              drawMy = centroidMeters.y + dx * sin + dy * cos;
            } else {
              drawMx = geoPt.x;
              drawMy = geoPt.y;
            }
          }
          const p = meterToPixel(drawMx, drawMy);
          drawCustomSymbol(ctx, f.symbol, p.x, p.y, 7 * SF, f.color);
          const label = mk.label || (f.key ? t(f.key) : f.label || 'Feature');
          ctx.font = `bold ${9 * SF}px ${props.fontFamily}`;
          const w = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(p.x - w / 2 - 3 * SF, p.y + 8 * SF, w + 6 * SF, 14 * SF);
          ctx.fillStyle = f.color;
          ctx.textAlign = 'center';
          ctx.fillText(label, p.x, p.y + 19 * SF);

          // Requirement B: If GPS coordinates are provided, display near symbol on map
          if (mk.lat !== undefined && mk.lon !== undefined) {
            const gpsText = `${toDMS(mk.lat, true)}, ${toDMS(mk.lon, false)}`;
            ctx.font = `bold ${7.5 * SF}px ${props.fontFamily}`;
            const gw = ctx.measureText(gpsText).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 0.8 * SF;
            ctx.beginPath();
            ctx.roundRect(p.x - gw / 2 - 3 * SF, p.y + 24 * SF, gw + 6 * SF, 13 * SF, 2 * SF);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#0f172a';
            ctx.fillText(gpsText, p.x, p.y + 33.5 * SF);
          }
        });
      });

      // Stamped Forest Boundary Pillars (BP-1, BP-2...)
      const activePillars = props.boundaryPillars || [];
      activePillars.forEach((bp) => {
        let drawMx = bp.mx;
        let drawMy = bp.my;
        if (props.geoRef?.hasGeo && Number.isFinite(bp.lat) && Number.isFinite(bp.lon)) {
          const geoPt = latLonToMeter({ lat: bp.lat, lon: bp.lon }, props.geoRef);
          if (rotationDeg !== 0) {
            const rad = (rotationDeg * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const dx = geoPt.x - centroidMeters.x;
            const dy = geoPt.y - centroidMeters.y;
            drawMx = centroidMeters.x + dx * cos - dy * sin;
            drawMy = centroidMeters.y + dx * sin + dy * cos;
          } else {
            drawMx = geoPt.x;
            drawMy = geoPt.y;
          }
        }
        const p = meterToPixel(drawMx, drawMy);
        ctx.save();
        // Official Boundary Pillar Diamond/Stone Symbol
        const r = 5.5 * SF;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
        ctx.fillStyle = '#047857';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6 * SF;
        ctx.stroke();

        // Pillar label pill (BP-1, BP-2...)
        ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
        const bw = ctx.measureText(bp.label).width + 8 * SF;
        const bh = 13 * SF;
        ctx.fillStyle = 'rgba(6, 78, 59, 0.94)';
        ctx.beginPath();
        ctx.roundRect(p.x - bw / 2, p.y - r - bh - 2 * SF, bw, bh, 3 * SF);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bp.label, p.x, p.y - r - bh / 2 - 2 * SF);
        ctx.restore();
      });
    }

    // 11. User Live GPS Pin, Real-World Accuracy Ring & Distance to Nearest Edge
    drawLiveUserGpsOverlay(true);

    // 12. Draw Legend Box, 360° Survey Compass Rose with Bearing & Signatures
    drawLegendBox(ctx);
    drawCompassWithBearing(ctx);
    drawSignatures(ctx);

    ctx.restore();
  }, [
    transformedWorking,
    transformedNonWorking,
    transformedNonWorkingItems,
    transformedLiveRoad,
    props.liveRoadTrack,
    props.liveWorkableWalk,
    props.liveGpsTelemetry,
    props.isNonWorkingNil,
    props.nonWorkingItems,
    props.activeScale,
    props.gridWidthM,
    props.gridHeightM,
    props.displayOptions,
    props.showSectionLines,
    props.sectionLineOffset,
    props.features,
    props.boundaryPillars,
    props.rawNonWorkingPolygons,
    props.userLocation,
    props.navTarget,
    measurePoints,
    props.liveMovementTrail,
    props.isWatchingGPS,
    props.manualBaselineOffset,
    props.baselineOption,
    props.legendPos,
    props.legendLayout,
    props.legendSize,
    props.legendOffset,
    props.fontSize,
    props.textColor,
    props.fontFamily,
    props.treatmentTitle,
    props.division,
    props.subDivision,
    props.range,
    props.round,
    props.beat,
    props.compartmentNo,
    props.mapDate,
    props.totalArea,
    props.treatmentArea,
    props.nonTreatmentArea,
    props.treatmentType,
    props.customTreatmentType,
    props.vanrakshak,
    props.vanpal,
    props.rfo,
    panOffset,
    rotationDeg,
    baseOrigin,
    centroidMeters,
    mapBounds,
    touchedGps,
    props.rawWorkingPoints,
    props.geoRef,
    props.showOfflineBasemap,
    props.offlineBasemapSource,
    props.offlineBasemapOpacity,
    props.offlineTilesVersion,
    basemapTick,
    lang
  ]);

  // Helper: Draw Sleek Survey North Arrow centered at (nx, ny)
  const drawNorthArrow = (
    ctx: CanvasRenderingContext2D,
    nx: number,
    ny: number,
    scale: number
  ) => {
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate((-rotationDeg * Math.PI) / 180);

    // Stem
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.45 * scale * SF;
    ctx.beginPath();
    ctx.moveTo(0, 9.5 * scale * SF);
    ctx.lineTo(0, -8.5 * scale * SF);
    ctx.stroke();

    // Two-tone survey arrowhead (left filled, right outlined)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, -10.5 * scale * SF);
    ctx.lineTo(-3.8 * scale * SF, -1.5 * scale * SF);
    ctx.lineTo(0, -3.5 * scale * SF);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.0 * scale * SF;
    ctx.beginPath();
    ctx.moveTo(0, -10.5 * scale * SF);
    ctx.lineTo(3.8 * scale * SF, -1.5 * scale * SF);
    ctx.lineTo(0, -3.5 * scale * SF);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Upright 'N' marker
    ctx.save();
    ctx.translate(0, -14.2 * scale * SF);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.font = `bold ${8.5 * scale * SF}px ${props.fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 0);
    ctx.restore();

    ctx.restore();
  };

  // Helper: Draw 360° Survey Compass Rose with Bearing on Map Sheet (Clear Corner Auto-Placement)
  const drawCompassWithBearing = (ctx: CanvasRenderingContext2D) => {
    if (props.displayOptions.showCompass === false) return;

    const layout = props.legendLayout || 'box';
    const isCompact = (props.legendSize || 'compact') === 'compact';
    const margin = 8 * SF;
    const cardW = (isCompact ? 80 : 88) * SF;
    const cardH = (isCompact ? 90 : 98) * SF;

    let cardX = mapBounds.left + margin;
    let cardY = mapBounds.bottom - cardH - margin;

    if (layout === 'strip') {
      // Bottom strip occupies bottom edge, so place Compass Rose cleanly in Top-Right corner
      cardX = mapBounds.right - cardW - margin;
      cardY = mapBounds.top + margin;
    } else if (props.legendPos === 'bottom_left') {
      // Legend is bottom-left, so place Compass Rose in Bottom-Right corner
      cardX = mapBounds.right - cardW - margin;
      cardY = mapBounds.bottom - cardH - margin;
    } else {
      // Default (legend at top_right, top_left, or bottom_right): Bottom-Left is always clear
      cardX = mapBounds.left + margin;
      cardY = mapBounds.bottom - cardH - margin;
    }

    // Compute exact geographic Base Line bearing (if boundary + baseline active)
    let baseBrg: number | null = null;
    if (props.displayOptions.showBaseline && transformedWorking.length >= 3) {
      const bc = computeBaselineCoords();
      if (bc?.p1 && bc?.p2) {
        const trueP1 = rotationDeg !== 0 ? unrotatePoint(bc.p1, centroidMeters, rotationDeg) : bc.p1;
        const trueP2 = rotationDeg !== 0 ? unrotatePoint(bc.p2, centroidMeters, rotationDeg) : bc.p2;
        baseBrg = calculateGeographicBearing(trueP1, trueP2);
      }
    }

    const mapNorthDeg = ((360 - Math.round(rotationDeg)) % 360 + 360) % 360;
    const cx = cardX + cardW / 2;
    const cy = cardY + (isCompact ? 37 : 40.5) * SF;
    const ringR = (isCompact ? 22.5 : 25) * SF;

    ctx.save();
    // Crisp translucent survey card backdrop
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.15 * SF;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 3.5 * SF);
    ctx.fill();
    ctx.stroke();

    // Rotate 360° dial by -rotationDeg so 0° / N always points toward True Geographic North
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-rotationDeg * Math.PI) / 180);

    // Outer & inner azimuth ring circles
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.05 * SF;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ringR - 4.2 * SF, 0, Math.PI * 2);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.65 * SF;
    ctx.stroke();

    // 360° degree ticks (10° minor, 30° major, 90° cardinal)
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = ((deg - 90) * Math.PI) / 180;
      const isCard = deg % 90 === 0;
      const isMajor = deg % 30 === 0;
      const innerR = ringR - (isCard ? 5.2 : isMajor ? 3.8 : 2.3) * SF;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * ringR, Math.sin(rad) * ringR);
      ctx.lineTo(Math.cos(rad) * innerR, Math.sin(rad) * innerR);
      ctx.strokeStyle = deg === 0 ? '#dc2626' : isCard ? '#0f172a' : isMajor ? '#475569' : '#94a3b8';
      ctx.lineWidth = (isCard ? 1.25 : isMajor ? 0.9 : 0.6) * SF;
      ctx.stroke();
    }

    // Upright Cardinal Bearing Labels (0°, 90°, 180°, 270°) outside azimuth ring
    const degLabels = [
      { txt: '0°', deg: 0, color: '#dc2626' },
      { txt: '90°', deg: 90, color: '#0f172a' },
      { txt: '180°', deg: 180, color: '#0f172a' },
      { txt: '270°', deg: 270, color: '#0f172a' }
    ];
    const degLabelR = ringR + (isCompact ? 6.6 : 7.2) * SF;
    ctx.font = `bold ${(isCompact ? 5.8 : 6.4) * SF}px ${props.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    degLabels.forEach((d) => {
      const rad = ((d.deg - 90) * Math.PI) / 180;
      const lx = Math.cos(rad) * degLabelR;
      const ly = Math.sin(rad) * degLabelR;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.fillStyle = d.color;
      ctx.fillText(d.txt, 0, 0);
      ctx.restore();
    });

    // Base Line Azimuth Indicator Vector (dashed crimson line across dial)
    if (baseBrg !== null) {
      ctx.save();
      ctx.rotate((baseBrg * Math.PI) / 180);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.05 * SF;
      ctx.setLineDash([2.4 * SF, 1.8 * SF]);
      ctx.beginPath();
      ctx.moveTo(0, -(ringR - 4.5 * SF));
      ctx.lineTo(0, ringR - 4.5 * SF);
      ctx.stroke();
      ctx.setLineDash([]);
      // Arrowhead pointing in Base Line forward bearing
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(0, -(ringR - 2.2 * SF));
      ctx.lineTo(-2.3 * SF, -(ringR - 6.8 * SF));
      ctx.lineTo(2.3 * SF, -(ringR - 6.8 * SF));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Intercardinal rays (NE, SE, SW, NW)
    const interR = ringR * 0.44;
    const interW = 2.0 * SF;
    [45, 135, 225, 315].forEach((deg) => {
      ctx.save();
      ctx.rotate((deg * Math.PI) / 180);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(0, -interR);
      ctx.lineTo(interW, 0);
      ctx.lineTo(0, 1.8 * SF);
      ctx.lineTo(-interW, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Two-tone 4-point Survey Compass Star (North in Crimson, E/S/W in Slate)
    const starR = ringR * 0.62;
    const starW = 3.1 * SF;
    [0, 90, 180, 270].forEach((deg) => {
      ctx.save();
      ctx.rotate((deg * Math.PI) / 180);
      // Left facet
      ctx.fillStyle = deg === 0 ? '#dc2626' : '#0f172a';
      ctx.beginPath();
      ctx.moveTo(0, -starR);
      ctx.lineTo(-starW, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      // Right facet
      ctx.fillStyle = deg === 0 ? '#fca5a5' : '#ffffff';
      ctx.strokeStyle = deg === 0 ? '#b91c1c' : '#0f172a';
      ctx.lineWidth = 0.7 * SF;
      ctx.beginPath();
      ctx.moveTo(0, -starR);
      ctx.lineTo(starW, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // Center Pivot Dot
    ctx.beginPath();
    ctx.arc(0, 0, 2.0 * SF, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.9 * SF;
    ctx.stroke();

    // Upright Cardinal Letters (N, E, S, W) tucked cleanly inside ring
    const cardR = ringR - 8.2 * SF;
    const cardLabels = [
      { txt: 'N', deg: 0, color: '#dc2626' },
      { txt: 'E', deg: 90, color: '#0f172a' },
      { txt: 'S', deg: 180, color: '#475569' },
      { txt: 'W', deg: 270, color: '#0f172a' }
    ];
    ctx.font = `bold ${(isCompact ? 6.6 : 7.3) * SF}px ${props.fontFamily}`;
    cardLabels.forEach((c) => {
      const rad = ((c.deg - 90) * Math.PI) / 180;
      const lx = Math.cos(rad) * cardR;
      const ly = Math.sin(rad) * cardR;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.fillStyle = c.color;
      ctx.fillText(c.txt, 0, 0);
      ctx.restore();
    });

    ctx.restore();

    // Bottom Bearing Footer Strip inside Compass Card
    const divY = cardY + cardH - (isCompact ? 16 : 17.5) * SF;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8 * SF;
    ctx.beginPath();
    ctx.moveTo(cardX + 4 * SF, divY);
    ctx.lineTo(cardX + cardW - 4 * SF, divY);
    ctx.stroke();

    const northStr = `N:${String(mapNorthDeg).padStart(3, '0')}°`;
    const footerText =
      baseBrg !== null
        ? `${northStr} · BL:${baseBrg}°${bearingToCompass(baseBrg)}`
        : `${northStr} ${bearingToCompass(mapNorthDeg)}`;

    ctx.font = `bold ${(isCompact ? 6.5 : 7.2) * SF}px ${props.fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(footerText, cx, divY + (cardY + cardH - divY) / 2, cardW - 7 * SF);

    ctx.restore();
  };

  // Helper: Draw Mini Legend Swatch Symbol centered vertically at cy, occupying [sx, sx + sw]
  const drawMiniLegendSwatch = (
    ctx: CanvasRenderingContext2D,
    kind: 'box' | 'line' | 'dashed' | 'road' | 'nala' | 'pillar',
    fill: string,
    stroke: string,
    sx: number,
    cy: number,
    sw: number,
    sh: number
  ) => {
    ctx.save();
    if (kind === 'road') {
      const rh = Math.max(5.5 * SF, sh * 0.85);
      ctx.fillStyle = '#475569';
      ctx.fillRect(sx, cy - rh / 2, sw, rh);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.1 * SF;
      ctx.beginPath();
      ctx.moveTo(sx, cy - rh / 2);
      ctx.lineTo(sx + sw, cy - rh / 2);
      ctx.moveTo(sx, cy + rh / 2);
      ctx.lineTo(sx + sw, cy + rh / 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 * SF;
      ctx.setLineDash([3 * SF, 2.2 * SF]);
      ctx.beginPath();
      ctx.moveTo(sx + 1.5 * SF, cy);
      ctx.lineTo(sx + sw - 1.5 * SF, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (kind === 'nala') {
      const rh = Math.max(5.5 * SF, sh * 0.85);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.fillRect(sx, cy - rh / 2, sw, rh);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.1 * SF;
      ctx.strokeRect(sx, cy - rh / 2, sw, rh);
      // Subtle wavy water line through center
      ctx.strokeStyle = '#0369a1';
      ctx.lineWidth = 0.9 * SF;
      ctx.beginPath();
      ctx.moveTo(sx + 1.5 * SF, cy);
      ctx.quadraticCurveTo(sx + sw * 0.3, cy - rh * 0.25, sx + sw * 0.5, cy);
      ctx.quadraticCurveTo(sx + sw * 0.7, cy + rh * 0.25, sx + sw - 1.5 * SF, cy);
      ctx.stroke();
    } else if (kind === 'dashed') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2 * SF;
      ctx.setLineDash([3.5 * SF, 2.2 * SF]);
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.lineTo(sx + sw, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (kind === 'line') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2 * SF;
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.lineTo(sx + sw, cy);
      ctx.stroke();
    } else if (kind === 'pillar') {
      // Miniature Survey Boundary Pillar triangle marker
      const cx = sx + sw / 2;
      const rad = Math.min(sw, sh) * 0.56;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9 * SF;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rad);
      ctx.lineTo(cx + rad, cy + rad * 0.85);
      ctx.lineTo(cx - rad, cy + rad * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fillRect(sx, cy - sh / 2, sw, sh);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1 * SF;
      ctx.strokeRect(sx, cy - sh / 2, sw, sh);
    }
    ctx.restore();
  };

  // Helper: Draw Legend Box (Supports Compact/Standard Corner Box with 2-col Landmarks + Horizontal Bottom Strip)
  const drawLegendBox = (ctx: CanvasRenderingContext2D) => {
    const layout = props.legendLayout || 'box';
    const isCompact = (props.legendSize || 'compact') === 'compact';
    const model = computeLegendItems();
    const r = getLegendRect();

    // Compute dynamic Base Line & Grid bearings
    const baseCoords = computeBaselineCoords();
    const bLenM =
      baseCoords?.p1 && baseCoords?.p2
        ? Math.round(Math.hypot(baseCoords.p2.x - baseCoords.p1.x, baseCoords.p2.y - baseCoords.p1.y))
        : 0;

    let baseBearingStr = '';
    let gridBearingStr = '';
    if (transformedWorking.length >= 3 && baseCoords?.p1 && baseCoords?.p2) {
      const trueP1 = rotationDeg !== 0 ? unrotatePoint(baseCoords.p1, centroidMeters, rotationDeg) : baseCoords.p1;
      const trueP2 = rotationDeg !== 0 ? unrotatePoint(baseCoords.p2, centroidMeters, rotationDeg) : baseCoords.p2;
      const baseBrg = calculateGeographicBearing(trueP1, trueP2);
      const gridLeftBrg = (baseBrg + 270) % 360;
      const gridRightBrg = (baseBrg + 90) % 360;
      baseBearingStr = `${baseBrg}°${bearingToCompass(baseBrg)}`;
      gridBearingStr = `${gridLeftBrg}°${bearingToCompass(gridLeftBrg)}/${gridRightBrg}°${bearingToCompass(gridRightBrg)}`;
    }

    type CoreLegendRow = {
      label: string;
      fill: string;
      stroke: string;
      kind: 'box' | 'line' | 'dashed' | 'road' | 'nala' | 'pillar';
    };

    const rows: CoreLegendRow[] = [];
    if (model.showBoundaryRow) {
      rows.push({ label: t('legend_boundary'), fill: '#000000', stroke: '#000000', kind: 'box' });
    }
    if (model.showBaselineRow) {
      const baseMeta = [bLenM > 0 ? `${bLenM}m` : '', baseBearingStr].filter(Boolean).join('·');
      const lenPart = baseMeta ? ` (${baseMeta})` : '';
      rows.push({
        label: `${t('legend_baseline')}${lenPart}`,
        fill: '#dc2626',
        stroke: '#dc2626',
        kind: 'line'
      });
    }
    if (model.showGridRow) {
      rows.push({
        label: `${t('legend_grid')}${gridBearingStr ? ` (${gridBearingStr})` : ''}`,
        fill: '#047857',
        stroke: '#047857',
        kind: 'box'
      });
    }
    if (model.hasNonWorkingPatch) {
      rows.push({ label: t('legend_non_working'), fill: '#fef3c7', stroke: '#d97706', kind: 'box' });
    }
    if (model.hasRoadNonWorking) {
      const roadAreaSum = model.roadItems.reduce((sum, it) => sum + (it.areaHa || 0), 0);
      const roadLabel =
        lang === 'mr'
          ? `रस्ता (${roadAreaSum.toFixed(2)} Ha)`
          : `Road (${roadAreaSum.toFixed(2)} Ha)`;
      rows.push({ label: roadLabel, fill: '#475569', stroke: '#1e293b', kind: 'road' });
    }
    if (model.hasNalaNonWorking) {
      const nalaAreaSum = model.nalaItems.reduce((sum, it) => sum + (it.areaHa || 0), 0);
      const nalaLabel =
        lang === 'mr'
          ? `नाला (${nalaAreaSum.toFixed(2)} Ha)`
          : `Nala (${nalaAreaSum.toFixed(2)} Ha)`;
      rows.push({ label: nalaLabel, fill: '#38bdf8', stroke: '#0284c7', kind: 'nala' });
    }
    if (model.showSectionRow) {
      rows.push({ label: t('legend_section_lines'), fill: '#9333ea', stroke: '#9333ea', kind: 'dashed' });
    }
    if (model.pillarCount > 0) {
      const pillarLabel =
        lang === 'mr'
          ? `सीमा खांब (${model.pillarCount})`
          : `Boundary Pillars (${model.pillarCount})`;
      rows.push({ label: pillarLabel, fill: '#0f172a', stroke: '#0f172a', kind: 'pillar' });
    }

    // ------------------------------------------------------------------------
    // MODE A: HORIZONTAL BOTTOM STRIP + STANDALONE TOP-RIGHT NORTH BADGE
    // ------------------------------------------------------------------------
    if (layout === 'strip') {
      // 1. Standalone compact True North badge in Top-Right corner (only if full 360° Compass Rose is hidden)
      if (props.displayOptions.showCompass === false) {
        const nbW = (isCompact ? 28 : 34) * SF;
        const nbH = (isCompact ? 34 : 40) * SF;
        const nbX = mapBounds.right - nbW - 8 * SF;
        const nbY = mapBounds.top + 8 * SF;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(nbX, nbY, nbW, nbH);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.1 * SF;
        ctx.strokeRect(nbX, nbY, nbW, nbH);
        drawNorthArrow(ctx, nbX + nbW / 2, nbY + nbH * 0.62, isCompact ? 0.84 : 1.0);
        ctx.restore();
      }

      // 2. Horizontal Bottom Index Strip
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.15 * SF;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      // Left Scale / Index Title cell
      const metaW = (isCompact ? 116 : 138) * SF;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(r.x + 1 * SF, r.y + 1 * SF, metaW - 1 * SF, r.h - 2 * SF);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.9 * SF;
      ctx.beginPath();
      ctx.moveTo(r.x + metaW, r.y + 2 * SF);
      ctx.lineTo(r.x + metaW, r.y + r.h - 2 * SF);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = props.textColor;
      ctx.font = `bold ${(isCompact ? 8 : 9) * SF}px ${props.fontFamily}`;
      ctx.fillText(t('legend'), r.x + 7 * SF, r.y + r.h * 0.33, metaW - 12 * SF);
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${(isCompact ? 7.8 : 8.8) * SF}px ${props.fontFamily}`;
      ctx.fillText(props.activeScale.name, r.x + 7 * SF, r.y + r.h * 0.7, metaW - 12 * SF);

      // Right grid-aligned item cells
      type StripEntry =
        | { type: 'core'; row: CoreLegendRow }
        | { type: 'feat'; feat: FeaturePreset };
      const allEntries: StripEntry[] = [
        ...rows.map((row): StripEntry => ({ type: 'core', row })),
        ...model.activeFeats.map((feat): StripEntry => ({ type: 'feat', feat }))
      ];

      const colsPerRow = isCompact ? 4 : 3;
      const stripRows = Math.max(1, Math.ceil(allEntries.length / colsPerRow));
      const itemsAreaX = r.x + metaW + 8 * SF;
      const itemsAreaW = r.w - metaW - 14 * SF;
      const colW = itemsAreaW / colsPerRow;
      const rowStep = (r.h - (isCompact ? 6 : 8) * SF) / stripRows;
      const startY = r.y + (isCompact ? 3 : 4) * SF + rowStep / 2;
      const sw = (isCompact ? 14 : 18) * SF;
      const sh = (isCompact ? 6.5 : 8) * SF;
      const fontSz = (isCompact ? 7.8 : 8.8) * SF;

      allEntries.forEach((entry, idx) => {
        const c = idx % colsPerRow;
        const rr = Math.floor(idx / colsPerRow);
        const cx = itemsAreaX + c * colW;
        const cy = startY + rr * rowStep;
        const labelX = cx + sw + 5 * SF;
        const maxLabelW = colW - sw - 10 * SF;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${fontSz}px ${props.fontFamily}`;
        ctx.fillStyle = props.textColor;

        if (entry.type === 'core') {
          drawMiniLegendSwatch(ctx, entry.row.kind, entry.row.fill, entry.row.stroke, cx, cy, sw, sh);
          ctx.fillText(entry.row.label, labelX, cy + 0.5 * SF, maxLabelW);
        } else {
          const f = entry.feat;
          const label = f.key ? t(f.key) : f.label || 'Feature';
          drawCustomSymbol(ctx, f.symbol, cx + sw / 2, cy, (isCompact ? 4.3 : 5.2) * SF, f.color);
          ctx.fillText(label, labelX, cy + 0.5 * SF, maxLabelW);
        }
      });

      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ------------------------------------------------------------------------
    // MODE B: COMPACT / STANDARD CORNER SURVEY BOX (LEFT SYMBOLS + 2-COL LANDMARKS)
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = (isCompact ? 1.15 : 1.35) * SF;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    const headerH = (isCompact ? 31 : 39) * SF;
    // Subtle light header tint for crisp visual separation
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(r.x + 1 * SF, r.y + 1 * SF, r.w - 2 * SF, headerH - 1 * SF);

    // Compact Sleek North Arrow on header left
    const nx = r.x + (isCompact ? 16 : 21) * SF;
    const ny = r.y + (isCompact ? 20.5 : 25) * SF;
    drawNorthArrow(ctx, nx, ny, isCompact ? 0.78 : 0.96);

    // Header text stacked cleanly beside North Arrow
    const headTextX = r.x + (isCompact ? 31 : 40) * SF;
    const headMaxW = r.w - (isCompact ? 37 : 46) * SF;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${(isCompact ? 8.3 : 9.6) * SF}px ${props.fontFamily}`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${t('pdf_scale')}: ${props.activeScale.name}`, headTextX, r.y + headerH * 0.34, headMaxW);
    ctx.font = `bold ${(isCompact ? 8.4 : 9.8) * SF}px ${props.fontFamily}`;
    ctx.fillStyle = props.textColor;
    ctx.fillText(t('legend'), headTextX, r.y + headerH * 0.72, headMaxW);

    // Header bottom divider
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.9 * SF;
    ctx.beginPath();
    ctx.moveTo(r.x + 4 * SF, r.y + headerH);
    ctx.lineTo(r.x + r.w - 4 * SF, r.y + headerH);
    ctx.stroke();

    // Core Rows: Left-aligned mini symbol + concise label on right
    const rowH = (isCompact ? 14.5 : 18) * SF;
    const sw = (isCompact ? 16 : 21) * SF;
    const sh = (isCompact ? 6.8 : 8.5) * SF;
    const padX = (isCompact ? 7 : 9) * SF;
    const symX = r.x + padX;
    const textX = symX + sw + (isCompact ? 6 : 7.5) * SF;
    const textMaxW = r.w - (textX - r.x) - padX;

    let cy = r.y + headerH + (isCompact ? 5 : 6) * SF + rowH * 0.5;
    ctx.font = `bold ${(isCompact ? 8.1 : 9.2) * SF}px ${props.fontFamily}`;

    rows.forEach((row) => {
      drawMiniLegendSwatch(ctx, row.kind, row.fill, row.stroke, symX, cy, sw, sh);
      ctx.fillStyle = props.textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, textX, cy + 0.5 * SF, textMaxW);
      cy += rowH;
    });

    // Enabled Landmarks: 2-column compact layout when 2+ landmarks are active
    if (model.activeFeats.length > 0) {
      const dividerY = cy - rowH * 0.5 + (isCompact ? 2.5 : 3.5) * SF;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.85 * SF;
      ctx.beginPath();
      ctx.moveTo(r.x + 6 * SF, dividerY);
      ctx.lineTo(r.x + r.w - 6 * SF, dividerY);
      ctx.stroke();

      const featRowH = (isCompact ? 13.5 : 16.5) * SF;
      const featStartY = dividerY + (isCompact ? 2.5 : 3.5) * SF + featRowH * 0.5;
      const symRadius = (isCompact ? 4.2 : 5.2) * SF;
      const featFont = `bold ${(isCompact ? 7.6 : 8.6) * SF}px ${props.fontFamily}`;
      ctx.font = featFont;

      if (model.activeFeats.length >= 2) {
        const innerW = r.w - padX * 2;
        const colW = innerW / 2;
        model.activeFeats.forEach((f, idx) => {
          const col = idx % 2;
          const rr = Math.floor(idx / 2);
          const cellX = r.x + padX + col * colW;
          const cellY = featStartY + rr * featRowH;
          const label = f.key ? t(f.key) : f.label || 'Feature';

          drawCustomSymbol(ctx, f.symbol, cellX + symRadius + 1 * SF, cellY, symRadius, f.color);
          ctx.fillStyle = props.textColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, cellX + symRadius * 2 + 4.5 * SF, cellY + 0.5 * SF, colW - symRadius * 2 - 7 * SF);
        });
      } else {
        const f = model.activeFeats[0];
        const label = f.key ? t(f.key) : f.label || 'Feature';
        drawCustomSymbol(ctx, f.symbol, symX + sw / 2, featStartY, symRadius, f.color);
        ctx.fillStyle = props.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, textX, featStartY + 0.5 * SF, textMaxW);
      }
    }

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  };

  // Helper: Draw Official Signatures (Positioned safely inside outer sheet border with zero print clipping)
  const drawSignatures = (ctx: CanvasRenderingContext2D) => {
    const fy = mapBounds.bottom + 11 * SF;
    const cols = [
      {
        x: mapBounds.left + 110 * SF,
        title: t('forest_guard'),
        name: props.vanrakshak.trim() || '—',
        sub: props.beat ? `${t('beat')}: ${props.beat}` : t('beat')
      },
      {
        x: canvasWidth / 2,
        title: t('forest_beat_officer'),
        name: props.vanpal.trim() || '—',
        sub: props.round ? `${t('round')}: ${props.round}` : t('round')
      },
      {
        x: mapBounds.right - 110 * SF,
        title: t('rfo'),
        name: props.rfo.trim() || '—',
        sub: props.range ? `${t('range')}: ${props.range}` : t('range')
      }
    ];

    cols.forEach((c) => {
      ctx.textAlign = 'center';
      ctx.fillStyle = props.textColor;
      ctx.font = `bold ${10 * SF}px ${props.fontFamily}`;
      ctx.fillText(c.title, c.x, fy);

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1 * SF;
      ctx.beginPath();
      ctx.moveTo(c.x - 68 * SF, fy + 19 * SF);
      ctx.lineTo(c.x + 68 * SF, fy + 19 * SF);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = `${9.5 * SF}px ${props.fontFamily}`;
      ctx.fillText(c.name, c.x, fy + 14.5 * SF);

      ctx.fillStyle = '#475569';
      ctx.font = `bold ${8.5 * SF}px ${props.fontFamily}`;
      ctx.fillText(c.sub, c.x, fy + 29 * SF);
    });
  };

  // Helper: Draw custom feature symbol
  const drawCustomSymbol = (
    c: CanvasRenderingContext2D,
    type: string,
    x: number,
    y: number,
    s: number,
    color: string
  ) => {
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.6 * SF;
    c.lineJoin = 'round';
    c.lineCap = 'round';

    switch (type) {
      case 'road':
        c.beginPath();
        c.moveTo(x - s, y + s * 0.8);
        c.lineTo(x + s * 0.8, y - s);
        c.moveTo(x - s * 0.8, y + s);
        c.lineTo(x + s, y - s * 0.8);
        c.stroke();
        break;
      case 'house':
        c.beginPath();
        c.rect(x - s * 0.7, y - s * 0.1, s * 1.4, s * 0.9);
        c.stroke();
        c.beginPath();
        c.moveTo(x - s * 0.9, y - s * 0.1);
        c.lineTo(x, y - s * 0.9);
        c.lineTo(x + s * 0.9, y - s * 0.1);
        c.closePath();
        c.stroke();
        break;
      case 'private_land':
        c.setLineDash([3 * SF, 2 * SF]);
        c.strokeRect(x - s * 0.8, y - s * 0.7, s * 1.6, s * 1.4);
        c.setLineDash([]);
        break;
      case 'well':
        c.beginPath();
        c.arc(x, y, s * 0.8, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(x, y, s * 0.3, 0, Math.PI * 2);
        c.fill();
        break;
      case 'borewell':
        c.beginPath();
        c.arc(x, y - s * 0.2, s * 0.45, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(x, y + s * 0.25);
        c.lineTo(x, y + s * 1.0);
        c.stroke();
        break;
      case 'pond':
        c.beginPath();
        c.ellipse(x, y, s, s * 0.55, 0, 0, Math.PI * 2);
        c.stroke();
        break;
      case 'water_hole':
        c.beginPath();
        c.arc(x, y, s * 0.65, 0, Math.PI * 2);
        c.stroke();
        break;
      case 'nala':
        c.beginPath();
        c.moveTo(x - s, y + s * 0.3);
        c.bezierCurveTo(x - s * 0.4, y - s * 0.8, x + s * 0.4, y + s * 0.8, x + s, y - s * 0.3);
        c.stroke();
        break;
      case 'temple':
        c.beginPath();
        c.moveTo(x - s * 0.6, y + s * 0.6);
        c.lineTo(x, y - s * 0.8);
        c.lineTo(x + s * 0.6, y + s * 0.6);
        c.closePath();
        c.stroke();
        break;
      case 'tower':
        c.beginPath();
        c.moveTo(x - s * 0.7, y + s * 0.8);
        c.lineTo(x, y - s * 0.9);
        c.lineTo(x + s * 0.7, y + s * 0.8);
        c.stroke();
        c.beginPath();
        c.moveTo(x - s * 0.4, y + s * 0.2);
        c.lineTo(x + s * 0.4, y + s * 0.2);
        c.stroke();
        break;
      default:
        c.beginPath();
        c.moveTo(x, y - s);
        c.lineTo(x + s, y);
        c.lineTo(x, y + s);
        c.lineTo(x - s, y);
        c.closePath();
        c.stroke();
    }
    c.restore();
  };

  useEffect(() => {
    render();
  }, [render]);

  // Pointer & Touch Gestures for Mobile & Desktop
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy
    };
  };

  const clampViewPan = useCallback(
    (nx: number, ny: number, zoom = zoomLevel): Point2D => {
      const maxX = Math.max(80, (canvasWidth / 2) * zoom * 0.45);
      const maxY = Math.max(100, (canvasHeight / 2) * zoom * 0.45);
      return {
        x: Math.max(-maxX, Math.min(maxX, nx)),
        y: Math.max(-maxY, Math.min(maxY, ny))
      };
    },
    [canvasWidth, canvasHeight, zoomLevel]
  );

  const panSheetBy = (dx: number, dy: number) => {
    setFollowGps(false);
    setViewPan((prev) => clampViewPan(prev.x + dx, prev.y + dy));
  };

  // Center viewport smoothly on current live GPS dot
  const centerOnUserLocation = useCallback(
    (zoomOverride?: number) => {
      if (!props.userLocation) return;
      let ux = props.userLocation.mx;
      let uy = props.userLocation.my;
      if (rotationDeg !== 0 && transformedWorking.length >= 3) {
        const rad = (rotationDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = ux - centroidMeters.x;
        const dy = uy - centroidMeters.y;
        ux = centroidMeters.x + dx * cos - dy * sin;
        uy = centroidMeters.y + dx * sin + dy * cos;
      }
      const p = meterToPixel(ux, uy);
      const z = zoomOverride ?? zoomLevel;
      const dxCss = (p.x - canvasWidth / 2) / 2;
      const dyCss = (p.y - canvasHeight / 2) / 2;
      setViewPan(clampViewPan(-dxCss * z, -dyCss * z, z));
    },
    [
      props.userLocation,
      rotationDeg,
      transformedWorking.length,
      centroidMeters.x,
      centroidMeters.y,
      meterToPixel,
      zoomLevel,
      canvasWidth,
      canvasHeight,
      clampViewPan
    ]
  );

  // Auto-enable Follow-GPS camera when an active GPS walk begins
  const isActivelyWalkingGps = Boolean(
    (props.liveWorkableWalk?.active &&
      props.liveWorkableWalk.inputMode === 'gps' &&
      (props.liveWorkableWalk.phase === 'road_walk' || props.liveWorkableWalk.phase === 'outer_walk')) ||
      (props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'gps')
  );

  useEffect(() => {
    if (isActivelyWalkingGps) {
      setFollowGps(true);
    }
  }, [isActivelyWalkingGps]);

  // Keep moving GPS marker centered while Follow-GPS is enabled
  useEffect(() => {
    if (followGps && props.userLocation) {
      centerOnUserLocation();
    }
  }, [followGps, props.userLocation, centerOnUserLocation]);

  // Multi-Touch Handlers for 2-Finger Zoom & Sheet Pan Up/Down/Left/Right on Mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const mid = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      touchStateRef.current = {
        activeTouches: new Map(),
        startDistance: dist,
        startZoom: zoomLevel,
        startMidpoint: mid,
        startPan: { ...viewPan }
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchStateRef.current.startDistance > 0) {
        const scaleChange = dist / touchStateRef.current.startDistance;
        const newZoom = Math.min(3.5, Math.max(0.11, touchStateRef.current.startZoom * scaleChange));
        setZoomLevel(newZoom);

        // Midpoint screen viewport pan (moves zoomed sheet up/down/left/right smoothly)
        const curMid = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2
        };
        const dx = curMid.x - touchStateRef.current.startMidpoint.x;
        const dy = curMid.y - touchStateRef.current.startMidpoint.y;
        if (Math.hypot(dx, dy) > 8) setFollowGps(false);
        setViewPan(
          clampViewPan(
            touchStateRef.current.startPan.x + dx,
            touchStateRef.current.startPan.y + dy,
            newZoom
          )
        );
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) {
      touchStateRef.current.startDistance = 0;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    pointerDownPosRef.current = pt;

    // 0. VIEW-ONLY LOCK MODE: Never drag polygon, baseline, legend, or rotate!
    // Instead smoothly pan the GPU-composited viewport camera (`viewPan`) with zero lag.
    if (props.isViewOnlyMode) {
      isDraggingViewPanRef.current = true;
      viewPanClientStartRef.current = { x: e.clientX, y: e.clientY };
      viewPanStartRef.current = { ...viewPan };
      try {
        canvasRef.current?.setPointerCapture(e.pointerId);
      } catch (err) {}
      return;
    }

    const lRect = getLegendRect();

    // 1. Check if clicking inside Legend Box to drag legend
    if (
      pt.x >= lRect.x &&
      pt.x <= lRect.x + lRect.w &&
      pt.y >= lRect.y &&
      pt.y <= lRect.y + lRect.h
    ) {
      isDraggingLegendRef.current = true;
      dragStartRef.current = pt;
      legendOffsetStartRef.current = { ...props.legendOffset };
      try {
        canvasRef.current?.setPointerCapture(e.pointerId);
      } catch (err) {}
      return;
    }

    // 1b. Check if in Map-Tap Road Tracing Mode
    if (props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'map' && props.onMapTapRoadPoint) {
      const m = pixelToMeter(pt.x, pt.y);
      const geoPt = unrotatePoint(m, centroidMeters, rotationDeg);
      props.onMapTapRoadPoint(geoPt);
      return;
    }

    // 1c. Check if in On-Field Workable Area Google-Earth Map-Tap Mode (road_walk or outer_walk)
    if (
      props.liveWorkableWalk?.active &&
      props.liveWorkableWalk.inputMode === 'map' &&
      (props.liveWorkableWalk.phase === 'road_walk' || props.liveWorkableWalk.phase === 'outer_walk') &&
      props.onMapTapWorkablePoint
    ) {
      const m = pixelToMeter(pt.x, pt.y);
      const geoPt =
        transformedWorking.length >= 3 ? unrotatePoint(m, centroidMeters, rotationDeg) : m;
      props.onMapTapWorkablePoint(geoPt);
      return;
    }

    // 2. Check if in Place Pin Mode
    if (props.placeLocationMode) {
      const snappedX = snapToAllowedGridLine(pt.x, mapBounds.left);
      const snappedY = snapToAllowedGridLine(pt.y, mapBounds.top);
      const m = pixelToMeter(snappedX, snappedY);
      const geoPt = unrotatePoint(m, centroidMeters, rotationDeg);
      const geo = meterToLatLon(geoPt, props.geoRef);
      props.onSetUserLocation({ mx: m.x, my: m.y, lat: geo.lat, lon: geo.lon, accuracy: 0 });
      props.onSetPlaceLocationMode(false);
      return;
    }

    // 3. Check if in Place Feature Symbol Mode
    if (props.activePlaceFeatureId) {
      const snappedX = snapToAllowedGridLine(pt.x, mapBounds.left);
      const snappedY = snapToAllowedGridLine(pt.y, mapBounds.top);
      const m = pixelToMeter(snappedX, snappedY);
      props.onPlacedFeature(props.activePlaceFeatureId, m);
      return;
    }

    // 4. Base Line dragging mode OR direct canvas hit-test (Checked BEFORE section lines)
    if (props.displayOptions.showBaseline || props.activeInteractionMode === 'baseline') {
      const baseline = computeBaselineCoords();
      if (baseline?.p1 && baseline?.p2) {
        const p1 = meterToPixel(baseline.p1.x, baseline.p1.y);
        const p2 = meterToPixel(baseline.p2.x, baseline.p2.y);
        const distSq = distToSegmentSq(pt, p1, p2);
        const midPx = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const distToMid = Math.hypot(pt.x - midPx.x, pt.y - midPx.y);

        // Generous touch target: within 35px*SF of line, within 50px*SF of center grab handle,
        // OR whenever interaction mode is explicitly 'baseline'
        if (
          props.activeInteractionMode === 'baseline' ||
          distToMid <= 50 * SF ||
          distSq <= (35 * SF) * (35 * SF)
        ) {
          isDraggingBaselineRef.current = true;
          dragStartRef.current = pt;
          baselineOffsetStartRef.current = { ...props.manualBaselineOffset };
          props.onSetInteractionMode('baseline');
          try {
            canvasRef.current?.setPointerCapture(e.pointerId);
          } catch (err) {}
          return;
        }
      }
    }

    // 5. Rotate KML mode
    if (props.activeInteractionMode === 'rotate') {
      isDraggingRotateRef.current = true;
      dragStartRef.current = pt;
      const cPx = meterToPixel(centroidMeters.x, centroidMeters.y);
      dragStartAngleRef.current = Math.atan2(pt.y - cPx.y, pt.x - cPx.x);
      startRotationDegRef.current = rotationDeg;
      try {
        canvasRef.current?.setPointerCapture(e.pointerId);
      } catch (err) {}
      return;
    }

    // 7. Default Pan Map mode
    isDraggingRef.current = true;
    dragStartRef.current = pt;
    panStartRef.current = { ...panOffset };
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingViewPanRef.current) {
      const dx = e.clientX - viewPanClientStartRef.current.x;
      const dy = e.clientY - viewPanClientStartRef.current.y;
      if (Math.hypot(dx, dy) > 8) setFollowGps(false);
      setViewPan(clampViewPan(viewPanStartRef.current.x + dx, viewPanStartRef.current.y + dy));
      return;
    }

    const pt = getCanvasCoords(e);

    if (isDraggingLegendRef.current) {
      const dx = pt.x - dragStartRef.current.x;
      const dy = pt.y - dragStartRef.current.y;

      if ((props.legendLayout || 'box') === 'strip') {
        props.onUpdateLegendOffset({
          x: 0,
          y: Math.round(legendOffsetStartRef.current.y + dy)
        });
        return;
      }

      const r = getLegendRect();
      const rawLegendX = r.x - props.legendOffset.x + legendOffsetStartRef.current.x + dx;
      const rawLegendY = r.y - props.legendOffset.y + legendOffsetStartRef.current.y + dy;

      const snappedLegendX = snapToAllowedGridLine(rawLegendX, mapBounds.left);
      const snappedLegendY = snapToAllowedGridLine(rawLegendY, mapBounds.top);

      const baseX = r.x - props.legendOffset.x;
      const baseY = r.y - props.legendOffset.y;

      props.onUpdateLegendOffset({
        x: Math.round(snappedLegendX - baseX),
        y: Math.round(snappedLegendY - baseY)
      });
      return;
    }

    if (isDraggingBaselineRef.current) {
      const ppm = props.activeScale.pxPer100m / 100;
      const isVertical = props.baselineOption === 'vertical';

      const testOffset = { ...props.manualBaselineOffset };
      if (!isVertical) {
        // Horizontal Baseline: Dragging changes Y coordinate
        const newOffsetY = (baseOrigin.y + panOffset.y - pt.y) / ppm;
        testOffset.y = Math.round(newOffsetY);
      } else {
        // Vertical Baseline: Dragging changes X coordinate
        const newOffsetX = (pt.x - (baseOrigin.x + panOffset.x)) / ppm;
        testOffset.x = Math.round(newOffsetX);
      }

      // Compute with strict interior clamping on Darkest Green lines
      const res = computeStrictInteriorBaseline(transformedWorking, {
        option: props.baselineOption,
        manualOffset: testOffset,
        bearingDeg: props.baselineAngleDeg,
        screenSnap: {
          mapBounds,
          baseOrigin,
          panOffset,
          ppm,
          primaryMajorStep: PRIMARY_MAJOR_STEP
        }
      });

      props.onUpdateBaselineOffset(res.clampedOffset);
      return;
    }

    if (isDraggingRotateRef.current) {
      const cPx = meterToPixel(centroidMeters.x, centroidMeters.y);
      const curAngle = Math.atan2(pt.y - cPx.y, pt.x - cPx.x);
      const diffDeg = Math.round(((curAngle - dragStartAngleRef.current) * 180) / Math.PI);
      setRotationDeg(((startRotationDegRef.current + diffDeg) % 360 + 360) % 360);
      return;
    }

    if (isDraggingRef.current) {
      const dx = pt.x - dragStartRef.current.x;
      const dy = pt.y - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 10) setFollowGps(false);
      const rawPanX = panStartRef.current.x + dx;
      const rawPanY = panStartRef.current.y + dy;

      // Mandatory Snap: strictly to Darkest (20mm) and Intermediate (5mm / 10mm) lines
      // Exclude / bypass all 1mm Lightest Green lines
      const snappedPanX = snapRelativeOffsetToAllowedGrid(rawPanX);
      const snappedPanY = snapRelativeOffsetToAllowedGrid(rawPanY);

      setPanOffset({
        x: snappedPanX,
        y: snappedPanY
      });
      return;
    }

    // Status on hover (displays true unrotated geographic coordinates)
    const m = pixelToMeter(pt.x, pt.y);
    const geoPt = unrotatePoint(m, centroidMeters, rotationDeg);
    const inside = isPointInPolygon({ x: m.x, y: m.y }, transformedWorking);
    props.onStatusChange(
      `X: ${Math.round(geoPt.x)}m, Y: ${Math.round(geoPt.y)}m ${inside ? '· Inside Polygon' : '· Outside'}`
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    const distMoved = Math.hypot(
      pt.x - pointerDownPosRef.current.x,
      pt.y - pointerDownPosRef.current.y
    );
    const clientDistMoved = isDraggingViewPanRef.current
      ? Math.hypot(
          e.clientX - viewPanClientStartRef.current.x,
          e.clientY - viewPanClientStartRef.current.y
        )
      : 0;
    const isCleanTap = distMoved < 8 && clientDistMoved < 8;

    // Quick Measure Tool: tap without drag drops a distance/area ruler vertex
    if (
      measureMode &&
      isCleanTap &&
      !isDraggingLegendRef.current &&
      !isDraggingBaselineRef.current &&
      !isDraggingRotateRef.current
    ) {
      const m = pixelToMeter(pt.x, pt.y);
      const geoPt = unrotatePoint(m, centroidMeters, rotationDeg);
      setMeasurePoints((prev) => [...prev, geoPt]);
      setTouchedGps(null);
      isDraggingRef.current = false;
      isDraggingViewPanRef.current = false;
      isDraggingLegendRef.current = false;
      isDraggingBaselineRef.current = false;
      isDraggingRotateRef.current = false;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch (err) {}
      return;
    }

    // If tap without significant drag: inspect GPS at touched point
    if (
      isCleanTap &&
      !isDraggingLegendRef.current &&
      !isDraggingBaselineRef.current &&
      !isDraggingRotateRef.current &&
      !props.placeLocationMode &&
      !props.activePlaceFeatureId &&
      !(props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'map') &&
      !(
        props.liveWorkableWalk?.active &&
        props.liveWorkableWalk.inputMode === 'map' &&
        (props.liveWorkableWalk.phase === 'road_walk' || props.liveWorkableWalk.phase === 'outer_walk')
      ) &&
      transformedWorking.length >= 3
    ) {
      const m = pixelToMeter(pt.x, pt.y);
      const geoPt = unrotatePoint(m, centroidMeters, rotationDeg);
      const geo = meterToLatLon(geoPt, props.geoRef);
      const inside = isPointInPolygon({ x: m.x, y: m.y }, transformedWorking);
      const { dist } = findNearestPointOnPolygon({ x: m.x, y: m.y }, transformedWorking);
      const baseline = computeBaselineCoords();
      let gridCode = '--';
      if (baseline?.p1 && baseline?.p2) {
        gridCode = computeForestryCellLabel(
          { x: m.x, y: m.y },
          baseline.p1,
          baseline.p2,
          props.gridWidthM,
          props.gridHeightM
        );
      }

      setTouchedGps({
        canvasX: pt.x,
        canvasY: pt.y,
        mx: geoPt.x,
        my: geoPt.y,
        lat: geo.lat,
        lon: geo.lon,
        dmsLat: toDMS(geo.lat, true),
        dmsLon: toDMS(geo.lon, false),
        gridCode,
        distToEdge: dist,
        isInside: inside
      });
      setCopiedGps(false);
    }

    isDraggingRef.current = false;
    isDraggingViewPanRef.current = false;
    isDraggingLegendRef.current = false;
    isDraggingBaselineRef.current = false;
    isDraggingRotateRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.shiftKey) {
      panSheetBy(-e.deltaX * 0.8, -e.deltaY * 0.8);
      return;
    }
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoomLevel((prev) => Math.min(3.5, Math.max(0.11, prev * zoomFactor)));
  };

  const hasActiveTaskHud = Boolean(
    props.liveWorkableWalk?.active ||
      props.liveRoadTrack?.active ||
      (props.isWatchingGPS && props.userLocation) ||
      props.activeInteractionMode === 'rotate' ||
      props.activeInteractionMode === 'baseline' ||
      props.placeLocationMode
  );

  const handleFitMap = () => {
    setFollowGps(false);
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const pad = cw < 500 ? 10 : 22;
      const fit = Math.min((cw - pad) / (canvasWidth / 2), (ch - pad) / (canvasHeight / 2));
      setZoomLevel(Math.max(0.11, Math.min(1.0, fit)));
      setViewPan({ x: 0, y: 0 });
    }
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-white/95 rounded-2xl border border-[#cce0d2] p-1 sm:p-2 min-w-0 overflow-hidden shadow-[0_4px_18px_rgba(11,53,39,0.08)]">
      {/* Slim Segmented Top Mode Strip (Locked View-Only Bar OR Full Edit Mode Controls) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
        {props.isViewOnlyMode ? (
          <div className="flex items-center justify-between gap-1.5 flex-1 min-w-0 bg-[#ebf5ee] px-2 py-1 rounded-xl border border-[#b7d9c4]">
            <div className="flex items-center gap-1.5 min-w-0 text-[#0c452a] font-bold text-[11px] sm:text-xs">
              <Lock className="w-3.5 h-3.5 text-[#0f5132] shrink-0" />
              <span className="truncate">
                {lang === 'mr' ? 'फक्त पहा · लॉक मोड' : 'View Only · Locked'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !measureMode;
                  setMeasureMode(next);
                  if (next) setTouchedGps(null);
                }}
                className={`min-h-[30px] px-2 rounded-lg text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                  measureMode
                    ? 'bg-sky-700 text-white'
                    : 'bg-white text-[#234334] border border-[#c8ded0] hover:bg-[#f4f9f6]'
                }`}
              >
                <Ruler className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'mr' ? 'मोजमाप' : 'Measure'}</span>
              </button>
              {props.onOpenOfflineTiles && (
                <button
                  type="button"
                  onClick={props.onOpenOfflineTiles}
                  className={`min-h-[30px] px-2 rounded-lg text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                    props.showOfflineBasemap
                      ? 'bg-[#0f5132] text-white'
                      : 'bg-white text-[#234334] border border-[#c8ded0] hover:bg-[#f4f9f6]'
                  }`}
                  title={lang === 'mr' ? 'ऑफलाईन उपग्रह नकाशा कॅश' : 'Pre-cache Offline Map Tiles'}
                >
                  <MapIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    {lang === 'mr' ? 'ऑफलाईन नकाशा' : 'Offline Map'}
                  </span>
                </button>
              )}
              {props.onExitViewOnlyMode && (
                <button
                  type="button"
                  onClick={props.onExitViewOnlyMode}
                  className="min-h-[30px] px-2.5 rounded-lg bg-[#0b3326] hover:bg-[#0f5132] text-white text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                >
                  <PencilLine className="w-3 h-3 shrink-0" />
                  <span>{lang === 'mr' ? 'संपादन' : 'Edit'}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-4 gap-0.5 sm:gap-1 flex-1 min-w-0 bg-[#ebf3ed] p-0.5 sm:p-1 rounded-xl border border-[#d2e3d7]">
          {/* 1. Move Map */}
          <button
            type="button"
            onClick={() => {
              setMeasureMode(false);
              props.onSetPlaceLocationMode(false);
              props.onSetInteractionMode('pan');
            }}
            className={`min-h-[30px] sm:min-h-[34px] px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer whitespace-nowrap truncate ${
              !measureMode && props.activeInteractionMode === 'pan' && !props.placeLocationMode && !props.activePlaceFeatureId
                ? 'bg-[#0f5132] text-white shadow-[0_1px_4px_rgba(15,81,50,0.28)]'
                : 'text-[#365346] hover:text-[#10251c] hover:bg-white/80'
            }`}
          >
            <Move className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{lang === 'mr' ? 'हलवा' : 'Move'}</span>
          </button>

          {/* 2. Lines & Grid */}
          <button
            type="button"
            onClick={() => {
              setMeasureMode(false);
              props.onSetPlaceLocationMode(false);
              props.onSetInteractionMode('baseline');
              props.onOpenMapSetupStep?.('lines');
            }}
            className={`min-h-[30px] sm:min-h-[34px] px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer whitespace-nowrap truncate ${
              !measureMode && props.activeInteractionMode === 'baseline'
                ? 'bg-rose-700 text-white shadow-2xs'
                : 'text-[#365346] hover:text-[#10251c] hover:bg-white/80'
            }`}
          >
            <Compass className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{lang === 'mr' ? 'बेस रेषा' : 'Base Line'}</span>
          </button>

          {/* 3. Add Landmark */}
          <button
            type="button"
            onClick={() => {
              setMeasureMode(false);
              const nextPin = !props.placeLocationMode;
              props.onSetInteractionMode('pan');
              props.onSetPlaceLocationMode(nextPin);
              if (nextPin) {
                props.onOpenMapSetupStep?.('landmarks');
              }
            }}
            className={`min-h-[30px] sm:min-h-[34px] px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer whitespace-nowrap truncate ${
              !measureMode && (props.placeLocationMode || props.activePlaceFeatureId)
                ? 'bg-[#0b3326] text-white shadow-2xs'
                : 'text-[#365346] hover:text-[#10251c] hover:bg-white/80'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{lang === 'mr' ? 'खूण' : 'Landmark'}</span>
          </button>

          {/* 4. Quick Distance & Area Ruler */}
          <button
            type="button"
            onClick={() => {
              const next = !measureMode;
              setMeasureMode(next);
              if (next) {
                props.onSetPlaceLocationMode(false);
                props.onSetInteractionMode('pan');
                setTouchedGps(null);
              }
            }}
            className={`min-h-[30px] sm:min-h-[34px] px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer whitespace-nowrap truncate ${
              measureMode
                ? 'bg-sky-700 text-white shadow-2xs'
                : 'text-[#365346] hover:text-[#10251c] hover:bg-white/80'
            }`}
            title={lang === 'mr' ? 'नकाशावर अंतर व क्षेत्रफळ मोजा (रूलर)' : 'Quick Distance & Area Ruler'}
          >
            <Ruler className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{lang === 'mr' ? 'मोजमाप' : 'Measure'}</span>
          </button>
        </div>
        )}

        {/* Mobile Expand / Collapse Map View */}
        {props.onToggleMobileMapExpanded && (
          <button
            type="button"
            onClick={props.onToggleMobileMapExpanded}
            className={`lg:hidden min-h-[32px] px-2 rounded-xl font-semibold text-[10.5px] flex items-center gap-1 flex-shrink-0 cursor-pointer border whitespace-nowrap transition ${
              props.isMobileMapExpanded
                ? 'bg-[#0b3326] text-white border-[#0b3326]'
                : 'bg-[#f4f8f5] hover:bg-white border-[#cfe0d4] text-[#173a2b]'
            }`}
            title={props.isMobileMapExpanded ? 'Exit Full Screen' : 'Full Screen Map'}
          >
            {props.isMobileMapExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>{lang === 'mr' ? 'पूर्ण' : 'Done'}</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#0f5132]" />
                <span>{lang === 'mr' ? 'मोठा' : 'Full'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Forest Cartography Drafting Viewport — Crisp A4 Sheet on Sage Topographic Desk */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-hidden forest-desk-bg border border-[#d4e3d9] rounded-xl flex items-center justify-center select-none touch-none"
      >
        <div
          style={{
            transform: `translate(${viewPan.x}px, ${viewPan.y}px) scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: 'transform 0.08s ease-out'
          }}
          className="bg-white shadow-[0_8px_28px_rgba(11,48,34,0.16)] ring-1 ring-emerald-950/12 flex-shrink-0"
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            className={`block bg-white select-none ${
              (props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'map') ||
              (props.liveWorkableWalk?.active &&
                props.liveWorkableWalk.inputMode === 'map' &&
                (props.liveWorkableWalk.phase === 'road_walk' || props.liveWorkableWalk.phase === 'outer_walk'))
                ? 'cursor-crosshair'
                : measureMode
                ? 'cursor-crosshair'
                : props.activeInteractionMode === 'baseline'
                ? 'cursor-move'
                : props.placeLocationMode || props.activePlaceFeatureId
                ? 'cursor-crosshair'
                : 'cursor-grab'
            }`}
            style={{
              width: `${canvasWidth / 2}px`,
              height: `${canvasHeight / 2}px`,
              touchAction: 'none'
            }}
          />
        </div>

        {/* Floating Quick Measure Distance & Area Ruler HUD (Top-Center, non-intrusive) */}
        {(measureMode || measurePoints.length > 0) && (() => {
          const totalDistM = calculatePolylineLengthM(measurePoints);
          const areaHa = measurePoints.length >= 3 ? calcAreaHa(measurePoints) : 0;
          const lastBrg =
            measurePoints.length >= 2
              ? calculateGeographicBearing(
                  measurePoints[measurePoints.length - 2],
                  measurePoints[measurePoints.length - 1]
                )
              : null;

          return (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-16px)] bg-slate-900/94 backdrop-blur-md text-white px-2.5 py-1.5 rounded-xl border border-sky-400/60 shadow-lg flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] select-none">
              <div className="flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                {measurePoints.length < 2 ? (
                  <span className="text-sky-100 font-semibold">
                    {measurePoints.length === 0
                      ? lang === 'mr'
                        ? 'अंतर मोजण्यासाठी नकाशावर टॅप करा'
                        : 'Tap 2+ points on map to measure'
                      : lang === 'mr'
                      ? 'पुढील बिंदूवर टॅप करा…'
                      : 'Tap next point…'}
                  </span>
                ) : (
                  <div className="flex items-center gap-2 font-mono font-bold tabular-nums">
                    <span className="text-sky-300">
                      {totalDistM >= 1000
                        ? `${(totalDistM / 1000).toFixed(2)} km`
                        : `${totalDistM.toFixed(1)} m`}
                    </span>
                    {lastBrg !== null && (
                      <span className="text-slate-200 border-l border-slate-700 pl-2">
                        {String(Math.round(lastBrg) % 360).padStart(3, '0')}° {bearingToCompass(lastBrg)}
                      </span>
                    )}
                    {measurePoints.length >= 3 && (
                      <span className="text-emerald-300 border-l border-slate-700 pl-2">
                        {areaHa.toFixed(2)} Ha
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                {measurePoints.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMeasurePoints((prev) => prev.slice(0, -1))}
                      className="px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                      title={lang === 'mr' ? 'शेवटचा बिंदू काढा' : 'Undo last point'}
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>{lang === 'mr' ? 'मागे' : 'Undo'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMeasurePoints([])}
                      className="px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
                    >
                      {lang === 'mr' ? 'साफ' : 'Clear'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMeasureMode(false);
                    setMeasurePoints([]);
                  }}
                  className="p-1 rounded-md bg-sky-700 hover:bg-sky-600 text-white cursor-pointer"
                  title={lang === 'mr' ? 'मोजमाप बंद करा' : 'Close Measure Tool'}
                  aria-label="Close Measure Tool"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Clean Collapsible Navigation & Layer Controls (Slim Rail + Popout Pan Pad / Layer Manager) */}
        <div className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 flex items-end gap-1.5 z-20">
          {isLayersOpen && props.onToggleDisplayOption && (
            <div className="w-[186px] bg-white/96 backdrop-blur-md p-2.5 rounded-xl shadow-lg border border-slate-200/90 text-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{lang === 'mr' ? 'नकाशा स्तर (Layers)' : 'Map & KMZ Layers'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsLayersOpen(false)}
                  className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                  aria-label="Close Layers"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {[
                {
                  key: 'showBoundary',
                  checked: props.displayOptions.showBoundary !== false,
                  label: lang === 'mr' ? 'कूप सीमा (Boundary)' : 'Boundary'
                },
                {
                  key: 'showNonWorking',
                  checked: props.displayOptions.showNonWorking !== false,
                  label: lang === 'mr' ? 'अनुपचार व रस्ते' : 'Non-Working & Roads'
                },
                {
                  key: 'showBaseline',
                  checked: props.displayOptions.showBaseline,
                  label: lang === 'mr' ? 'पाया रेषा (Base Line)' : 'Base Line'
                },
                {
                  key: 'showSectionLines',
                  checked: Boolean(props.showSectionLines || props.displayOptions.showSectionLines),
                  label: lang === 'mr' ? 'विभाग रेषा (Section)' : 'Section Lines'
                },
                {
                  key: 'showGridLines',
                  checked: props.displayOptions.showGridLines,
                  label: lang === 'mr' ? 'ग्रीड रेषा (Grid)' : 'Grid Lines'
                },
                {
                  key: 'showLandmarks',
                  checked: props.displayOptions.showLandmarks !== false,
                  label: lang === 'mr' ? 'खुणा व खांब (BP)' : 'Landmarks & Pillars'
                },
                {
                  key: 'showCompass',
                  checked: props.displayOptions.showCompass !== false,
                  label: lang === 'mr' ? 'कंपॉस आणि बेअरिंग' : 'Compass & Bearing'
                }
              ].map((layer) => (
                <label
                  key={layer.key}
                  className="flex items-center justify-between gap-2 py-0.5 px-1 rounded-md hover:bg-slate-50 cursor-pointer select-none"
                >
                  <span className="text-[11px] font-medium text-slate-700 truncate">
                    {layer.label}
                  </span>
                  <input
                    type="checkbox"
                    checked={layer.checked}
                    onChange={(e) => {
                      const nextVal = e.target.checked;
                      props.onToggleDisplayOption?.(layer.key, nextVal);
                      if (layer.key === 'showSectionLines') {
                        props.onToggleSectionLines?.(nextVal);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                  />
                </label>
              ))}
              {/* Offline Basemap Imagery Controls (IndexedDB Tile Cache) */}
              {props.onToggleOfflineBasemap && (
                <div className="pt-1.5 mt-1 border-t border-slate-200 space-y-1.5">
                  <label className="flex items-center justify-between gap-2 py-0.5 px-1 rounded-md hover:bg-slate-50 cursor-pointer select-none">
                    <span className="text-[11px] font-bold text-[#0f5132] truncate">
                      {lang === 'mr' ? 'ऑफलाईन उपग्रह नकाशा' : 'Offline Basemap'}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(props.showOfflineBasemap)}
                      onChange={(e) => props.onToggleOfflineBasemap?.(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                    />
                  </label>

                  {props.showOfflineBasemap && props.onChangeOfflineBasemapSource && (
                    <div className="grid grid-cols-3 gap-0.5 bg-slate-100 p-0.5 rounded-lg">
                      {(['esri_satellite', 'esri_topo', 'osm_standard'] as TileSourceId[]).map((sid) => (
                        <button
                          key={sid}
                          type="button"
                          onClick={() => props.onChangeOfflineBasemapSource?.(sid)}
                          className={`py-1 rounded-md text-[10px] font-semibold cursor-pointer transition ${
                            (props.offlineBasemapSource || 'esri_satellite') === sid
                              ? 'bg-[#0f5132] text-white'
                              : 'text-slate-600 hover:bg-white'
                          }`}
                        >
                          {lang === 'mr' ? TILE_SOURCES[sid].shortMr : TILE_SOURCES[sid].shortEn}
                        </button>
                      ))}
                    </div>
                  )}

                  {props.onOpenOfflineTiles && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsLayersOpen(false);
                        props.onOpenOfflineTiles?.();
                      }}
                      className="w-full py-1.5 px-2 rounded-lg bg-[#eaf5ee] hover:bg-[#d8eee0] border border-[#c3e0ce] text-[#0c452a] text-[10.5px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Download className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {lang === 'mr' ? 'ऑफलाईन टाईल्स कॅश करा' : 'Pre-cache Map Tiles'}
                        {(props.cachedTileCount ?? 0) > 0 ? ` (${props.cachedTileCount})` : ''}
                      </span>
                    </button>
                  )}
                </div>
              )}

              <p className="text-[9.5px] text-slate-400 pt-1 border-t border-slate-100 leading-tight">
                {lang === 'mr'
                  ? 'KMZ फाईलमध्येही हेच स्तर जतन होतात.'
                  : 'Synced directly to exported KMZ folders.'}
              </p>
            </div>
          )}

          {isPanPadOpen && (
            <div className="bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-md border border-slate-200/90">
              <div className="grid grid-cols-3 gap-0.5">
                <div className="w-7 h-7" />
                <button
                  type="button"
                  onClick={() => panSheetBy(0, 75)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-200/80 active:scale-95 rounded-md text-slate-700 transition cursor-pointer"
                  title="Move Map Up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <div className="w-7 h-7" />

                <button
                  type="button"
                  onClick={() => panSheetBy(75, 0)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-200/80 active:scale-95 rounded-md text-slate-700 transition cursor-pointer"
                  title="Move Map Left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleFitMap}
                  className="w-7 h-7 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 active:scale-95 rounded-md text-emerald-800 transition cursor-pointer"
                  title="Center & Fit Map"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => panSheetBy(-75, 0)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-200/80 active:scale-95 rounded-md text-slate-700 transition cursor-pointer"
                  title="Move Map Right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="w-7 h-7" />
                <button
                  type="button"
                  onClick={() => panSheetBy(0, -75)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-200/80 active:scale-95 rounded-md text-slate-700 transition cursor-pointer"
                  title="Move Map Down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <div className="w-7 h-7" />
              </div>
            </div>
          )}

          {/* Slim Vertical Control Rail */}
          <div className="flex flex-col bg-white/92 backdrop-blur-md rounded-xl shadow-sm border border-slate-200/90 overflow-hidden divide-y divide-slate-200/70">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(3.5, z + 0.14))}
              className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.11, z - 0.14))}
              className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitMap}
              className="w-8 h-8 flex items-center justify-center text-emerald-800 hover:bg-emerald-50 active:bg-emerald-100 transition cursor-pointer"
              title="Center & Fit Map"
              aria-label="Center & Fit Map"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {props.userLocation && (
              <button
                type="button"
                onClick={() => {
                  const next = !followGps;
                  setFollowGps(next);
                  if (next) centerOnUserLocation();
                }}
                className={`w-8 h-8 flex items-center justify-center transition cursor-pointer ${
                  followGps
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                }`}
                title={
                  followGps
                    ? lang === 'mr'
                      ? 'GPS फॉलो सुरू — थांबवण्यासाठी टॅप करा'
                      : 'Following live GPS — tap to unlock'
                    : lang === 'mr'
                    ? 'माझ्या स्थानावर केंद्रित करा'
                    : 'Center & Follow my live GPS'
                }
                aria-label="Follow Live GPS"
              >
                <LocateFixed className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsPanPadOpen((v) => !v);
                setIsLayersOpen(false);
              }}
              className={`w-8 h-8 flex items-center justify-center transition cursor-pointer ${
                isPanPadOpen
                  ? 'bg-emerald-800 text-white'
                  : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
              }`}
              title={isPanPadOpen ? 'Hide Direction Arrows' : 'Show Direction Arrows'}
              aria-label="Toggle 4-way pan arrows"
              aria-expanded={isPanPadOpen}
            >
              <Move className="w-3.5 h-3.5" />
            </button>
            {props.onToggleDisplayOption && (
              <button
                type="button"
                onClick={() => {
                  setIsLayersOpen((v) => !v);
                  setIsPanPadOpen(false);
                }}
                className={`w-8 h-8 flex items-center justify-center transition cursor-pointer ${
                  isLayersOpen
                    ? 'bg-emerald-800 text-white'
                    : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                }`}
                title={lang === 'mr' ? 'नकाशा स्तर (Layers)' : 'Map & KMZ Layers'}
                aria-label="Toggle map layers"
                aria-expanded={isLayersOpen}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Real-Time GPS Quality Dashboard Widget (Top-Right of Map Screen) */}
        <GpsQualityDashboard
          lang={lang}
          telemetry={props.liveGpsTelemetry}
          isGpsActive={Boolean(
            props.isWatchingGPS ||
              (props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'gps') ||
              (props.liveWorkableWalk?.active && props.liveWorkableWalk.inputMode === 'gps')
          )}
          onToggleGps={props.onToggleGPS}
          gpsAccuracyGateM={props.gpsAccuracyGateM}
          onGpsAccuracyGateChange={props.onGpsAccuracyGateChange}
          gnssStatus={props.gnssStatus}
          onRetryGpsLock={props.onRetryGpsLock}
        />

        {/* Compact Live Walking & Activity Status Bar — Shows Real-Time Walked Distance, Live Area Making & Direction */}
        {hasActiveTaskHud && (() => {
          const headingCompass =
            typeof props.userLocation?.headingDeg === 'number' && Number.isFinite(props.userLocation.headingDeg)
              ? bearingToCompass(props.userLocation.headingDeg)
              : '';
          const speedKmh =
            props.userLocation?.speedMps != null && props.userLocation.speedMps >= 0.35
              ? (props.userLocation.speedMps * 3.6).toFixed(1)
              : null;

          // Compute standalone road/nala/patch live walked distance & area including current GPS tip
          let standaloneWalkedM = 0;
          let standaloneAreaHa = 0;
          if (props.liveRoadTrack?.active && props.liveRoadTrack.points.length >= 1) {
            const pts = props.liveRoadTrack.points;
            const last = pts[pts.length - 1];
            const livePts =
              props.liveRoadTrack.mode === 'gps' &&
              props.userLocation &&
              Math.hypot(props.userLocation.mx - last.x, props.userLocation.my - last.y) >= 0.5
                ? [...pts, { x: props.userLocation.mx, y: props.userLocation.my }]
                : pts;
            standaloneWalkedM = calculatePolylineLengthM(livePts);
            const k = props.liveRoadTrack.kind || 'road';
            if (k === 'patch') {
              standaloneAreaHa = livePts.length >= 3 ? calcAreaHa(livePts) : 0;
            } else if (livePts.length >= 2) {
              const poly =
                k === 'nala'
                  ? oneSidedBufferPolylineToPolygon(
                      livePts,
                      props.liveRoadTrack.widthM,
                      props.liveRoadTrack.nalaSide || 'right'
                    )
                  : bufferPolylineToPolygon(livePts, props.liveRoadTrack.widthM);
              const polyHa = poly.length >= 3 ? calcAreaHa(poly) : 0;
              standaloneAreaHa = polyHa > 0 ? polyHa : (standaloneWalkedM * props.liveRoadTrack.widthM) / 10000;
            }
          }

          const formatAreaSmall = (ha: number) => {
            if (ha <= 0) return '0.00 Ha';
            if (ha < 0.05) return `${ha.toFixed(3)} Ha (${Math.round(ha * 10000)} m²)`;
            return `${ha.toFixed(2)} Ha`;
          };

          const monitorTrailM =
            props.liveMovementTrail && props.liveMovementTrail.length >= 2
              ? calculatePolylineLengthM(props.liveMovementTrail)
              : 0;

          return (
            <div className="flex absolute top-2 left-2 sm:top-2.5 sm:left-2.5 right-auto max-w-[calc(100%-152px)] sm:max-w-[430px] bg-slate-900/92 backdrop-blur-md text-white px-2.5 py-1.5 rounded-xl text-[11px] font-medium flex-col gap-1 pointer-events-none shadow-lg border border-white/10 z-20">
              {props.liveWorkableWalk?.active ? (
                props.liveWorkableWalk.phase === 'road_walk' ? (
                  <>
                    {/* Row 1: Feature Type + Live Direction/Speed */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`flex items-center gap-1.5 font-bold truncate ${
                          props.liveWorkableWalk.activeNonWorkingKind === 'nala'
                            ? 'text-sky-300'
                            : props.liveWorkableWalk.activeNonWorkingKind === 'patch'
                            ? 'text-amber-300'
                            : 'text-orange-300'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
                            props.liveWorkableWalk.activeNonWorkingKind === 'nala'
                              ? 'bg-sky-400'
                              : props.liveWorkableWalk.activeNonWorkingKind === 'patch'
                              ? 'bg-amber-400'
                              : 'bg-orange-400'
                          }`}
                        />
                        <span className="truncate">
                          {props.liveWorkableWalk.activeNonWorkingKind === 'nala'
                            ? lang === 'mr'
                              ? `नाला (${props.liveWorkableWalk.nalaSide === 'left' ? 'डावी' : 'उजवी'} · ${props.liveWorkableWalk.nalaWidthM}m)`
                              : `Nala (${props.liveWorkableWalk.nalaSide === 'left' ? 'Left' : 'Right'} · ${props.liveWorkableWalk.nalaWidthM}m)`
                            : props.liveWorkableWalk.activeNonWorkingKind === 'patch'
                            ? lang === 'mr'
                              ? `अनुपचार क्षेत्र (${props.liveWorkableWalk.roadDraftPoints.length} कोपरे)`
                              : `NW Patch (${props.liveWorkableWalk.roadDraftPoints.length} pts)`
                            : lang === 'mr'
                            ? `रस्ता (${props.liveWorkableWalk.roadWidthM}m रुंदी)`
                            : `Road (${props.liveWorkableWalk.roadWidthM}m wide)`}
                        </span>
                      </span>
                      {props.liveWorkableWalk.inputMode === 'gps' && (headingCompass || speedKmh) && (
                        <span className="font-mono text-[10px] font-semibold text-sky-200 bg-white/10 px-1.5 py-0.5 rounded tabular-nums shrink-0">
                          {headingCompass}
                          {headingCompass && speedKmh ? ' · ' : ''}
                          {speedKmh ? `${speedKmh} km/h` : ''}
                        </span>
                      )}
                    </div>

                    {/* Row 2: Live Walked Distance & Non-Workable Area Making */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] font-mono tabular-nums border-t border-white/10 pt-1">
                      <span className="text-slate-200">
                        <span className="text-slate-400 font-sans mr-1">
                          {lang === 'mr' ? 'चालले:' : 'Walked:'}
                        </span>
                        <strong className="text-white">
                          {Math.round(props.liveWorkableWalk.activeDraftDistanceM || 0)} m
                        </strong>
                      </span>
                      <span className="text-amber-300">
                        <span className="text-slate-400 font-sans mr-1">
                          {lang === 'mr' ? 'अनुपचार:' : 'NW Area:'}
                        </span>
                        <strong>{formatAreaSmall(props.liveWorkableWalk.activeDraftAreaHa || 0)}</strong>
                      </span>
                      {props.liveWorkableWalk.sessionRoadItems.length > 0 && (
                        <span className="text-slate-300">
                          <span className="text-slate-400 font-sans mr-1">
                            {lang === 'mr' ? 'एकूण NW:' : 'Total NW:'}
                          </span>
                          <strong>{(props.liveWorkableWalk.totalSessionNonWorkingHa || 0).toFixed(2)} Ha</strong>
                        </span>
                      )}
                    </div>
                  </>
                ) : props.liveWorkableWalk.phase === 'outer_walk' ? (
                  <>
                    {/* Row 1: Workable Area Walk Status + Remaining */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-emerald-300 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            props.liveWorkableWalk.isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                        <span className="truncate">
                          {props.liveWorkableWalk.isPaused
                            ? lang === 'mr'
                              ? 'थांबवले (Paused)'
                              : 'Walk Paused'
                            : lang === 'mr'
                            ? 'उपचार क्षेत्र मोजणी'
                            : 'Workable Area Walk'}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] font-bold text-emerald-200 bg-emerald-500/20 px-1.5 py-0.5 rounded tabular-nums shrink-0">
                        {lang === 'mr' ? 'शिल्लक' : 'Left'}:{' '}
                        {props.liveWorkableWalk.remainingWorkableHa.toFixed(2)} Ha
                      </span>
                    </div>

                    {/* Row 2: Live Walked Distance + Workable Area Making + NW Area */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] font-mono tabular-nums border-t border-white/10 pt-1">
                      <span className="text-slate-200">
                        <span className="text-slate-400 font-sans mr-1">
                          {lang === 'mr' ? 'चालले:' : 'Walked:'}
                        </span>
                        <strong className="text-white">
                          {Math.round(props.liveWorkableWalk.liveOuterWalkedM ?? props.liveWorkableWalk.perimeterM)} m
                        </strong>
                      </span>
                      <span className="text-emerald-300">
                        <span className="text-slate-400 font-sans mr-1">
                          {lang === 'mr' ? 'उपचार:' : 'Workable:'}
                        </span>
                        <strong>
                          {props.liveWorkableWalk.currentNetWorkableHa.toFixed(2)} /{' '}
                          {props.liveWorkableWalk.targetWorkableHa.toFixed(2)} Ha
                        </strong>
                      </span>
                      {props.liveWorkableWalk.roadAreaHa > 0 && (
                        <span className="text-amber-300">
                          <span className="text-slate-400 font-sans mr-1">NW:</span>
                          <strong>{props.liveWorkableWalk.roadAreaHa.toFixed(2)} Ha</strong>
                        </span>
                      )}
                      {props.liveWorkableWalk.distToStartM != null && (
                        <span className="text-sky-200">
                          {lang === 'mr' ? 'सुरुवात:' : 'Start:'}{' '}
                          {Math.round(props.liveWorkableWalk.distToStartM)}m{' '}
                          {props.liveWorkableWalk.bearingToStartCompass || ''}
                        </span>
                      )}
                    </div>

                    {/* Slim Progress Bar */}
                    <div className="w-full h-1.5 bg-slate-700/90 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          props.liveWorkableWalk.isPaused ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            props.liveWorkableWalk.targetWorkableHa > 0
                              ? (props.liveWorkableWalk.currentNetWorkableHa /
                                  props.liveWorkableWalk.targetWorkableHa) *
                                  100
                              : 0
                          )}%`
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-300 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="truncate">
                        {props.liveWorkableWalk.phase === 'road_review'
                          ? lang === 'mr'
                            ? `अनुपचार तयार (${props.liveWorkableWalk.sessionRoadItems.length}) · ${props.liveWorkableWalk.roadAreaHa.toFixed(2)} Ha → बाह्य लक्ष्य ${props.liveWorkableWalk.targetGrossHa.toFixed(2)} Ha`
                            : `Non-Workable Ready (${props.liveWorkableWalk.sessionRoadItems.length}) · ${props.liveWorkableWalk.roadAreaHa.toFixed(2)} Ha → Outer ${props.liveWorkableWalk.targetGrossHa.toFixed(2)} Ha`
                          : lang === 'mr'
                          ? 'शेतातील क्षेत्र मोजणी सेटअप'
                          : 'Field Workable Area Setup'}
                      </span>
                    </span>
                  </div>
                )
              ) : props.liveRoadTrack?.active ? (
                <>
                  {/* Standalone Road / Nala / Non-Workable Patch Walk Live Status Bar */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`flex items-center gap-1.5 font-bold truncate ${
                        props.liveRoadTrack.kind === 'nala'
                          ? 'text-sky-300'
                          : props.liveRoadTrack.kind === 'patch'
                          ? 'text-amber-300'
                          : 'text-orange-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
                          props.liveRoadTrack.kind === 'nala'
                            ? 'bg-sky-400'
                            : props.liveRoadTrack.kind === 'patch'
                            ? 'bg-amber-400'
                            : 'bg-orange-400'
                        }`}
                      />
                      <span className="truncate">
                        {props.liveRoadTrack.kind === 'nala'
                          ? lang === 'mr'
                            ? `नाला काठ (${props.liveRoadTrack.nalaSide === 'left' ? 'डावी' : 'उजवी'} · ${props.liveRoadTrack.widthM}m)`
                            : `Nala Bank (${props.liveRoadTrack.nalaSide === 'left' ? 'Left' : 'Right'} · ${props.liveRoadTrack.widthM}m)`
                          : props.liveRoadTrack.kind === 'patch'
                          ? lang === 'mr'
                            ? `अनुपचार क्षेत्र (${props.liveRoadTrack.points.length} कोपरे)`
                            : `NW Patch (${props.liveRoadTrack.points.length} pts)`
                          : lang === 'mr'
                          ? `रस्ता (${props.liveRoadTrack.widthM}m रुंदी)`
                          : `Road (${props.liveRoadTrack.widthM}m wide)`}
                      </span>
                    </span>
                    {props.liveRoadTrack.mode === 'gps' && (headingCompass || speedKmh) && (
                      <span className="font-mono text-[10px] font-semibold text-sky-200 bg-white/10 px-1.5 py-0.5 rounded tabular-nums shrink-0">
                        {headingCompass}
                        {headingCompass && speedKmh ? ' · ' : ''}
                        {speedKmh ? `${speedKmh} km/h` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] font-mono tabular-nums border-t border-white/10 pt-1">
                    <span className="text-slate-200">
                      <span className="text-slate-400 font-sans mr-1">
                        {lang === 'mr' ? 'चालले:' : 'Walked:'}
                      </span>
                      <strong className="text-white">{Math.round(standaloneWalkedM)} m</strong>
                    </span>
                    <span className="text-amber-300">
                      <span className="text-slate-400 font-sans mr-1">
                        {lang === 'mr' ? 'अनुपचार:' : 'NW Area:'}
                      </span>
                      <strong>{formatAreaSmall(standaloneAreaHa)}</strong>
                    </span>
                  </div>
                </>
              ) : props.isWatchingGPS && props.userLocation ? (
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px]">
                  <span className="flex items-center gap-1.5 font-bold text-sky-300">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                    <span>
                      {headingCompass
                        ? lang === 'mr'
                          ? `चाल दिशा: ${headingCompass}`
                          : `Moving ${headingCompass}`
                        : lang === 'mr'
                        ? 'थेट GPS सुरू'
                        : 'GPS Live'}
                    </span>
                  </span>
                  {speedKmh && (
                    <span className="font-mono text-slate-200 tabular-nums">{speedKmh} km/h</span>
                  )}
                  <span className="font-mono text-white tabular-nums">
                    {lang === 'mr' ? 'चालले:' : 'Walked:'} <strong>{Math.round(monitorTrailM)} m</strong>
                  </span>
                </div>
              ) : props.activeInteractionMode === 'rotate' ? (
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rotate: Drag to spin KML ({rotationDeg}°)</span>
                </div>
              ) : props.activeInteractionMode === 'baseline' ? (
                <div className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-rose-400" />
                  <span>Base Line: Drag red line on map or step in Setup</span>
                </div>
              ) : props.placeLocationMode ? (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  <span>Pin Mode: Tap map to place GPS mark</span>
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* Live Interactive 360° Survey Compass & Bearing Overlay (Bottom-Left above Scale chip) */}
        {(() => {
          let liveBaseBearingDeg: number | null = null;
          if (props.displayOptions.showBaseline && transformedWorking.length >= 3 && baselineCalc?.p1 && baselineCalc?.p2) {
            const trueP1 = rotationDeg !== 0 ? unrotatePoint(baselineCalc.p1, centroidMeters, rotationDeg) : baselineCalc.p1;
            const trueP2 = rotationDeg !== 0 ? unrotatePoint(baselineCalc.p2, centroidMeters, rotationDeg) : baselineCalc.p2;
            liveBaseBearingDeg = calculateGeographicBearing(trueP1, trueP2);
          }

          let targetBearing: { bearingDeg: number; distanceM: number } | null = null;
          if (touchedGps && props.userLocation) {
            const dx = touchedGps.mx - props.userLocation.mx;
            const dy = touchedGps.my - props.userLocation.my;
            const dist = Math.hypot(dx, dy);
            if (dist >= 1) {
              targetBearing = {
                bearingDeg: calculateGeographicBearing(
                  { x: props.userLocation.mx, y: props.userLocation.my },
                  { x: touchedGps.mx, y: touchedGps.my }
                ),
                distanceM: dist
              };
            }
          }

          return (
            <MapCompassWidget
              lang={lang}
              rotationDeg={rotationDeg}
              baseLineBearingDeg={liveBaseBearingDeg}
              gpsHeadingDeg={
                typeof props.userLocation?.headingDeg === 'number' && Number.isFinite(props.userLocation.headingDeg)
                  ? props.userLocation.headingDeg
                  : null
              }
              isGpsActive={Boolean(
                props.isWatchingGPS ||
                  (props.liveRoadTrack?.active && props.liveRoadTrack.mode === 'gps') ||
                  (props.liveWorkableWalk?.active && props.liveWorkableWalk.inputMode === 'gps')
              )}
              showMapCompass={props.displayOptions.showCompass !== false}
              onToggleMapCompass={
                props.onToggleDisplayOption
                  ? (val) => props.onToggleDisplayOption?.('showCompass', val)
                  : undefined
              }
              onResetNorth={props.onRotationChange ? () => props.onRotationChange?.(0) : undefined}
              targetBearing={targetBearing}
              navTarget={props.navTarget || null}
              navWaypoints={navWaypoints}
              userLocation={props.userLocation}
              onSelectNavTarget={props.onSelectNavTarget}
              onStartGpsForNav={props.onStartGpsForNav}
              hidden={Boolean(touchedGps)}
            />
          );
        })()}

        {/* Live Calculated Zoom Scale Readout (e.g., 1:5,000) based on Canvas Zoom Transform & ActiveScale */}
        {!touchedGps && (() => {
          const baseSheetScaleDenom = Math.round(720000 / Math.max(1, props.activeScale.pxPer100m));
          const liveViewScaleDenom = Math.max(
            50,
            Math.round(baseSheetScaleDenom / Math.max(0.05, zoomLevel))
          );
          const zoomPct = Math.round(zoomLevel * 100);
          return (
            <button
              type="button"
              onClick={handleFitMap}
              title={
                lang === 'mr'
                  ? `सध्याचे झूम प्रमाण (मूळ नकाशा प्रमाण 1:${baseSheetScaleDenom.toLocaleString('en-US')}) — फिट करण्यासाठी टॅप करा`
                  : `Current viewport zoom scale (Print sheet 1:${baseSheetScaleDenom.toLocaleString('en-US')}) — Tap to Fit`
              }
              className="absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/92 hover:bg-white backdrop-blur-md border border-slate-200/90 shadow-sm text-slate-800 transition cursor-pointer select-none"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {lang === 'mr' ? 'प्रमाण' : 'Scale'}
              </span>
              <span className="font-mono font-bold text-[11.5px] text-emerald-950 tabular-nums">
                1:{liveViewScaleDenom.toLocaleString('en-US')}
              </span>
              <span className="text-[10px] font-mono text-slate-400 tabular-nums border-l border-slate-200 pl-1.5">
                {zoomPct}%
              </span>
            </button>
          );
        })()}

        {/* Touched GPS Location Callout Card (Whenever user taps anywhere on map) */}
        {touchedGps && (
          <div className="absolute bottom-2 left-2 right-12 sm:bottom-3 sm:left-3 sm:right-auto sm:max-w-md bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700 z-20 animate-slideUp text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5">
              <span className="font-semibold text-amber-300 flex items-center gap-1.5 text-xs">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>Tapped Location</span>
              </span>
              <button
                type="button"
                onClick={() => setTouchedGps(null)}
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700">
                <span className="text-slate-400 block text-[9px] font-sans">Latitude</span>
                <span className="font-bold text-emerald-300">{touchedGps.dmsLat}</span>
                <span className="block text-[10px] text-slate-400">{touchedGps.lat.toFixed(5)}°</span>
              </div>
              <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700">
                <span className="text-slate-400 block text-[9px] font-sans">Longitude</span>
                <span className="font-bold text-emerald-300">{touchedGps.dmsLon}</span>
                <span className="block text-[10px] text-slate-400">{touchedGps.lon.toFixed(5)}°</span>
              </div>
            </div>

            {props.userLocation && (() => {
              const distM = Math.hypot(
                touchedGps.mx - props.userLocation.mx,
                touchedGps.my - props.userLocation.my
              );
              const brg = calculateGeographicBearing(
                { x: props.userLocation.mx, y: props.userLocation.my },
                { x: touchedGps.mx, y: touchedGps.my }
              );
              const backBrg = (brg + 180) % 360;
              return (
                <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-400/30 text-[11px] font-mono tabular-nums">
                  <span className="text-rose-200 font-sans font-semibold flex items-center gap-1">
                    <Compass className="w-3 h-3 text-rose-400" />
                    <span>{lang === 'mr' ? 'बेअरिंग:' : 'Bearing:'}</span>
                  </span>
                  <span className="text-white font-bold">
                    {String(brg).padStart(3, '0')}° {bearingToCompass(brg)} · {Math.round(distM)}m
                    <span className="text-slate-400 font-normal ml-1.5">
                      (BB {String(backBrg).padStart(3, '0')}°)
                    </span>
                  </span>
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
              <span className="text-slate-300 font-mono">
                Grid {touchedGps.gridCode} · {Math.round(touchedGps.distToEdge)}m to edge
              </span>

              <div className="flex items-center gap-1.5">
                {props.onSelectNavTarget && (
                  <button
                    type="button"
                    onClick={() => {
                      props.onSelectNavTarget?.({
                        id: `tap_${Date.now()}`,
                        label:
                          touchedGps.gridCode && touchedGps.gridCode !== '-'
                            ? `${lang === 'mr' ? 'ग्रीड' : 'Grid'} ${touchedGps.gridCode}`
                            : lang === 'mr'
                            ? 'टॅप बिंदू'
                            : 'Tapped Spot',
                        sublabel: `${touchedGps.dmsLat}, ${touchedGps.dmsLon}`,
                        category: 'custom',
                        mx: touchedGps.mx,
                        my: touchedGps.my,
                        lat: touchedGps.lat,
                        lon: touchedGps.lon
                      });
                      props.onStartGpsForNav?.();
                      setTouchedGps(null);
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-extrabold flex items-center gap-1 transition text-[10px] cursor-pointer"
                  >
                    <Target className="w-3 h-3" />
                    <span>{lang === 'mr' ? 'गो-टू' : 'Go-To'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const text = `${touchedGps.lat.toFixed(6)}, ${touchedGps.lon.toFixed(6)} (${touchedGps.dmsLat}, ${touchedGps.dmsLon}) Grid: ${touchedGps.gridCode}`;
                    navigator.clipboard.writeText(text);
                    setCopiedGps(true);
                    setTimeout(() => setCopiedGps(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-1 transition text-[10px] cursor-pointer"
                >
                  {copiedGps ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedGps ? 'Copied' : 'Copy GPS'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom helper strip — Hidden on compact mobile preview so map maximizes height */}
      <div className={`${props.isMobileMapExpanded ? 'flex' : 'hidden lg:flex'} flex-shrink-0 mt-2 px-1 flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500`}>
        <div className="flex items-center gap-1.5 text-slate-600">
          <MapPin className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
          <span className="truncate">
            {touchedGps
              ? `Tapped: ${touchedGps.dmsLat}, ${touchedGps.dmsLon} · Grid ${touchedGps.gridCode}`
              : 'Tap anywhere on the map to inspect instant GPS coordinates, grid cell code, and edge distance.'}
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-500 shrink-0">
          1mm = {(props.gridWidthM / (props.activeScale.gridStepXPx / MM_PX)).toFixed(1)}m ground
        </div>
      </div>
    </div>
  );
};
