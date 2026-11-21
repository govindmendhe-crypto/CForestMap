/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MapCanvas } from './components/MapCanvas';
import { ShareModal } from './components/ShareModal';
import { PdfExportModal } from './components/PdfExportModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallBanner } from './components/PWAInstallButton';
import { SavedCoupesModal } from './components/SavedCoupesModal';
import { OfflineTilesModal } from './components/OfflineTilesModal';
import { ImportModeDialog, PendingImportPreview } from './components/ImportModeDialog';
import {
  TileSourceId,
  TileCacheStats,
  getTileCacheStats
} from './utils/offlineTileCache';
import { registerIncomingMapFileListeners } from './utils/incomingFileHandler';
import {
  Point2D,
  GeoRef,
  ScaleConfig,
  FeaturePreset,
  Orientation,
  UserLocation,
  PaperSize,
  LandIdentifierType,
  GridStatementData,
  NonWorkingAreaItem,
  LiveGpsTelemetry,
  LiveWorkableWalkState,
  WorkableWalkPhase,
  BoundaryPillar,
  NonWorkingFeatureKind,
  NalaSide,
  NavTarget
} from './types/mapTypes';
import {
  parseSpatialFile,
  calcAreaHa,
  toDMS,
  bearingToCompass,
  isPointInPolygon,
  evaluateSmartA4Orientation,
  generateForestrySurveyGrid,
  getMetersPerDegree,
  latLonToMeter,
  meterToLatLon,
  formatToDMY,
  computeStrictInteriorBaseline,
  computeSectionLines,
  clampSectionLineOffset,
  unrotatePoint,
  unrotatePoints,
  calculateGeographicBearing,
  bufferPolylineToPolygon,
  oneSidedBufferPolylineToPolygon,
  calculatePolylineLengthM
} from './utils/geoUtils';
import {
  GpsPrecisionFilter,
  latLonToLocalMetersWGS84,
  localMetersToLatLonWGS84,
  buildGeoRefFromLocalPolygon,
  computePolygonPerimeterM,
  solveExactTargetAreaPolygon
} from './utils/gpsPrecision';
import {
  startResilientGnssWatch,
  getOfflineSafeCurrentFix,
  ResilientGnssHandle,
  OfflineGnssStatus
} from './utils/offlineGnss';
import {
  computeParentChildAreaSummary,
  computeExactParentChildrenUnionAreaM2,
  clipNonWorkingItemsToBoundary,
  cleanSimpleBoundaryPolygon,
  ParentChildAreaSummary
} from './utils/polygonAreaEngine';
import { getFontForLang, getTranslation } from './utils/i18n';
import {
  StrictFrame,
  evaluatePaperChoice,
  generateStrictScalePdf,
  buildPdfDocument,
  handleDownloadPDF
} from './utils/pdfExport';
import { generateCoupeKmz, generateKmzForSavedProject } from './utils/kmzExport';
import { extractEmbeddedProjectFromKmz, parseAppKmzForInspection } from './utils/kmzImport';
import {
  acquireScreenWakeLock,
  releaseScreenWakeLock,
  triggerVertexCapturedFeedback,
  triggerPillarStampedFeedback,
  triggerTargetCompletedFeedback,
  saveActiveWalkDraft,
  loadActiveWalkDraft,
  clearActiveWalkDraft,
  ActiveWalkDraft,
  SavedCoupeProject,
  listSavedCoupes,
  downloadProjectJsonBackup
} from './utils/fieldTools';
import {
  loadAllSavedCoupesFromDb,
  upsertSavedCoupeInDb,
  bulkUpsertSavedCoupesInDb,
  deleteSavedCoupeInDb,
  exportEntireFolderAsZip,
  importFolderZipBackup
} from './utils/offlineCoupeDb';
import { isNativeAndroidApp, saveOrShareBlobFile } from './utils/nativeBridge';
import { CheckCircle2, AlertCircle, Info, X, Globe, Move, Compass, Layers } from 'lucide-react';

const SCALE_PRESETS: Record<string, { name: string; pxPer100m: number }> = {
  '2cm_100m': { name: '2 cm = 100 m', pxPer100m: 72 * 2 },
  '1cm_100m': { name: '1 cm = 100 m', pxPer100m: 36 * 2 },
  '1cm_50m': { name: '1 cm = 50 m', pxPer100m: 72 * 2 },
  '1cm_200m': { name: '1 cm = 200 m', pxPer100m: 18 * 2 }
};

const DEFAULT_FEATURES: FeaturePreset[] = [
  { id: 'road', key: 'feature_road', symbol: 'road', color: '#334155', enabled: false, markers: [] },
  { id: 'house', key: 'feature_house', symbol: 'house', color: '#7c2d12', enabled: false, markers: [] },
  { id: 'private_land', key: 'feature_private_land', symbol: 'private_land', color: '#b45309', enabled: false, markers: [] },
  { id: 'well', key: 'feature_well', symbol: 'well', color: '#1d4ed8', enabled: false, markers: [] },
  { id: 'borewell', key: 'feature_borewell', symbol: 'borewell', color: '#0369a1', enabled: false, markers: [] },
  { id: 'pond', key: 'feature_pond', symbol: 'pond', color: '#0284c7', enabled: false, markers: [] },
  { id: 'water_hole', key: 'feature_water_hole', symbol: 'water_hole', color: '#0ea5e9', enabled: false, markers: [] },
  { id: 'nala', key: 'feature_nala', symbol: 'nala', color: '#2563eb', enabled: false, markers: [] },
  { id: 'temple', key: 'feature_temple', symbol: 'temple', color: '#b91c1c', enabled: false, markers: [] },
  { id: 'school', key: 'feature_school', symbol: 'school', color: '#7c3aed', enabled: false, markers: [] },
  { id: 'tower', key: 'feature_tower', symbol: 'tower', color: '#0f172a', enabled: false, markers: [] }
];

export default function App() {
  const [lang, setLang] = useState<string>('mr');
  const [fontFamily, setFontFamily] = useState<string>(getFontForLang('mr'));
  const t = useCallback((k: string) => getTranslation(k, lang), [lang]);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // Chrome Browser Tip banner (hidden automatically inside compiled native Android APK)
  const [chromeNoticeDismissed, setChromeNoticeDismissed] = useState<boolean>(() => {
    if (isNativeAndroidApp()) return true;
    try {
      return localStorage.getItem('forest_chrome_notice_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismissChromeNotice = () => {
    setChromeNoticeDismissed(true);
    try {
      localStorage.setItem('forest_chrome_notice_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  // Spatial Data
  const [rawWorkingPoints, setRawWorkingPoints] = useState<Point2D[]>([]);
  const [rawNonWorkingPolygons, setRawNonWorkingPolygons] = useState<Point2D[][]>([]);
  const [nonWorkingFiles, setNonWorkingFiles] = useState<NonWorkingAreaItem[]>([]);
  const [workingFileName, setWorkingFileName] = useState<string>('');
  const [nonWorkingFileName, setNonWorkingFileName] = useState<string>('');
  const [isNonWorkingNil, setIsNonWorkingNil] = useState<boolean>(false);
  const [geoRef, setGeoRef] = useState<GeoRef>({
    hasGeo: false,
    centerLat: 0,
    centerLon: 0,
    northLat: 0,
    southLat: 0,
    eastLon: 0,
    westLon: 0
  });

  // Base Line & Section Line
  const [baselineOption, setBaselineOption] = useState<'horizontal' | 'longest_axis' | 'vertical' | 'grid_parallel'>('horizontal');
  const [manualBaselineOffset, setManualBaselineOffset] = useState<Point2D>({ x: 0, y: 0 });
  const [showSectionLines, setShowSectionLines] = useState<boolean>(false);
  const [sectionLineOffset, setSectionLineOffset] = useState<number>(0);
  const [axisLength, setAxisLength] = useState<number>(0);
  const [bearingDeg, setBearingDeg] = useState<number>(90);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [isMobileMapExpanded, setIsMobileMapExpanded] = useState<boolean>(false);
  const [isMobileWorkExpanded, setIsMobileWorkExpanded] = useState<boolean>(false);
  const [hasSavedOfficerDefaults, setHasSavedOfficerDefaults] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('forest_officer_defaults_v1'));
    } catch {
      return false;
    }
  });

  const handleBaselineOptionChange = useCallback((opt: 'horizontal' | 'longest_axis' | 'vertical' | 'grid_parallel') => {
    setBaselineOption(opt);
    setSectionLineOffset(0);
  }, []);

  // Grid & Scale
  const [gridWidthM, setGridWidthM] = useState<number>(100);
  const [gridHeightM, setGridHeightM] = useState<number>(100);
  const [scaleId, setScaleId] = useState<string>('2cm_100m');
  const [customScaleCm, setCustomScaleCm] = useState<number>(1);
  const [customScaleM, setCustomScaleM] = useState<number>(100);
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  // Scale Config computation
  const activeScale: ScaleConfig = React.useMemo(() => {
    let pxPer100m = SCALE_PRESETS['2cm_100m'].pxPer100m;
    let name = SCALE_PRESETS['2cm_100m'].name;

    if (scaleId === 'custom') {
      const cm = customScaleCm || 1;
      const m = customScaleM || 100;
      pxPer100m = (cm * 36 * 2 * 100) / m;
      name = `${cm} cm = ${m} m`;
    } else if (SCALE_PRESETS[scaleId]) {
      pxPer100m = SCALE_PRESETS[scaleId].pxPer100m;
      name = SCALE_PRESETS[scaleId].name;
    }

    const ppm = pxPer100m / 100;
    return {
      id: scaleId,
      name,
      pxPer100m,
      gridStepXPx: gridWidthM * ppm,
      gridStepYPx: gridHeightM * ppm,
      metersX: gridWidthM,
      metersY: gridHeightM
    };
  }, [scaleId, customScaleCm, customScaleM, gridWidthM, gridHeightM]);

  // Smart A4 orientation fit evaluation
  const a4FitInfo = React.useMemo(() => {
    return evaluateSmartA4Orientation(rawWorkingPoints, activeScale.pxPer100m, 3.6 * 2);
  }, [rawWorkingPoints, activeScale.pxPer100m]);

  const handleAutoOptimizeA4 = useCallback(() => {
    if (rawWorkingPoints.length < 3) {
      showToast(getTranslation('toast_please_load_map', lang), 'info');
      return;
    }
    const fit = evaluateSmartA4Orientation(rawWorkingPoints, activeScale.pxPer100m, 3.6 * 2);
    setOrientation(fit.recommendedOrientation);
    if (fit.fitsInA4) {
      showToast(
        `Smart A4: Switched to ${fit.recommendedOrientation === 'landscape' ? 'Landscape (आडवा)' : 'Portrait (उभा)'} — fits strictly in A4!`,
        'success'
      );
    } else {
      showToast(
        `Orientation optimized (${fit.recommendedOrientation}). Expansive coupe exceeds A4; print on A3 to strictly preserve ruler scale.`,
        'info'
      );
    }
  }, [rawWorkingPoints, activeScale.pxPer100m, lang, showToast]);

  // Administration Details - Clean defaults (no hardcoded personnel names or specific localities)
  const [treatmentTitle, setTreatmentTitle] = useState<string>('');
  const [village, setVillage] = useState<string>('');
  const [landIdentifierType, setLandIdentifierType] = useState<LandIdentifierType>('compartment');
  const [landIdentifierValue, setLandIdentifierValue] = useState<string>('');
  const [plantSpacingM, setPlantSpacingM] = useState<number>(3);
  const [targetTotalPlants, setTargetTotalPlants] = useState<number>(7777);

  const [division, setDivision] = useState<string>('');
  const [subDivision, setSubDivision] = useState<string>('');
  const [range, setRange] = useState<string>('');
  const [round, setRound] = useState<string>('');
  const [beat, setBeat] = useState<string>('');
  const [compartmentNo, setCompartmentNo] = useState<string>('');
  const [mapDate, setMapDate] = useState<string>(() => formatToDMY());
  const [treatmentType, setTreatmentType] = useState<string>('nirmulan');
  const [customTreatmentType, setCustomTreatmentType] = useState<string>('');

  // STRICT PARENT-CHILD GEOMETRIC AREA ENGINE (Single Source of Truth)
  // Net Workable Area = Area(Parent) - Area(Parent ∩ ⋃ Children)
  const areaSummary = React.useMemo<ParentChildAreaSummary>(
    () => computeParentChildAreaSummary(rawWorkingPoints, nonWorkingFiles, isNonWorkingNil),
    [rawWorkingPoints, nonWorkingFiles, isNonWorkingNil]
  );
  const totalArea = areaSummary.formatted.totalArea;
  const preWalkNonWorkingHa =
    rawWorkingPoints.length < 3 && !isNonWorkingNil && nonWorkingFiles.length > 0
      ? nonWorkingFiles.reduce((sum, item) => sum + item.areaHa, 0)
      : 0;
  const nonTreatmentArea = isNonWorkingNil
    ? ''
    : rawWorkingPoints.length < 3 && preWalkNonWorkingHa > 0
    ? preWalkNonWorkingHa.toFixed(2)
    : areaSummary.formatted.nonWorkingArea;
  const treatmentArea = areaSummary.formatted.workableArea;

  // Signatures
  const [vanrakshak, setVanrakshak] = useState<string>('');
  const [vanpal, setVanpal] = useState<string>('');
  const [rfo, setRfo] = useState<string>('');

  // Display Options (Synced with MapCanvas Layer Manager & KMZ Folders)
  const [displayOptions, setDisplayOptions] = useState({
    showBoundary: true,
    showNonWorking: true,
    showLandmarks: true,
    showBaseline: true,
    showBaselineMeas: true,
    showSectionLines: true,
    showEdgeGps: true,
    showGridNaming: true,
    showGridNumbers: true,
    showGridLines: true,
    showCompass: true,
    combineTitleLines: true
  });

  // Landmark Features & Legend
  const [features, setFeatures] = useState<FeaturePreset[]>(DEFAULT_FEATURES);
  const [activePlaceFeatureId, setActivePlaceFeatureId] = useState<string | null>(null);
  const [legendPos, setLegendPos] = useState<string>('top_right');
  const [legendLayout, setLegendLayout] = useState<'box' | 'strip'>('box');
  const [legendSize, setLegendSize] = useState<'compact' | 'standard'>('compact');
  const [legendOffset, setLegendOffset] = useState<Point2D>({ x: 0, y: 0 });

  // Styling
  const [fontSize, setFontSize] = useState<string>('medium');
  const [textColor, setTextColor] = useState<string>('#065f46');

  // Interaction State
  const [activeInteractionMode, setActiveInteractionMode] = useState<'pan' | 'baseline' | 'place' | 'rotate'>('pan');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [navTarget, setNavTarget] = useState<NavTarget | null>(null);
  const [liveMovementTrail, setLiveMovementTrail] = useState<Point2D[]>([]);
  const liveMovementTrailRef = useRef<Point2D[]>([]);
  const lastHeadingPtRef = useRef<Point2D | null>(null);
  const lastHeadingDegRef = useRef<number | null>(null);
  const gpsMonitorOriginRef = useRef<{ lat: number; lon: number } | null>(null);
  const geoRefLatestRef = useRef<GeoRef>(geoRef);
  geoRefLatestRef.current = geoRef;
  const rawWorkingPointsLatestRef = useRef<Point2D[]>(rawWorkingPoints);
  rawWorkingPointsLatestRef.current = rawWorkingPoints;
  const [isWatchingGPS, setIsWatchingGPS] = useState<boolean>(false);
  const [placeLocationMode, setPlaceLocationMode] = useState<boolean>(false);
  const [hoverStatus, setHoverStatus] = useState<string>('Ready');
  const [rotationDeg, setRotationDeg] = useState<number>(0);

  // Standalone Walkable Road / Nala / Non-Workable Patch Recorder State
  const [isRecordingRoad, setIsRecordingRoad] = useState<boolean>(false);
  const [roadRecordMode, setRoadRecordMode] = useState<'gps' | 'map' | null>(null);
  const [roadTrackKind, setRoadTrackKind] = useState<NonWorkingFeatureKind>('road');
  const [roadWidthM, setRoadWidthM] = useState<number>(4);
  const [roadNalaSide, setRoadNalaSide] = useState<NalaSide>('right');
  const [roadTrackPoints, setRoadTrackPoints] = useState<Point2D[]>([]);
  const [roadGpsAccuracy, setRoadGpsAccuracy] = useState<number | null>(null);
  const roadWatchHandleRef = useRef<ResilientGnssHandle | null>(null);

  // High-Accuracy Field GPS Precision Engine & Live Telemetry
  const [gpsAccuracyGateM, setGpsAccuracyGateM] = useState<number>(12);
  const [gnssStatus, setGnssStatus] = useState<OfflineGnssStatus | null>(null);
  const [liveGpsTelemetry, setLiveGpsTelemetry] = useState<LiveGpsTelemetry>({
    rawAccuracyM: null,
    filteredAccuracyM: null,
    quality: 'poor',
    acceptedFixes: 0,
    rejectedFixes: 0,
    speedMps: 0,
    maxAccuracyGateM: 12,
    isLocked: false
  });
  const gpsFilterRef = useRef<GpsPrecisionFilter>(new GpsPrecisionFilter(12));
  const fieldOriginRef = useRef<{ lat: number; lon: number } | null>(null);

  // On-Field Workable Area Mapping (Target Ha + Optional Multi-Road/Nala/Patch First + Strict Auto-Complete)
  const [workableWalkPhase, setWorkableWalkPhase] = useState<WorkableWalkPhase>('idle');
  const [workableInputMode, setWorkableInputMode] = useState<'gps' | 'map'>('gps');
  const [targetWorkableHa, setTargetWorkableHa] = useState<number>(20);
  const [includeRoadFirst, setIncludeRoadFirst] = useState<boolean>(false);
  const [workableNonWorkingKind, setWorkableNonWorkingKind] = useState<NonWorkingFeatureKind>('road');
  const [workableRoadWidthM, setWorkableRoadWidthM] = useState<number>(4);
  const [workableNalaWidthM, setWorkableNalaWidthM] = useState<number>(6);
  const [workableNalaSide, setWorkableNalaSide] = useState<NalaSide>('right');
  const [workableRoadDraftPts, setWorkableRoadDraftPts] = useState<Point2D[]>([]);
  const [sessionRoadItems, setSessionRoadItems] = useState<NonWorkingAreaItem[]>([]);
  const [outerWalkPoints, setOuterWalkPoints] = useState<Point2D[]>([]);
  const [isWalkPaused, setIsWalkPaused] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [boundaryPillars, setBoundaryPillars] = useState<BoundaryPillar[]>([]);
  const [recoverableWalkDraft, setRecoverableWalkDraft] = useState<ActiveWalkDraft | null>(() =>
    loadActiveWalkDraft()
  );
  const [savedCoupes, setSavedCoupes] = useState<SavedCoupeProject[]>(() => listSavedCoupes());
  const [coupeStorageEngine, setCoupeStorageEngine] = useState<'indexeddb' | 'localstorage'>('indexeddb');
  const [isSavedCoupesOpen, setIsSavedCoupesOpen] = useState<boolean>(false);

  // View-Only Lock Mode & Pre-Open KML/KMZ Mode Dialog
  const [isViewOnlyMode, setIsViewOnlyMode] = useState<boolean>(false);
  const [pendingImport, setPendingImport] = useState<
    | {
        kind: 'saved_project';
        project: SavedCoupeProject;
        sourceMode?: 'full_project' | 'kml_reconstructed' | 'json_backup';
        preview: PendingImportPreview;
      }
    | {
        kind: 'raw_kml';
        fileName: string;
        pts: Point2D[];
        geoRef: GeoRef;
        totalPolyHa: number;
        workHa: string;
        axisLength: number;
        bearingDeg: number;
        preview: PendingImportPreview;
      }
    | null
  >(null);

  // Offline Pre-Cached Map Tiles State (IndexedDB)
  const [isOfflineTilesOpen, setIsOfflineTilesOpen] = useState<boolean>(false);
  const [showOfflineBasemap, setShowOfflineBasemap] = useState<boolean>(false);
  const [offlineBasemapSource, setOfflineBasemapSource] = useState<TileSourceId>(() => {
    try {
      const saved = localStorage.getItem('forest_offline_basemap_source');
      if (saved === 'esri_satellite' || saved === 'esri_topo' || saved === 'osm_standard') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'esri_satellite';
  });
  const [offlineBasemapOpacity, setOfflineBasemapOpacity] = useState<number>(0.82);
  const [offlineTileStats, setOfflineTileStats] = useState<TileCacheStats>({
    totalTiles: 0,
    totalBytes: 0,
    regions: []
  });
  const [offlineTilesVersion, setOfflineTilesVersion] = useState<number>(0);

  useEffect(() => {
    try {
      localStorage.setItem('forest_offline_basemap_source', offlineBasemapSource);
    } catch {
      // ignore
    }
  }, [offlineBasemapSource]);

  // Hydrate Saved KMZ Folder & Offline Map Tile Stats from IndexedDB on startup
  useEffect(() => {
    let active = true;
    loadAllSavedCoupesFromDb().then(({ coupes, engine }) => {
      if (!active) return;
      setSavedCoupes(coupes);
      setCoupeStorageEngine(engine);
    });
    getTileCacheStats().then((stats) => {
      if (!active) return;
      setOfflineTileStats(stats);
      if (stats.regions.length > 0) {
        try {
          if (!localStorage.getItem('forest_offline_basemap_source')) {
            setOfflineBasemapSource(stats.regions[0].sourceId);
          }
        } catch {
          // ignore
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Receive KMZ/KML files opened directly from WhatsApp ("Open With" or "Share -> TreatmentMap")
  const incomingFileHandlerRef = useRef<((file: File) => void) | null>(null);
  useEffect(() => {
    const cleanup = registerIncomingMapFileListeners((file) => {
      incomingFileHandlerRef.current?.(file);
    });
    return cleanup;
  }, []);

  const workableWatchHandleRef = useRef<ResilientGnssHandle | null>(null);
  const liveMonitorWatchHandleRef = useRef<ResilientGnssHandle | null>(null);

  // Refs to prevent stale closures inside continuous GPS watch callbacks
  const outerWalkPointsRef = useRef<Point2D[]>([]);
  const workableRoadDraftPtsRef = useRef<Point2D[]>([]);
  const sessionRoadItemsRef = useRef<NonWorkingAreaItem[]>([]);
  const targetWorkableHaRef = useRef<number>(20);
  const roadTrackPointsRef = useRef<Point2D[]>([]);
  const isWalkPausedRef = useRef<boolean>(false);
  const boundaryPillarsRef = useRef<BoundaryPillar[]>([]);

  useEffect(() => {
    outerWalkPointsRef.current = outerWalkPoints;
  }, [outerWalkPoints]);
  useEffect(() => {
    workableRoadDraftPtsRef.current = workableRoadDraftPts;
  }, [workableRoadDraftPts]);
  useEffect(() => {
    sessionRoadItemsRef.current = sessionRoadItems;
  }, [sessionRoadItems]);
  useEffect(() => {
    targetWorkableHaRef.current = targetWorkableHa;
  }, [targetWorkableHa]);
  useEffect(() => {
    roadTrackPointsRef.current = roadTrackPoints;
  }, [roadTrackPoints]);
  useEffect(() => {
    isWalkPausedRef.current = isWalkPaused;
  }, [isWalkPaused]);
  useEffect(() => {
    boundaryPillarsRef.current = boundaryPillars;
  }, [boundaryPillars]);

  // Automatic Screen Wake Lock during active jungle GPS walks
  const needsWakeLock =
    ((workableWalkPhase === 'road_walk' || workableWalkPhase === 'outer_walk') &&
      workableInputMode === 'gps' &&
      !isWalkPaused) ||
    (isRecordingRoad && roadRecordMode === 'gps');

  useEffect(() => {
    let cancelled = false;
    const syncWakeLock = async () => {
      if (needsWakeLock) {
        const locked = await acquireScreenWakeLock();
        if (!cancelled) setWakeLockActive(locked);
      } else {
        await releaseScreenWakeLock();
        if (!cancelled) setWakeLockActive(false);
      }
    };
    syncWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && needsWakeLock) {
        acquireScreenWakeLock().then((locked) => {
          if (!cancelled) setWakeLockActive(locked);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      releaseScreenWakeLock();
    };
  }, [needsWakeLock]);

  // Crash-Proof Auto-Save of Active Field Walk Progress (survives refresh / battery drain)
  useEffect(() => {
    if (workableWalkPhase === 'idle' || workableWalkPhase === 'setup') return;
    const hasData =
      outerWalkPoints.length > 0 || workableRoadDraftPts.length > 0 || sessionRoadItems.length > 0;
    if (!hasData) return;

    saveActiveWalkDraft({
      savedAt: Date.now(),
      phase: workableWalkPhase,
      inputMode: workableInputMode,
      targetWorkableHa,
      includeRoadFirst,
      activeNonWorkingKind: workableNonWorkingKind,
      roadWidthM: workableRoadWidthM,
      nalaWidthM: workableNalaWidthM,
      nalaSide: workableNalaSide,
      roadDraftPoints: workableRoadDraftPts,
      sessionRoadItems,
      outerWalkPoints,
      fieldOrigin: fieldOriginRef.current,
      pillars: boundaryPillars
    });
  }, [
    workableWalkPhase,
    workableInputMode,
    targetWorkableHa,
    includeRoadFirst,
    workableNonWorkingKind,
    workableRoadWidthM,
    workableNalaWidthM,
    workableNalaSide,
    workableRoadDraftPts,
    sessionRoadItems,
    outerWalkPoints,
    boundaryPillars
  ]);

  // Clean up all GPS watches & wake lock on unmount
  useEffect(() => {
    return () => {
      releaseScreenWakeLock();
      roadWatchHandleRef.current?.stop();
      roadWatchHandleRef.current = null;
      workableWatchHandleRef.current?.stop();
      workableWatchHandleRef.current = null;
      liveMonitorWatchHandleRef.current?.stop();
      liveMonitorWatchHandleRef.current = null;
    };
  }, []);

  // Auto-synchronize orientation based on compartment shape & engineering scale
  useEffect(() => {
    if (a4FitInfo?.recommendedOrientation) {
      setOrientation(a4FitInfo.recommendedOrientation);
    }
  }, [a4FitInfo?.recommendedOrientation]);

  // Modals
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);

  // Strict Frame for PDF
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [registeredFrame, setRegisteredFrame] = useState<StrictFrame | null>(null);
  const registeredFrameRef = useRef<StrictFrame | null>(null);
  const handleRegisterFrame = useCallback((frame: StrictFrame) => {
    const prev = registeredFrameRef.current;
    if (
      !prev ||
      prev.x !== frame.x ||
      prev.y !== frame.y ||
      prev.w !== frame.w ||
      prev.h !== frame.h
    ) {
      registeredFrameRef.current = frame;
      setRegisteredFrame(frame);
    }
  }, []);

  // Offline Persistence: Load saved Officer/Range Defaults first, then session administrative preferences
  useEffect(() => {
    try {
      const defaultsRaw = localStorage.getItem('forest_officer_defaults_v1');
      if (defaultsRaw) {
        const def = JSON.parse(defaultsRaw);
        if (def.division) setDivision(def.division);
        if (def.subDivision) setSubDivision(def.subDivision);
        if (def.range) setRange(def.range);
        if (def.round) setRound(def.round);
        if (def.beat) setBeat(def.beat);
        if (def.vanrakshak) setVanrakshak(def.vanrakshak);
        if (def.vanpal) setVanpal(def.vanpal);
        if (def.rfo) setRfo(def.rfo);
      }

      const saved = localStorage.getItem('forest_treatment_map_state');
      if (saved) {
        const d = JSON.parse(saved);
        // Clean out any stale tracks or polygons saved in previous sessions
        if (d.rawWorkingPoints || d.rawNonWorkingPolygons || d.workingFileName) {
          delete d.rawWorkingPoints;
          delete d.rawNonWorkingPolygons;
          delete d.nonWorkingFiles;
          delete d.workingFileName;
          delete d.nonWorkingFileName;
          delete d.geoRef;
          localStorage.setItem('forest_treatment_map_state', JSON.stringify(d));
        }

        const isBanned = (str: string) => {
          if (!str) return false;
          const s = str.toLowerCase();
          return (
            s.includes('prashik') ||
            s.includes('patil') ||
            s.includes('butibori') ||
            s.includes('buttibori') ||
            s.includes('butibore') ||
            s.includes('buttibore') ||
            s.includes('बुटीबोरी') ||
            s.includes('बुट्टीबोरी') ||
            s.includes('वानाडोंगरी') ||
            s.includes('खिर्डी') ||
            s.includes('ramtek') ||
            s.includes('mansar') ||
            s.includes('parseoni') ||
            s.includes('nagpur') ||
            s.includes('नागपूर')
          );
        };

        if (d.compartmentNo && !isBanned(d.compartmentNo)) setCompartmentNo(d.compartmentNo);
        if (d.village && !isBanned(d.village)) setVillage(d.village);
        if (d.landIdentifierType) setLandIdentifierType(d.landIdentifierType);
        if (d.landIdentifierValue && !isBanned(d.landIdentifierValue)) setLandIdentifierValue(d.landIdentifierValue);
        if (d.plantSpacingM) setPlantSpacingM(d.plantSpacingM);
        if (d.targetTotalPlants) setTargetTotalPlants(d.targetTotalPlants);
        if (d.division && !isBanned(d.division)) setDivision(d.division);
        if (d.subDivision && !isBanned(d.subDivision)) setSubDivision(d.subDivision);
        if (d.range && !isBanned(d.range)) setRange(d.range);
        if (d.round && !isBanned(d.round)) setRound(d.round);
        if (d.beat && !isBanned(d.beat)) setBeat(d.beat);
        if (d.treatmentTitle && !isBanned(d.treatmentTitle)) setTreatmentTitle(d.treatmentTitle);
        if (d.vanrakshak && !isBanned(d.vanrakshak)) setVanrakshak(d.vanrakshak);
        if (d.vanpal && !isBanned(d.vanpal)) setVanpal(d.vanpal);
        if (d.rfo && !isBanned(d.rfo)) setRfo(d.rfo);
      }
    } catch {
      // Local storage unavailable
    }
  }, []);

  const getSavedOfficerSummary = useCallback((): string => {
    try {
      const raw = localStorage.getItem('forest_officer_defaults_v1');
      if (!raw) return '';
      const d = JSON.parse(raw);
      return [d.range, d.round, d.beat, d.village].filter(Boolean).slice(0, 3).join(' · ');
    } catch {
      return '';
    }
  }, [hasSavedOfficerDefaults]);

  const handleSaveOfficerDefaults = useCallback(() => {
    try {
      const payload = {
        division,
        subDivision,
        range,
        round,
        beat,
        village,
        vanrakshak,
        vanpal,
        rfo
      };
      localStorage.setItem('forest_officer_defaults_v1', JSON.stringify(payload));
      setHasSavedOfficerDefaults(true);
      showToast(
        lang === 'mr'
          ? 'कार्यालय, बीट व अधिकारी माहिती कायमची सेव्ह केली!'
          : 'Default office, beat & officer details saved!',
        'success'
      );
    } catch {
      showToast('Could not save defaults in browser storage.', 'error');
    }
  }, [division, subDivision, range, round, beat, village, vanrakshak, vanpal, rfo, lang, showToast]);

  const handleApplyOfficerDefaults = useCallback(() => {
    try {
      const raw = localStorage.getItem('forest_officer_defaults_v1');
      if (!raw) {
        showToast(
          lang === 'mr' ? 'अद्याप कोणतीही डीफॉल्ट माहिती जतन केलेली नाही.' : 'No saved officer defaults yet.',
          'info'
        );
        return;
      }
      const d = JSON.parse(raw);
      if (d.division) setDivision(d.division);
      if (d.subDivision) setSubDivision(d.subDivision);
      if (d.range) setRange(d.range);
      if (d.round) setRound(d.round);
      if (d.beat) setBeat(d.beat);
      if (d.village) setVillage(d.village);
      if (d.vanrakshak) setVanrakshak(d.vanrakshak);
      if (d.vanpal) setVanpal(d.vanpal);
      if (d.rfo) setRfo(d.rfo);
      showToast(
        lang === 'mr'
          ? 'तुमची जतन केलेली कार्यालय व अधिकारी माहिती भरली!'
          : 'Auto-filled your saved office & officer details!',
        'success'
      );
    } catch {
      showToast('Could not load saved officer defaults.', 'error');
    }
  }, [lang, showToast]);

  const handleClearOfficerDefaults = useCallback(() => {
    try {
      localStorage.removeItem('forest_officer_defaults_v1');
      setHasSavedOfficerDefaults(false);
      showToast(
        lang === 'mr' ? 'सेव्ह केलेली रेंज माहिती काढली.' : 'Cleared saved officer defaults.',
        'info'
      );
    } catch {
      // ignore
    }
  }, [lang, showToast]);

  const applySmartPresetToPoints = useCallback(
    (pts: Point2D[], showSuccessToast = true) => {
      if (pts.length < 3) {
        if (showSuccessToast) showToast(getTranslation('toast_please_load_map', lang), 'info');
        return;
      }
      const fit = evaluateSmartA4Orientation(pts, activeScale.pxPer100m, 3.6 * 2);
      setOrientation(fit.recommendedOrientation);
      setRotationDeg(0);
      setManualBaselineOffset({ x: 0, y: 0 });
      setShowSectionLines(true);
      setSectionLineOffset(0);
      setDisplayOptions((prev) => ({
        ...prev,
        showBaseline: true,
        showSectionLines: true
      }));
      setLegendOffset({ x: 0, y: 0 });
      if (showSuccessToast) {
        const oriLabel = fit.recommendedOrientation === 'landscape' ? 'Landscape' : 'Portrait';
        showToast(
          lang === 'mr'
            ? `स्वयंचलित सेटअप पूर्ण: ${oriLabel} A4, मध्यवर्ती बेस लाईन व ५०% विभाग रेषा तयार!`
            : `Auto-Prepared: ${oriLabel} A4, centered Base Line & 50% Section Line ready!`,
          'success'
        );
      }
    },
    [activeScale.pxPer100m, lang, showToast]
  );

  useEffect(() => {
    try {
      if (compartmentNo !== '' || division !== '' || range !== '') {
        const toSave = {
          compartmentNo,
          village,
          landIdentifierType,
          landIdentifierValue,
          plantSpacingM,
          targetTotalPlants,
          division,
          subDivision,
          range,
          round,
          beat,
          treatmentTitle,
          vanrakshak,
          vanpal,
          rfo
        };
        localStorage.setItem('forest_treatment_map_state', JSON.stringify(toSave));
      }
    } catch {
      // Local storage quota or security error
    }
  }, [
    compartmentNo, village, landIdentifierType, landIdentifierValue,
    plantSpacingM, targetTotalPlants, division, subDivision, range, round, beat,
    treatmentTitle, vanrakshak, vanpal, rfo
  ]);

  // Update font on language change
  const handleLanguageChange = (newLang: string) => {
    setLang(newLang);
    const font = getFontForLang(newLang);
    setFontFamily(font);
    document.body.style.fontFamily = font;
  };

  // Intelligent Plantation Calculation:
  // Plants per Ha = 10,000 / (spacingM * spacingM)
  // Total Plants = Treatment Area (Ha) * Plants per Ha
  const computePlantsFromSpacing = useCallback((spacingM: number, areaStr: string): number => {
    const s = Math.max(0.5, spacingM || 3);
    const ha = parseFloat(areaStr) || 0;
    const perHa = 10000 / (s * s);
    return ha > 0 ? Math.round(ha * perHa) : Math.round(perHa);
  }, []);

  const handlePlantSpacingChange = useCallback((newSpacing: number) => {
    const s = Math.max(0.5, newSpacing);
    setPlantSpacingM(s);
    const ha = treatmentArea || totalArea;
    const computedTotal = computePlantsFromSpacing(s, ha);
    setTargetTotalPlants(computedTotal);
  }, [computePlantsFromSpacing, treatmentArea, totalArea]);

  // Keep plantation seedling targets automatically synchronized with geometry-derived Net Workable Area
  useEffect(() => {
    if (treatmentType === 'plantation' && areaSummary.hasParent) {
      setTargetTotalPlants(computePlantsFromSpacing(plantSpacingM, areaSummary.formatted.workableArea));
    }
  }, [treatmentType, areaSummary.hasParent, areaSummary.formatted.workableArea, plantSpacingM, computePlantsFromSpacing]);

  const handleTreatmentTypeChange = useCallback((newType: string) => {
    setTreatmentType(newType);
    if (newType === 'plantation') {
      setTargetTotalPlants(computePlantsFromSpacing(plantSpacingM, treatmentArea || totalArea));
    }
  }, [computePlantsFromSpacing, plantSpacingM, treatmentArea, totalArea]);

  // Load sample demo map
  const handleLoadDemoMap = () => {
    const demoWorking: Point2D[] = [
      { x: -50, y: 560 },
      { x: -70, y: 530 },
      { x: -140, y: 460 },
      { x: -180, y: 410 },
      { x: -180, y: 350 },
      { x: -130, y: 250 },
      { x: -120, y: 150 },
      { x: -125, y: 0 },
      { x: -160, y: -100 },
      { x: -210, y: -200 },
      { x: -260, y: -300 },
      { x: -250, y: -350 },
      { x: -230, y: -410 },
      { x: -190, y: -450 },
      { x: -130, y: -460 },
      { x: -70, y: -440 },
      { x: 0, y: -400 },
      { x: 70, y: -360 },
      { x: 130, y: -310 },
      { x: 165, y: -290 },
      { x: 160, y: -240 },
      { x: 220, y: -150 },
      { x: 260, y: -50 },
      { x: 290, y: 0 },
      { x: 260, y: 60 },
      { x: 200, y: 140 },
      { x: 140, y: 230 },
      { x: 60, y: 330 },
      { x: 20, y: 420 },
      { x: -10, y: 520 }
    ];

    const demoNonWorking: Point2D[][] = [
      [
        { x: 70, y: 40 },
        { x: 120, y: 50 },
        { x: 110, y: -20 },
        { x: 60, y: -10 }
      ]
    ];

    const totalPolyHa = Number(calcAreaHa(demoWorking).toFixed(2));
    const nonWorkHa = Number(calcAreaHa(demoNonWorking[0]).toFixed(2));

    setRawWorkingPoints(demoWorking);
    setRawNonWorkingPolygons(demoNonWorking);
    setNonWorkingFiles([
      {
        id: 'demo_patch_1',
        fileName: 'Sample_Rocky_Patch.kml',
        pts: demoNonWorking[0],
        areaHa: nonWorkHa
      }
    ]);
    setWorkingFileName(`Sample_Compartment.kml (${totalPolyHa.toFixed(2)} Ha)`);
    setNonWorkingFileName(`Sample_Rocky_Patch.kml (${nonWorkHa.toFixed(2)} Ha)`);
    setIsNonWorkingNil(false);

    setGeoRef({
      hasGeo: true,
      centerLat: 21.5312,
      centerLon: 79.2318,
      northLat: 21.5365,
      southLat: 21.5268,
      eastLon: 79.2355,
      westLon: 79.2272
    });

    setManualBaselineOffset({ x: 0, y: 0 });
    setSectionLineOffset(0);
    setLegendOffset({ x: 0, y: 0 });
    setAxisLength(840);
    setBearingDeg(88);
    applySmartPresetToPoints(demoWorking, false);

    showToast(getTranslation('load_demo_toast', lang), 'success');
  };

  // Clear map
  const handleClearMap = () => {
    try {
      localStorage.removeItem('forest_treatment_map_state');
    } catch {
      // ignore
    }
    setRawWorkingPoints([]);
    setRawNonWorkingPolygons([]);
    setNonWorkingFiles([]);
    setWorkingFileName('');
    setNonWorkingFileName('');
    setIsNonWorkingNil(false);
    setBoundaryPillars([]);
    boundaryPillarsRef.current = [];
    setUserLocation(null);
    setNavTarget(null);
    setManualBaselineOffset({ x: 0, y: 0 });
    setSectionLineOffset(0);
    setLegendOffset({ x: 0, y: 0 });
    setIsViewOnlyMode(false);
    setGeoRef({
      hasGeo: false,
      centerLat: 0,
      centerLon: 0,
      northLat: 0,
      southLat: 0,
      eastLon: 0,
      westLon: 0
    });
    showToast(getTranslation('clear_map_toast', lang), 'info');
  };

  // Commit staged KML/KMZ import after user chooses 'Just View (Locked)' or 'Edit Map'
  const commitPendingImport = (mode: 'view' | 'edit') => {
    if (!pendingImport) return;
    const lockView = mode === 'view';

    if (pendingImport.kind === 'saved_project') {
      const proj = pendingImport.project;
      handleLoadSavedCoupe(proj, true);
      setIsViewOnlyMode(lockView);
      if (lockView) {
        setActiveInteractionMode('pan');
        setPlaceLocationMode(false);
        setActivePlaceFeatureId(null);
        setIsMobileMapExpanded(true);
        setIsMobileWorkExpanded(false);
      }
      showToast(
        lockView
          ? lang === 'mr'
            ? `फक्त पहा मोडमध्ये उघडले (${proj.name}) — ड्रॅग लॉक आहे!`
            : `Opened in View-Only Locked Mode (${proj.name}) — No accidental dragging!`
          : lang === 'mr'
          ? `संपादन मोडमध्ये उघडले: ${proj.name}`
          : `Opened in Edit Mode: ${proj.name}`,
        'success'
      );
    } else {
      setRawWorkingPoints(pendingImport.pts);
      setWorkingFileName(`${pendingImport.fileName} (${pendingImport.totalPolyHa.toFixed(2)} Ha)`);
      setGeoRef(pendingImport.geoRef);
      geoRefLatestRef.current = pendingImport.geoRef;
      rawWorkingPointsLatestRef.current = pendingImport.pts;
      setBearingDeg(pendingImport.bearingDeg);
      setAxisLength(pendingImport.axisLength);
      applySmartPresetToPoints(pendingImport.pts, false);
      setIsViewOnlyMode(lockView);
      if (lockView) {
        setActiveInteractionMode('pan');
        setPlaceLocationMode(false);
        setActivePlaceFeatureId(null);
        setIsMobileMapExpanded(true);
        setIsMobileWorkExpanded(false);
      }
      showToast(
        lockView
          ? lang === 'mr'
            ? `KML नकाशा फक्त पहा मोडमध्ये उघडला (${pendingImport.workHa} हे.) — ड्रॅग लॉक!`
            : `Opened KML in View-Only Locked Mode (${pendingImport.workHa} Ha)`
          : getTranslation('working_loaded_toast', lang).replace('{ha}', pendingImport.workHa),
        'success'
      );
    }

    setPendingImport(null);
  };

  // Working File Upload: parses KML/KMZ first and asks user 'Just View' vs 'Edit Map' before opening
  const handleUploadWorking = async (file: File) => {
    try {
      if (file.name.toLowerCase().endsWith('.kmz')) {
        const embeddedProject = await extractEmbeddedProjectFromKmz(file);
        if (embeddedProject) {
          const updated = await upsertSavedCoupeInDb(embeddedProject);
          setSavedCoupes(updated);
          const grossHa = calcAreaHa(embeddedProject.rawWorkingPoints || []);
          const nwCount = embeddedProject.nonWorkingFiles?.length || 0;
          const pillarCount = embeddedProject.boundaryPillars?.length || 0;
          setPendingImport({
            kind: 'saved_project',
            project: embeddedProject,
            sourceMode: 'full_project',
            preview: {
              fileName: embeddedProject.name || file.name,
              areaSummaryText: grossHa > 0 ? `${grossHa.toFixed(2)} Ha` : undefined,
              detailsText:
                lang === 'mr'
                  ? `पूर्ण अ‍ॅप KMZ${nwCount ? ` · ${nwCount} अनुपचार` : ''}${pillarCount ? ` · ${pillarCount} खांब` : ''}`
                  : `Full App KMZ${nwCount ? ` · ${nwCount} NW layers` : ''}${pillarCount ? ` · ${pillarCount} pillars` : ''}`,
              isAppKmz: true
            }
          });
          return;
        }
      }
      const coords = await parseSpatialFile(file);
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;

      coords.forEach((c) => {
        if (c.lat < minLat) minLat = c.lat;
        if (c.lat > maxLat) maxLat = c.lat;
        if (c.lon < minLon) minLon = c.lon;
        if (c.lon > maxLon) maxLon = c.lon;
      });

      const cLat = (minLat + maxLat) / 2;
      const cLon = (minLon + maxLon) / 2;
      const { latM, lonM } = getMetersPerDegree(cLat);

      const pts: Point2D[] = coords.map((c) => ({
        x: (c.lon - cLon) * lonM,
        y: (c.lat - cLat) * latM
      }));

      const summary = computeParentChildAreaSummary(pts, nonWorkingFiles, isNonWorkingNil);
      const totalPolyHa = Number(summary.grossAreaHa.toFixed(2));
      const workHa = summary.formatted.workableArea;

      // Fast bounded longest-axis scan (prevents O(n^2) freeze on dense previously-built KML files)
      let maxD = 0;
      let bestDeg = 90;
      const stride = Math.max(1, Math.floor(pts.length / 180));
      for (let i = 0; i < pts.length; i += stride) {
        for (let j = i + stride; j < pts.length; j += stride) {
          const dx = pts[j].x - pts[i].x;
          const dy = pts[j].y - pts[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxD) {
            maxD = dist;
            let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (deg < 0) deg += 360;
            bestDeg = Math.round(deg);
          }
        }
      }

      setPendingImport({
        kind: 'raw_kml',
        fileName: file.name,
        pts,
        geoRef: {
          hasGeo: true,
          centerLat: cLat,
          centerLon: cLon,
          northLat: maxLat,
          southLat: minLat,
          eastLon: maxLon,
          westLon: minLon
        },
        totalPolyHa,
        workHa,
        axisLength: Math.round(maxD),
        bearingDeg: bestDeg,
        preview: {
          fileName: file.name,
          areaSummaryText: `${totalPolyHa.toFixed(2)} Ha`,
          detailsText:
            lang === 'mr' ? `${pts.length} सीमा बिंदू` : `${pts.length} boundary vertices`
        }
      });
    } catch (err: any) {
      showToast(getTranslation('toast_file_parse_error', lang) + err.message, 'error');
    }
  };

  // Multiple Non-Working Files Upload
  const handleAddNonWorkingFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    const newItems: NonWorkingAreaItem[] = [];

    for (const file of fileList) {
      try {
        const coords = await parseSpatialFile(file);
        const cLat = geoRef.hasGeo ? geoRef.centerLat : 21.0;
        const cLon = geoRef.hasGeo ? geoRef.centerLon : 79.0;
        const { latM, lonM } = getMetersPerDegree(cLat);

        const pts: Point2D[] = coords.map((c) => ({
          x: (c.lon - cLon) * lonM,
          y: (c.lat - cLat) * latM
        }));

        const ha = calcAreaHa(pts);
        newItems.push({
          id: `nw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          fileName: file.name,
          pts,
          areaHa: Number(ha.toFixed(2))
        });
      } catch (err: any) {
        showToast(`Error reading ${file.name}: ${err.message}`, 'error');
      }
    }

    if (newItems.length > 0) {
      const clipRes =
        rawWorkingPoints.length >= 3
          ? clipNonWorkingItemsToBoundary(rawWorkingPoints, newItems, lang)
          : { clippedItems: newItems, droppedCount: 0, trimmedCount: 0 };

      if (clipRes.clippedItems.length === 0) {
        showToast(
          lang === 'mr'
            ? 'अनुपचार पॉलीगॉन मुख्य सीमेच्या बाहेर आहे — नकाशात जोडला नाही.'
            : 'Non-workable polygon lies outside the boundary — not added.',
          'info'
        );
        return;
      }

      setNonWorkingFiles((prev) => {
        const updated = [...prev, ...clipRes.clippedItems];
        const allPolys = updated.map((it) => it.pts);
        const derived = computeParentChildAreaSummary(rawWorkingPoints, updated, false);
        const displayHa =
          rawWorkingPoints.length >= 3
            ? derived.clippedNonWorkingUnionHa
            : updated.reduce((s, it) => s + it.areaHa, 0);
        setRawNonWorkingPolygons(allPolys);
        setNonWorkingFileName(`${updated.length} files (${displayHa.toFixed(2)} Ha)`);
        setIsNonWorkingNil(false);
        return updated;
      });
      showToast(
        clipRes.trimmedCount > 0 || clipRes.droppedCount > 0
          ? lang === 'mr'
            ? `${clipRes.clippedItems.length} अनुपचार फाईल जोडल्या (सीमेबाहेरील भाग वगळला).`
            : `Added ${clipRes.clippedItems.length} non-working item(s) — outside portion excluded.`
          : `Added ${clipRes.clippedItems.length} non-working file(s).`,
        'success'
      );
    }
  };

  const handleRemoveNonWorkingFile = (id: string) => {
    setNonWorkingFiles((prev) => {
      const updated = prev.filter((it) => it.id !== id);
      const allPolys = updated.map((it) => it.pts);
      const derived = computeParentChildAreaSummary(rawWorkingPoints, updated, isNonWorkingNil);
      const displayHa =
        rawWorkingPoints.length >= 3
          ? derived.clippedNonWorkingUnionHa
          : updated.reduce((s, it) => s + it.areaHa, 0);
      setRawNonWorkingPolygons(allPolys);
      setNonWorkingFileName(
        updated.length > 0 ? `${updated.length} items (${displayHa.toFixed(2)} Ha)` : ''
      );
      return updated;
    });
    setSessionRoadItems((prev) => prev.filter((it) => it.id !== id));
    showToast('Non-working file removed.', 'info');
  };

  // Toggle Left / Right one-sided buffer for any recorded Nala track and rebuild its polygon from the walked bank
  const handleUpdateNonWorkingNalaSide = (id: string, newSide: NalaSide) => {
    const targetItem = nonWorkingFiles.find((it) => it.id === id && it.category === 'nala');
    const bankLine = targetItem?.sourceCenterlinePts || targetItem?.centerlinePts;
    if (!targetItem || !bankLine || bankLine.length < 2) return;
    if (targetItem.nalaSide === newSide) return;

    const buildRebuffered = (item: NonWorkingAreaItem): NonWorkingAreaItem[] | null => {
      if (item.id !== id || item.category !== 'nala') return [item];
      const line = item.sourceCenterlinePts || item.centerlinePts;
      if (!line || line.length < 2) return [item];
      const widthM = Math.max(0.5, item.roadWidthM ?? 6);
      const bufferedPoly = oneSidedBufferPolylineToPolygon(line, widthM, newSide);
      if (bufferedPoly.length < 3) return [item];
      const lengthM = Math.round(calculatePolylineLengthM(line));
      const rawHa = calcAreaHa(bufferedPoly) || (lengthM * widthM) / 10000;
      const areaHa = Number(Math.max(0.01, rawHa).toFixed(2));
      const sideEn = newSide === 'left' ? 'Left' : 'Right';
      const sideMr = newSide === 'left' ? 'डावी' : 'उजवी';
      const updatedFileName = item.fileName
        .replace(/\b(Left|Right)\b/g, sideEn)
        .replace(/(डावी|उजवी)/g, sideMr);
      const candidate: NonWorkingAreaItem = {
        ...item,
        pts: bufferedPoly,
        areaHa,
        roadLengthM: lengthM,
        nalaSide: newSide,
        centerlinePts: line,
        sourceCenterlinePts: line,
        fileName: updatedFileName
      };
      if (rawWorkingPoints.length >= 3) {
        const clipped = clipNonWorkingItemsToBoundary(rawWorkingPoints, [candidate], lang);
        if (clipped.clippedItems.length === 0) return null;
        return clipped.clippedItems;
      }
      return [candidate];
    };

    const previewRebufferedList = buildRebuffered(targetItem);
    if (!previewRebufferedList || previewRebufferedList.length === 0) {
      showToast(
        lang === 'mr'
          ? `नाला ${newSide === 'left' ? 'डाव्या' : 'उजव्या'} बाजूला हलवल्यास संपूर्णपणे मुख्य सीमेबाहेर जातो.`
          : `Shifting this Nala to the ${newSide === 'left' ? 'Left' : 'Right'} side places it completely outside the boundary polygon.`,
        'info'
      );
      return;
    }

    const applyListUpdate = (list: NonWorkingAreaItem[]) =>
      list.flatMap((item) => (item.id === id ? previewRebufferedList : [item]));

    setNonWorkingFiles((prev) => {
      const updated = applyListUpdate(prev);
      const allPolys = updated.map((it) => it.pts);
      const derived = computeParentChildAreaSummary(rawWorkingPoints, updated, isNonWorkingNil);
      const displayHa =
        rawWorkingPoints.length >= 3
          ? derived.clippedNonWorkingUnionHa
          : updated.reduce((s, it) => s + it.areaHa, 0);
      setRawNonWorkingPolygons(allPolys);
      setNonWorkingFileName(
        updated.length > 0 ? `${updated.length} items (${displayHa.toFixed(2)} Ha)` : ''
      );
      return updated;
    });

    const nextSessionItems = applyListUpdate(sessionRoadItemsRef.current);
    sessionRoadItemsRef.current = nextSessionItems;
    setSessionRoadItems(nextSessionItems);

    showToast(
      lang === 'mr'
        ? `नाला पॉलीगॉन ${newSide === 'left' ? 'डाव्या (Left)' : 'उजव्या (Right)'} बाजूला हलवला.`
        : `Nala buffer shifted to ${newSide === 'left' ? 'Left' : 'Right'} side.`,
      'success'
    );
  };

  // Stop any active GPS watch for standalone road tracking
  const stopRoadGpsWatch = useCallback(() => {
    if (roadWatchHandleRef.current !== null) {
      roadWatchHandleRef.current.stop();
      roadWatchHandleRef.current = null;
    }
    if (!workableWatchHandleRef.current && !liveMonitorWatchHandleRef.current) {
      setGnssStatus(null);
      releaseScreenWakeLock();
    }
  }, []);

  // Stop any active GPS watch for workable field mapping
  const stopWorkableGpsWatch = useCallback(() => {
    if (workableWatchHandleRef.current !== null) {
      workableWatchHandleRef.current.stop();
      workableWatchHandleRef.current = null;
    }
    if (!roadWatchHandleRef.current && !liveMonitorWatchHandleRef.current) {
      setGnssStatus(null);
      releaseScreenWakeLock();
    }
  }, []);

  // Stop standalone continuous GPS quality monitor watch
  const stopLiveMonitorWatch = useCallback(() => {
    if (liveMonitorWatchHandleRef.current !== null) {
      liveMonitorWatchHandleRef.current.stop();
      liveMonitorWatchHandleRef.current = null;
    }
    gpsMonitorOriginRef.current = null;
    setIsWatchingGPS(false);
    if (!roadWatchHandleRef.current && !workableWatchHandleRef.current) {
      setGnssStatus(null);
      releaseScreenWakeLock();
    }
  }, []);

  // Manual 1-tap retry for whichever GNSS watcher is currently running
  const handleRetryGpsLock = useCallback(() => {
    liveMonitorWatchHandleRef.current?.forceRetry();
    workableWatchHandleRef.current?.forceRetry();
    roadWatchHandleRef.current?.forceRetry();
    showToast(
      lang === 'mr'
        ? 'उपग्रह सिग्नल पुन्हा शोधत आहे — फोन खुल्या आकाशाकडे धरा...'
        : 'Retrying hardware satellite lock — hold phone facing open sky...',
      'info'
    );
  }, [lang, showToast]);

  // Reset live breadcrumb trail & heading cache when starting/ending a GPS track
  const resetLiveMovementTrail = useCallback(() => {
    liveMovementTrailRef.current = [];
    setLiveMovementTrail([]);
    lastHeadingPtRef.current = null;
    lastHeadingDegRef.current = null;
  }, []);

  // Update live GPS position, smooth heading direction, speed & movement breadcrumb trail
  const updateLiveMovementLocation = useCallback(
    (
      pt: Point2D,
      lat: number,
      lon: number,
      accuracy: number,
      rawHeading: number | null | undefined,
      speedMps: number
    ) => {
      let headingDeg: number | null = lastHeadingDegRef.current;

      if (typeof rawHeading === 'number' && Number.isFinite(rawHeading) && rawHeading >= 0 && speedMps >= 0.45) {
        headingDeg = Math.round(rawHeading) % 360;
      } else if (lastHeadingPtRef.current) {
        const moveDist = Math.hypot(pt.x - lastHeadingPtRef.current.x, pt.y - lastHeadingPtRef.current.y);
        if (moveDist >= 0.8) {
          headingDeg = Math.round(calculateGeographicBearing(lastHeadingPtRef.current, pt)) % 360;
          lastHeadingPtRef.current = { x: pt.x, y: pt.y };
        }
      } else {
        lastHeadingPtRef.current = { x: pt.x, y: pt.y };
      }

      if (headingDeg != null) {
        lastHeadingDegRef.current = headingDeg;
      }

      const trail = liveMovementTrailRef.current;
      const lastTrailPt = trail[trail.length - 1];
      if (!lastTrailPt || Math.hypot(pt.x - lastTrailPt.x, pt.y - lastTrailPt.y) >= 1.2) {
        const nextTrail = [...trail.slice(-119), { x: pt.x, y: pt.y }];
        liveMovementTrailRef.current = nextTrail;
        setLiveMovementTrail(nextTrail);
      }

      setUserLocation({
        mx: pt.x,
        my: pt.y,
        lat,
        lon,
        accuracy,
        headingDeg,
        speedMps
      });
    },
    []
  );

  const handleUpdateGpsAccuracyGate = useCallback((gateM: number) => {
    const safeGate = Math.max(5, Math.min(35, gateM));
    setGpsAccuracyGateM(safeGate);
    gpsFilterRef.current.setMaxAccuracyGate(safeGate);
    setLiveGpsTelemetry((prev) => ({ ...prev, maxAccuracyGateM: safeGate }));
  }, []);

  // Start Walking Field Road / Nala / Non-Workable Track via High-Accuracy Kalman-Filtered GPS
  // Works BOTH before outer boundary (on-field from scratch) AND on top of an existing coupe KML!
  const handleStartWalkRoad = (widthM: number) => {
    const safeWidth = Math.max(0.5, Number(widthM) || 4);
    setRoadWidthM(safeWidth);

    if (!('geolocation' in navigator)) {
      showToast(getTranslation('gps_not_supported', lang), 'error');
      return;
    }

    stopRoadGpsWatch();
    stopWorkableGpsWatch();
    stopLiveMonitorWatch();
    resetLiveMovementTrail();
    gpsFilterRef.current.reset();
    gpsFilterRef.current.setMaxAccuracyGate(gpsAccuracyGateM);
    setRoadTrackPoints([]);
    roadTrackPointsRef.current = [];
    setRoadGpsAccuracy(null);
    setRoadRecordMode('gps');
    setIsRecordingRoad(true);
    setIsNonWorkingNil(false);

    showToast(
      roadTrackKind === 'nala'
        ? lang === 'mr'
          ? `नाला चालणे सुरू (${safeWidth}m · ${roadNalaSide === 'left' ? 'डावी' : 'उजवी'} बाजू) — एका काठाने चाला.`
          : `Nala walk started (${safeWidth}m · ${roadNalaSide === 'left' ? 'Left' : 'Right'} side) — walk along one bank.`
        : roadTrackKind === 'patch'
        ? lang === 'mr'
          ? 'अनुपचार क्षेत्र चालणे सुरू — क्षेत्राच्या कडेने चाला.'
          : 'Non-Workable walk started — walk around the area perimeter.'
        : lang === 'mr'
        ? `रस्ता चालणे सुरू (${safeWidth}m रुंदी) — रस्त्याने चाला.`
        : `Road walk started (${safeWidth}m width) — walk along the road.`,
      'info'
    );

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const effectiveGate = isOffline && gpsAccuracyGateM <= 12 ? 25 : gpsAccuracyGateM;
    if (effectiveGate !== gpsAccuracyGateM) {
      setGpsAccuracyGateM(effectiveGate);
    }
    gpsFilterRef.current.setMaxAccuracyGate(effectiveGate);
    acquireScreenWakeLock();

    roadWatchHandleRef.current = startResilientGnssWatch({
      allowCachedBootstrap: true,
      onStatus: (st) => setGnssStatus(st),
      onPermissionDenied: () => {
        stopRoadGpsWatch();
        showToast(getTranslation('gps_permission', lang), 'error');
      },
      onFix: (fix) => {
        if (roadWatchHandleRef.current === null) return;
        const lat = fix.lat;
        const lon = fix.lon;
        const rawAcc = fix.accuracy;

        // Lock shared WGS84 field origin on first fix if no coupe boundary is loaded yet
        let cLat: number;
        let cLon: number;
        if (rawWorkingPointsLatestRef.current.length >= 3 && geoRefLatestRef.current.hasGeo) {
          cLat = geoRefLatestRef.current.centerLat;
          cLon = geoRefLatestRef.current.centerLon;
        } else {
          if (!fieldOriginRef.current) {
            fieldOriginRef.current = { lat, lon };
            setGeoRef((prev) =>
              prev.hasGeo
                ? prev
                : {
                    hasGeo: true,
                    centerLat: lat,
                    centerLon: lon,
                    northLat: lat + 0.005,
                    southLat: lat - 0.005,
                    eastLon: lon + 0.005,
                    westLon: lon - 0.005
                  }
            );
          }
          cLat = fieldOriginRef.current.lat;
          cLon = fieldOriginRef.current.lon;
        }

        const rawPt = latLonToLocalMetersWGS84(lat, lon, cLat, cLon);

        const res = gpsFilterRef.current.processFix(
          rawPt,
          lat,
          lon,
          rawAcc,
          cLat,
          cLon,
          fix.timestamp,
          fix.altitude
        );
        setLiveGpsTelemetry(res.telemetry);
        setRoadGpsAccuracy(res.telemetry.filteredAccuracyM ?? Math.round(rawAcc));
        updateLiveMovementLocation(
          res.filteredPoint,
          res.filteredLatLon.lat,
          res.filteredLatLon.lon,
          res.telemetry.filteredAccuracyM ?? Math.round(rawAcc),
          fix.heading,
          res.telemetry.speedMps
        );

        // Skip recording a permanent vertex from an initial low-accuracy OS bootstrap cache
        if (fix.isCachedBootstrap) return;
        if (!res.accepted) return;

        const existing = roadTrackPointsRef.current;
        if (
          gpsFilterRef.current.shouldEmitVertex(
            existing,
            res.filteredPoint,
            res.telemetry.filteredAccuracyM ?? rawAcc,
            2.5
          )
        ) {
          const updated = [...existing, res.filteredPoint];
          roadTrackPointsRef.current = updated;
          setRoadTrackPoints(updated);
          triggerVertexCapturedFeedback();
        }
      }
    });
  };

  // Start Map-Tap Non-Workable Tracing Mode (works both before and after outer boundary)
  const handleStartMapRoad = (widthM: number) => {
    const safeWidth = Math.max(0.5, Number(widthM) || 4);
    setRoadWidthM(safeWidth);

    stopRoadGpsWatch();
    if (rawWorkingPoints.length < 3 && !fieldOriginRef.current) {
      fieldOriginRef.current = {
        lat: geoRef.hasGeo ? geoRef.centerLat : 21.5312,
        lon: geoRef.hasGeo ? geoRef.centerLon : 79.2318
      };
    }
    setRoadTrackPoints([]);
    roadTrackPointsRef.current = [];
    setRoadGpsAccuracy(null);
    setRoadRecordMode('map');
    setIsRecordingRoad(true);
    setIsNonWorkingNil(false);
    setPlaceLocationMode(false);
    setActivePlaceFeatureId(null);
    showToast(
      roadTrackKind === 'nala'
        ? lang === 'mr'
          ? `नकाशावर नाला काठाचे बिंदू टॅप करा (${safeWidth}m).`
          : `Tap along one bank of the Nala on the map (${safeWidth}m).`
        : roadTrackKind === 'patch'
        ? lang === 'mr'
          ? 'नकाशावर अनुपचार क्षेत्राचे कोपरे टॅप करा.'
          : 'Tap corners of the Non-Workable patch on the map.'
        : lang === 'mr'
        ? `नकाशावर रस्त्याचे बिंदू टॅप करा (${safeWidth}m रुंदी).`
        : `Tap along the road path on the map (${safeWidth}m width).`,
      'info'
    );
  };

  const handleMapTapRoadPoint = useCallback((pt: Point2D) => {
    setRoadTrackPoints((prev) => {
      const updated = [...prev, { x: pt.x, y: pt.y }];
      roadTrackPointsRef.current = updated;
      return updated;
    });
  }, []);

  const handleCaptureGpsRoadPoint = async () => {
    if (!('geolocation' in navigator)) {
      showToast(getTranslation('gps_not_supported', lang), 'error');
      return;
    }
    try {
      const fix = await getOfflineSafeCurrentFix(10000);
      const lat = fix.lat;
      const lon = fix.lon;
      if (rawWorkingPointsLatestRef.current.length < 3 && !fieldOriginRef.current) {
        fieldOriginRef.current = { lat, lon };
      }
      const cLat =
        rawWorkingPointsLatestRef.current.length >= 3 && geoRefLatestRef.current.hasGeo
          ? geoRefLatestRef.current.centerLat
          : fieldOriginRef.current?.lat ?? lat;
      const cLon =
        rawWorkingPointsLatestRef.current.length >= 3 && geoRefLatestRef.current.hasGeo
          ? geoRefLatestRef.current.centerLon
          : fieldOriginRef.current?.lon ?? lon;
      const ptM = latLonToLocalMetersWGS84(lat, lon, cLat, cLon);
      const acc = Math.round(fix.accuracy);
      setRoadGpsAccuracy(acc);
      updateLiveMovementLocation(ptM, lat, lon, acc, fix.heading, fix.speed || 0);
      setRoadTrackPoints((prev) => {
        const updated = [...prev, ptM];
        roadTrackPointsRef.current = updated;
        return updated;
      });
      showToast(
        lang === 'mr' ? `GPS बिंदू नोंदवला (±${acc}m)` : `GPS point recorded (±${acc}m)`,
        'success'
      );
    } catch (err: any) {
      showToast(
        err?.code === 1 ? getTranslation('gps_permission', lang) : getTranslation('gps_no_signal', lang),
        'error'
      );
    }
  };

  const handleUndoRoadPoint = () => {
    setRoadTrackPoints((prev) => {
      const next = prev.slice(0, -1);
      roadTrackPointsRef.current = next;
      return next;
    });
  };

  const handleCancelRoadTrack = () => {
    stopRoadGpsWatch();
    resetLiveMovementTrail();
    setUserLocation(null);
    setIsRecordingRoad(false);
    setRoadRecordMode(null);
    setRoadTrackPoints([]);
    roadTrackPointsRef.current = [];
    setRoadGpsAccuracy(null);
    showToast(
      roadTrackKind === 'nala'
        ? lang === 'mr'
          ? 'नाला चालणे रद्द केले.'
          : 'Nala walk cancelled.'
        : roadTrackKind === 'patch'
        ? lang === 'mr'
          ? 'अनुपचार चालणे रद्द केले.'
          : 'Non-Workable walk cancelled.'
        : lang === 'mr'
        ? 'रस्ता चालणे रद्द केले.'
        : 'Road walk cancelled.',
      'info'
    );
  };

  const handleFinishRoadTrack = (customRoadName?: string) => {
    stopRoadGpsWatch();
    const kind = roadTrackKind;

    // Include latest live GPS position as final stopping point if user moved >= 0.8m since last auto-vertex
    const basePts = [...roadTrackPointsRef.current];
    if (roadRecordMode === 'gps' && userLocation && basePts.length >= 1) {
      const last = basePts[basePts.length - 1];
      if (Math.hypot(userLocation.mx - last.x, userLocation.my - last.y) >= 0.8) {
        basePts.push({ x: userLocation.mx, y: userLocation.my });
      }
    }

    const resetWalkUi = () => {
      resetLiveMovementTrail();
      setUserLocation(null);
      setIsRecordingRoad(false);
      setRoadRecordMode(null);
      setRoadTrackPoints([]);
      roadTrackPointsRef.current = [];
      setRoadGpsAccuracy(null);
    };

    if (kind === 'patch') {
      if (basePts.length < 3) {
        resetWalkUi();
        showToast(
          lang === 'mr'
            ? 'चालणे थांबवले — अनुपचार क्षेत्र जतन करण्यासाठी किमान ३ कोपरे आवश्यक आहेत.'
            : 'Walk stopped — walk at least 3 corners to save a Non-Workable area.',
          'info'
        );
        return;
      }
      const rawHa = calcAreaHa(basePts);
      if (rawHa < 0.0005) {
        resetWalkUi();
        showToast(
          lang === 'mr' ? 'चालणे थांबवले — अनुपचार क्षेत्र खूप लहान आहे.' : 'Walk stopped — area too small to save.',
          'info'
        );
        return;
      }
      const areaHa = Number(Math.max(0.01, rawHa).toFixed(2));
      const trimmedName = customRoadName?.trim();
      const label =
        trimmedName ||
        (lang === 'mr'
          ? `अनुपचार क्षेत्र (${areaHa.toFixed(2)} Ha)`
          : `Non-Workable Patch (${areaHa.toFixed(2)} Ha)`);

      const patchItem: NonWorkingAreaItem = {
        id: `patch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fileName: label,
        pts: basePts,
        areaHa,
        category: 'patch'
      };

      const patchClip =
        rawWorkingPoints.length >= 3
          ? clipNonWorkingItemsToBoundary(rawWorkingPoints, [patchItem], lang)
          : { clippedItems: [patchItem], droppedCount: 0, trimmedCount: 0 };

      if (patchClip.clippedItems.length === 0) {
        resetWalkUi();
        showToast(
          lang === 'mr'
            ? 'अनुपचार क्षेत्र मुख्य सीमेच्या बाहेर आहे — नकाशात घेतले नाही.'
            : 'Non-Workable area lies outside the boundary polygon — not added.',
          'info'
        );
        return;
      }

      const savedPatchHa = patchClip.clippedItems.reduce((s, it) => s + it.areaHa, 0);
      setNonWorkingFiles((prev) => {
        const updated = [...prev, ...patchClip.clippedItems];
        const allPolys = updated.map((it) => it.pts);
        const derived = computeParentChildAreaSummary(rawWorkingPoints, updated, false);
        const displayHa =
          rawWorkingPoints.length >= 3
            ? derived.clippedNonWorkingUnionHa
            : updated.reduce((s, it) => s + it.areaHa, 0);
        setRawNonWorkingPolygons(allPolys);
        setNonWorkingFileName(`${updated.length} items (${displayHa.toFixed(2)} Ha)`);
        setIsNonWorkingNil(false);
        return updated;
      });

      resetWalkUi();

      showToast(
        patchClip.trimmedCount > 0
          ? lang === 'mr'
            ? `अनुपचार क्षेत्र जतन झाले (${savedPatchHa.toFixed(2)} Ha) — सीमेबाहेरील भाग वगळला.`
            : `Non-Workable area saved (${savedPatchHa.toFixed(2)} Ha) — outside portion excluded.`
          : lang === 'mr'
          ? `अनुपचार क्षेत्र जतन झाले (${savedPatchHa.toFixed(2)} Ha).`
          : `Non-Workable area saved (${savedPatchHa.toFixed(2)} Ha).`,
        'success'
      );
      return;
    }

    if (basePts.length < 2) {
      resetWalkUi();
      showToast(
        lang === 'mr'
          ? `चालणे थांबवले — ${kind === 'nala' ? 'नाला' : 'रस्ता'} जतन करण्यासाठी थोडे अंतर चालणे आवश्यक आहे.`
          : `Walk stopped — walk at least a few meters to save a ${kind === 'nala' ? 'Nala' : 'Road'}.`,
        'info'
      );
      return;
    }

    const lengthM = calculatePolylineLengthM(basePts);
    if (lengthM < 1) {
      resetWalkUi();
      showToast(
        lang === 'mr'
          ? 'चालणे थांबवले — अंतर खूप कमी आहे.'
          : 'Walk stopped — distance too short to save.',
        'info'
      );
      return;
    }

    const bufferedPoly =
      kind === 'nala'
        ? oneSidedBufferPolylineToPolygon(basePts, roadWidthM, roadNalaSide)
        : bufferPolylineToPolygon(basePts, roadWidthM);
    if (bufferedPoly.length < 3) {
      resetWalkUi();
      showToast('Could not generate corridor polygon.', 'error');
      return;
    }

    const rawHa = calcAreaHa(bufferedPoly) || (lengthM * roadWidthM) / 10000;
    const areaHa = Number(Math.max(0.01, rawHa).toFixed(2));
    const trimmedName = customRoadName?.trim();
    const sideLabelMr = roadNalaSide === 'left' ? 'डावी' : 'उजवी';
    const sideLabelEn = roadNalaSide === 'left' ? 'Left' : 'Right';
    const label =
      kind === 'nala'
        ? trimmedName
          ? `${trimmedName} (${roadWidthM}m · ${sideLabelEn})`
          : lang === 'mr'
          ? `नाला — ${sideLabelMr} (${roadWidthM}मी × ${Math.round(lengthM)}मी)`
          : `Nala — ${sideLabelEn} (${roadWidthM}m × ${Math.round(lengthM)}m)`
        : trimmedName
        ? `${trimmedName} (${roadWidthM}m × ${Math.round(lengthM)}m)`
        : lang === 'mr'
        ? `रस्ता (${roadWidthM}मी × ${Math.round(lengthM)}मी)`
        : `Road (${roadWidthM}m × ${Math.round(lengthM)}m)`;

    const featureItem: NonWorkingAreaItem = {
      id: `${kind}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fileName: label,
      pts: bufferedPoly,
      areaHa,
      category: kind,
      roadWidthM,
      roadLengthM: Math.round(lengthM),
      nalaSide: kind === 'nala' ? roadNalaSide : undefined,
      centerlinePts: basePts,
      sourceCenterlinePts: basePts
    };

    const featureClip =
      rawWorkingPoints.length >= 3
        ? clipNonWorkingItemsToBoundary(rawWorkingPoints, [featureItem], lang)
        : { clippedItems: [featureItem], droppedCount: 0, trimmedCount: 0 };

    if (featureClip.clippedItems.length === 0) {
      resetWalkUi();
      showToast(
        kind === 'nala'
          ? lang === 'mr'
            ? 'नाला मुख्य सीमेच्या बाहेर आहे — नकाशात घेतला नाही.'
            : 'Nala lies outside the boundary polygon — not added.'
          : lang === 'mr'
          ? 'रस्ता मुख्य सीमेच्या बाहेर आहे — नकाशात घेतला नाही.'
          : 'Road lies outside the boundary polygon — not added.',
        'info'
      );
      return;
    }

    const savedFeatureHa = featureClip.clippedItems.reduce((s, it) => s + it.areaHa, 0);
    setNonWorkingFiles((prev) => {
      const updated = [...prev, ...featureClip.clippedItems];
      const allPolys = updated.map((it) => it.pts);
      const derived = computeParentChildAreaSummary(rawWorkingPoints, updated, false);
      const displayHa =
        rawWorkingPoints.length >= 3
          ? derived.clippedNonWorkingUnionHa
          : updated.reduce((s, it) => s + it.areaHa, 0);
      setRawNonWorkingPolygons(allPolys);
      setNonWorkingFileName(`${updated.length} items (${displayHa.toFixed(2)} Ha)`);
      setIsNonWorkingNil(false);
      return updated;
    });

    resetWalkUi();

    showToast(
      featureClip.trimmedCount > 0
        ? kind === 'nala'
          ? lang === 'mr'
            ? `नाला जतन झाला (${savedFeatureHa.toFixed(2)} Ha) — सीमेबाहेरील भाग वगळला.`
            : `Nala saved (${savedFeatureHa.toFixed(2)} Ha) — outside portion excluded.`
          : lang === 'mr'
          ? `रस्ता जतन झाला (${savedFeatureHa.toFixed(2)} Ha) — सीमेबाहेरील भाग वगळला.`
          : `Road saved (${savedFeatureHa.toFixed(2)} Ha) — outside portion excluded.`
        : kind === 'nala'
        ? lang === 'mr'
          ? `नाला जतन झाला (${savedFeatureHa.toFixed(2)} Ha · ${Math.round(lengthM)}m) — आता आणखी नाला/रस्ता किंवा बाह्य सीमा चाला.`
          : `Nala saved (${savedFeatureHa.toFixed(2)} Ha · ${Math.round(lengthM)}m) — walk another feature or start Boundary Walk.`
        : lang === 'mr'
        ? `रस्ता जतन झाला (${savedFeatureHa.toFixed(2)} Ha · ${Math.round(lengthM)}m) — आता आणखी रस्ता/नाला किंवा बाह्य सीमा चाला.`
        : `Road saved (${savedFeatureHa.toFixed(2)} Ha · ${Math.round(lengthM)}m) — walk another feature or start Boundary Walk.`,
      'success'
    );
  };

  // =========================================================================
  // ON-FIELD WORKABLE AREA MAPPING ENGINE
  // Target Workable Ha + Optional Pre-Road Non-Workable Logic + Exact Auto-End
  // =========================================================================

  // Helper: pick comfortable A4 scale for target polygon size when mapping on blank canvas
  const ensureScaleForTargetHa = useCallback(
    (grossHa: number) => {
      if (rawWorkingPoints.length >= 3) return;
      if (grossHa > 60) {
        setScaleId('1cm_200m');
      } else if (grossHa >= 8) {
        setScaleId('1cm_100m');
      } else {
        setScaleId('2cm_100m');
      }
    },
    [rawWorkingPoints.length]
  );

  // Commits a completed field-walked outer polygon (+ any pre-walked roads/nalas) into the main map
  const commitCompletedFieldPolygon = useCallback(
    (finalOuterPoly: Point2D[], roads: NonWorkingAreaItem[], wasAutoCompleted: boolean) => {
      stopWorkableGpsWatch();
      stopRoadGpsWatch();
      stopLiveMonitorWatch();
      if (finalOuterPoly.length < 3) return;

      // Sanitize outer boundary polygon (resolves any GPS micro-loops/self-crossings before clipping)
      const cleanedOuterPoly = cleanSimpleBoundaryPolygon(finalOuterPoly);
      if (cleanedOuterPoly.length < 3) return;

      // Gentle haptic pulse on mobile when target area auto-completes
      try {
        if (wasAutoCompleted && 'vibrate' in navigator) {
          navigator.vibrate([110, 50, 160]);
        }
      } catch {
        // ignore unsupported browsers
      }

      // Compute centroid and center both outer polygon and any inner session roads together
      let cx = 0;
      let cy = 0;
      cleanedOuterPoly.forEach((p) => {
        cx += p.x;
        cy += p.y;
      });
      cx /= cleanedOuterPoly.length;
      cy /= cleanedOuterPoly.length;

      const centeredWorking: Point2D[] = cleanedOuterPoly.map((p) => ({
        x: Number((p.x - cx).toFixed(2)),
        y: Number((p.y - cy).toFixed(2))
      }));

      const shiftedRoads: NonWorkingAreaItem[] = roads.map((r) => ({
        ...r,
        pts: r.pts.map((p) => ({
          x: Number((p.x - cx).toFixed(2)),
          y: Number((p.y - cy).toFixed(2))
        })),
        centerlinePts: r.centerlinePts
          ? r.centerlinePts.map((p) => ({
              x: Number((p.x - cx).toFixed(2)),
              y: Number((p.y - cy).toFixed(2))
            }))
          : undefined,
        sourceCenterlinePts: (r.sourceCenterlinePts || r.centerlinePts)
          ? (r.sourceCenterlinePts || r.centerlinePts)!.map((p) => ({
              x: Number((p.x - cx).toFixed(2)),
              y: Number((p.y - cy).toFixed(2))
            }))
          : undefined
      }));

      // Strictly clip all pre-walked Roads, Nalas & Non-Workable patches to the completed boundary polygon
      // Any portion (or entire feature) outside the boundary polygon is permanently excluded from map & area!
      const { clippedItems: insideOnlyItems, droppedCount, trimmedCount } =
        clipNonWorkingItemsToBoundary(centeredWorking, shiftedRoads, lang);

      // Compute accurate WGS84 GeoRef centered on the completed polygon
      const origin = fieldOriginRef.current || {
        lat: geoRef.hasGeo ? geoRef.centerLat : 21.5312,
        lon: geoRef.hasGeo ? geoRef.centerLon : 79.2318
      };
      const newCenterLL = localMetersToLatLonWGS84({ x: cx, y: cy }, origin.lat, origin.lon);
      const newGeoRef = buildGeoRefFromLocalPolygon(centeredWorking, newCenterLL.lat, newCenterLL.lon);

      const exactSummary = computeParentChildAreaSummary(
        centeredWorking,
        insideOnlyItems,
        insideOnlyItems.length === 0
      );
      const grossHaNum = Number(exactSummary.formatted.totalArea);
      const roadHaNum = exactSummary.formatted.nonWorkingArea
        ? Number(exactSummary.formatted.nonWorkingArea)
        : 0;
      const netWorkableHaNum = Number(exactSummary.formatted.workableArea);

      setGeoRef(newGeoRef);
      setRawWorkingPoints(centeredWorking);
      setWorkingFileName(
        lang === 'mr'
          ? `शेतात सर्वेक्षण (${netWorkableHaNum.toFixed(2)} Ha)`
          : `Field Walk (${netWorkableHaNum.toFixed(2)} Ha)`
      );
      setRotationDeg(0);

      if (insideOnlyItems.length > 0) {
        setNonWorkingFiles(insideOnlyItems);
        setRawNonWorkingPolygons(insideOnlyItems.map((r) => r.pts));
        setNonWorkingFileName(`${insideOnlyItems.length} items (${roadHaNum.toFixed(2)} Ha)`);
        setIsNonWorkingNil(false);
      } else {
        setNonWorkingFiles([]);
        setRawNonWorkingPolygons([]);
        setNonWorkingFileName('');
        setIsNonWorkingNil(true);
      }

      // Compute axis length & bearing
      let maxD = 0;
      for (let i = 0; i < centeredWorking.length; i++) {
        for (let j = i + 1; j < centeredWorking.length; j++) {
          const dx = centeredWorking[j].x - centeredWorking[i].x;
          const dy = centeredWorking[j].y - centeredWorking[i].y;
          const dist = Math.hypot(dx, dy);
          if (dist > maxD) {
            maxD = dist;
            let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (deg < 0) deg += 360;
            setBearingDeg(Math.round(deg));
          }
        }
      }
      setAxisLength(Math.round(maxD));

      // Shift stamped boundary pillars into centered local coordinate system
      if (boundaryPillarsRef.current.length > 0) {
        const shiftedPillars = boundaryPillarsRef.current.map((bp) => ({
          ...bp,
          mx: Number((bp.mx - cx).toFixed(2)),
          my: Number((bp.my - cy).toFixed(2))
        }));
        boundaryPillarsRef.current = shiftedPillars;
        setBoundaryPillars(shiftedPillars);
      }

      // Reset walk session cleanly, clear stale pre-centered GPS trail/pin & crash-recovery draft
      clearActiveWalkDraft();
      setRecoverableWalkDraft(null);
      setIsWalkPaused(false);
      isWalkPausedRef.current = false;
      setWorkableWalkPhase('idle');
      setOuterWalkPoints([]);
      outerWalkPointsRef.current = [];
      setWorkableRoadDraftPts([]);
      workableRoadDraftPtsRef.current = [];
      setSessionRoadItems([]);
      sessionRoadItemsRef.current = [];
      fieldOriginRef.current = null;
      resetLiveMovementTrail();
      setUserLocation(null);

      applySmartPresetToPoints(centeredWorking, false);

      if (wasAutoCompleted) {
        triggerTargetCompletedFeedback();
      } else {
        triggerPillarStampedFeedback();
      }

      const clipSuffix =
        trimmedCount > 0 || droppedCount > 0
          ? lang === 'mr'
            ? ' (सीमेबाहेरील अनुपचार भाग वगळला)'
            : ' (outside non-workable portion excluded)'
          : '';

      const summaryMsg =
        roadHaNum > 0
          ? lang === 'mr'
            ? `सीमा पूर्ण! बाह्य क्षेत्र ${grossHaNum.toFixed(2)} Ha (${netWorkableHaNum.toFixed(2)} Ha उपचार + ${roadHaNum.toFixed(2)} Ha अनुपचार)${clipSuffix}.`
            : `Boundary completed! ${grossHaNum.toFixed(2)} Ha (${netWorkableHaNum.toFixed(2)} Ha Workable + ${roadHaNum.toFixed(2)} Ha Non-Workable)${clipSuffix}.`
          : lang === 'mr'
          ? `सीमा पूर्ण! उपचार क्षेत्राचा नकाशा ${grossHaNum.toFixed(2)} Ha वर पूर्ण झाला${clipSuffix}.`
          : `Boundary completed! Workable polygon finalized at ${grossHaNum.toFixed(2)} Ha${clipSuffix}.`;

      showToast(summaryMsg, 'success');
    },
    [
      stopWorkableGpsWatch,
      stopRoadGpsWatch,
      stopLiveMonitorWatch,
      resetLiveMovementTrail,
      geoRef,
      lang,
      treatmentType,
      plantSpacingM,
      applySmartPresetToPoints,
      showToast
    ]
  );

  // Appends a vertex to the active outer workable polygon and strictly auto-completes
  // when exact Parent-Child Net Workable Area = Area(Outer) - Area(Outer ∩ ⋃ Roads) hits targetWorkableHa
  const appendOuterWalkVertex = useCallback(
    (pt: Point2D) => {
      const currentPts = outerWalkPointsRef.current;
      const childRoadPolys = sessionRoadItemsRef.current.map((r) => r.pts);

      const solved = solveExactTargetAreaPolygon(
        currentPts,
        pt,
        targetWorkableHaRef.current,
        childRoadPolys
      );

      if (solved.completed) {
        commitCompletedFieldPolygon(solved.points, sessionRoadItemsRef.current, true);
        return;
      }

      outerWalkPointsRef.current = solved.points;
      setOuterWalkPoints(solved.points);
    },
    [commitCompletedFieldPolygon]
  );

  // Starts high-accuracy GPS watch for either 'road_walk' or 'outer_walk'
  const startWorkableGpsStream = useCallback(
    (phase: 'road_walk' | 'outer_walk') => {
      if (!('geolocation' in navigator)) {
        showToast(getTranslation('gps_not_supported', lang), 'error');
        return;
      }

      stopWorkableGpsWatch();
      stopRoadGpsWatch();
      stopLiveMonitorWatch();
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const effectiveGate = isOffline && gpsAccuracyGateM <= 12 ? 25 : gpsAccuracyGateM;
      if (effectiveGate !== gpsAccuracyGateM) {
        setGpsAccuracyGateM(effectiveGate);
      }

      resetLiveMovementTrail();
      gpsFilterRef.current.reset();
      gpsFilterRef.current.setMaxAccuracyGate(effectiveGate);
      acquireScreenWakeLock();

      workableWatchHandleRef.current = startResilientGnssWatch({
        allowCachedBootstrap: true,
        onStatus: (st) => setGnssStatus(st),
        onPermissionDenied: () => {
          stopWorkableGpsWatch();
          showToast(getTranslation('gps_permission', lang), 'error');
        },
        onFix: (fix) => {
          if (workableWatchHandleRef.current === null) return;
          const lat = fix.lat;
          const lon = fix.lon;
          const rawAcc = fix.accuracy;

          // Lock session WGS84 origin on first fix so road + outer boundary share exact local meters
          if (!fieldOriginRef.current) {
            if (geoRefLatestRef.current.hasGeo && rawWorkingPointsLatestRef.current.length >= 3) {
              const distFromExisting = Math.hypot(
                latLonToLocalMetersWGS84(
                  lat,
                  lon,
                  geoRefLatestRef.current.centerLat,
                  geoRefLatestRef.current.centerLon
                ).x,
                latLonToLocalMetersWGS84(
                  lat,
                  lon,
                  geoRefLatestRef.current.centerLat,
                  geoRefLatestRef.current.centerLon
                ).y
              );
              if (distFromExisting < 3000) {
                fieldOriginRef.current = {
                  lat: geoRefLatestRef.current.centerLat,
                  lon: geoRefLatestRef.current.centerLon
                };
              } else {
                fieldOriginRef.current = { lat, lon };
              }
            } else {
              fieldOriginRef.current = { lat, lon };
              setGeoRef((prev) =>
                prev.hasGeo
                  ? prev
                  : {
                      hasGeo: true,
                      centerLat: lat,
                      centerLon: lon,
                      northLat: lat + 0.005,
                      southLat: lat - 0.005,
                      eastLon: lon + 0.005,
                      westLon: lon - 0.005
                    }
              );
            }
          }

          const origin = fieldOriginRef.current;
          const rawPt = latLonToLocalMetersWGS84(lat, lon, origin.lat, origin.lon);
          const res = gpsFilterRef.current.processFix(
            rawPt,
            lat,
            lon,
            rawAcc,
            origin.lat,
            origin.lon,
            fix.timestamp,
            fix.altitude
          );

          setLiveGpsTelemetry(res.telemetry);
          updateLiveMovementLocation(
            res.filteredPoint,
            res.filteredLatLon.lat,
            res.filteredLatLon.lon,
            res.telemetry.filteredAccuracyM ?? Math.round(rawAcc),
            fix.heading,
            res.telemetry.speedMps
          );

          if (fix.isCachedBootstrap) return;
          if (!res.accepted) return;
          if (isWalkPausedRef.current) return;

          if (phase === 'road_walk') {
            const existing = workableRoadDraftPtsRef.current;
            if (
              gpsFilterRef.current.shouldEmitVertex(
                existing,
                res.filteredPoint,
                res.telemetry.filteredAccuracyM ?? rawAcc,
                2.5
              )
            ) {
              const updated = [...existing, res.filteredPoint];
              workableRoadDraftPtsRef.current = updated;
              setWorkableRoadDraftPts(updated);
              triggerVertexCapturedFeedback();
            }
          } else {
            const existing = outerWalkPointsRef.current;
            if (
              gpsFilterRef.current.shouldEmitVertex(
                existing,
                res.filteredPoint,
                res.telemetry.filteredAccuracyM ?? rawAcc,
                4.0
              )
            ) {
              appendOuterWalkVertex(res.filteredPoint);
              triggerVertexCapturedFeedback();
            }
          }
        }
      });
    },
    [
      gpsAccuracyGateM,
      geoRef,
      rawWorkingPoints.length,
      lang,
      stopWorkableGpsWatch,
      stopRoadGpsWatch,
      stopLiveMonitorWatch,
      resetLiveMovementTrail,
      updateLiveMovementLocation,
      appendOuterWalkVertex,
      showToast
    ]
  );

  const handleOpenWorkableWalk = () => {
    stopRoadGpsWatch();
    setIsRecordingRoad(false);
    setPlaceLocationMode(false);
    setActivePlaceFeatureId(null);
    setWorkableWalkPhase('setup');
  };

  const handleStartFieldWorkableSession = (config: {
    targetWorkableHa: number;
    includeRoadFirst: boolean;
    inputMode: 'gps' | 'map';
    roadWidthM: number;
    initialKind?: NonWorkingFeatureKind;
    nalaWidthM?: number;
    nalaSide?: NalaSide;
  }) => {
    const safeTarget = Math.max(0.1, Number(config.targetWorkableHa) || 20);
    const safeRoadW = Math.max(0.5, Number(config.roadWidthM) || 4);
    const safeNalaW = Math.max(0.5, Number(config.nalaWidthM) || 6);
    const kind: NonWorkingFeatureKind = config.initialKind || 'road';
    const side: NalaSide = config.nalaSide || 'right';

    stopWorkableGpsWatch();
    stopRoadGpsWatch();
    setIsRecordingRoad(false);
    setPlaceLocationMode(false);
    setActivePlaceFeatureId(null);

    setTargetWorkableHa(safeTarget);
    targetWorkableHaRef.current = safeTarget;
    setIncludeRoadFirst(config.includeRoadFirst);
    setWorkableNonWorkingKind(kind);
    setWorkableInputMode(config.inputMode);
    setWorkableRoadWidthM(safeRoadW);
    setWorkableNalaWidthM(safeNalaW);
    setWorkableNalaSide(side);
    // Automatically carry any pre-walked Step-1 Non-Workable items (Roads, Nalas, Patches) into the Boundary Walk!
    const preWalkedNonWorking: NonWorkingAreaItem[] =
      rawWorkingPoints.length < 3 && !isNonWorkingNil && nonWorkingFiles.length > 0
        ? [...nonWorkingFiles]
        : [];
    const preWalkedNwHa = Number(preWalkedNonWorking.reduce((s, it) => s + it.areaHa, 0).toFixed(2));
    const combinedGrossTarget = Number((safeTarget + preWalkedNwHa).toFixed(2));

    setSessionRoadItems(preWalkedNonWorking);
    sessionRoadItemsRef.current = preWalkedNonWorking;
    setWorkableRoadDraftPts([]);
    workableRoadDraftPtsRef.current = [];
    setOuterWalkPoints([]);
    outerWalkPointsRef.current = [];

    // Preserve locked GPS origin if user already walked Step-1 Roads/Nalas/Patches in this field session!
    if (preWalkedNonWorking.length === 0) {
      fieldOriginRef.current =
        config.inputMode === 'map'
          ? {
              lat: geoRef.hasGeo ? geoRef.centerLat : 21.5312,
              lon: geoRef.hasGeo ? geoRef.centerLon : 79.2318
            }
          : null;
    } else if (!fieldOriginRef.current && config.inputMode === 'map') {
      fieldOriginRef.current = {
        lat: geoRef.hasGeo ? geoRef.centerLat : 21.5312,
        lon: geoRef.hasGeo ? geoRef.centerLon : 79.2318
      };
    }

    ensureScaleForTargetHa(combinedGrossTarget);

    if (config.includeRoadFirst) {
      setWorkableWalkPhase('road_walk');
      if (config.inputMode === 'gps') {
        startWorkableGpsStream('road_walk');
        showToast(
          kind === 'nala'
            ? lang === 'mr'
              ? `पायरी १/२: नाल्याच्या एका काठाने चाला (${side === 'left' ? 'डावी बाजू' : 'उजवी बाजू'} · ${safeNalaW}m रुंदी).`
              : `Step 1/2: Walk along ONE bank of Nala (${side === 'left' ? 'Left' : 'Right'} side · ${safeNalaW}m width).`
            : kind === 'patch'
            ? lang === 'mr'
              ? 'पायरी १/२: अनुपचार क्षेत्राच्या कडेने चाला — पॉलीगॉन आपोआप तयार होईल.'
              : 'Step 1/2: Walk around the Non-Workable patch perimeter — polygon builds automatically.'
            : lang === 'mr'
            ? `पायरी १/२: आधी रस्त्याने चाला (${safeRoadW}m रुंदी). रस्त्याचे क्षेत्र तुमच्या ${safeTarget} Ha मध्ये आपोआप मिळवले जाईल.`
            : `Step 1/2: Walk along the road first (${safeRoadW}m width). Its area will be added to your ${safeTarget} Ha workable target.`,
          'info'
        );
      } else {
        showToast(
          kind === 'nala'
            ? lang === 'mr'
              ? `पायरी १/२: नकाशावर नाल्याच्या एका काठाचे बिंदू टॅप करा (${side === 'left' ? 'डावी' : 'उजवी'} · ${safeNalaW}m).`
              : `Step 1/2: Tap points along one bank of Nala on map (${side === 'left' ? 'Left' : 'Right'} · ${safeNalaW}m).`
            : kind === 'patch'
            ? lang === 'mr'
              ? 'पायरी १/२: नकाशावर अनुपचार क्षेत्राचे कोपरे टॅप करा.'
              : 'Step 1/2: Tap corners of the Non-Workable patch on map.'
            : lang === 'mr'
            ? `पायरी १/२: आधी नकाशावर रस्त्याचे बिंदू टॅप करा (${safeRoadW}m रुंदी).`
            : `Step 1/2: Tap along the road path on the map first (${safeRoadW}m width).`,
          'info'
        );
      }
    } else {
      setWorkableWalkPhase('outer_walk');
      if (config.inputMode === 'gps') {
        startWorkableGpsStream('outer_walk');
        showToast(
          preWalkedNwHa > 0
            ? lang === 'mr'
              ? `बाह्य सीमा चालणे सुरू — लक्ष्य ${combinedGrossTarget.toFixed(2)} Ha (${safeTarget.toFixed(2)} उपचार + ${preWalkedNwHa.toFixed(2)} अनुपचार).`
              : `Boundary walk started — outer target ${combinedGrossTarget.toFixed(2)} Ha (${safeTarget.toFixed(2)} Workable + ${preWalkedNwHa.toFixed(2)} Non-Workable).`
            : lang === 'mr'
            ? `शेतात सीमा चालणे सुरू — ${safeTarget.toFixed(2)} Ha पूर्ण होताच नकाशा आपोआप बंद होईल.`
            : `Field boundary walk started — polygon will auto-complete strictly at ${safeTarget.toFixed(2)} Ha.`,
          'info'
        );
      } else {
        showToast(
          lang === 'mr'
            ? `नकाशावर कोपरे टॅप करा — ${combinedGrossTarget.toFixed(2)} Ha पूर्ण होताच पॉलीगॉन आपोआप पूर्ण होईल.`
            : `Tap corners on map — polygon auto-completes strictly at ${combinedGrossTarget.toFixed(2)} Ha.`,
          'info'
        );
      }
    }
  };

  const handleFinishSessionRoad = (customName?: string) => {
    stopWorkableGpsWatch();
    resetLiveMovementTrail();
    setUserLocation(null);
    const pts = workableRoadDraftPtsRef.current;
    const kind = workableNonWorkingKind;

    let item: NonWorkingAreaItem | null = null;
    const trimmed = customName?.trim();

    if (kind === 'patch') {
      if (pts.length < 3) {
        showToast(
          lang === 'mr'
            ? 'अनुपचार पॉलीगॉनसाठी किमान ३ कोपरे आवश्यक आहेत.'
            : 'At least 3 corners are required for a non-workable polygon.',
          'error'
        );
        return;
      }
      const rawHa = calcAreaHa(pts);
      if (rawHa < 0.001) {
        showToast(
          lang === 'mr' ? 'अनुपचार क्षेत्र खूप लहान आहे.' : 'Non-workable polygon is too small.',
          'error'
        );
        return;
      }
      const areaHa = Number(Math.max(0.01, rawHa).toFixed(2));
      const existingPatches = sessionRoadItemsRef.current.filter((it) => it.category === 'patch').length;
      const label =
        trimmed ||
        (lang === 'mr'
          ? `अनुपचार क्षेत्र ${existingPatches + 1}`
          : `Non-Workable Patch ${existingPatches + 1}`);
      item = {
        id: `walk_patch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fileName: label,
        pts: [...pts],
        areaHa,
        category: 'patch'
      };
    } else {
      if (pts.length < 2) {
        showToast(
          lang === 'mr'
            ? `${kind === 'nala' ? 'नाला' : 'रस्ता'} पूर्ण करण्यासाठी किमान २ बिंदू आवश्यक आहेत.`
            : `At least 2 points are required for the ${kind === 'nala' ? 'nala bank' : 'road'} track.`,
          'error'
        );
        return;
      }
      const lengthM = calculatePolylineLengthM(pts);
      const widthM = kind === 'nala' ? workableNalaWidthM : workableRoadWidthM;
      const bufferedPoly =
        kind === 'nala'
          ? oneSidedBufferPolylineToPolygon(pts, widthM, workableNalaSide)
          : bufferPolylineToPolygon(pts, widthM);
      if (lengthM < 1 || bufferedPoly.length < 3) {
        showToast(
          lang === 'mr' ? 'अंतर खूप कमी आहे.' : 'Track length is too short.',
          'error'
        );
        return;
      }
      const rawHa = calcAreaHa(bufferedPoly) || (lengthM * widthM) / 10000;
      const areaHa = Number(Math.max(0.01, rawHa).toFixed(2));

      if (kind === 'nala') {
        const sideMr = workableNalaSide === 'left' ? 'डावी' : 'उजवी';
        const sideEn = workableNalaSide === 'left' ? 'Left' : 'Right';
        const label = trimmed
          ? `${trimmed} (${widthM}m · ${sideEn})`
          : lang === 'mr'
          ? `नाला — ${sideMr} (${widthM}मी × ${Math.round(lengthM)}मी)`
          : `Nala — ${sideEn} (${widthM}m × ${Math.round(lengthM)}m)`;
        item = {
          id: `walk_nala_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          fileName: label,
          pts: bufferedPoly,
          areaHa,
          category: 'nala',
          roadWidthM: widthM,
          roadLengthM: Math.round(lengthM),
          nalaSide: workableNalaSide,
          centerlinePts: [...pts],
          sourceCenterlinePts: [...pts]
        };
      } else {
        const label = trimmed
          ? `${trimmed} (${widthM}m × ${Math.round(lengthM)}m)`
          : lang === 'mr'
          ? `रस्ता (${widthM}मी × ${Math.round(lengthM)}मी)`
          : `Road (${widthM}m × ${Math.round(lengthM)}m)`;
        item = {
          id: `walk_road_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          fileName: label,
          pts: bufferedPoly,
          areaHa,
          category: 'road',
          roadWidthM: widthM,
          roadLengthM: Math.round(lengthM),
          centerlinePts: [...pts],
          sourceCenterlinePts: [...pts]
        };
      }
    }

    if (!item) return;

    const nextItems = [...sessionRoadItemsRef.current, item];
    sessionRoadItemsRef.current = nextItems;
    setSessionRoadItems(nextItems);
    setWorkableRoadDraftPts([]);
    workableRoadDraftPtsRef.current = [];
    setWorkableWalkPhase('road_review');

    const totalNwHa = nextItems.reduce((s, r) => s + r.areaHa, 0);
    const newGrossTarget = Number((targetWorkableHaRef.current + totalNwHa).toFixed(2));
    ensureScaleForTargetHa(newGrossTarget);

    showToast(
      lang === 'mr'
        ? `${item.fileName} नोंदवले (${item.areaHa.toFixed(2)} Ha). बाह्य लक्ष्य आता ${newGrossTarget.toFixed(2)} Ha झाले.`
        : `Saved ${item.fileName} (${item.areaHa.toFixed(2)} Ha). Outer polygon target is now ${newGrossTarget.toFixed(2)} Ha.`,
      'success'
    );
  };

  const handleRemoveSessionRoad = (id: string) => {
    const updated = sessionRoadItemsRef.current.filter((r) => r.id !== id);
    sessionRoadItemsRef.current = updated;
    setSessionRoadItems(updated);
  };

  const handleStartAnotherSessionRoad = (
    mode: 'gps' | 'map',
    widthM?: number,
    kind: NonWorkingFeatureKind = 'road',
    side?: NalaSide
  ) => {
    setWorkableNonWorkingKind(kind);
    if (kind === 'nala') {
      if (widthM && widthM > 0) setWorkableNalaWidthM(widthM);
      if (side) setWorkableNalaSide(side);
    } else if (kind === 'road') {
      if (widthM && widthM > 0) setWorkableRoadWidthM(widthM);
    }
    setWorkableInputMode(mode);
    setWorkableRoadDraftPts([]);
    workableRoadDraftPtsRef.current = [];
    setWorkableWalkPhase('road_walk');
    if (mode === 'gps') {
      startWorkableGpsStream('road_walk');
    }
  };

  const handleProceedToOuterWalk = (mode: 'gps' | 'map') => {
    setWorkableInputMode(mode);
    setOuterWalkPoints([]);
    outerWalkPointsRef.current = [];
    setWorkableWalkPhase('outer_walk');

    const totalRoadHa = sessionRoadItemsRef.current.reduce((s, r) => s + r.areaHa, 0);
    const grossTarget = Number((targetWorkableHaRef.current + totalRoadHa).toFixed(2));
    ensureScaleForTargetHa(grossTarget);

    if (mode === 'gps') {
      startWorkableGpsStream('outer_walk');
      showToast(
        lang === 'mr'
          ? `पायरी २/२: बाह्य सीमेवरून चाला — ${grossTarget.toFixed(2)} Ha पूर्ण होताच पॉलीगॉन आपोआप बंद होईल.`
          : `Step 2/2: Walk outer boundary — polygon auto-completes strictly at ${grossTarget.toFixed(2)} Ha.`,
        'info'
      );
    } else {
      stopWorkableGpsWatch();
      showToast(
        lang === 'mr'
          ? `पायरी २/२: नकाशावर बाह्य सीमेचे कोपरे टॅप करा (लक्ष्य ${grossTarget.toFixed(2)} Ha).`
          : `Step 2/2: Tap outer polygon corners on map (Target ${grossTarget.toFixed(2)} Ha).`,
        'info'
      );
    }
  };

  const handleSwitchWorkableInputMode = (nextMode: 'gps' | 'map') => {
    setWorkableInputMode(nextMode);
    if (nextMode === 'gps' && (workableWalkPhase === 'road_walk' || workableWalkPhase === 'outer_walk')) {
      startWorkableGpsStream(workableWalkPhase);
    } else {
      stopWorkableGpsWatch();
    }
  };

  const handleMapTapWorkablePoint = useCallback(
    (pt: Point2D) => {
      if (workableWalkPhase === 'road_walk') {
        const updated = [...workableRoadDraftPtsRef.current, { x: pt.x, y: pt.y }];
        workableRoadDraftPtsRef.current = updated;
        setWorkableRoadDraftPts(updated);
      } else if (workableWalkPhase === 'outer_walk') {
        appendOuterWalkVertex({ x: pt.x, y: pt.y });
      }
    },
    [workableWalkPhase, appendOuterWalkVertex]
  );

  // Survey-grade manual corner pin (uses inverse-variance weighted recent GPS buffer or fresh fix)
  const handlePinAccurateGpsPoint = () => {
    const weighted = gpsFilterRef.current.getWeightedCornerPoint();
    if (weighted) {
      if (workableWalkPhase === 'road_walk') {
        const updated = [...workableRoadDraftPtsRef.current, weighted];
        workableRoadDraftPtsRef.current = updated;
        setWorkableRoadDraftPts(updated);
      } else if (workableWalkPhase === 'outer_walk') {
        appendOuterWalkVertex(weighted);
      }
      showToast(
        lang === 'mr'
          ? `अचूक GPS कोपरा नोंदवला (±${liveGpsTelemetry.filteredAccuracyM ?? '--'}m)`
          : `Precision averaged GPS corner pinned (±${liveGpsTelemetry.filteredAccuracyM ?? '--'}m)`,
        'success'
      );
      return;
    }

    if (!('geolocation' in navigator)) {
      showToast(getTranslation('gps_not_supported', lang), 'error');
      return;
    }

    getOfflineSafeCurrentFix(10000)
      .then((fix) => {
        const lat = fix.lat;
        const lon = fix.lon;
        const acc = Number(fix.accuracy.toFixed(1));
        if (!fieldOriginRef.current) {
          fieldOriginRef.current = { lat, lon };
        }
        const pt = latLonToLocalMetersWGS84(lat, lon, fieldOriginRef.current.lat, fieldOriginRef.current.lon);
        setUserLocation({ mx: pt.x, my: pt.y, lat, lon, accuracy: acc });
        if (workableWalkPhase === 'road_walk') {
          const updated = [...workableRoadDraftPtsRef.current, pt];
          workableRoadDraftPtsRef.current = updated;
          setWorkableRoadDraftPts(updated);
        } else if (workableWalkPhase === 'outer_walk') {
          appendOuterWalkVertex(pt);
        }
        showToast(
          lang === 'mr' ? `GPS बिंदू नोंदवला (±${acc}m)` : `GPS point pinned (±${acc}m)`,
          'success'
        );
      })
      .catch((err: any) => {
        showToast(
          err?.code === 1 ? getTranslation('gps_permission', lang) : getTranslation('gps_no_signal', lang),
          'error'
        );
      });
  };

  const handleUndoWorkablePoint = () => {
    if (workableWalkPhase === 'road_walk') {
      const updated = workableRoadDraftPtsRef.current.slice(0, -1);
      workableRoadDraftPtsRef.current = updated;
      setWorkableRoadDraftPts(updated);
    } else if (workableWalkPhase === 'outer_walk') {
      const updated = outerWalkPointsRef.current.slice(0, -1);
      outerWalkPointsRef.current = updated;
      setOuterWalkPoints(updated);
    }
  };

  const handleFinishOuterWalkEarly = () => {
    if (outerWalkPointsRef.current.length < 3) {
      showToast(
        lang === 'mr'
          ? 'पॉलीगॉन पूर्ण करण्यासाठी किमान ३ कोपरे आवश्यक आहेत.'
          : 'At least 3 corners are required to form a polygon.',
        'error'
      );
      return;
    }
    commitCompletedFieldPolygon(outerWalkPointsRef.current, sessionRoadItemsRef.current, false);
  };

  const handleCancelWorkableWalk = () => {
    stopWorkableGpsWatch();
    resetLiveMovementTrail();
    setUserLocation(null);
    clearActiveWalkDraft();
    setRecoverableWalkDraft(null);
    setIsWalkPaused(false);
    isWalkPausedRef.current = false;
    setWorkableWalkPhase('idle');
    setWorkableRoadDraftPts([]);
    workableRoadDraftPtsRef.current = [];
    setOuterWalkPoints([]);
    outerWalkPointsRef.current = [];
    setSessionRoadItems([]);
    sessionRoadItemsRef.current = [];
    fieldOriginRef.current = null;
    showToast(
      lang === 'mr' ? 'शेतातील क्षेत्र मोजणी रद्द केली.' : 'Field workable area mapping cancelled.',
      'info'
    );
  };

  // Pause / Resume active GPS recording (lets guard detour around nalas/thickets safely)
  const handleTogglePauseWorkableWalk = () => {
    setIsWalkPaused((prev) => {
      const next = !prev;
      isWalkPausedRef.current = next;
      showToast(
        next
          ? lang === 'mr'
            ? 'GPS नोंद तात्पुरती थांबवली — अडथळा ओलांडून पुन्हा सुरू करा.'
            : 'GPS Walk Paused — tap Resume when back on boundary.'
          : lang === 'mr'
          ? 'GPS नोंद पुन्हा सुरू झाली.'
          : 'GPS Walk Resumed.',
        'info'
      );
      return next;
    });
  };

  // 1-Tap Forest Boundary Pillar Stamping (BP-1, BP-2...) with filtered GPS coordinates
  const handleMarkBoundaryPillar = () => {
    const nextIdx = boundaryPillarsRef.current.length + 1;
    const label = `BP-${nextIdx}`;

    const origin = fieldOriginRef.current || {
      lat: geoRef.hasGeo ? geoRef.centerLat : 21.5312,
      lon: geoRef.hasGeo ? geoRef.centerLon : 79.2318
    };

    let pt: Point2D | null = null;
    let lat: number | null = null;
    let lon: number | null = null;
    let accM: number | undefined;

    if (liveGpsTelemetry.isLocked && liveGpsTelemetry.lat != null && liveGpsTelemetry.lon != null) {
      lat = liveGpsTelemetry.lat;
      lon = liveGpsTelemetry.lon;
      pt = latLonToLocalMetersWGS84(lat, lon, origin.lat, origin.lon);
      accM = liveGpsTelemetry.ehpeM ?? liveGpsTelemetry.filteredAccuracyM ?? undefined;
    } else if (userLocation && userLocation.lat != null && userLocation.lon != null) {
      lat = userLocation.lat;
      lon = userLocation.lon;
      pt = { x: userLocation.mx, y: userLocation.my };
      accM = userLocation.accuracy;
    } else if (outerWalkPointsRef.current.length > 0) {
      const last = outerWalkPointsRef.current[outerWalkPointsRef.current.length - 1];
      const ll = localMetersToLatLonWGS84(last, origin.lat, origin.lon);
      pt = last;
      lat = ll.lat;
      lon = ll.lon;
    }

    if (!pt || lat == null || lon == null) {
      showToast(
        lang === 'mr'
          ? 'खांब नोंदवण्यासाठी GPS लॉक किंवा किमान १ कोपरा आवश्यक आहे.'
          : 'Wait for GPS lock or tap a corner before stamping a pillar.',
        'error'
      );
      return;
    }

    const pillar: BoundaryPillar = {
      id: `bp_${Date.now()}_${nextIdx}`,
      label,
      mx: Number(pt.x.toFixed(2)),
      my: Number(pt.y.toFixed(2)),
      lat,
      lon,
      accuracyM: accM,
      timestamp: Date.now()
    };
    const updated = [...boundaryPillarsRef.current, pillar];
    boundaryPillarsRef.current = updated;
    setBoundaryPillars(updated);
    triggerPillarStampedFeedback();
    showToast(
      lang === 'mr'
        ? `सीमा खांब ${label} नोंदवला (${toDMS(lat, true)}, ${toDMS(lon, false)})`
        : `Stamped Boundary Pillar ${label} (${toDMS(lat, true)}, ${toDMS(lon, false)})`,
      'success'
    );
  };

  const handleRemoveBoundaryPillar = (id: string) => {
    const updated = boundaryPillarsRef.current.filter((bp) => bp.id !== id);
    boundaryPillarsRef.current = updated;
    setBoundaryPillars(updated);
  };

  // Resume Interrupted GPS Walk from Offline Auto-Save Draft
  const handleResumeWalkDraft = () => {
    if (!recoverableWalkDraft) return;
    const d = recoverableWalkDraft;
    setTargetWorkableHa(d.targetWorkableHa);
    targetWorkableHaRef.current = d.targetWorkableHa;
    setIncludeRoadFirst(d.includeRoadFirst);
    setWorkableNonWorkingKind(d.activeNonWorkingKind || 'road');
    setWorkableRoadWidthM(d.roadWidthM);
    setWorkableNalaWidthM(d.nalaWidthM || 6);
    setWorkableNalaSide(d.nalaSide || 'right');
    setWorkableRoadDraftPts(d.roadDraftPoints || []);
    workableRoadDraftPtsRef.current = d.roadDraftPoints || [];
    setSessionRoadItems(d.sessionRoadItems || []);
    sessionRoadItemsRef.current = d.sessionRoadItems || [];
    setOuterWalkPoints(d.outerWalkPoints || []);
    outerWalkPointsRef.current = d.outerWalkPoints || [];
    if (d.pillars?.length) {
      setBoundaryPillars(d.pillars);
      boundaryPillarsRef.current = d.pillars;
    }
    fieldOriginRef.current = d.fieldOrigin;
    setWorkableInputMode(d.inputMode);
    setWorkableWalkPhase(d.phase);
    setIsWalkPaused(false);
    isWalkPausedRef.current = false;
    setRecoverableWalkDraft(null);
    if (d.inputMode === 'gps' && (d.phase === 'road_walk' || d.phase === 'outer_walk')) {
      startWorkableGpsStream(d.phase);
    }
    showToast(
      lang === 'mr'
        ? 'मागील अपूर्ण GPS सर्व्हे यशस्वीरित्या पुन्हा सुरू केला!'
        : 'Interrupted field walk resumed from auto-saved draft!',
      'success'
    );
  };

  const handleDiscardWalkDraft = () => {
    clearActiveWalkDraft();
    setRecoverableWalkDraft(null);
  };

  // Build Serializable Snapshot for Offline Saved Coupes Library & .json Backup
  const buildCurrentProjectSnapshot = (customName?: string): SavedCoupeProject => {
    const defaultName =
      customName?.trim() ||
      [
        landIdentifierValue || compartmentNo ? `Comp ${landIdentifierValue || compartmentNo}` : '',
        village || beat
      ]
        .filter(Boolean)
        .join(' — ') ||
      workingFileName ||
      `Coupe (${treatmentArea || totalArea || '0.00'} Ha)`;

    return {
      id: `coupe_${Date.now()}`,
      name: defaultName,
      savedAt: Date.now(),
      schemaVersion: 1,
      rawWorkingPoints,
      nonWorkingFiles,
      isNonWorkingNil,
      geoRef,
      workingFileName,
      nonWorkingFileName,
      boundaryPillars,
      features,
      scaleId,
      customScaleCm,
      customScaleM,
      gridWidthM,
      gridHeightM,
      orientation,
      baselineOption,
      manualBaselineOffset,
      showSectionLines,
      sectionLineOffset,
      rotationDeg,
      legendPos,
      legendLayout,
      legendSize,
      legendOffset,
      displayOptions,
      treatmentTitle,
      village,
      landIdentifierType,
      landIdentifierValue,
      division,
      subDivision,
      range,
      round,
      beat,
      compartmentNo,
      mapDate,
      treatmentType,
      customTreatmentType,
      plantSpacingM,
      targetTotalPlants,
      vanrakshak,
      vanpal,
      rfo,
      totalAreaHa: totalArea,
      treatmentAreaHa: treatmentArea
    };
  };

  const handleSaveCurrentCoupe = async (customName?: string) => {
    if (rawWorkingPoints.length < 3) {
      showToast(
        lang === 'mr' ? 'जतन करण्यासाठी आधी कूप सीमा लोड करा.' : 'Load or walk a coupe boundary before saving.',
        'error'
      );
      return;
    }
    const snap = buildCurrentProjectSnapshot(customName);
    const updated = await upsertSavedCoupeInDb(snap);
    setSavedCoupes(updated);
    showToast(
      lang === 'mr' ? `नकाशा ऑफलाईन जतन झाला: ${snap.name}` : `Saved offline: ${snap.name}`,
      'success'
    );
  };

  const handleLoadSavedCoupe = (project: SavedCoupeProject, silentToast = false) => {
    stopRoadGpsWatch();
    stopWorkableGpsWatch();
    stopLiveMonitorWatch();
    resetLiveMovementTrail();
    setUserLocation(null);
    setNavTarget(null);
    setWorkableWalkPhase('idle');
    setRawWorkingPoints(project.rawWorkingPoints || []);
    setNonWorkingFiles(project.nonWorkingFiles || []);
    setRawNonWorkingPolygons((project.nonWorkingFiles || []).map((f) => f.pts));
    setIsNonWorkingNil(Boolean(project.isNonWorkingNil));
    setGeoRef(project.geoRef);
    geoRefLatestRef.current = project.geoRef;
    rawWorkingPointsLatestRef.current = project.rawWorkingPoints || [];
    setWorkingFileName(project.workingFileName || project.name);
    setNonWorkingFileName(project.nonWorkingFileName || '');
    setBoundaryPillars(project.boundaryPillars || []);
    boundaryPillarsRef.current = project.boundaryPillars || [];
    if (project.features?.length) setFeatures(project.features);
    if (project.scaleId) setScaleId(project.scaleId);
    if (project.customScaleCm) setCustomScaleCm(project.customScaleCm);
    if (project.customScaleM) setCustomScaleM(project.customScaleM);
    if (project.gridWidthM) setGridWidthM(project.gridWidthM);
    if (project.gridHeightM) setGridHeightM(project.gridHeightM);
    if (project.orientation) setOrientation(project.orientation);
    if (project.baselineOption) setBaselineOption(project.baselineOption);
    if (project.manualBaselineOffset) setManualBaselineOffset(project.manualBaselineOffset);
    setShowSectionLines(Boolean(project.showSectionLines));
    setSectionLineOffset(project.sectionLineOffset || 0);
    setRotationDeg(project.rotationDeg || 0);
    if (project.legendPos) setLegendPos(project.legendPos);
    setLegendLayout(project.legendLayout || 'box');
    setLegendSize(project.legendSize || 'compact');
    if (project.legendOffset) setLegendOffset(project.legendOffset);
    if (project.displayOptions) {
      setDisplayOptions((prev) => ({ ...prev, ...project.displayOptions }));
    }
    setTreatmentTitle(project.treatmentTitle || '');
    setVillage(project.village || '');
    if (project.landIdentifierType) setLandIdentifierType(project.landIdentifierType);
    setLandIdentifierValue(project.landIdentifierValue || '');
    setDivision(project.division || '');
    setSubDivision(project.subDivision || '');
    setRange(project.range || '');
    setRound(project.round || '');
    setBeat(project.beat || '');
    setCompartmentNo(project.compartmentNo || '');
    setMapDate(project.mapDate || formatToDMY());
    if (project.treatmentType) setTreatmentType(project.treatmentType);
    setCustomTreatmentType(project.customTreatmentType || '');
    if (project.plantSpacingM) setPlantSpacingM(project.plantSpacingM);
    if (project.targetTotalPlants) setTargetTotalPlants(project.targetTotalPlants);
    setVanrakshak(project.vanrakshak || '');
    setVanpal(project.vanpal || '');
    setRfo(project.rfo || '');
    if (!silentToast) {
      showToast(
        lang === 'mr' ? `जतन नकाशा उघडला: ${project.name}` : `Opened saved coupe: ${project.name}`,
        'success'
      );
    }
  };

  // Open a saved or imported coupe directly in Field Inspection Mode (Locked View-Only + Live GPS + Full Map on Mobile + Go-To Compass ready)
  const handleInspectSavedCoupe = (project: SavedCoupeProject) => {
    handleLoadSavedCoupe(project, true);
    setIsViewOnlyMode(true);
    setActiveInteractionMode('pan');
    setPlaceLocationMode(false);
    setActivePlaceFeatureId(null);
    setIsMobileMapExpanded(true);
    setIsMobileWorkExpanded(false);
    startLiveGpsMonitor(project.geoRef, project.rawWorkingPoints);
    showToast(
      lang === 'mr'
        ? `क्षेत्र तपासणी सुरू (${project.name}) — ड्रॅग लॉक · गो-टू कंपॉस तयार!`
        : `Field Inspection active (${project.name}) — Drag locked · Go-To Compass ready!`,
      'success'
    );
  };

  const handleDeleteSavedCoupe = async (id: string) => {
    const updated = await deleteSavedCoupeInDb(id);
    setSavedCoupes(updated);
    showToast(lang === 'mr' ? 'जतन नकाशा काढला.' : 'Saved coupe removed.', 'info');
  };

  const handleExportSavedCoupeKmz = async (project: SavedCoupeProject) => {
    try {
      showToast(lang === 'mr' ? 'KMZ फाईल तयार होत आहे...' : 'Generating KMZ file...', 'info');
      const { blob, filename } = await generateKmzForSavedProject(project, lang);
      await saveOrShareBlobFile(blob, filename, {
        title: filename,
        dialogTitle: 'Save or Share KMZ File'
      });
      showToast(
        lang === 'mr' ? `KMZ डाऊनलोड पूर्ण (${filename})` : `KMZ downloaded (${filename})`,
        'success'
      );
    } catch (err: any) {
      showToast(
        lang === 'mr'
          ? `KMZ तयार करताना त्रुटी: ${err?.message || ''}`
          : `Failed to generate KMZ: ${err?.message || ''}`,
        'error'
      );
    }
  };

  const handleExportAllFolderZip = async () => {
    if (savedCoupes.length === 0) {
      showToast(
        lang === 'mr' ? 'बॅकअपसाठी फोल्डरमध्ये कोणतेही नकाशे नाहीत.' : 'No saved coupes to back up yet.',
        'info'
      );
      return;
    }
    try {
      showToast(
        lang === 'mr'
          ? `सर्व ${savedCoupes.length} नकाशांचा .zip बॅकअप तयार होत आहे...`
          : `Packaging all ${savedCoupes.length} coupes into .zip backup...`,
        'info'
      );
      const { blob, filename, count } = await exportEntireFolderAsZip(savedCoupes, lang);
      await saveOrShareBlobFile(blob, filename, {
        title: filename,
        dialogTitle: 'Save or Share Folder Backup (.zip)'
      });
      showToast(
        lang === 'mr'
          ? `संपूर्ण KMZ फोल्डर बॅकअप तयार (${count} नकाशे · ${filename})`
          : `Entire KMZ folder backed up (${count} maps · ${filename})`,
        'success'
      );
    } catch (err: any) {
      showToast(
        lang === 'mr'
          ? `ZIP बॅकअप त्रुटी: ${err?.message || ''}`
          : `ZIP backup error: ${err?.message || ''}`,
        'error'
      );
    }
  };

  const handleExportProjectBackup = (project?: SavedCoupeProject) => {
    const target = project || buildCurrentProjectSnapshot();
    if (!target.rawWorkingPoints || target.rawWorkingPoints.length < 3) {
      showToast(
        lang === 'mr' ? 'बॅकअपसाठी आधी कूप सीमा लोड करा.' : 'Load a coupe boundary before exporting backup.',
        'error'
      );
      return;
    }
    const filename = downloadProjectJsonBackup(target);
    showToast(
      lang === 'mr'
        ? `प्रोजेक्ट बॅकअप डाऊनलोड पूर्ण (${filename})`
        : `Project backup downloaded (${filename})`,
      'success'
    );
  };

  const handleImportProjectBackupFile = async (file: File) => {
    try {
      // Multi-coupe Folder ZIP Backup Restore
      if (file.name.toLowerCase().endsWith('.zip')) {
        showToast(
          lang === 'mr' ? 'ZIP फोल्डर बॅकअप उघडत आहे...' : 'Restoring multi-coupe ZIP folder backup...',
          'info'
        );
        const restoredList = await importFolderZipBackup(file);
        if (restoredList.length === 0) {
          showToast(
            lang === 'mr' ? 'ZIP मध्ये कोणताही वैध कूप नकाशा सापडला नाही.' : 'No valid coupes found inside ZIP file.',
            'error'
          );
          return;
        }
        const updated = await bulkUpsertSavedCoupesInDb(restoredList);
        setSavedCoupes(updated);
        showToast(
          lang === 'mr'
            ? `ZIP मधून ${restoredList.length} नकाशे KMZ फोल्डरमध्ये पुनर्संचयित झाले!`
            : `Restored ${restoredList.length} maps into your KMZ Folder!`,
          'success'
        );
        return;
      }

      const result = await parseAppKmzForInspection(file);
      if (!result) {
        showToast(
          lang === 'mr'
            ? 'अवैध KMZ / KML / ZIP किंवा JSON बॅकअप फाईल.'
            : 'Invalid KMZ / KML / ZIP or JSON backup file.',
          'error'
        );
        return;
      }
      const updated = await upsertSavedCoupeInDb(result.project);
      setSavedCoupes(updated);
      setIsSavedCoupesOpen(false);
      const grossHa = calcAreaHa(result.project.rawWorkingPoints || []);
      const nwCount = result.project.nonWorkingFiles?.length || 0;
      const pillarCount = result.project.boundaryPillars?.length || 0;
      setPendingImport({
        kind: 'saved_project',
        project: result.project,
        sourceMode: result.mode,
        preview: {
          fileName: result.project.name || file.name,
          areaSummaryText: grossHa > 0 ? `${grossHa.toFixed(2)} Ha` : undefined,
          detailsText:
            result.mode === 'full_project'
              ? lang === 'mr'
                ? `पूर्ण अ‍ॅप KMZ${nwCount ? ` · ${nwCount} अनुपचार` : ''}${pillarCount ? ` · ${pillarCount} खांब` : ''}`
                : `Full App KMZ${nwCount ? ` · ${nwCount} NW layers` : ''}${pillarCount ? ` · ${pillarCount} pillars` : ''}`
              : lang === 'mr'
              ? 'KML / KMZ उपचार नकाशा'
              : 'KML / KMZ Treatment Map',
          isAppKmz: result.mode === 'full_project'
        }
      });
    } catch {
      showToast(
        lang === 'mr' ? 'KMZ / ZIP / बॅकअप फाईल वाचताना त्रुटी आली.' : 'Failed to read KMZ / ZIP / backup file.',
        'error'
      );
    }
  };

  // Keep OS incoming-file handler ref synced (handles WhatsApp Share & Open With launches)
  incomingFileHandlerRef.current = async (file: File) => {
    const lower = (file.name || '').toLowerCase();
    if (lower.endsWith('.gpx') || lower.endsWith('.geojson')) {
      await handleUploadWorking(file);
      return;
    }
    if (lower.endsWith('.zip')) {
      await handleImportProjectBackupFile(file);
      return;
    }
    try {
      const parsed = await parseAppKmzForInspection(file);
      if (parsed) {
        const updated = await upsertSavedCoupeInDb(parsed.project);
        setSavedCoupes(updated);
        setIsSavedCoupesOpen(false);
        const grossHa = calcAreaHa(parsed.project.rawWorkingPoints || []);
        const nwCount = parsed.project.nonWorkingFiles?.length || 0;
        const pillarCount = parsed.project.boundaryPillars?.length || 0;
        setPendingImport({
          kind: 'saved_project',
          project: parsed.project,
          sourceMode: parsed.mode,
          preview: {
            fileName: parsed.project.name || file.name,
            areaSummaryText: grossHa > 0 ? `${grossHa.toFixed(2)} Ha` : undefined,
            detailsText:
              parsed.mode === 'full_project'
                ? lang === 'mr'
                  ? `WhatsApp अ‍ॅप KMZ${nwCount ? ` · ${nwCount} अनुपचार` : ''}${pillarCount ? ` · ${pillarCount} खांब` : ''}`
                  : `WhatsApp App KMZ${nwCount ? ` · ${nwCount} NW layers` : ''}${pillarCount ? ` · ${pillarCount} pillars` : ''}`
                : lang === 'mr'
                ? 'WhatsApp KMZ / KML नकाशा'
                : 'WhatsApp KMZ / KML Map',
            isAppKmz: parsed.mode === 'full_project'
          }
        });
        return;
      }
    } catch {
      // Fall through to standard working file parser below
    }
    await handleUploadWorking(file);
  };

  // Live computed state object shared between Sidebar & MapCanvas (Strict Parent-Child Geometric Clipping + Live Step-by-Step Metrics)
  const liveWorkableWalk = React.useMemo<LiveWorkableWalkState>(() => {
    const rawRoadAreaHa = Number(sessionRoadItems.reduce((sum, r) => sum + r.areaHa, 0).toFixed(2));

    // Include current moving GPS position as live rubber-band tip while walking so distance & area update smoothly every step
    const gpsTip: Point2D | null =
      workableInputMode === 'gps' && userLocation && !isWalkPaused
        ? { x: userLocation.mx, y: userLocation.my }
        : null;

    // 1. Live active non-workable draft metrics (Road / One-Sided Nala / NW Patch)
    let activeDraftDistanceM = 0;
    let activeDraftAreaHa = 0;
    if (workableWalkPhase === 'road_walk' && workableRoadDraftPts.length >= 1) {
      const lastDraft = workableRoadDraftPts[workableRoadDraftPts.length - 1];
      const liveDraftPts =
        gpsTip && Math.hypot(gpsTip.x - lastDraft.x, gpsTip.y - lastDraft.y) >= 0.5
          ? [...workableRoadDraftPts, gpsTip]
          : workableRoadDraftPts;

      activeDraftDistanceM = calculatePolylineLengthM(liveDraftPts);

      if (workableNonWorkingKind === 'patch') {
        activeDraftAreaHa = liveDraftPts.length >= 3 ? calcAreaHa(liveDraftPts) : 0;
      } else if (liveDraftPts.length >= 2) {
        const wM = workableNonWorkingKind === 'nala' ? workableNalaWidthM : workableRoadWidthM;
        const previewPoly =
          workableNonWorkingKind === 'nala'
            ? oneSidedBufferPolylineToPolygon(liveDraftPts, wM, workableNalaSide)
            : bufferPolylineToPolygon(liveDraftPts, wM);
        const polyHa = previewPoly.length >= 3 ? calcAreaHa(previewPoly) : 0;
        activeDraftAreaHa = polyHa > 0 ? polyHa : (activeDraftDistanceM * wM) / 10000;
      }
    }
    const totalSessionNonWorkingHa = rawRoadAreaHa + activeDraftAreaHa;

    // 2. Live outer workable polygon metrics (including live GPS tip when walking)
    const lastOuter = outerWalkPoints.length > 0 ? outerWalkPoints[outerWalkPoints.length - 1] : null;
    const liveOuterPts =
      workableWalkPhase === 'outer_walk' &&
      gpsTip &&
      lastOuter &&
      Math.hypot(gpsTip.x - lastOuter.x, gpsTip.y - lastOuter.y) >= 0.5
        ? [...outerWalkPoints, gpsTip]
        : outerWalkPoints;

    const liveOuterWalkedM = calculatePolylineLengthM(liveOuterPts);
    const currentGrossHa = liveOuterPts.length >= 3 ? calcAreaHa(liveOuterPts) : 0;
    const clippedRoadInsideHa =
      liveOuterPts.length >= 3 && sessionRoadItems.length > 0
        ? computeExactParentChildrenUnionAreaM2(
            liveOuterPts,
            sessionRoadItems.map((r) => r.pts)
          ) / 10000
        : 0;
    // Strictly count ONLY the portion of non-workable polygons inside the walked boundary polygon!
    // Never include outside road/nala/patch portions in area calculations or auto-end target.
    const effectiveRoadHa =
      workableWalkPhase === 'outer_walk'
        ? liveOuterPts.length >= 3
          ? clippedRoadInsideHa
          : 0
        : rawRoadAreaHa;
    const targetGrossHa = Number((targetWorkableHa + effectiveRoadHa).toFixed(2));
    const currentNetWorkableHa = Math.max(0, currentGrossHa - clippedRoadInsideHa);
    const remainingWorkableHa = Math.max(0, targetWorkableHa - currentNetWorkableHa);
    const remainingGrossHa = Math.max(0, targetGrossHa - currentGrossHa);
    const perimeterM = computePolygonPerimeterM(liveOuterPts, liveOuterPts.length >= 3);

    // Distance & Compass Bearing from current position back to the first boundary corner (Start Point)
    let distToStartM: number | null = null;
    let bearingToStartDeg: number | null = null;
    let bearingToStartCompass = '';
    if (outerWalkPoints.length >= 1) {
      const startPt = outerWalkPoints[0];
      const currentPos: Point2D =
        workableInputMode === 'gps' && userLocation
          ? { x: userLocation.mx, y: userLocation.my }
          : outerWalkPoints[outerWalkPoints.length - 1];
      distToStartM = Math.hypot(startPt.x - currentPos.x, startPt.y - currentPos.y);
      if (distToStartM >= 1) {
        bearingToStartDeg = calculateGeographicBearing(currentPos, startPt);
        bearingToStartCompass = bearingToCompass(bearingToStartDeg);
      }
    }

    return {
      active: workableWalkPhase !== 'idle',
      phase: workableWalkPhase,
      inputMode: workableInputMode,
      isPaused: isWalkPaused,
      wakeLockActive,
      targetWorkableHa,
      includeRoadFirst,
      activeNonWorkingKind: workableNonWorkingKind,
      roadWidthM: workableRoadWidthM,
      nalaWidthM: workableNalaWidthM,
      nalaSide: workableNalaSide,
      roadDraftPoints: workableRoadDraftPts,
      sessionRoadItems,
      roadAreaHa: Number(effectiveRoadHa.toFixed(2)),
      targetGrossHa,
      outerPoints: outerWalkPoints,
      currentGrossHa,
      remainingGrossHa,
      currentNetWorkableHa,
      remainingWorkableHa,
      perimeterM,
      activeDraftDistanceM,
      activeDraftAreaHa,
      totalSessionNonWorkingHa,
      liveOuterWalkedM,
      distToStartM,
      bearingToStartDeg,
      bearingToStartCompass,
      pillars: boundaryPillars
    };
  }, [
    workableWalkPhase,
    workableInputMode,
    isWalkPaused,
    wakeLockActive,
    targetWorkableHa,
    includeRoadFirst,
    workableNonWorkingKind,
    workableRoadWidthM,
    workableNalaWidthM,
    workableNalaSide,
    workableRoadDraftPts,
    sessionRoadItems,
    outerWalkPoints,
    userLocation,
    boundaryPillars
  ]);

  // Idempotent helper: starts Continuous Real-Time Offline-Safe Hardware GNSS Monitor
  const startLiveGpsMonitor = (overrideGeoRef?: GeoRef, overrideBoundary?: Point2D[]) => {
    if (
      isWatchingGPS ||
      liveMonitorWatchHandleRef.current !== null ||
      roadWatchHandleRef.current !== null ||
      workableWatchHandleRef.current !== null
    ) {
      return;
    }

    if (!('geolocation' in navigator)) {
      showToast(getTranslation('gps_not_supported', lang), 'error');
      return;
    }

    if (overrideGeoRef) geoRefLatestRef.current = overrideGeoRef;
    if (overrideBoundary) rawWorkingPointsLatestRef.current = overrideBoundary;

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const effectiveGate = isOffline && gpsAccuracyGateM <= 12 ? 25 : gpsAccuracyGateM;
    if (effectiveGate !== gpsAccuracyGateM) {
      setGpsAccuracyGateM(effectiveGate);
    }

    resetLiveMovementTrail();
    gpsMonitorOriginRef.current = null;
    gpsFilterRef.current.reset();
    gpsFilterRef.current.setMaxAccuracyGate(effectiveGate);
    setIsWatchingGPS(true);
    acquireScreenWakeLock();

    showToast(
      isOffline
        ? lang === 'mr'
          ? 'ऑफलाईन उपग्रह GPS सुरू (इंटरनेट आवश्यक नाही) — खुल्या आकाशाखाली 20–45 सेकंद थांबा...'
          : 'Offline Hardware GNSS started (No internet needed) — Hold under open sky 20–45s...'
        : getTranslation('gps_acquiring', lang),
      'info'
    );

    let announcedFirstFix = false;

    liveMonitorWatchHandleRef.current = startResilientGnssWatch({
      allowCachedBootstrap: true,
      onStatus: (st) => setGnssStatus(st),
      onPermissionDenied: () => {
        stopLiveMonitorWatch();
        showToast(getTranslation('gps_permission', lang), 'error');
      },
      onFix: (fix) => {
        if (liveMonitorWatchHandleRef.current === null) return;
        const activeGeo = geoRefLatestRef.current;
        const activeBoundary = rawWorkingPointsLatestRef.current;
        const lat = fix.lat;
        const lon = fix.lon;
        const rawAcc = fix.accuracy;
        if (!activeGeo.hasGeo && !gpsMonitorOriginRef.current) {
          gpsMonitorOriginRef.current = { lat, lon };
        }
        const originLat = activeGeo.hasGeo ? activeGeo.centerLat : gpsMonitorOriginRef.current?.lat ?? lat;
        const originLon = activeGeo.hasGeo ? activeGeo.centerLon : gpsMonitorOriginRef.current?.lon ?? lon;
        const rawPt = latLonToLocalMetersWGS84(lat, lon, originLat, originLon);

        const res = gpsFilterRef.current.processFix(
          rawPt,
          lat,
          lon,
          rawAcc,
          originLat,
          originLon,
          fix.timestamp,
          fix.altitude
        );
        setLiveGpsTelemetry(res.telemetry);

        const accRounded = Math.round(res.telemetry.ehpeM ?? res.telemetry.filteredAccuracyM ?? rawAcc);
        const mx = res.filteredPoint.x;
        const my = res.filteredPoint.y;
        updateLiveMovementLocation(
          { x: mx, y: my },
          res.filteredLatLon.lat,
          res.filteredLatLon.lon,
          accRounded,
          fix.heading,
          res.telemetry.speedMps
        );

        if (!activeGeo.hasGeo) {
          if (!announcedFirstFix && !fix.isCachedBootstrap) {
            announcedFirstFix = true;
            showToast(getTranslation('gps_fixed_no_map', lang), 'info');
          }
          return;
        }

        if (!announcedFirstFix && !fix.isCachedBootstrap) {
          announcedFirstFix = true;
          const inside = isPointInPolygon({ x: mx, y: my }, activeBoundary);
          if (inside) {
            showToast(getTranslation('gps_inside', lang).replace('{grid}', 'Current Cell'), 'success');
          } else {
            showToast(getTranslation('gps_outside', lang), 'info');
          }
        }
      }
    });
  };

  // Toggle Continuous Real-Time GPS Quality Monitor & Live Position Pin
  const handleToggleGPS = () => {
    if (isWatchingGPS || liveMonitorWatchHandleRef.current !== null) {
      stopLiveMonitorWatch();
      resetLiveMovementTrail();
      setUserLocation(null);
      setLiveGpsTelemetry((prev) => ({
        ...prev,
        isLocked: false,
        fixMode: 'none'
      }));
      showToast(getTranslation('gps_stopped', lang), 'info');
      return;
    }

    // If a field walk GPS stream is already running, let user know telemetry is already live
    if (roadWatchHandleRef.current !== null || workableWatchHandleRef.current !== null) {
      showToast(
        lang === 'mr'
          ? 'क्षेत्र GPS ट्रॅकिंग आधीच सुरू आहे.'
          : 'Field GPS tracking is already active.',
        'info'
      );
      return;
    }

    startLiveGpsMonitor();
  };

  // Geometric centroid of unrotated polygon boundary in ground meters
  const centroid = React.useMemo<Point2D>(() => {
    if (rawWorkingPoints.length === 0) return { x: 0, y: 0 };
    let rcx = 0;
    let rcy = 0;
    rawWorkingPoints.forEach((p) => {
      rcx += p.x;
      rcy += p.y;
    });
    return { x: rcx / rawWorkingPoints.length, y: rcy / rawWorkingPoints.length };
  }, [rawWorkingPoints]);

  // Rotated boundary points for visual drafting canvas (e.g. 5°, 10°)
  const rotatedWorkingPoints = React.useMemo(() => {
    if (rawWorkingPoints.length < 3 || rotationDeg === 0) return rawWorkingPoints;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return rawWorkingPoints.map((p) => ({
      x: Math.round(centroid.x + (p.x - centroid.x) * cos - (p.y - centroid.y) * sin),
      y: Math.round(centroid.y + (p.x - centroid.x) * sin + (p.y - centroid.y) * cos)
    }));
  }, [rawWorkingPoints, centroid, rotationDeg]);

  const rotatedNonWorkingPolygons = React.useMemo(() => {
    if (!rawNonWorkingPolygons || rawNonWorkingPolygons.length === 0 || rotationDeg === 0) return rawNonWorkingPolygons;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return rawNonWorkingPolygons.map((poly) =>
      poly.map((p) => ({
        x: Math.round(centroid.x + (p.x - centroid.x) * cos - (p.y - centroid.y) * sin),
        y: Math.round(centroid.y + (p.x - centroid.x) * sin + (p.y - centroid.y) * cos)
      }))
    );
  }, [rawNonWorkingPolygons, centroid, rotationDeg]);

  const screenSnapConfig = React.useMemo(() => {
    const isLandscape = orientation === 'landscape';
    const SF = 2;
    const CM_PX = 36 * SF;
    const MM_PX = 3.6 * SF;
    const canvasWidth = isLandscape ? 2138 : 1512;
    const graphW = isLandscape ? 28 * CM_PX : 20 * CM_PX;
    const graphH = isLandscape ? 18 * CM_PX : 26 * CM_PX;
    const left = Math.round((canvasWidth - graphW) / 2);
    const top = isLandscape ? 96 : 100;
    const mapBounds = {
      left,
      right: left + graphW,
      top,
      bottom: top + graphH
    };
    const primaryMajorStep = MM_PX * 20; // 144px
    const baseOrigin = {
      x: mapBounds.left + Math.round(((mapBounds.left + mapBounds.right) / 2 - mapBounds.left) / primaryMajorStep) * primaryMajorStep,
      y: mapBounds.top + Math.round(((mapBounds.top + mapBounds.bottom) / 2 - mapBounds.top) / primaryMajorStep) * primaryMajorStep
    };
    const ppm = activeScale.pxPer100m / 100;
    return {
      mapBounds,
      baseOrigin,
      panOffset: { x: 0, y: 0 },
      ppm,
      primaryMajorStep
    };
  }, [orientation, activeScale.pxPer100m]);

  // Compute baseline coordinates strictly inside polygon boundary & locked to Darkest Green intersection
  const baselineCoords = React.useMemo(() => {
    const pts = rotatedWorkingPoints;
    if (pts.length < 3) {
      return { p1: { x: -100, y: 0 }, p2: { x: 100, y: 0 }, origin0: { x: 0, y: 0 }, bearingDeg: 0 };
    }
    const res = computeStrictInteriorBaseline(pts, {
      option: baselineOption,
      manualOffset: manualBaselineOffset,
      bearingDeg,
      screenSnap: screenSnapConfig
    });
    return { p1: res.p1, p2: res.p2, origin0: res.origin0, bearingDeg: res.bearingDeg };
  }, [rotatedWorkingPoints, baselineOption, manualBaselineOffset, bearingDeg, screenSnapConfig]);

  const activeSectionDistanceM = React.useMemo(() => {
    if (rotatedWorkingPoints.length < 3 || !baselineCoords?.p1 || !baselineCoords?.p2) return undefined;
    const secs = computeSectionLines(
      baselineCoords.p1,
      baselineCoords.p2,
      rotatedWorkingPoints,
      gridWidthM,
      sectionLineOffset
    );
    return secs[0]?.distanceFromStart;
  }, [rotatedWorkingPoints, baselineCoords, gridWidthM, sectionLineOffset]);

  const handleStepSectionLine = useCallback(
    (deltaM: number) => {
      if (!baselineCoords?.p1 || !baselineCoords?.p2 || rotatedWorkingPoints.length < 3) return;
      setSectionLineOffset((prev) =>
        clampSectionLineOffset(baselineCoords.p1, baselineCoords.p2, gridWidthM, prev + deltaM)
      );
    },
    [baselineCoords, rotatedWorkingPoints.length, gridWidthM]
  );

  const handleResetSectionLineOffset = useCallback(() => {
    setSectionLineOffset(0);
    showToast('Section Line reset to Auto 50% midpoint.', 'info');
  }, [showToast]);

  // Compute grid statement table for Page 2 (with strictly calibrated area sum)
  const surveyGridResult = React.useMemo(() => {
    if (rotatedWorkingPoints.length < 3) {
      return { cells: [], pegs: [], gridLines: [], totalEstimatedPlants: 0, totalPlants: 0, totalAreaHa: 0 };
    }
    const targetHa = parseFloat(treatmentArea) || parseFloat(totalArea) || 0;
    const res = generateForestrySurveyGrid(
      rotatedWorkingPoints,
      baselineCoords.p1,
      baselineCoords.p2,
      activeScale.metersX,
      activeScale.metersY,
      plantSpacingM,
      targetTotalPlants,
      rotatedNonWorkingPolygons,
      isNonWorkingNil,
      targetHa > 0 ? targetHa : undefined,
      baselineCoords.origin0
    );

    // Attach true unrotated geographic ground coordinates to pegs
    const pegsWithGeo = res.pegs.map((peg) => ({
      ...peg,
      geoPointM: unrotatePoint(peg.pointM, centroid, rotationDeg)
    }));

    return {
      ...res,
      pegs: pegsWithGeo
    };
  }, [
    rotatedWorkingPoints,
    baselineCoords,
    activeScale.metersX,
    activeScale.metersY,
    plantSpacingM,
    targetTotalPlants,
    rotatedNonWorkingPolygons,
    isNonWorkingNil,
    treatmentArea,
    totalArea,
    centroid,
    rotationDeg
  ]);

  // Unrotated survey grid elements in real-world geographic ground meters for KML & PDF export
  const unrotatedSurveyGrid = React.useMemo(() => {
    if (rotationDeg === 0) return surveyGridResult;
    return {
      ...surveyGridResult,
      pegs: surveyGridResult.pegs.map((peg) => ({
        ...peg,
        pointM: unrotatePoint(peg.pointM, centroid, rotationDeg),
        geoPointM: unrotatePoint(peg.pointM, centroid, rotationDeg)
      })),
      gridLines: surveyGridResult.gridLines.map((line) => ({
        ...line,
        p1: unrotatePoint(line.p1, centroid, rotationDeg),
        p2: unrotatePoint(line.p2, centroid, rotationDeg)
      })),
      cells: surveyGridResult.cells.map((cell) => ({
        ...cell,
        centerM: unrotatePoint(cell.centerM, centroid, rotationDeg),
        cornersM: cell.cornersM ? cell.cornersM.map((p) => unrotatePoint(p, centroid, rotationDeg)) : undefined
      }))
    };
  }, [surveyGridResult, centroid, rotationDeg]);

  const gridStatementData: GridStatementData = React.useMemo(() => {
    return {
      title: treatmentTitle || getTranslation('treatment_map_title', lang),
      village,
      landIdentifierType,
      landIdentifierValue: landIdentifierValue || compartmentNo,
      division,
      subDivision,
      range,
      round,
      beat,
      totalArea,
      treatmentArea,
      nonTreatmentArea: isNonWorkingNil ? getTranslation('pdf_nil', lang) : nonTreatmentArea,
      plantSpacingM,
      targetTotalPlants,
      vanrakshak,
      vanpal,
      rfo,
      lang,
      date: formatToDMY(mapDate),
      cells: surveyGridResult.cells,
      pegs: unrotatedSurveyGrid.pegs,
      geoRef,
      gridWidthM: activeScale.metersX,
      gridHeightM: activeScale.metersY,
      polygonAreaHa: Number(totalArea || treatmentArea || '0'),
      isNonWorkingNil
    };
  }, [
    treatmentTitle,
    lang,
    village,
    landIdentifierType,
    landIdentifierValue,
    compartmentNo,
    division,
    subDivision,
    range,
    round,
    beat,
    totalArea,
    treatmentArea,
    isNonWorkingNil,
    nonTreatmentArea,
    plantSpacingM,
    targetTotalPlants,
    vanrakshak,
    vanpal,
    rfo,
    mapDate,
    surveyGridResult.cells,
    unrotatedSurveyGrid.pegs,
    geoRef,
    activeScale.metersX,
    activeScale.metersY
  ]);

  // Handle Strict PDF Export with 2-Page Field Report
  const handleExportPdf = (
    selectedFormat: 'auto' | 'a4' | 'a3',
    exportOrientation: Orientation,
    forceA4?: boolean
  ) => {
    if (!canvasRef.current || !registeredFrame) {
      showToast('Cannot export: Canvas frame not ready.', 'error');
      return;
    }

    try {
      handleDownloadPDF(canvasRef.current, {
        compartmentName: landIdentifierValue || compartmentNo,
        gridStatementData,
        strictFrame: registeredFrame,
        selectedFormat,
        orientation: exportOrientation,
        requiredWidthMm: registeredFrame.wMm,
        requiredHeightMm: registeredFrame.hMm,
        forceA4
      });

      showToast(
        `PDF downloaded (2-Page Field Report: Scaled Map + Grid Statement Table, strict ${activeScale.name} scale).`,
        'success'
      );
    } catch (err: any) {
      showToast(getTranslation('toast_pdf_error', lang) + err.message, 'error');
    }
  };

  // Build PDF Blob for Download or WhatsApp Share
  const buildPdfFile = async (
    selectedFormat: 'auto' | 'a4' | 'a3' = 'auto',
    exportOrientation: Orientation = orientation,
    forceA4?: boolean
  ): Promise<{ blob: Blob; filename: string } | null> => {
    if (!canvasRef.current || !registeredFrame || rawWorkingPoints.length < 3) {
      return null;
    }
    return buildPdfDocument(canvasRef.current, {
      compartmentName: landIdentifierValue || compartmentNo,
      gridStatementData,
      strictFrame: registeredFrame,
      selectedFormat,
      orientation: exportOrientation,
      requiredWidthMm: registeredFrame.wMm,
      requiredHeightMm: registeredFrame.hMm,
      forceA4
    });
  };

  // Build Georeferenced KMZ Blob for Download or WhatsApp Share
  const buildKmzFile = async (): Promise<{ blob: Blob; filename: string } | null> => {
    if (!canvasRef.current || rawWorkingPoints.length < 3) {
      return null;
    }

    const SF = 2;
    const CM_PX = 36 * SF;
    const isLandscape = orientation === 'landscape';
    const canvasWidth = isLandscape ? 2138 : 1512;
    const canvasHeight = isLandscape ? 1512 : 2138;
    const graphW = isLandscape ? 28 * CM_PX : 20 * CM_PX;
    const graphH = isLandscape ? 18 * CM_PX : 26 * CM_PX;
    const left = Math.round((canvasWidth - graphW) / 2);
    const top = isLandscape ? 96 : 100;
    const mapBounds = {
      left,
      right: left + graphW,
      top,
      bottom: top + graphH
    };

    let sumX = 0, sumY = 0;
    rawWorkingPoints.forEach((p) => {
      sumX += p.x;
      sumY += p.y;
    });
    const cMeters = { x: sumX / rawWorkingPoints.length, y: sumY / rawWorkingPoints.length };
    const PRIMARY_MAJOR_STEP = 3.6 * SF * 20; // 144px
    const baseOrigin = {
      x: mapBounds.left + Math.round(((mapBounds.left + mapBounds.right) / 2 - mapBounds.left) / PRIMARY_MAJOR_STEP) * PRIMARY_MAJOR_STEP,
      y: mapBounds.top + Math.round(((mapBounds.top + mapBounds.bottom) / 2 - mapBounds.top) / PRIMARY_MAJOR_STEP) * PRIMARY_MAJOR_STEP
    };
    const ppm = activeScale.pxPer100m / 100;
    const pixelToMeter = (px: number, py: number): Point2D => ({
      x: cMeters.x + (px - baseOrigin.x) / ppm,
      y: cMeters.y - (py - baseOrigin.y) / ppm
    });

    const unrotatedP1 = baselineCoords ? unrotatePoint(baselineCoords.p1, centroid, rotationDeg) : null;
    const unrotatedP2 = baselineCoords ? unrotatePoint(baselineCoords.p2, centroid, rotationDeg) : null;
    const unrotatedOrigin0 = baselineCoords?.origin0 ? unrotatePoint(baselineCoords.origin0, centroid, rotationDeg) : unrotatedP1;
    const trueBearingDeg = (unrotatedP1 && unrotatedP2)
      ? calculateGeographicBearing(unrotatedP1, unrotatedP2)
      : bearingDeg;

    const showSec = Boolean(showSectionLines || displayOptions.showSectionLines);
    const unrotatedSectionLines =
      showSec && baselineCoords?.p1 && baselineCoords?.p2
        ? computeSectionLines(
            baselineCoords.p1,
            baselineCoords.p2,
            rotatedWorkingPoints,
            gridWidthM,
            sectionLineOffset
          ).map((sec) => ({
            p1: unrotatePoint(sec.p1, centroid, rotationDeg),
            p2: unrotatePoint(sec.p2, centroid, rotationDeg)
          }))
        : [];

    const kmzBlob = await generateCoupeKmz({
      canvas: canvasRef.current,
      mapBounds,
      pixelToMeter,
      boundaryPoints: rawWorkingPoints,
      nonWorkingPolygons: rawNonWorkingPolygons,
      nonWorkingItems: nonWorkingFiles,
      isNonWorkingNil,
      baseline: (unrotatedP1 && unrotatedP2)
        ? { p1: unrotatedP1, p2: unrotatedP2, origin0: unrotatedOrigin0 || unrotatedP1, bearingDeg: trueBearingDeg }
        : null,
      sectionLines: unrotatedSectionLines,
      surveyGrid: unrotatedSurveyGrid,
      geoRef,
      features,
      pillars: boundaryPillars,
      layerVisibility: {
        showBoundary: displayOptions.showBoundary !== false,
        showNonWorking: displayOptions.showNonWorking !== false,
        showBaseline: displayOptions.showBaseline,
        showSectionLines: showSec,
        showGridLines: displayOptions.showGridLines,
        showLandmarks: displayOptions.showLandmarks !== false
      },
      metadata: {
        village,
        division,
        subDivision,
        range,
        round,
        beat,
        compartmentNo,
        landIdentifierType,
        landIdentifierValue: landIdentifierValue || compartmentNo,
        totalArea,
        treatmentArea,
        nonTreatmentArea: isNonWorkingNil ? 'निरंक' : nonTreatmentArea,
        treatmentTitle,
        treatmentType,
        date: mapDate,
        plantSpacingM,
        targetTotalPlants,
        scaleName: activeScale.name,
        lang,
        vanrakshak,
        vanpal,
        rfo
      },
      projectSnapshot: buildCurrentProjectSnapshot()
    });

    const safeName = (landIdentifierValue || compartmentNo || 'Coupe_Treatment_Map').replace(/[^\w\d-_]/g, '_');
    const filename = `${safeName}_GoogleEarth.kmz`;
    return { blob: kmzBlob, filename };
  };

  // Handle High-Precision Georeferenced KMZ Export for Google Earth (auto-archives to offline KMZ Folder)
  const handleExportKmz = async () => {
    if (!canvasRef.current || rawWorkingPoints.length < 3) {
      showToast(lang === 'mr' ? 'कृपया आधी कूप नकाशा KML लोड करा.' : 'Please load coupe KML map first.', 'error');
      return;
    }

    try {
      showToast(lang === 'mr' ? 'KMZ फाईल तयार होत आहे...' : 'Generating Google Earth KMZ with full layers...', 'info');
      const result = await buildKmzFile();
      if (!result) return;

      // Auto-archive exported coupe into the IndexedDB Saved KMZ & Field Folder so it can be re-opened or navigated offline anytime
      try {
        const snap = buildCurrentProjectSnapshot();
        const archived: SavedCoupeProject = {
          ...snap,
          source: 'app',
          kmzFileName: result.filename
        };
        const updated = await upsertSavedCoupeInDb(archived);
        setSavedCoupes(updated);
      } catch {
        // Non-fatal
      }

      await saveOrShareBlobFile(result.blob, result.filename, {
        title: result.filename,
        dialogTitle: 'Save or Share Google Earth KMZ'
      });

      showToast(
        lang === 'mr'
          ? `KMZ डाऊनलोड व KMZ फोल्डरमध्ये जतन झाले (${result.filename})`
          : `KMZ downloaded & archived in KMZ Folder (${result.filename})`,
        'success'
      );
    } catch (err: any) {
      showToast('KMZ Export Error: ' + err.message, 'error');
    }
  };

  // Landmark Feature Placed (records true unrotated GPS coordinates)
  const handlePlacedFeature = (featureId: string, pt: Point2D) => {
    const geoPt = unrotatePoint(pt, centroid, rotationDeg);
    const geo = meterToLatLon(geoPt, geoRef);
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id === featureId) {
          return {
            ...f,
            enabled: true,
            markers: [
              ...f.markers,
              {
                mx: pt.x,
                my: pt.y,
                lat: geo.lat,
                lon: geo.lon,
                label: f.label || f.id
              }
            ]
          };
        }
        return f;
      })
    );
    setActivePlaceFeatureId(null);
    showToast('Landmark symbol placed on map with GPS coordinates.', 'success');
  };

  // Add Landmark Marker at Manual GPS Coordinates (Requirement B)
  const handleAddMarkerAtGps = (featureId: string, lat: number, lon: number, label?: string) => {
    const ptM = latLonToMeter({ lat, lon }, geoRef);
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id === featureId) {
          return {
            ...f,
            enabled: true,
            markers: [
              ...f.markers,
              {
                mx: ptM.x,
                my: ptM.y,
                lat,
                lon,
                label: label || f.label || f.id
              }
            ]
          };
        }
        return f;
      })
    );
    showToast(
      lang === 'mr'
        ? `GPS नोंद यशस्वी: ${lat.toFixed(6)}, ${lon.toFixed(6)}`
        : `Added symbol marker at GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      'success'
    );
  };

  // Remove a specific landmark marker
  const handleRemoveFeatureMarker = (featureId: string, markerIdx: number) => {
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id === featureId) {
          return {
            ...f,
            markers: f.markers.filter((_, idx) => idx !== markerIdx)
          };
        }
        return f;
      })
    );
    showToast(lang === 'mr' ? 'खूण काढून टाकली.' : 'Marker removed.', 'info');
  };

  // Add Custom Feature
  const handleAddCustomFeature = (name: string, symbol: string, color: string) => {
    const newFeat: FeaturePreset = {
      id: `custom_${Date.now()}`,
      label: name,
      symbol,
      color,
      enabled: true,
      markers: [],
      custom: true
    };
    setFeatures((prev) => [...prev, newFeat]);
    showToast(getTranslation('custom_added', lang), 'success');
  };

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col forest-topo-bg text-[#10251c]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 lg:bottom-5 right-3 sm:right-5 z-50 flex items-center gap-2 bg-[#0b3326]/95 backdrop-blur-md border border-emerald-600/40 text-white px-4 py-2.5 rounded-2xl shadow-[0_8px_24px_rgba(7,38,27,0.28)] text-xs font-semibold animate-slideUp max-w-[90vw]">
          {toastType === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />}
          {toastType === 'error' && <AlertCircle className="w-4 h-4 text-rose-300 flex-shrink-0" />}
          {toastType === 'info' && <Info className="w-4 h-4 text-amber-300 flex-shrink-0" />}
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* Top Header (Brand + Language Selector Only) */}
      <Header
        currentLang={lang}
        onLanguageChange={handleLanguageChange}
        userLocationText={
          userLocation
            ? `GPS: ${userLocation.lat?.toFixed(5) || ''}, ${userLocation.lon?.toFixed(5) || ''} (±${userLocation.accuracy}m)`
            : null
        }
      />

      {/* Google Chrome Browser Recommended Banner (Desktop only) */}
      {!chromeNoticeDismissed && (
        <div className="hidden lg:flex flex-shrink-0 bg-emerald-900 text-emerald-50 px-4 py-1.5 text-xs items-center justify-between border-b border-emerald-800">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-3.5 h-3.5 flex-shrink-0 text-emerald-300" />
            <span className="font-medium truncate">
              {t('chrome_notice')}
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismissChromeNotice}
            className="px-2.5 py-0.5 bg-white/15 hover:bg-white/25 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer flex-shrink-0 ml-3"
          >
            <span>{t('chrome_got_it')}</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Treatment Workspace (60% Map Screen Top/Right, 40% User Working Screen Below/Left) */}
      <main className="max-w-[1600px] mx-auto w-full px-1.5 sm:px-3 py-1.5 sm:py-2.5 flex-1 min-h-0 flex flex-col lg:flex-row gap-2 sm:gap-3 overflow-hidden">
        {/* Sidebar Controls (40% Working Screen) */}
        <div
          className={`${
            isMobileMapExpanded ? 'hidden lg:flex' : 'flex'
          } order-2 lg:order-1 ${
            isMobileWorkExpanded ? 'flex-[3_1_0%]' : 'flex-[2_1_0%]'
          } lg:flex-[2_1_0%] lg:min-w-[360px] lg:max-w-[640px] min-h-0 flex-col w-full lg:h-full`}
        >
          <Sidebar
            lang={lang}
            wizardStep={wizardStep}
            onWizardStepChange={setWizardStep}
            onAutoPrepareMap={() => applySmartPresetToPoints(rawWorkingPoints, true)}
            hasSavedOfficerDefaults={hasSavedOfficerDefaults}
            savedOfficerSummary={getSavedOfficerSummary()}
            onSaveOfficerDefaults={handleSaveOfficerDefaults}
            onApplyOfficerDefaults={handleApplyOfficerDefaults}
            onClearOfficerDefaults={handleClearOfficerDefaults}
            isWatchingGPS={isWatchingGPS}
            onToggleGPS={handleToggleGPS}
            isWorkExpanded={isMobileWorkExpanded}
            onToggleWorkExpanded={() => setIsMobileWorkExpanded((v) => !v)}
            onUploadWorking={handleUploadWorking}
            nonWorkingFiles={nonWorkingFiles}
            onAddNonWorkingFiles={handleAddNonWorkingFiles}
            onRemoveNonWorkingFile={handleRemoveNonWorkingFile}
            onUpdateNalaSide={handleUpdateNonWorkingNalaSide}
            isRecordingRoad={isRecordingRoad}
            roadRecordMode={roadRecordMode}
            roadTrackKind={roadTrackKind}
            onRoadTrackKindChange={(kind) => {
              setRoadTrackKind(kind);
              if (kind === 'nala' && roadWidthM < 5) setRoadWidthM(6);
              if (kind === 'road' && roadWidthM > 10) setRoadWidthM(4);
            }}
            roadWidthM={roadWidthM}
            onRoadWidthChange={setRoadWidthM}
            roadNalaSide={roadNalaSide}
            onRoadNalaSideChange={setRoadNalaSide}
            roadTrackPoints={roadTrackPoints}
            roadGpsAccuracy={roadGpsAccuracy}
            onStartWalkRoad={handleStartWalkRoad}
            onStartMapRoad={handleStartMapRoad}
            onCaptureGpsRoadPoint={handleCaptureGpsRoadPoint}
            onUndoRoadPoint={handleUndoRoadPoint}
            onFinishRoadTrack={handleFinishRoadTrack}
            onCancelRoadTrack={handleCancelRoadTrack}
            liveWorkableWalk={liveWorkableWalk}
            liveGpsTelemetry={liveGpsTelemetry}
            gpsAccuracyGateM={gpsAccuracyGateM}
            onGpsAccuracyGateChange={handleUpdateGpsAccuracyGate}
            onOpenWorkableWalk={handleOpenWorkableWalk}
            onStartFieldWorkableSession={handleStartFieldWorkableSession}
            onUpdateSessionNalaConfig={(widthM, side) => {
              if (widthM > 0) setWorkableNalaWidthM(widthM);
              setWorkableNalaSide(side);
            }}
            onUpdateSessionRoadWidth={(widthM) => {
              if (widthM > 0) setWorkableRoadWidthM(widthM);
            }}
            onFinishSessionRoad={handleFinishSessionRoad}
            onRemoveSessionRoad={handleRemoveSessionRoad}
            onStartAnotherSessionRoad={handleStartAnotherSessionRoad}
            onProceedToOuterWalk={handleProceedToOuterWalk}
            onSwitchWorkableInputMode={handleSwitchWorkableInputMode}
            onPinAccurateGpsPoint={handlePinAccurateGpsPoint}
            onUndoWorkablePoint={handleUndoWorkablePoint}
            onFinishOuterWalkEarly={handleFinishOuterWalkEarly}
            onCancelWorkableWalk={handleCancelWorkableWalk}
            onTogglePauseWorkableWalk={handleTogglePauseWorkableWalk}
            onMarkBoundaryPillar={handleMarkBoundaryPillar}
            boundaryPillars={boundaryPillars}
            onRemoveBoundaryPillar={handleRemoveBoundaryPillar}
            recoverableWalkDraft={recoverableWalkDraft}
            onResumeWalkDraft={handleResumeWalkDraft}
            onDiscardWalkDraft={handleDiscardWalkDraft}
            savedCoupesCount={savedCoupes.length}
            onOpenSavedCoupes={() => setIsSavedCoupesOpen(true)}
            onExportProjectBackup={() => handleExportProjectBackup()}
            cachedTileCount={offlineTileStats.totalTiles}
            showOfflineBasemap={showOfflineBasemap}
            onOpenOfflineTiles={() => setIsOfflineTilesOpen(true)}
            isViewOnlyMode={isViewOnlyMode}
            onExitViewOnlyMode={() => {
              setIsViewOnlyMode(false);
              showToast(
                lang === 'mr' ? 'संपादन मोड सुरू झाला.' : 'Edit Mode unlocked.',
                'info'
              );
            }}
            workingFileName={workingFileName}
            nonWorkingFileName={nonWorkingFileName}
          isNonWorkingNil={isNonWorkingNil}
          onToggleNonWorkingNil={(val) => {
            setIsNonWorkingNil(val);
            if (val) {
              setRawNonWorkingPolygons([]);
              setNonWorkingFiles([]);
              setNonWorkingFileName('');
            }
          }}
          onLoadDemoMap={handleLoadDemoMap}
          onClearMap={handleClearMap}
          orientation={orientation}
          onOrientationChange={setOrientation}
          onAutoOptimizeA4={handleAutoOptimizeA4}
          a4FitInfo={a4FitInfo}
          onOpenPdfModal={() => setIsPdfModalOpen(true)}
          onOpenShareModal={() => setIsShareOpen(true)}
          onExportKmz={handleExportKmz}
          baselineOption={baselineOption}
          onBaselineOptionChange={handleBaselineOptionChange}
          bearingDeg={bearingDeg}
          activeInteractionMode={activeInteractionMode}
          onSetInteractionMode={setActiveInteractionMode}
          manualBaselineOffset={manualBaselineOffset}
          onUpdateBaselineOffset={setManualBaselineOffset}
          onNudgeBaseline={(dx, dy) => {
            const res = computeStrictInteriorBaseline(rotatedWorkingPoints, {
              option: baselineOption,
              manualOffset: { x: manualBaselineOffset.x + dx, y: manualBaselineOffset.y + dy },
              bearingDeg
            });
            setManualBaselineOffset(res.clampedOffset);
          }}
          onResetBaselineOffset={() => {
            const res = computeStrictInteriorBaseline(rotatedWorkingPoints, {
              option: baselineOption,
              manualOffset: { x: 0, y: 0 },
              bearingDeg
            });
            setManualBaselineOffset(res.clampedOffset);
            showToast('Base Line centered to optimal position inside polygon.', 'info');
          }}
          showSectionLines={showSectionLines}
          onToggleSectionLines={setShowSectionLines}
          sectionLineOffset={sectionLineOffset}
          onStepSectionLine={handleStepSectionLine}
          onResetSectionLineOffset={handleResetSectionLineOffset}
          sectionDistanceM={activeSectionDistanceM}
          rotationDeg={rotationDeg}
          onRotationChange={setRotationDeg}
          gridWidthM={gridWidthM}
          gridHeightM={gridHeightM}
          onGridSizeChange={(w, h) => {
            setGridWidthM(w);
            setGridHeightM(h);
            showToast(`Survey grid updated to ${w} × ${h} m`, 'success');
          }}
          scaleId={scaleId}
          onScaleChange={(id, cm, m) => {
            setScaleId(id);
            if (cm) setCustomScaleCm(cm);
            if (m) setCustomScaleM(m);
            showToast(`Scale updated: ${activeScale.name}`, 'info');
          }}
          customScaleCm={customScaleCm}
          customScaleM={customScaleM}
          treatmentTitle={treatmentTitle}
          onTreatmentTitleChange={setTreatmentTitle}
          village={village}
          onVillageChange={setVillage}
          landIdentifierType={landIdentifierType}
          onLandIdentifierTypeChange={setLandIdentifierType}
          landIdentifierValue={landIdentifierValue}
          onLandIdentifierValueChange={setLandIdentifierValue}
          plantSpacingM={plantSpacingM}
          onPlantSpacingChange={handlePlantSpacingChange}
          targetTotalPlants={targetTotalPlants}
          onTargetTotalPlantsChange={setTargetTotalPlants}
          division={division}
          onDivisionChange={setDivision}
          subDivision={subDivision}
          onSubDivisionChange={setSubDivision}
          range={range}
          onRangeChange={setRange}
          round={round}
          onRoundChange={setRound}
          beat={beat}
          onBeatChange={setBeat}
          compartmentNo={compartmentNo}
          onCompartmentNoChange={setCompartmentNo}
          mapDate={mapDate}
          onMapDateChange={setMapDate}
          totalArea={totalArea}
          treatmentArea={treatmentArea}
          nonTreatmentArea={nonTreatmentArea}
          areaSummary={areaSummary}
          treatmentType={treatmentType}
          onTreatmentTypeChange={handleTreatmentTypeChange}
          customTreatmentType={customTreatmentType}
          onCustomTreatmentTypeChange={setCustomTreatmentType}
          vanrakshak={vanrakshak}
          onVanrakshakChange={setVanrakshak}
          vanpal={vanpal}
          onVanpalChange={setVanpal}
          rfo={rfo}
          onRfoChange={setRfo}
          displayOptions={displayOptions}
          onToggleDisplayOption={(key, val) =>
            setDisplayOptions((prev) => ({ ...prev, [key]: val }))
          }
          features={features}
          onToggleFeature={(id, en) =>
            setFeatures((prev) =>
              prev.map((f) => (f.id === id ? { ...f, enabled: en } : f))
            )
          }
          onStartPlaceFeature={(id) => {
            setActivePlaceFeatureId(activePlaceFeatureId === id ? null : id);
            showToast('Click anywhere on the treatment map to place this landmark symbol.', 'info');
          }}
          activePlaceFeatureId={activePlaceFeatureId}
          onAddCustomFeature={handleAddCustomFeature}
          onAddMarkerAtGps={handleAddMarkerAtGps}
          onRemoveFeatureMarker={handleRemoveFeatureMarker}
          geoRef={geoRef}
          onClearMarkers={() => {
            setFeatures((prev) => prev.map((f) => ({ ...f, markers: [] })));
            showToast(getTranslation('markers_cleared', lang), 'info');
          }}
          legendPos={legendPos}
          onLegendPosChange={(pos) => {
            setLegendPos(pos);
            setLegendOffset({ x: 0, y: 0 });
          }}
          legendLayout={legendLayout}
          onLegendLayoutChange={(layout) => {
            setLegendLayout(layout);
            setLegendOffset({ x: 0, y: 0 });
          }}
          legendSize={legendSize}
          onLegendSizeChange={setLegendSize}
          onResetLegendPos={() => {
            setLegendOffset({ x: 0, y: 0 });
            showToast(lang === 'mr' ? 'सूची स्थान रीसेट झाले.' : 'Index Box position reset.', 'info');
          }}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          textColor={textColor}
          onTextColorChange={setTextColor}
        />
        </div>

        {/* Map Canvas Viewport (60% Map Screen on Mobile & Desktop) */}
        <div
          className={`order-1 lg:order-2 flex flex-col min-w-0 min-h-0 ${
            isMobileMapExpanded
              ? 'fixed inset-0 z-50 bg-[#071f17]/95 p-2 sm:p-4'
              : `${isMobileWorkExpanded ? 'flex-[2_1_0%]' : 'flex-[3_1_0%]'} lg:flex-[3_1_0%] lg:h-full`
          }`}
        >
          <MapCanvas
            lang={lang}
            canvasRef={canvasRef}
            orientation={orientation}
            activeScale={activeScale}
            gridWidthM={gridWidthM}
            gridHeightM={gridHeightM}
            rawWorkingPoints={rawWorkingPoints}
            rawNonWorkingPolygons={rawNonWorkingPolygons}
            nonWorkingItems={nonWorkingFiles}
            liveRoadTrack={{
              active: isRecordingRoad,
              mode: roadRecordMode,
              kind: roadTrackKind,
              widthM: roadWidthM,
              nalaSide: roadNalaSide,
              points: roadTrackPoints
            }}
            onMapTapRoadPoint={handleMapTapRoadPoint}
            liveWorkableWalk={liveWorkableWalk}
            liveGpsTelemetry={liveGpsTelemetry}
            onMapTapWorkablePoint={handleMapTapWorkablePoint}
            geoRef={geoRef}
            isNonWorkingNil={isNonWorkingNil}
            baselineOption={baselineOption}
            onBaselineOptionChange={handleBaselineOptionChange}
            manualBaselineOffset={manualBaselineOffset}
            onUpdateBaselineOffset={setManualBaselineOffset}
            onResetBaselineOffset={() => {
              setManualBaselineOffset({ x: 0, y: 0 });
              showToast('Base Line centered to default position.', 'info');
            }}
            showSectionLines={showSectionLines}
            onToggleSectionLines={setShowSectionLines}
            sectionLineOffset={sectionLineOffset}
            onStepSectionLine={handleStepSectionLine}
            onResetSectionLineOffset={handleResetSectionLineOffset}
            displayOptions={displayOptions}
            onToggleDisplayOption={(key, val) =>
              setDisplayOptions((prev) => ({ ...prev, [key]: val }))
            }
            features={features}
            boundaryPillars={boundaryPillars}
            activePlaceFeatureId={activePlaceFeatureId}
            onPlacedFeature={handlePlacedFeature}
            userLocation={userLocation}
            liveMovementTrail={liveMovementTrail}
            onSetUserLocation={setUserLocation}
            placeLocationMode={placeLocationMode}
            onSetPlaceLocationMode={setPlaceLocationMode}
            treatmentTitle={treatmentTitle}
            village={village}
            landIdentifierType={landIdentifierType}
            landIdentifierValue={landIdentifierValue}
            division={division}
            subDivision={subDivision}
            range={range}
            round={round}
            beat={beat}
            compartmentNo={compartmentNo}
            mapDate={mapDate}
            totalArea={totalArea}
            treatmentArea={treatmentArea}
            nonTreatmentArea={nonTreatmentArea}
            treatmentType={treatmentType}
            customTreatmentType={customTreatmentType}
            vanrakshak={vanrakshak}
            vanpal={vanpal}
            rfo={rfo}
            legendPos={legendPos}
            legendLayout={legendLayout}
            legendSize={legendSize}
            legendOffset={legendOffset}
            onUpdateLegendOffset={setLegendOffset}
            fontSize={fontSize}
            textColor={textColor}
            fontFamily={fontFamily}
            rotationDeg={rotationDeg}
            onRotationChange={setRotationDeg}
            activeInteractionMode={activeInteractionMode}
            onSetInteractionMode={setActiveInteractionMode}
            onRegisterFrame={handleRegisterFrame}
            onStatusChange={setHoverStatus}
            isMobileMapExpanded={isMobileMapExpanded}
            onToggleMobileMapExpanded={() => setIsMobileMapExpanded((v) => !v)}
            onOpenMapSetupStep={() => setWizardStep(3)}
            isWatchingGPS={isWatchingGPS}
            onToggleGPS={handleToggleGPS}
            gpsAccuracyGateM={gpsAccuracyGateM}
            onGpsAccuracyGateChange={handleUpdateGpsAccuracyGate}
            gnssStatus={gnssStatus}
            onRetryGpsLock={handleRetryGpsLock}
            navTarget={navTarget}
            onSelectNavTarget={(target) => {
              setNavTarget(target);
              if (target) {
                startLiveGpsMonitor();
              }
            }}
            onStartGpsForNav={() => startLiveGpsMonitor()}
            isViewOnlyMode={isViewOnlyMode}
            onExitViewOnlyMode={() => {
              setIsViewOnlyMode(false);
              showToast(
                lang === 'mr' ? 'संपादन मोड सुरू झाला.' : 'Edit Mode unlocked.',
                'info'
              );
            }}
            showOfflineBasemap={showOfflineBasemap}
            onToggleOfflineBasemap={setShowOfflineBasemap}
            offlineBasemapSource={offlineBasemapSource}
            onChangeOfflineBasemapSource={setOfflineBasemapSource}
            offlineBasemapOpacity={offlineBasemapOpacity}
            onChangeOfflineBasemapOpacity={setOfflineBasemapOpacity}
            offlineTilesVersion={offlineTilesVersion}
            cachedTileCount={offlineTileStats.totalTiles}
            onOpenOfflineTiles={() => setIsOfflineTilesOpen(true)}
          />
        </div>
      </main>

      {/* Offline Status & Precached Indicator */}
      <OfflineIndicator lang={lang} />

      {/* Automatic Browser Install App Prompt (hides once installed in standalone mode) */}
      <PWAInstallBanner lang={lang} />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        compartment={landIdentifierValue || compartmentNo}
        range={range}
        round={round}
        beat={beat}
        workArea={treatmentArea}
        onBuildPdf={() => buildPdfFile('auto', orientation)}
        onBuildKmz={buildKmzFile}
      />

      {/* PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        frame={registeredFrame}
        activeScale={activeScale}
        compartmentName={landIdentifierValue || compartmentNo}
        onExport={handleExportPdf}
        defaultOrientation={orientation}
        lang={lang}
      />

      {/* Saved KMZ & Field Inspection Folder Modal */}
      <SavedCoupesModal
        isOpen={isSavedCoupesOpen}
        onClose={() => setIsSavedCoupesOpen(false)}
        lang={lang}
        savedCoupes={savedCoupes}
        storageEngine={coupeStorageEngine}
        currentSuggestedName={
          [
            landIdentifierValue || compartmentNo ? `Comp ${landIdentifierValue || compartmentNo}` : '',
            village || beat
          ]
            .filter(Boolean)
            .join(' — ') || workingFileName
        }
        hasActiveBoundary={rawWorkingPoints.length >= 3}
        onSaveCurrent={handleSaveCurrentCoupe}
        onLoadCoupe={(p) => {
          setIsViewOnlyMode(false);
          handleLoadSavedCoupe(p);
        }}
        onInspectCoupe={handleInspectSavedCoupe}
        onDeleteCoupe={handleDeleteSavedCoupe}
        onExportKmzForCoupe={handleExportSavedCoupeKmz}
        onExportAllFolderZip={handleExportAllFolderZip}
        onExportBackup={handleExportProjectBackup}
        onImportBackupFile={handleImportProjectBackupFile}
      />

      {/* Pre-cache Offline Map Tiles Modal (IndexedDB Basemap Cache) */}
      <OfflineTilesModal
        isOpen={isOfflineTilesOpen}
        onClose={() => setIsOfflineTilesOpen(false)}
        lang={lang}
        geoRef={geoRef}
        rawWorkingPoints={rawWorkingPoints}
        userLocation={userLocation}
        suggestedRegionName={
          [
            landIdentifierValue || compartmentNo ? `Comp ${landIdentifierValue || compartmentNo}` : '',
            beat || village || range
          ]
            .filter(Boolean)
            .join(' · ')
        }
        showOfflineBasemap={showOfflineBasemap}
        onToggleOfflineBasemap={setShowOfflineBasemap}
        activeSource={offlineBasemapSource}
        onChangeSource={setOfflineBasemapSource}
        basemapOpacity={offlineBasemapOpacity}
        onChangeOpacity={setOfflineBasemapOpacity}
        onTilesUpdated={(stats) => {
          setOfflineTileStats(stats);
          setOfflineTilesVersion((v) => v + 1);
        }}
      />

      {/* Pre-Open 'Just View (Locked)' vs 'Edit Map' Dialog for Imported KML/KMZ Files */}
      <ImportModeDialog
        isOpen={Boolean(pendingImport)}
        lang={lang}
        preview={pendingImport?.preview || null}
        onChooseViewOnly={() => commitPendingImport('view')}
        onChooseEdit={() => commitPendingImport('edit')}
        onCancel={() => setPendingImport(null)}
      />

      {/* Footer (Desktop Studio Credit Bar) */}
      <footer className="hidden lg:flex flex-shrink-0 bg-white border-t border-slate-200 py-1.5 px-4 items-center justify-center gap-2 text-xs text-slate-500">
        <span>Forest Treatment Map Generator</span>
        <span aria-hidden="true">·</span>
        <span>
          Designed by <strong className="text-slate-800">Govind Mendhe</strong>, Forest Guard — Pench Tiger Reserve
        </span>
        <span aria-hidden="true">·</span>
        <a href="mailto:govind.mendhe@gmail.com" className="text-emerald-700 hover:underline font-mono text-[11px]">
          govind.mendhe@gmail.com
        </a>
      </footer>
    </div>
  );
}
