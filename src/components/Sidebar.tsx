/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Compass,
  FileCheck2,
  Tag,
  Plus,
  Trash2,
  Move,
  FileDown,
  Share2,
  Sprout,
  MapPin,
  Sparkles,
  Layers,
  Globe,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Save,
  Settings,
  AlertTriangle,
  Navigation,
  Route,
  Undo2,
  X,
  Crosshair,
  Radio,
  Pentagon,
  Lock,
  FolderUp,
  Pause,
  Play,
  Flag,
  FolderOpen,
  ShieldCheck,
  CheckCircle2,
  Sun,
  Map as MapIcon,
  PencilLine
} from 'lucide-react';
import { getTranslation } from '../utils/i18n';
import {
  FeaturePreset,
  Orientation,
  LandIdentifierType,
  NonWorkingAreaItem,
  NonWorkingFeatureKind,
  NalaSide,
  Point2D,
  LiveGpsTelemetry,
  LiveWorkableWalkState,
  BoundaryPillar
} from '../types/mapTypes';
import { ActiveWalkDraft } from '../utils/fieldTools';
import { bearingToCompass, calcAreaHa, calculatePolylineLengthM, parseGpsCoordinate, toDMS } from '../utils/geoUtils';
import { ParentChildAreaSummary } from '../utils/polygonAreaEngine';

export interface SidebarProps {
  lang: string;
  wizardStep?: 1 | 2 | 3 | 4;
  onWizardStepChange?: (step: 1 | 2 | 3 | 4) => void;
  onAutoPrepareMap?: () => void;
  hasSavedOfficerDefaults?: boolean;
  savedOfficerSummary?: string;
  onSaveOfficerDefaults?: () => void;
  onApplyOfficerDefaults?: () => void;
  onClearOfficerDefaults?: () => void;
  isWatchingGPS?: boolean;
  onToggleGPS?: () => void;
  isWorkExpanded?: boolean;
  onToggleWorkExpanded?: () => void;

  onAddMarkerAtGps?: (featureId: string, lat: number, lon: number, label?: string) => void;
  onRemoveFeatureMarker?: (featureId: string, markerIdx: number) => void;
  geoRef?: any;
  onUploadWorking: (file: File) => void;
  onUploadNonWorking?: (file: File) => void;
  nonWorkingFiles: NonWorkingAreaItem[];
  onAddNonWorkingFiles: (files: FileList | File[]) => void;
  onRemoveNonWorkingFile: (id: string) => void;
  onUpdateNalaSide?: (id: string, side: NalaSide) => void;
  isRecordingRoad?: boolean;
  roadRecordMode?: 'gps' | 'map' | null;
  roadTrackKind?: NonWorkingFeatureKind;
  onRoadTrackKindChange?: (kind: NonWorkingFeatureKind) => void;
  roadWidthM?: number;
  onRoadWidthChange?: (w: number) => void;
  roadNalaSide?: NalaSide;
  onRoadNalaSideChange?: (side: NalaSide) => void;
  roadTrackPoints?: Point2D[];
  roadGpsAccuracy?: number | null;
  onStartWalkRoad?: (widthM: number) => void;
  onStartMapRoad?: (widthM: number) => void;
  onCaptureGpsRoadPoint?: () => void;
  onUndoRoadPoint?: () => void;
  onFinishRoadTrack?: (name?: string) => void;
  onCancelRoadTrack?: () => void;
  liveWorkableWalk?: LiveWorkableWalkState;
  liveGpsTelemetry?: LiveGpsTelemetry;
  gpsAccuracyGateM?: number;
  onGpsAccuracyGateChange?: (gateM: number) => void;
  onOpenWorkableWalk?: () => void;
  onStartFieldWorkableSession?: (config: {
    targetWorkableHa: number;
    includeRoadFirst: boolean;
    inputMode: 'gps' | 'map';
    roadWidthM: number;
    initialKind?: NonWorkingFeatureKind;
    nalaWidthM?: number;
    nalaSide?: NalaSide;
  }) => void;
  onUpdateSessionNalaConfig?: (widthM: number, side: NalaSide) => void;
  onUpdateSessionRoadWidth?: (widthM: number) => void;
  onFinishSessionRoad?: (name?: string) => void;
  onRemoveSessionRoad?: (id: string) => void;
  onStartAnotherSessionRoad?: (
    mode: 'gps' | 'map',
    widthM?: number,
    kind?: NonWorkingFeatureKind,
    side?: NalaSide
  ) => void;
  onProceedToOuterWalk?: (mode: 'gps' | 'map') => void;
  onSwitchWorkableInputMode?: (mode: 'gps' | 'map') => void;
  onPinAccurateGpsPoint?: () => void;
  onUndoWorkablePoint?: () => void;
  onFinishOuterWalkEarly?: () => void;
  onCancelWorkableWalk?: () => void;
  onTogglePauseWorkableWalk?: () => void;
  onMarkBoundaryPillar?: () => void;
  boundaryPillars?: BoundaryPillar[];
  onRemoveBoundaryPillar?: (id: string) => void;
  recoverableWalkDraft?: ActiveWalkDraft | null;
  onResumeWalkDraft?: () => void;
  onDiscardWalkDraft?: () => void;
  savedCoupesCount?: number;
  onOpenSavedCoupes?: () => void;
  onExportProjectBackup?: () => void;
  cachedTileCount?: number;
  showOfflineBasemap?: boolean;
  onOpenOfflineTiles?: () => void;
  isViewOnlyMode?: boolean;
  onExitViewOnlyMode?: () => void;
  workingFileName: string;
  nonWorkingFileName: string;
  isNonWorkingNil: boolean;
  onToggleNonWorkingNil: (val: boolean) => void;
  onLoadDemoMap: () => void;
  onClearMap: () => void;

  // Export & Page Options (Step 4)
  orientation: Orientation;
  onOrientationChange: (o: Orientation) => void;
  onAutoOptimizeA4: () => void;
  a4FitInfo?: {
    recommendedOrientation: 'portrait' | 'landscape';
    fitsInA4: boolean;
    fitsInPortrait?: boolean;
    fitsInLandscape?: boolean;
    spaceSavedPercent?: number;
    reason: string;
  };
  onOpenPdfModal: () => void;
  onOpenShareModal: () => void;
  onExportKmz?: () => void;

  // Baseline & Section Lines (Step 3)
  baselineOption: 'horizontal' | 'vertical' | 'grid_parallel' | 'longest_axis';
  onBaselineOptionChange: (opt: 'horizontal' | 'vertical' | 'longest_axis' | 'grid_parallel') => void;
  bearingDeg: number;
  activeInteractionMode: 'pan' | 'baseline' | 'place' | 'rotate';
  onSetInteractionMode: (mode: 'pan' | 'baseline' | 'place' | 'rotate') => void;
  manualBaselineOffset: Point2D;
  onUpdateBaselineOffset: (offset: Point2D) => void;
  onNudgeBaseline?: (dx: number, dy: number) => void;
  onResetBaselineOffset: () => void;
  showSectionLines: boolean;
  onToggleSectionLines: (val: boolean) => void;
  sectionLineOffset?: number;
  onStepSectionLine?: (deltaM: number) => void;
  onResetSectionLineOffset?: () => void;
  sectionDistanceM?: number;
  rotationDeg?: number;
  onRotationChange?: (deg: number) => void;

  // Admin Details (Step 2)
  treatmentTitle: string;
  onTreatmentTitleChange: (v: string) => void;
  village: string;
  onVillageChange: (v: string) => void;
  landIdentifierType: LandIdentifierType;
  onLandIdentifierTypeChange: (v: LandIdentifierType) => void;
  landIdentifierValue: string;
  onLandIdentifierValueChange: (v: string) => void;
  plantSpacingM: number;
  onPlantSpacingChange: (v: number) => void;
  targetTotalPlants: number;
  onTargetTotalPlantsChange: (v: number) => void;
  division: string;
  onDivisionChange: (v: string) => void;
  subDivision: string;
  onSubDivisionChange: (v: string) => void;
  range: string;
  onRangeChange: (v: string) => void;
  round: string;
  onRoundChange: (v: string) => void;
  beat: string;
  onBeatChange: (v: string) => void;
  compartmentNo: string;
  onCompartmentNoChange: (v: string) => void;
  mapDate: string;
  onMapDateChange: (v: string) => void;
  totalArea: string;
  treatmentArea: string;
  onTreatmentAreaChange?: (v: string) => void;
  nonTreatmentArea: string;
  onNonTreatmentAreaChange?: (v: string) => void;
  areaSummary?: ParentChildAreaSummary;
  treatmentType: string;
  onTreatmentTypeChange: (v: string) => void;
  customTreatmentType: string;
  onCustomTreatmentTypeChange: (v: string) => void;

  // Signatures
  vanrakshak: string;
  onVanrakshakChange: (v: string) => void;
  vanpal: string;
  onVanpalChange: (v: string) => void;
  rfo: string;
  onRfoChange: (v: string) => void;

  // Grid & Scale
  gridWidthM: number;
  gridHeightM: number;
  onGridSizeChange: (w: number, h: number) => void;
  scaleId: string;
  onScaleChange: (scaleId: string, customCm?: number, customM?: number) => void;
  customScaleCm: number;
  customScaleM: number;

  // Legend & Features
  features: FeaturePreset[];
  onToggleFeature: (id: string, enabled: boolean) => void;
  onStartPlaceFeature: (id: string) => void;
  activePlaceFeatureId: string | null;
  onAddCustomFeature: (name: string, symbol: string, color: string) => void;
  onClearMarkers: () => void;
  legendPos: string;
  onLegendPosChange: (pos: string) => void;
  legendLayout?: 'box' | 'strip';
  onLegendLayoutChange?: (layout: 'box' | 'strip') => void;
  legendSize?: 'compact' | 'standard';
  onLegendSizeChange?: (size: 'compact' | 'standard') => void;
  onResetLegendPos: () => void;

  // Display Options & Styling
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
    combineTitleLines?: boolean;
  };
  onToggleDisplayOption: (key: string, val: boolean) => void;
  fontSize: string;
  onFontSizeChange: (v: string) => void;
  textColor: string;
  onTextColorChange: (v: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { lang } = props;
  const t = (key: string) => getTranslation(key, lang);

  const [internalStep, setInternalStep] = useState<1 | 2 | 3 | 4>(1);
  const activeStep = props.wizardStep ?? internalStep;
  const setStep = (step: 1 | 2 | 3 | 4) => {
    if (props.onWizardStepChange) {
      props.onWizardStepChange(step);
    } else {
      setInternalStep(step);
    }
  };

  // Step 1 Input Mode: 1st option Manual (KML upload), 2nd option On-Field (GPS track & walking road)
  const [step1Mode, setStep1Mode] = useState<'manual' | 'field'>('manual');
  // Step 1 On-Field 2-Phase Switcher (show only the active walk phase to avoid bulky stacked cards)
  const [fieldPhase, setFieldPhase] = useState<'non_workable' | 'boundary'>('non_workable');

  useEffect(() => {
    if (props.liveWorkableWalk?.active || props.isRecordingRoad) {
      setStep1Mode('field');
    }
    if (props.isRecordingRoad) {
      setFieldPhase('non_workable');
    } else if (props.liveWorkableWalk?.active && props.liveWorkableWalk.phase === 'outer_walk') {
      setFieldPhase('boundary');
    }
  }, [props.liveWorkableWalk?.active, props.liveWorkableWalk?.phase, props.isRecordingRoad]);

  // Collapsible accordions so screens stay light and easy to manage on mobile
  const [showOfficeDefaultsPanel, setShowOfficeDefaultsPanel] = useState<boolean>(
    !props.hasSavedOfficerDefaults
  );
  type Step3SectionKey = 'baseline' | 'section' | 'landmarks' | 'legend' | 'advanced';
  const [openStep3Section, setOpenStep3Section] = useState<Step3SectionKey | null>('baseline');
  const toggleStep3Section = (key: Step3SectionKey) =>
    setOpenStep3Section((prev) => (prev === key ? null : key));

  useEffect(() => {
    if (props.activePlaceFeatureId) {
      setOpenStep3Section('landmarks');
    } else if (props.activeInteractionMode === 'baseline' || props.activeInteractionMode === 'rotate') {
      setOpenStep3Section('baseline');
    }
  }, [props.activePlaceFeatureId, props.activeInteractionMode]);

  const workFileInputRef = useRef<HTMLInputElement>(null);
  const nonWorkFileInputRef = useRef<HTMLInputElement>(null);

  const [customFeatureName, setCustomFeatureName] = useState('');
  const [fieldTargetHaInput, setFieldTargetHaInput] = useState<string>('20');
  const liveTrackKind: NonWorkingFeatureKind = props.roadTrackKind || 'road';
  const liveRoadLengthM =
    props.roadTrackPoints && props.roadTrackPoints.length >= 2
      ? calculatePolylineLengthM(props.roadTrackPoints)
      : 0;
  const liveRoadEstHa =
    liveTrackKind === 'patch'
      ? props.roadTrackPoints && props.roadTrackPoints.length >= 3
        ? calcAreaHa(props.roadTrackPoints)
        : 0
      : (liveRoadLengthM * (props.roadWidthM ?? 4)) / 10000;
  const walkState = props.liveWorkableWalk;
  const [isManualGrid, setIsManualGrid] = useState(
    !(props.gridWidthM === 100 && props.gridHeightM === 100) &&
      !(props.gridWidthM === 50 && props.gridHeightM === 50) &&
      !(props.gridWidthM === 200 && props.gridHeightM === 200)
  );

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFeatureName.trim()) return;
    props.onAddCustomFeature(customFeatureName.trim(), 'custom', '#0f172a');
    setCustomFeatureName('');
  };

  // Manual GPS Coordinate Entry State (DMS & Decimal Lat/Long)
  const [gpsCoordMode, setGpsCoordMode] = useState<'decimal' | 'dms'>('dms');
  const [gpsLatInput, setGpsLatInput] = useState('');
  const [gpsLonInput, setGpsLonInput] = useState('');
  const [dmsLatDeg, setDmsLatDeg] = useState('');
  const [dmsLatMin, setDmsLatMin] = useState('');
  const [dmsLatSec, setDmsLatSec] = useState('');
  const [dmsLatHemi, setDmsLatHemi] = useState<'N' | 'S'>('N');
  const [dmsLonDeg, setDmsLonDeg] = useState('');
  const [dmsLonMin, setDmsLonMin] = useState('');
  const [dmsLonSec, setDmsLonSec] = useState('');
  const [dmsLonHemi, setDmsLonHemi] = useState<'E' | 'W'>('E');
  const [gpsFeatureId, setGpsFeatureId] = useState(props.features[0]?.id || 'road');
  const [gpsLabelInput, setGpsLabelInput] = useState('');
  const [gpsInputError, setGpsInputError] = useState('');

  const selectedFeature = props.features.find((f) => f.id === gpsFeatureId) || props.features[0];
  const getFeatureName = (f: FeaturePreset) => (f.key ? t(f.key) : f.label || f.id);

  const handleManualGpsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGpsInputError('');

    let parsedLat: number | null = null;
    let parsedLon: number | null = null;

    if (gpsCoordMode === 'dms') {
      const ld = parseFloat(dmsLatDeg);
      const lm = dmsLatMin.trim() === '' ? 0 : parseFloat(dmsLatMin);
      const ls = dmsLatSec.trim() === '' ? 0 : parseFloat(dmsLatSec);
      const od = parseFloat(dmsLonDeg);
      const om = dmsLonMin.trim() === '' ? 0 : parseFloat(dmsLonMin);
      const os = dmsLonSec.trim() === '' ? 0 : parseFloat(dmsLonSec);

      if (
        isNaN(ld) ||
        isNaN(lm) ||
        isNaN(ls) ||
        ld < 0 ||
        ld > 90 ||
        lm < 0 ||
        lm >= 60 ||
        ls < 0 ||
        ls >= 60
      ) {
        setGpsInputError(
          lang === 'mr'
            ? 'अवैध अक्षवृत्त DMS मूल्य. उदा: 21° 08\' 45.2" N'
            : 'Invalid Latitude DMS values (e.g. 21° 08\' 45.2" N).'
        );
        return;
      }
      if (
        isNaN(od) ||
        isNaN(om) ||
        isNaN(os) ||
        od < 0 ||
        od > 180 ||
        om < 0 ||
        om >= 60 ||
        os < 0 ||
        os >= 60
      ) {
        setGpsInputError(
          lang === 'mr'
            ? 'अवैध रेखावृत्त DMS मूल्य. उदा: 79° 13\' 53.2" E'
            : 'Invalid Longitude DMS values (e.g. 79° 13\' 53.2" E).'
        );
        return;
      }

      parsedLat = (ld + lm / 60 + ls / 3600) * (dmsLatHemi === 'S' ? -1 : 1);
      parsedLon = (od + om / 60 + os / 3600) * (dmsLonHemi === 'W' ? -1 : 1);
    } else {
      if (!gpsLatInput.trim() || !gpsLonInput.trim()) {
        setGpsInputError(
          lang === 'mr'
            ? 'कृपया अक्षवृत्त (Lat) आणि रेखावृत्त (Lon) दोन्ही भरा.'
            : 'Please enter both Latitude and Longitude.'
        );
        return;
      }
      parsedLat = parseGpsCoordinate(gpsLatInput, true);
      parsedLon = parseGpsCoordinate(gpsLonInput, false);
      if (parsedLat === null) {
        setGpsInputError(
          lang === 'mr'
            ? 'अवैध अक्षवृत्त (Lat). उदा: 21.145889 किंवा 21°08\'45.2" N'
            : 'Invalid Latitude coordinate (e.g. 21.145889 or 21°08\'45" N).'
        );
        return;
      }
      if (parsedLon === null) {
        setGpsInputError(
          lang === 'mr'
            ? 'अवैध रेखावृत्त (Lon). उदा: 79.231450 किंवा 79°13\'53.2" E'
            : 'Invalid Longitude coordinate (e.g. 79.231450 or 79°13\'53" E).'
        );
        return;
      }
    }

    props.onAddMarkerAtGps?.(
      selectedFeature ? selectedFeature.id : gpsFeatureId,
      parsedLat,
      parsedLon,
      gpsLabelInput.trim() || undefined
    );
    setGpsLatInput('');
    setGpsLonInput('');
    setDmsLatDeg('');
    setDmsLatMin('');
    setDmsLatSec('');
    setDmsLonDeg('');
    setDmsLonMin('');
    setDmsLonSec('');
    setGpsLabelInput('');
  };

  const totalNonWorkingSumHa = props.nonWorkingFiles.reduce((sum, item) => sum + item.areaHa, 0);
  const clippedNonWorkingUnionHa =
    props.areaSummary !== undefined ? props.areaSummary.clippedNonWorkingUnionHa : totalNonWorkingSumHa;
  const overlapDeduplicatedHa = props.areaSummary?.overlapDeduplicatedHa ?? 0;
  const outsideParentExcludedHa = props.areaSummary?.outsideParentExcludedHa ?? 0;
  const hasClippingAdjustment = overlapDeduplicatedHa > 0.005 || outsideParentExcludedHa > 0.005;
  const step1Done = Boolean(props.workingFileName);
  const step2Done = Boolean(
    props.village.trim() && (props.landIdentifierValue.trim() || props.compartmentNo.trim())
  );

  const steps: { id: 1 | 2 | 3 | 4; label: string; short: string; done?: boolean }[] = [
    {
      id: 1,
      label: lang === 'mr' ? 'KML व क्षेत्रफळ' : 'KML & Area',
      short: lang === 'mr' ? '1. KML' : '1. KML',
      done: step1Done
    },
    {
      id: 2,
      label: lang === 'mr' ? 'कूप व बीट माहिती' : 'Beat & Plot',
      short: lang === 'mr' ? '2. प्लॉट' : '2. Plot',
      done: step2Done
    },
    {
      id: 3,
      label: lang === 'mr' ? 'नकाशा सेटअप' : 'Map Setup',
      short: lang === 'mr' ? '3. सेटअप' : '3. Setup'
    },
    {
      id: 4,
      label: lang === 'mr' ? 'PDF, KMZ व शेअर' : 'Export & Share',
      short: lang === 'mr' ? '4. प्रिंट' : '4. Export'
    }
  ];

  const tileCardClass =
    'bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] p-3 sm:p-3.5';
  const inputClass =
    'w-full min-h-[40px] px-3 py-1.5 bg-[#f5f9f6] focus:bg-white border border-[#cde0d3] focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none rounded-xl text-[13px] font-medium text-[#10251c] placeholder:text-[#6f8a7b] transition';
  const compactInputClass =
    'w-full min-h-[38px] px-2.5 py-1.5 bg-[#f5f9f6] focus:bg-white border border-[#cde0d3] focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 focus:outline-none rounded-xl text-xs font-medium text-[#10251c] placeholder:text-[#6f8a7b] transition';
  const hasLoadedBoundary = Boolean(props.workingFileName || parseFloat(props.totalArea || '0') > 0);
  const totalLandmarksCount = props.features.reduce((sum, f) => sum + f.markers.length, 0);
  const legendPosShortLabel =
    props.legendLayout === 'strip'
      ? lang === 'mr'
        ? 'तळ पट्टी'
        : 'Bottom Strip'
      : props.legendPos === 'top_left'
      ? lang === 'mr'
        ? 'वर डावी'
        : 'Top Left'
      : props.legendPos === 'bottom_left'
      ? lang === 'mr'
        ? 'खाली डावी'
        : 'Bottom Left'
      : props.legendPos === 'bottom_right'
      ? lang === 'mr'
        ? 'खाली उजवी'
        : 'Bottom Right'
      : lang === 'mr'
      ? 'वर उजवी'
      : 'Top Right';
  const scaleShortLabel =
    props.scaleId === '1cm_100m'
      ? '1:10K'
      : props.scaleId === '1cm_50m'
      ? '1:2.5K'
      : props.scaleId === '1cm_200m'
      ? '1:20K'
      : '1:5K';

  return (
    <aside className="w-full h-full min-h-0 flex flex-col bg-[#f3f8f4] rounded-2xl border border-[#cde0d3] overflow-hidden text-xs shadow-[0_4px_18px_rgba(11,53,39,0.08)]">
      {/* Segmented 4-Step Wizard Navigation Header */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-b border-[#d9e7dd] px-2.5 sm:px-3 pt-2 pb-2 space-y-2">
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#e8f1eb] rounded-xl border border-[#cfe0d4]">
          {steps.map((s) => {
            const isActive = activeStep === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`min-h-[36px] sm:min-h-[38px] px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap truncate text-[11px] sm:text-xs ${
                  isActive
                    ? 'bg-gradient-to-b from-[#0f5132] to-[#0b3e26] text-white shadow-[0_2px_6px_rgba(11,62,38,0.26)] font-bold'
                    : s.done
                    ? 'bg-white text-[#0f5132] border border-[#c6decb] shadow-[0_1px_2px_rgba(11,53,39,0.05)] font-semibold hover:bg-[#f2f9f4]'
                    : 'text-[#3c594b] hover:text-[#10251c] hover:bg-white/75 font-medium'
                }`}
              >
                {s.done && !isActive && <Check className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />}
                <span className="truncate">{s.short}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-0.5 gap-2">
          <span className="font-bold text-[#10251c] text-[13px] truncate min-w-0">
            {steps[activeStep - 1].label}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            {props.onOpenOfflineTiles && (
              <button
                type="button"
                onClick={props.onOpenOfflineTiles}
                className={`min-h-[30px] px-2 py-1 rounded-xl border font-semibold text-[11px] flex items-center gap-1 cursor-pointer shrink-0 transition whitespace-nowrap ${
                  props.showOfflineBasemap
                    ? 'bg-[#0f5132] text-white border-[#0f5132]'
                    : 'bg-[#f1f8f3] hover:bg-[#e1f1e7] border-[#c8e0d0] text-[#0c452a]'
                }`}
                title={
                  lang === 'mr'
                    ? 'ऑफलाईन उपग्रह नकाशा टाईल्स कॅश करा (Pre-cache Map Tiles)'
                    : 'Pre-cache Offline Map Tiles (IndexedDB)'
                }
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {lang === 'mr' ? 'ऑफलाईन नकाशा' : 'Offline Map'}
                </span>
                {(props.cachedTileCount ?? 0) > 0 && (
                  <span
                    className={`font-mono text-[10px] font-bold px-1 rounded-md tabular-nums ${
                      props.showOfflineBasemap
                        ? 'bg-white/20 text-white'
                        : 'bg-[#0f5132]/12 text-[#0f5132]'
                    }`}
                  >
                    {props.cachedTileCount}
                  </span>
                )}
              </button>
            )}

            {props.onOpenSavedCoupes && (
              <button
                type="button"
                onClick={props.onOpenSavedCoupes}
                className="min-h-[30px] px-2.5 py-1 rounded-xl bg-[#eaf5ee] hover:bg-[#dcf0e3] border border-[#c2decb] text-[#0c452a] font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 transition whitespace-nowrap"
                title={lang === 'mr' ? 'जतन केलेले KMZ व कूप फोल्डर (इम्पोर्ट व तपासणी)' : 'Saved KMZ & Field Folder (Import & Inspect)'}
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#0f5132]" />
                <span>{lang === 'mr' ? 'KMZ फोल्डर' : 'KMZ Folder'}</span>
                {(props.savedCoupesCount ?? 0) > 0 && (
                  <span className="font-mono text-[10px] font-bold bg-[#0f5132] text-white px-1.5 rounded-md tabular-nums">
                    {props.savedCoupesCount}
                  </span>
                )}
              </button>
            )}

            {props.onToggleWorkExpanded && (
              <button
                type="button"
                onClick={props.onToggleWorkExpanded}
                className="lg:hidden min-h-[30px] px-2.5 py-1 rounded-xl bg-[#ebf3ed] hover:bg-[#deebe2] border border-[#d0e2d6] text-[#1d4231] font-semibold text-[11px] flex items-center gap-1 cursor-pointer shrink-0 transition"
                title={props.isWorkExpanded ? 'Reset to 40%' : 'Expand working panel'}
              >
                {props.isWorkExpanded ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>40%</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>{lang === 'mr' ? 'मोठे करा' : 'Expand'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* View-Only Locked Mode Notice Strip */}
        {props.isViewOnlyMode && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#e9f5ee] border border-[#b4d8c2] text-[#0b3b24]">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-3.5 h-3.5 text-[#0f5132] shrink-0" />
              <span className="text-[11.5px] font-semibold truncate">
                {lang === 'mr'
                  ? 'फक्त पहा मोड (नकाशा ड्रॅग लॉक आहे)'
                  : 'View-Only Mode (Map drag locked)'}
              </span>
            </div>
            {props.onExitViewOnlyMode && (
              <button
                type="button"
                onClick={props.onExitViewOnlyMode}
                className="min-h-[28px] px-2.5 rounded-lg bg-[#0f5132] hover:bg-[#0b3d25] text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition whitespace-nowrap"
              >
                <PencilLine className="w-3 h-3" />
                <span>{lang === 'mr' ? 'संपादन सुरू करा' : 'Unlock Edit'}</span>
              </button>
            )}
          </div>
        )}

        {/* Single Pinned Compact Area Summary Strip (replaces duplicate area cards across steps) */}
        {hasLoadedBoundary && (
          <div className="grid grid-cols-3 divide-x divide-[#cfe0d4] bg-[#f4f9f6] border border-[#d4e3d9] rounded-xl overflow-hidden text-center">
            <div className="px-2 py-1.5">
              <span className="block text-[9.5px] font-semibold text-[#557363] uppercase tracking-wide truncate">
                {lang === 'mr' ? 'एकूण' : 'Gross'}
              </span>
              <span className="block font-mono font-bold text-[#10251c] text-xs tabular-nums truncate">
                {props.totalArea || '0.00'} <span className="text-[10px] font-medium text-[#648172]">Ha</span>
              </span>
            </div>
            <div className="px-2 py-1.5 bg-[#fdfaf3]/80">
              <span className="block text-[9.5px] font-semibold text-amber-800/80 uppercase tracking-wide truncate">
                {lang === 'mr' ? 'अनुपचार' : 'Non-Work'}
              </span>
              <span className="block font-mono font-bold text-amber-800 text-xs tabular-nums truncate">
                {props.isNonWorkingNil ? t('pdf_nil') : `${props.nonTreatmentArea || '0.00'} Ha`}
              </span>
            </div>
            <div className="px-2 py-1.5 bg-[#eaf7ef]/90">
              <span className="block text-[9.5px] font-semibold text-[#0f5132] uppercase tracking-wide truncate">
                {lang === 'mr' ? 'उपचार (Net)' : 'Net Work'}
              </span>
              <span className="block font-mono font-bold text-[#082f1d] text-xs tabular-nums truncate">
                {props.treatmentArea || '0.00'} <span className="text-[10px] font-semibold text-[#176440]">Ha</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Step Workspace (Forest Modular Tile Canvas) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-2.5 sm:p-3 space-y-2.5 bg-[#ebf3ed]/90">
        {/* ============================================================
            STEP 1: KML & AREA (Modular Tile Layout)
           ============================================================ */}
        {activeStep === 1 && (
          <div className="space-y-3 animate-fadeIn">
            {/* Hidden file inputs kept mounted across mode switches */}
            <input
              ref={workFileInputRef}
              type="file"
              accept=".kml,.kmz,.gpx"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) props.onUploadWorking(e.target.files[0]);
              }}
            />
            <input
              ref={nonWorkFileInputRef}
              type="file"
              accept=".kml,.kmz,.gpx"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  props.onAddNonWorkingFiles(e.target.files);
                }
              }}
            />

            {/* Exact Geometry Sync Notice (shown only when clipping/overlap adjustment occurred) */}
            {hasClippingAdjustment && !props.isNonWorkingNil && (
              <div className="px-3 py-2 rounded-xl bg-white/95 border border-[#c5decb] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[10.5px] text-[#0f452b] font-medium flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-700 shrink-0" />
                <span className="truncate">
                  {lang === 'mr'
                    ? `अचूक भौमितिक समायोजन: ${
                        outsideParentExcludedHa > 0.005
                          ? `${outsideParentExcludedHa.toFixed(2)} Ha सीमेबाहेर वगळले`
                          : ''
                      }${
                        outsideParentExcludedHa > 0.005 && overlapDeduplicatedHa > 0.005 ? ' · ' : ''
                      }${
                        overlapDeduplicatedHa > 0.005
                          ? `${overlapDeduplicatedHa.toFixed(2)} Ha दुहेरी ओव्हरलॅप काढले`
                          : ''
                      }`
                    : `Exact geometry sync: ${
                        outsideParentExcludedHa > 0.005
                          ? `${outsideParentExcludedHa.toFixed(2)} Ha outside parent clipped`
                          : ''
                      }${
                        outsideParentExcludedHa > 0.005 && overlapDeduplicatedHa > 0.005 ? ' · ' : ''
                      }${
                        overlapDeduplicatedHa > 0.005
                          ? `${overlapDeduplicatedHa.toFixed(2)} Ha overlap deduplicated`
                          : ''
                      }`}
                </span>
              </div>
            )}

            {/* Crash-Proof Interrupted GPS Walk Auto-Recovery Banner */}
            {props.recoverableWalkDraft && !walkState?.active && (
              <div className="bg-amber-50 border border-amber-300/90 rounded-2xl p-3 shadow-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>
                        {lang === 'mr'
                          ? 'अपूर्ण GPS सर्व्हे सापडला (Auto-Saved)'
                          : 'Interrupted Field Walk Found (Auto-Saved)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 mt-0.5 font-mono">
                      {props.recoverableWalkDraft.outerWalkPoints.length > 0
                        ? `${props.recoverableWalkDraft.outerWalkPoints.length} ${lang === 'mr' ? 'कोपरे' : 'corners'}`
                        : `${props.recoverableWalkDraft.roadDraftPoints.length} ${lang === 'mr' ? 'रस्ता बिंदू' : 'road pts'}`}
                      {' · '}
                      {lang === 'mr' ? 'लक्ष्य' : 'Target'} {props.recoverableWalkDraft.targetWorkableHa} Ha
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => props.onResumeWalkDraft?.()}
                    className="h-8 px-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{lang === 'mr' ? 'पुढे सुरू करा' : 'Resume Walk'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDiscardWalkDraft?.()}
                    className="h-8 px-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{lang === 'mr' ? 'रद्द करा' : 'Discard'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2-Option Step 1 Mode Switcher: 1st Manual (KML Uploads), 2nd On-Field (GPS Track & Walking Road) */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06)] p-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setStep1Mode('manual')}
                  className={`min-h-[54px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-left transition-all cursor-pointer ${
                    step1Mode === 'manual'
                      ? 'bg-gradient-to-b from-[#0f5132] to-[#0b3e26] text-white shadow-[0_2px_6px_rgba(11,62,38,0.24)]'
                      : 'bg-[#f2f7f4] hover:bg-[#e6f0ea] text-[#1e3d2f]'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      step1Mode === 'manual' ? 'bg-white/15 text-emerald-100' : 'bg-white border border-[#cde0d3] text-[#0f5132]'
                    }`}
                  >
                    <FolderUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-bold text-xs leading-tight truncate">
                      {lang === 'mr' ? '१. मॅन्युअल (KML)' : '1. Manual (KML)'}
                    </span>
                    <span
                      className={`block text-[10.5px] leading-tight mt-0.5 truncate ${
                        step1Mode === 'manual' ? 'text-emerald-100/90' : 'text-[#527060]'
                      }`}
                    >
                      {lang === 'mr' ? 'KML / KMZ अपलोड' : 'Upload KML / KMZ'}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStep1Mode('field')}
                  className={`min-h-[54px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-left transition-all cursor-pointer ${
                    step1Mode === 'field'
                      ? 'bg-gradient-to-b from-[#0f5132] to-[#0b3e26] text-white shadow-[0_2px_6px_rgba(11,62,38,0.24)]'
                      : 'bg-[#f2f7f4] hover:bg-[#e6f0ea] text-[#1e3d2f]'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      step1Mode === 'field' ? 'bg-white/15 text-emerald-100' : 'bg-white border border-[#cde0d3] text-[#0f5132]'
                    }`}
                  >
                    <Navigation className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-bold text-xs leading-tight truncate">
                      {lang === 'mr' ? '२. शेतात (On-Field)' : '2. On-Field (GPS)'}
                    </span>
                    <span
                      className={`block text-[10.5px] leading-tight mt-0.5 truncate ${
                        step1Mode === 'field' ? 'text-emerald-100/90' : 'text-[#527060]'
                      }`}
                    >
                      {lang === 'mr' ? 'GPS ट्रॅक व रस्ता चाला' : 'GPS Track & Walk Road'}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* ============================================================
                OPTION 1: MANUAL MODE — Upload Workable KML, Non-Workable KML, Auto-A4
               ============================================================ */}
            {step1Mode === 'manual' && (
              <div className="space-y-3.5 animate-fadeIn">
                {/* 2-Column Primary Modular Action Tiles */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => workFileInputRef.current?.click()}
                    className="bg-gradient-to-br from-[#0f5132] to-[#093621] hover:from-[#125d3a] hover:to-[#0b4027] active:scale-[0.99] text-white rounded-2xl p-3.5 flex flex-col items-start justify-between gap-2.5 text-left cursor-pointer transition min-h-[100px] shadow-[0_4px_12px_rgba(11,62,38,0.24)] border border-[#196843]/40"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/15 flex items-center justify-center">
                      <Upload className="w-4.5 h-4.5 text-emerald-100" />
                    </div>
                    <div className="w-full min-w-0">
                      <span className="block font-bold text-[13px] leading-snug truncate">
                        {props.workingFileName ? t('replace_kml') : t('select_kml_btn')}
                      </span>
                      <span className="block text-[11px] text-emerald-100/85 truncate mt-0.5">
                        {props.workingFileName ? props.workingFileName : 'KML · KMZ · GPX'}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={props.onAutoPrepareMap}
                    className="bg-white/98 hover:bg-[#f4faf6] active:scale-[0.99] border border-[#d4e3d9] hover:border-emerald-400 rounded-2xl p-3.5 flex flex-col items-start justify-between gap-2.5 text-left cursor-pointer transition min-h-[100px] shadow-[0_2px_10px_rgba(11,53,39,0.06)]"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#eaf6ee] border border-[#c6e1cf] flex items-center justify-center">
                      <Sparkles className="w-4.5 h-4.5 text-[#0f5132]" />
                    </div>
                    <div className="w-full min-w-0">
                      <span className="block font-bold text-[#10251c] text-[13px] leading-snug truncate">
                        {lang === 'mr' ? 'Auto-Setup A4' : 'Auto-Prepare A4'}
                      </span>
                      <span className="block text-[11px] text-[#527060] truncate mt-0.5">
                        {lang === 'mr' ? 'दिशा · बेस · ५०% विभाग' : 'Orient · Base · 50% Cut'}
                      </span>
                    </div>
                  </button>
                </div>

                {/* Non-Working Boundary KML Upload Card */}
                <div className={`${tileCardClass} space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-[#10251c] text-[13px] truncate">
                        {t('non_working_boundary_kml')}
                      </h3>
                      <p className="text-[11px] text-[#527060] truncate">
                        {lang === 'mr'
                          ? 'अनुपचार क्षेत्र KML अपलोड करा (आपोआप मुख्य सीमेत कापले जाईल)'
                          : 'Upload non-workable KMLs (auto-clipped to parent boundary)'}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none px-2.5 py-1.5 rounded-xl bg-[#f3f8f5] border border-[#d4e3d9] shrink-0">
                      <input
                        type="checkbox"
                        checked={props.isNonWorkingNil}
                        onChange={(e) => props.onToggleNonWorkingNil(e.target.checked)}
                        className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-800 text-[11.5px]">{t('non_working_nil')}</span>
                    </label>
                  </div>

                  {!props.isNonWorkingNil && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => nonWorkFileInputRef.current?.click()}
                        className="w-full min-h-[44px] py-2.5 px-3 bg-slate-50 hover:bg-amber-50/60 text-slate-800 border border-dashed border-slate-300 hover:border-amber-400 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer text-xs"
                      >
                        <Plus className="w-4 h-4 text-amber-700" />
                        <span>{t('add_non_working_btn')}</span>
                      </button>

                      {props.nonWorkingFiles.length > 0 && (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto">
                          {props.nonWorkingFiles.map((item, idx) => {
                            const isRoad = item.category === 'road';
                            const isNala = item.category === 'nala';
                            const metrics = props.areaSummary?.childrenById[item.id];
                            const effectiveHa = metrics ? metrics.clippedInsideParentHa : item.areaHa;
                            const outsideHa = metrics ? metrics.outsideParentHa : 0;
                            const canFlipNalaSide =
                              isNala && Boolean(item.centerlinePts && item.centerlinePts.length >= 2);
                            const currentNalaSide: NalaSide = item.nalaSide || 'right';
                            return (
                              <div
                                key={item.id}
                                className={`px-3 py-2 border rounded-xl text-xs space-y-1.5 ${
                                  isNala
                                    ? 'bg-sky-50/90 border-sky-200/90'
                                    : isRoad
                                    ? 'bg-slate-100/90 border-slate-300/90'
                                    : 'bg-slate-50/90 border-slate-200/80'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 truncate min-w-0">
                                    {isRoad ? (
                                      <span
                                        className="w-5 h-2.5 bg-slate-500 border-y border-slate-900 flex items-center justify-center shrink-0 rounded-[2px]"
                                        title={lang === 'mr' ? 'रस्ता (अनुपचार)' : 'Road (Non-Workable)'}
                                      >
                                        <span className="w-3.5 border-t border-dashed border-white" />
                                      </span>
                                    ) : isNala ? (
                                      <span
                                        className="w-5 h-2.5 bg-sky-300/80 border border-sky-600 flex items-center justify-center shrink-0 rounded-[2px]"
                                        title={lang === 'mr' ? 'नाला (अनुपचार)' : 'Nala (Non-Workable)'}
                                      >
                                        <span className="w-3.5 border-t border-sky-800" />
                                      </span>
                                    ) : (
                                      <span
                                        className="w-3.5 h-3.5 rounded-[3px] bg-amber-100 border border-amber-500 shrink-0"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <div className="truncate min-w-0">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-semibold text-slate-800 truncate">
                                          #{idx + 1} {item.fileName}
                                        </span>
                                        <span className={`${isNala ? 'text-sky-800' : 'text-amber-800'} font-mono font-bold tabular-nums shrink-0`}>
                                          {effectiveHa.toFixed(2)} Ha
                                        </span>
                                      </div>
                                      {((isRoad || isNala) && item.roadWidthM && item.roadLengthM) || outsideHa > 0.005 ? (
                                        <span className="block text-[10px] font-mono text-slate-500 tabular-nums truncate">
                                          {(isRoad || isNala) && item.roadWidthM && item.roadLengthM
                                            ? `${item.roadLengthM}m × ${item.roadWidthM}m${
                                                isNala && item.nalaSide
                                                  ? ` · ${item.nalaSide === 'left' ? (lang === 'mr' ? 'डावी' : 'Left') : (lang === 'mr' ? 'उजवी' : 'Right')}`
                                                  : ''
                                              }`
                                            : ''}
                                          {(isRoad || isNala) && item.roadWidthM && item.roadLengthM && outsideHa > 0.005
                                            ? ' · '
                                            : ''}
                                          {outsideHa > 0.005
                                            ? lang === 'mr'
                                              ? `${outsideHa.toFixed(2)} Ha सीमेबाहेर`
                                              : `${outsideHa.toFixed(2)} Ha outside parent`
                                            : ''}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => props.onRemoveNonWorkingFile(item.id)}
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                                    title={lang === 'mr' ? 'काढा' : 'Remove item'}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                {canFlipNalaSide && props.onUpdateNalaSide && (
                                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-sky-200/70">
                                    <span className="text-[10.5px] font-semibold text-sky-900 shrink-0">
                                      {lang === 'mr' ? 'नाला बाजू:' : 'Nala Buffer Side:'}
                                    </span>
                                    <div className="grid grid-cols-2 gap-1 w-36 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => props.onUpdateNalaSide?.(item.id, 'left')}
                                        className={`h-6.5 px-1.5 rounded-lg font-bold text-[10.5px] border transition cursor-pointer ${
                                          currentNalaSide === 'left'
                                            ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                            : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-100/70'
                                        }`}
                                      >
                                        {lang === 'mr' ? '⬅ डावी' : '⬅ Left'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => props.onUpdateNalaSide?.(item.id, 'right')}
                                        className={`h-6.5 px-1.5 rounded-lg font-bold text-[10.5px] border transition cursor-pointer ${
                                          currentNalaSide === 'right'
                                            ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                            : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-100/70'
                                        }`}
                                      >
                                        {lang === 'mr' ? 'उजवी ➡' : 'Right ➡'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-700 pt-1 px-1 tabular-nums">
                            <span className="text-slate-500 font-sans font-semibold">
                              {lang === 'mr' ? 'अचूक वजावट (Union):' : 'Exact Subtracted Union:'}
                            </span>
                            <span className="text-amber-900">
                              {clippedNonWorkingUnionHa.toFixed(2)} Ha
                              {overlapDeduplicatedHa > 0.005
                                ? ` (-${overlapDeduplicatedHa.toFixed(2)} overlap)`
                                : ''}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Office Quick Jump Strip (when boundary is loaded) */}
                {hasLoadedBoundary && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="min-h-[38px] px-3 bg-[#eaf6ee] hover:bg-[#dcf0e3] border border-[#c6e1cf] text-[#0f5132] rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <span>{lang === 'mr' ? 'कूप तपशील भरा' : 'Fill Plot Info'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="min-h-[38px] px-3 bg-gradient-to-b from-[#0f5132] to-[#0b3e26] hover:from-[#125d3a] hover:to-[#0c452a] text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_6px_rgba(11,62,38,0.2)] transition cursor-pointer"
                    >
                      <span>{lang === 'mr' ? 'थेट प्रिंट / PDF' : 'Print / Export'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Quick Utility Tiles */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={props.onLoadDemoMap}
                    className="min-h-[40px] px-3 bg-white/98 hover:bg-[#f4faf6] active:scale-[0.99] border border-[#d4e3d9] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[#173628] rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    {t('load_demo_map')}
                  </button>
                  <button
                    type="button"
                    onClick={props.onClearMap}
                    className="min-h-[40px] px-3 bg-white/98 hover:bg-rose-50 active:scale-[0.99] border border-[#d4e3d9] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[#4f6d5e] hover:text-rose-700 hover:border-rose-200 rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    {t('clear_map')}
                  </button>
                </div>
              </div>
            )}

            {/* ============================================================
                OPTION 2: ON-FIELD MODE — Clean 2-Phase Field Switcher
                Phase A: Non-Workable Area First (Road / Nala / Patch)
                Phase B: Workable Area Outer Boundary Walk
               ============================================================ */}
            {step1Mode === 'field' && (
              <div className="space-y-2.5 animate-fadeIn">
                {/* Clean 2-Phase Toggle so only the active walk card is shown */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#e3efe7] rounded-xl border border-[#cde0d3]">
                  <button
                    type="button"
                    onClick={() => setFieldPhase('non_workable')}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      fieldPhase === 'non_workable'
                        ? 'bg-white text-[#10251c] shadow-[0_1px_4px_rgba(11,53,39,0.10)] border border-[#cde0d3]'
                        : 'text-[#3c594b] hover:text-[#10251c]'
                    }`}
                  >
                    <Route className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                    <span className="truncate">{lang === 'mr' ? 'अ. रस्ता / नाला' : 'A. Road / Nala'}</span>
                    {!props.isNonWorkingNil && props.nonWorkingFiles.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 font-mono text-[10px] font-bold tabular-nums">
                        {props.nonWorkingFiles.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFieldPhase('boundary')}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      fieldPhase === 'boundary'
                        ? 'bg-white text-[#0f5132] shadow-[0_1px_4px_rgba(11,53,39,0.10)] border border-[#cde0d3]'
                        : 'text-[#3c594b] hover:text-[#10251c]'
                    }`}
                  >
                    <Pentagon className="w-3.5 h-3.5 shrink-0 text-[#0f5132]" />
                    <span className="truncate">{lang === 'mr' ? 'ब. बाह्य सीमा' : 'B. Boundary'}</span>
                    {walkState?.active && walkState.phase === 'outer_walk' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                    )}
                  </button>
                </div>

                {/* ======================================================
                    CARD 1: PHASE A — NON-WORKABLE AREA (WALK FIRST, IF ANY)
                   ====================================================== */}
                {fieldPhase === 'non_workable' && (
                <div className={`${tileCardClass} space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                          liveTrackKind === 'nala'
                            ? 'bg-sky-700 border-sky-800'
                            : liveTrackKind === 'patch'
                            ? 'bg-amber-600 border-amber-700'
                            : 'bg-slate-800 border-slate-900'
                        }`}
                        aria-hidden="true"
                      >
                        <Route className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-[13px] truncate">
                          {lang === 'mr' ? '१. अनुपचार क्षेत्र (आधी मोजा)' : '1. Non-Workable Area (First)'}
                        </h3>
                        <p className="text-[11px] text-slate-500 truncate">
                          {lang === 'mr'
                            ? 'रस्ता, नाला किंवा अनुपचार असल्यास आधी चाला'
                            : 'Walk Road, Nala, or Patch first — or skip to Boundary'}
                        </p>
                      </div>
                    </div>
                    {!props.isNonWorkingNil && props.nonWorkingFiles.length > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 font-mono text-[10.5px] font-bold text-amber-900 shrink-0 tabular-nums">
                        {props.nonWorkingFiles.length}
                      </span>
                    )}
                  </div>

                  {/* 3-Tab Selector: Road | Nala | Non-Workable */}
                  <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200/80">
                    {[
                      { id: 'road' as const, en: 'Road', mr: 'रस्ता' },
                      { id: 'nala' as const, en: 'Nala', mr: 'नाला' },
                      { id: 'patch' as const, en: 'Non-Workable', mr: 'अनुपचार' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={props.isRecordingRoad || walkState?.phase === 'outer_walk'}
                        onClick={() => props.onRoadTrackKindChange?.(opt.id)}
                        className={`py-2 px-1 rounded-lg text-[11.5px] font-bold transition cursor-pointer disabled:opacity-50 ${
                          liveTrackKind === opt.id
                            ? opt.id === 'nala'
                              ? 'bg-sky-700 text-white shadow-2xs'
                              : opt.id === 'patch'
                              ? 'bg-amber-600 text-white shadow-2xs'
                              : 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {lang === 'mr' ? opt.mr : opt.en}
                      </button>
                    ))}
                  </div>

                  {/* OPTION 1: WIDTH (for Road & Nala) + SIDE (for Nala) */}
                  {liveTrackKind === 'road' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-bold text-slate-800">
                          {lang === 'mr' ? 'रस्त्याची रुंदी (मीटर)' : 'Road Width (m)'}
                        </span>
                        <div className="flex items-center bg-slate-50 focus-within:bg-white border border-slate-300 rounded-xl px-2.5 h-9 w-24 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                          <input
                            type="number"
                            min="0.5"
                            max="50"
                            step="0.5"
                            value={props.roadWidthM ?? 4}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) props.onRoadWidthChange?.(val);
                            }}
                            className="w-full text-sm font-mono font-bold text-slate-900 bg-transparent focus:outline-none tabular-nums"
                          />
                          <span className="text-xs font-semibold text-slate-500 ml-1">m</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[3, 4, 5, 6].map((w) => {
                          const isSelected = Number(props.roadWidthM ?? 4) === w;
                          return (
                            <button
                              key={w}
                              type="button"
                              onClick={() => props.onRoadWidthChange?.(w)}
                              className={`h-8 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer tabular-nums ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {w}m
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {liveTrackKind === 'nala' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-bold text-slate-800">
                          {lang === 'mr' ? 'नाल्याची रुंदी (मीटर)' : 'Nala Width (m)'}
                        </span>
                        <div className="flex items-center bg-slate-50 focus-within:bg-white border border-sky-300 rounded-xl px-2.5 h-9 w-24 focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-100">
                          <input
                            type="number"
                            min="0.5"
                            max="100"
                            step="0.5"
                            value={props.roadWidthM ?? 6}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) props.onRoadWidthChange?.(val);
                            }}
                            className="w-full text-sm font-mono font-bold text-slate-900 bg-transparent focus:outline-none tabular-nums"
                          />
                          <span className="text-xs font-semibold text-slate-500 ml-1">m</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[4, 6, 8, 12].map((w) => {
                          const isSelected = Number(props.roadWidthM ?? 6) === w;
                          return (
                            <button
                              key={w}
                              type="button"
                              onClick={() => props.onRoadWidthChange?.(w)}
                              className={`h-8 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer tabular-nums ${
                                isSelected
                                  ? 'bg-sky-700 text-white border-sky-700'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-sky-50'
                              }`}
                            >
                              {w}m
                            </button>
                          );
                        })}
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[11px] font-semibold text-sky-950">
                          {lang === 'mr'
                            ? 'एका काठाने चाला — नाला कोणत्या बाजूला आहे?'
                            : 'Walk one bank — which side is the Nala?'}
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => props.onRoadNalaSideChange?.('left')}
                            className={`h-9 rounded-xl font-bold text-xs border cursor-pointer transition ${
                              (props.roadNalaSide || 'right') === 'left'
                                ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                : 'bg-sky-50/60 text-sky-900 border-sky-200 hover:bg-sky-100/70'
                            }`}
                          >
                            {lang === 'mr' ? '⬅ डावी बाजू (Left)' : '⬅ Left Side'}
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onRoadNalaSideChange?.('right')}
                            className={`h-9 rounded-xl font-bold text-xs border cursor-pointer transition ${
                              (props.roadNalaSide || 'right') === 'right'
                                ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                : 'bg-sky-50/60 text-sky-900 border-sky-200 hover:bg-sky-100/70'
                            }`}
                          >
                            {lang === 'mr' ? 'उजवी बाजू (Right) ➡' : 'Right Side ➡'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {liveTrackKind === 'patch' && (
                    <p className="text-[11px] text-amber-950 bg-amber-50/80 border border-amber-200/90 rounded-xl px-2.5 py-2 leading-snug">
                      {lang === 'mr'
                        ? 'खडक, तळे किंवा पडीक भागाच्या कडेने चाला आणि पूर्ण झाल्यावर थांबवा दाबा.'
                        : 'Walk around the non-workable patch (rock, pond, barren) and tap Stop when done.'}
                    </p>
                  )}

                  {/* OPTION 2 & 3: START WALK + STOP WALK (Always crystal clear!) */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={props.isRecordingRoad || walkState?.phase === 'outer_walk'}
                      onClick={() =>
                        props.onStartWalkRoad?.(props.roadWidthM ?? (liveTrackKind === 'nala' ? 6 : 4))
                      }
                      className={`min-h-[44px] px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-45 disabled:cursor-not-allowed ${
                        liveTrackKind === 'nala'
                          ? 'bg-sky-700 hover:bg-sky-800 text-white'
                          : liveTrackKind === 'patch'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      }`}
                    >
                      <Play className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {liveTrackKind === 'nala'
                          ? lang === 'mr'
                            ? 'नाला चालणे सुरू'
                            : 'Start Nala Walk'
                          : liveTrackKind === 'patch'
                          ? lang === 'mr'
                            ? 'अनुपचार सुरू'
                            : 'Start NW Walk'
                          : lang === 'mr'
                          ? 'रस्ता चालणे सुरू'
                          : 'Start Road Walk'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={!props.isRecordingRoad}
                      onClick={() => props.onFinishRoadTrack?.()}
                      className="min-h-[44px] px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs disabled:shadow-none disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {liveTrackKind === 'nala'
                          ? lang === 'mr'
                            ? 'नाला थांबवा'
                            : 'Stop Nala Walk'
                          : liveTrackKind === 'patch'
                          ? lang === 'mr'
                            ? 'अनुपचार थांबवा'
                            : 'Stop NW Walk'
                          : lang === 'mr'
                          ? 'रस्ता थांबवा'
                          : 'Stop Road Walk'}
                      </span>
                    </button>
                  </div>

                  {/* Minimal Live Status Strip while walking */}
                  {props.isRecordingRoad && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200/90 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                        <span className="font-mono font-bold text-emerald-950 tabular-nums truncate">
                          {liveTrackKind === 'patch'
                            ? `${props.roadTrackPoints?.length ?? 0} pts · ${liveRoadEstHa.toFixed(2)} Ha`
                            : `${Math.round(liveRoadLengthM)} m · ${liveRoadEstHa.toFixed(2)} Ha`}
                          {props.roadGpsAccuracy != null ? ` · ±${props.roadGpsAccuracy}m` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onCancelRoadTrack?.()}
                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer shrink-0"
                      >
                        {lang === 'mr' ? 'रद्द' : 'Cancel'}
                      </button>
                    </div>
                  )}

                  {/* Recorded Non-Workable Features List (supports multiple Roads, Nalas & Patches) */}
                  {!props.isNonWorkingNil && props.nonWorkingFiles.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="max-h-52 overflow-y-auto space-y-1.5">
                        {props.nonWorkingFiles.map((item, idx) => {
                          const isRoad = item.category === 'road';
                          const isNala = item.category === 'nala';
                          const canFlipNalaSide =
                            isNala && Boolean(item.centerlinePts && item.centerlinePts.length >= 2);
                          const currentNalaSide: NalaSide = item.nalaSide || 'right';
                          const metrics = props.areaSummary?.childrenById[item.id];
                          const effectiveHa =
                            metrics && props.workingFileName ? metrics.clippedInsideParentHa : item.areaHa;
                          return (
                            <div
                              key={item.id}
                              className={`px-2.5 py-2 border rounded-xl text-xs space-y-1.5 ${
                                isNala
                                  ? 'bg-sky-50/80 border-sky-200'
                                  : isRoad
                                  ? 'bg-slate-100/90 border-slate-200'
                                  : 'bg-amber-50/80 border-amber-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 truncate min-w-0">
                                  {isRoad ? (
                                    <span
                                      className="w-4.5 h-2.5 bg-slate-500 border-y border-slate-900 flex items-center justify-center shrink-0 rounded-[2px]"
                                      aria-hidden="true"
                                    >
                                      <span className="w-3 border-t border-dashed border-white" />
                                    </span>
                                  ) : isNala ? (
                                    <span
                                      className="w-4.5 h-2.5 bg-sky-300 border border-sky-600 flex items-center justify-center shrink-0 rounded-[2px]"
                                      aria-hidden="true"
                                    >
                                      <span className="w-3 border-t border-sky-800" />
                                    </span>
                                  ) : (
                                    <span
                                      className="w-3.5 h-3.5 rounded-[3px] bg-amber-200 border border-amber-600 shrink-0"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <div className="truncate min-w-0">
                                    <span className="font-semibold text-slate-800">
                                      #{idx + 1} {item.fileName}
                                    </span>
                                    <span className={`${isNala ? 'text-sky-900' : 'text-amber-900'} font-mono font-bold ml-1.5 tabular-nums`}>
                                      {effectiveHa.toFixed(2)} Ha
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => props.onRemoveNonWorkingFile(item.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                                  title={lang === 'mr' ? 'काढा' : 'Remove'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Dedicated Per-Track Nala Buffer Side Toggle (Left / Right) */}
                              {canFlipNalaSide && props.onUpdateNalaSide && (
                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-sky-200/70">
                                  <span className="text-[10.5px] font-semibold text-sky-900 shrink-0">
                                    {lang === 'mr' ? 'नाला बाजू:' : 'Nala Buffer Side:'}
                                  </span>
                                  <div className="grid grid-cols-2 gap-1 w-36 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => props.onUpdateNalaSide?.(item.id, 'left')}
                                      className={`h-6.5 px-1.5 rounded-lg font-bold text-[10.5px] border transition cursor-pointer ${
                                        currentNalaSide === 'left'
                                          ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                          : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-100/70'
                                      }`}
                                    >
                                      {lang === 'mr' ? '⬅ डावी' : '⬅ Left'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => props.onUpdateNalaSide?.(item.id, 'right')}
                                      className={`h-6.5 px-1.5 rounded-lg font-bold text-[10.5px] border transition cursor-pointer ${
                                        currentNalaSide === 'right'
                                          ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                          : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-100/70'
                                      }`}
                                    >
                                      {lang === 'mr' ? 'उजवी ➡' : 'Right ➡'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-700 pt-0.5 px-1 tabular-nums">
                        <span className="text-slate-500 font-sans font-semibold">
                          {lang === 'mr' ? 'एकूण अनुपचार क्षेत्र:' : 'Total Non-Workable:'}
                        </span>
                        <span className="text-amber-900">
                          {(props.workingFileName ? clippedNonWorkingUnionHa : totalNonWorkingSumHa).toFixed(2)} Ha
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Quick 1-Tap Transition to Phase B: Outer Boundary Walk */}
                  <button
                    type="button"
                    onClick={() => setFieldPhase('boundary')}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#eaf6ee] hover:bg-[#dcf0e3] border border-[#c6e1cf] text-[#0f5132] font-bold text-xs flex items-center justify-between cursor-pointer transition"
                  >
                    <span>
                      {lang === 'mr'
                        ? 'पुढे: बाह्य सीमा चालणे (उपचार क्षेत्र)'
                        : 'Next: Walk Outer Boundary (Workable Area)'}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
                )}

                {/* ======================================================
                    CARD 2: PHASE B — WORKABLE AREA (OUTER BOUNDARY WALK)
                   ====================================================== */}
                {fieldPhase === 'boundary' && (
                <div className={`${tileCardClass} space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center shrink-0">
                        <Pentagon className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-[13px] truncate">
                          {lang === 'mr' ? '२. उपचार क्षेत्र (बाह्य सीमा)' : '2. Workable Area (Boundary)'}
                        </h3>
                        <p className="text-[11px] text-slate-500 truncate">
                          {lang === 'mr'
                            ? 'लक्ष्य (Ha) टाका व सीमा चाला — क्षेत्र पूर्ण होताच बंद होईल'
                            : 'Set target Ha & walk outer boundary — auto-completes'}
                        </p>
                      </div>
                    </div>
                    {walkState?.active && (
                      <button
                        type="button"
                        onClick={() => props.onCancelWorkableWalk?.()}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                        title={lang === 'mr' ? 'बंद करा' : 'Cancel'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Live GPS Accuracy Panel (when Outer Walk GPS is active) */}
                  {walkState?.active &&
                    walkState.inputMode === 'gps' &&
                    walkState.phase === 'outer_walk' && (
                      <div className="rounded-xl bg-slate-900 text-white p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Radio
                              className={`w-4 h-4 shrink-0 ${
                                props.liveGpsTelemetry?.quality === 'excellent'
                                  ? 'text-emerald-400'
                                  : props.liveGpsTelemetry?.quality === 'good'
                                  ? 'text-teal-400'
                                  : props.liveGpsTelemetry?.quality === 'fair'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            />
                            <div className="min-w-0">
                              <span className="block text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                                {lang === 'mr' ? 'लाइव्ह GPS अचूकता' : 'Live GPS Accuracy'}
                              </span>
                              <div className="flex items-baseline gap-2">
                                <span className="font-mono font-bold text-sm text-white tabular-nums">
                                  {props.liveGpsTelemetry?.filteredAccuracyM != null
                                    ? `±${props.liveGpsTelemetry.filteredAccuracyM.toFixed(1)} m`
                                    : lang === 'mr'
                                    ? 'सॅटेलाइट शोधत आहे...'
                                    : 'Acquiring GPS...'}
                                </span>
                                {props.liveGpsTelemetry?.rawAccuracyM != null && (
                                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                                    (Raw ±{props.liveGpsTelemetry.rawAccuracyM.toFixed(0)}m)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => props.onGpsAccuracyGateChange?.(10)}
                              className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[10px] cursor-pointer transition ${
                                (props.gpsAccuracyGateM ?? 12) <= 12
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              ≤10m
                            </button>
                            <button
                              type="button"
                              onClick={() => props.onGpsAccuracyGateChange?.(22)}
                              className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[10px] cursor-pointer transition ${
                                (props.gpsAccuracyGateM ?? 12) > 12
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              ≤22m
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* READY STATE: Target Workable Ha + Auto-Added Non-Workable Sum + Start Boundary Walk */}
                  {(!walkState ||
                    !walkState.active ||
                    walkState.phase === 'idle' ||
                    walkState.phase === 'setup') && (
                    <div className="space-y-2.5">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11.5px] font-bold text-slate-800">
                            {lang === 'mr' ? 'उपचार क्षेत्र लक्ष्य (Ha)' : 'Target Workable Area (Ha)'}
                          </label>
                          <div className="flex items-center bg-slate-50 border border-slate-300 rounded-xl px-2.5 h-9 w-28 focus-within:bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                            <input
                              type="number"
                              min="0.1"
                              max="500"
                              step="0.5"
                              value={fieldTargetHaInput}
                              onChange={(e) => setFieldTargetHaInput(e.target.value)}
                              className="w-full font-mono font-bold text-sm text-slate-900 bg-transparent focus:outline-none tabular-nums"
                              placeholder="20"
                            />
                            <span className="text-xs font-bold text-emerald-800 ml-1">Ha</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-6 gap-1">
                          {[5, 10, 15, 20, 25, 50].map((ha) => (
                            <button
                              key={ha}
                              type="button"
                              onClick={() => setFieldTargetHaInput(String(ha))}
                              className={`h-7 rounded-lg font-mono text-[11px] font-semibold border transition cursor-pointer tabular-nums ${
                                Number(fieldTargetHaInput) === ha
                                  ? 'bg-emerald-800 text-white border-emerald-800'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {ha}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Auto-sum preview whenever Step 1 Non-Workable items exist */}
                      {!props.isNonWorkingNil && props.nonWorkingFiles.length > 0 && (
                        <div className="rounded-xl bg-emerald-50/90 border border-emerald-200 px-3 py-2 text-[11px] flex items-center justify-between gap-2">
                          <span className="text-emerald-900 font-semibold truncate">
                            {lang === 'mr'
                              ? `उपचार ${Number(fieldTargetHaInput) || 20} + अनुपचार ${totalNonWorkingSumHa.toFixed(2)}`
                              : `Workable ${Number(fieldTargetHaInput) || 20} + NW ${totalNonWorkingSumHa.toFixed(2)}`}
                          </span>
                          <span className="font-mono font-bold text-emerald-950 shrink-0 tabular-nums">
                            = {((Number(fieldTargetHaInput) || 20) + totalNonWorkingSumHa).toFixed(2)} Ha
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={props.isRecordingRoad}
                          onClick={() =>
                            props.onStartFieldWorkableSession?.({
                              targetWorkableHa: Math.max(0.1, parseFloat(fieldTargetHaInput) || 20),
                              includeRoadFirst: false,
                              inputMode: 'gps',
                              roadWidthM: props.roadWidthM ?? 4
                            })
                          }
                          className="col-span-2 min-h-[44px] px-3 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-45 active:scale-[0.99] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-[0_2px_6px_rgba(6,78,59,0.2)]"
                        >
                          <Navigation className="w-4 h-4 text-emerald-200 shrink-0" />
                          <span className="truncate">
                            {lang === 'mr' ? 'सीमा चालणे सुरू (GPS)' : 'Start Boundary Walk'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={props.isRecordingRoad}
                          onClick={() =>
                            props.onStartFieldWorkableSession?.({
                              targetWorkableHa: Math.max(0.1, parseFloat(fieldTargetHaInput) || 20),
                              includeRoadFirst: false,
                              inputMode: 'map',
                              roadWidthM: props.roadWidthM ?? 4
                            })
                          }
                          className="min-h-[44px] px-2 py-2 bg-white hover:bg-slate-50 disabled:opacity-45 text-slate-800 border border-slate-300 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Crosshair className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span className="truncate">{lang === 'mr' ? 'टॅप' : 'Map Tap'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* FALLBACK IF RESUMED LEGACY ROAD_WALK / ROAD_REVIEW DRAFT */}
                  {(walkState?.phase === 'road_walk' || walkState?.phase === 'road_review') && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <p className="text-[11px] text-slate-600">
                        {lang === 'mr'
                          ? `जतन केलेले अनुपचार (${walkState.roadAreaHa.toFixed(2)} Ha). आता बाह्य सीमा चालणे सुरू करा.`
                          : `Non-Workable recorded (${walkState.roadAreaHa.toFixed(2)} Ha). Ready to walk outer boundary.`}
                      </p>
                      <button
                        type="button"
                        onClick={() => props.onProceedToOuterWalk?.('gps')}
                        className="w-full min-h-[42px] px-3 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Navigation className="w-4 h-4" />
                        <span>
                          {lang === 'mr'
                            ? `सीमा चालणे सुरू (${walkState.targetGrossHa.toFixed(2)} Ha)`
                            : `Start Boundary Walk (${walkState.targetGrossHa.toFixed(2)} Ha)`}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* ACTIVE OUTER BOUNDARY WALK DASHBOARD */}
                  {walkState?.phase === 'outer_walk' && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-2 text-center">
                          <span className="block text-[10px] font-semibold text-emerald-800">
                            {lang === 'mr' ? 'झालेले क्षेत्र' : 'Area Made'}
                          </span>
                          <span className="block font-mono font-bold text-emerald-950 text-sm tabular-nums mt-0.5">
                            {walkState.currentGrossHa.toFixed(2)}
                          </span>
                          <span className="block text-[9.5px] font-mono text-emerald-700">
                            {walkState.roadAreaHa > 0
                              ? `Net ${walkState.currentNetWorkableHa.toFixed(2)} Ha`
                              : 'Ha'}
                          </span>
                        </div>

                        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-2 text-center">
                          <span className="block text-[10px] font-semibold text-amber-800">
                            {lang === 'mr' ? 'शिल्लक क्षेत्र' : 'Remaining'}
                          </span>
                          <span className="block font-mono font-bold text-amber-950 text-sm tabular-nums mt-0.5">
                            {walkState.remainingGrossHa.toFixed(2)}
                          </span>
                          <span className="block text-[9.5px] font-mono text-amber-700">Ha left</span>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                          <span className="block text-[10px] font-semibold text-slate-600">
                            {lang === 'mr' ? 'आपोआप पूर्ण' : 'Auto-End At'}
                          </span>
                          <span className="block font-mono font-bold text-slate-900 text-sm tabular-nums mt-0.5">
                            {walkState.targetGrossHa.toFixed(2)}
                          </span>
                          <span className="block text-[9.5px] font-mono text-slate-500">
                            {walkState.roadAreaHa > 0
                              ? `${walkState.targetWorkableHa}+${walkState.roadAreaHa.toFixed(1)}`
                              : 'Target Ha'}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar & Start Point Distance */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-600 tabular-nums">
                          <span>
                            {lang === 'mr' ? 'कोपरे:' : 'Corners:'} <strong>{walkState.outerPoints.length}</strong> ·{' '}
                            {lang === 'mr' ? 'परिमिती:' : 'Perim:'} <strong>{Math.round(walkState.perimeterM)}m</strong>
                          </span>
                          <span className="font-bold text-emerald-800">
                            {Math.min(
                              100,
                              walkState.targetGrossHa > 0
                                ? (walkState.currentGrossHa / walkState.targetGrossHa) * 100
                                : 0
                            ).toFixed(1)}
                            %
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-200 rounded-full ${
                              walkState.isPaused ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                walkState.targetGrossHa > 0
                                  ? (walkState.currentGrossHa / walkState.targetGrossHa) * 100
                                  : 0
                              )}%`
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[10.5px]">
                          <span className="font-mono font-semibold text-slate-700 tabular-nums truncate">
                            {walkState.distToStartM != null ? (
                              <>
                                {lang === 'mr' ? 'सुरुवात बिंदू:' : 'Start Point:'}{' '}
                                <strong className="text-emerald-800">
                                  {Math.round(walkState.distToStartM)}m{' '}
                                  {walkState.bearingToStartCompass || ''}
                                </strong>
                              </>
                            ) : lang === 'mr' ? (
                              'सुरुवात बिंदू: प्रतीक्षा...'
                            ) : (
                              'Start Point: Walk to begin...'
                            )}
                          </span>
                          {walkState.wakeLockActive && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 shrink-0">
                              <Sun className="w-3 h-3" />
                              <span>{lang === 'mr' ? 'स्क्रीन चालू' : 'Awake'}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Walk Controls */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {walkState.inputMode === 'gps' && (
                          <button
                            type="button"
                            onClick={() => props.onTogglePauseWorkableWalk?.()}
                            className={`min-h-[38px] px-2.5 rounded-xl font-bold text-[11.5px] flex items-center justify-center gap-1.5 cursor-pointer transition border ${
                              walkState.isPaused
                                ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {walkState.isPaused ? (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                <span>{lang === 'mr' ? 'पुन्हा सुरू' : 'Resume'}</span>
                              </>
                            ) : (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                <span>{lang === 'mr' ? 'थांबा' : 'Pause'}</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => props.onMarkBoundaryPillar?.()}
                          className="min-h-[38px] px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl font-bold text-[11.5px] flex items-center justify-center gap-1.5 cursor-pointer transition"
                        >
                          <Flag className="w-3.5 h-3.5 text-emerald-700" />
                          <span>
                            {lang === 'mr'
                              ? `खांब (BP-${(props.boundaryPillars?.length ?? 0) + 1})`
                              : `Pillar (BP-${(props.boundaryPillars?.length ?? 0) + 1})`}
                          </span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {walkState.inputMode === 'gps' && (
                          <button
                            type="button"
                            onClick={() => props.onPinAccurateGpsPoint?.()}
                            className="flex-1 min-h-[36px] px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{lang === 'mr' ? 'कोपरा नोंदवा' : 'Pin Corner'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={walkState.outerPoints.length === 0}
                          onClick={() => props.onUndoWorkablePoint?.()}
                          className="min-h-[36px] px-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-800 border border-slate-200 rounded-xl font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>{lang === 'mr' ? 'मागे' : 'Undo'}</span>
                        </button>
                      </div>

                      {/* Stamped Boundary Pillars Chips */}
                      {(props.boundaryPillars?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {props.boundaryPillars?.map((bp) => (
                            <span
                              key={bp.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono text-[10.5px] font-bold"
                            >
                              <span>{bp.label}</span>
                              {props.onRemoveBoundaryPillar && (
                                <button
                                  type="button"
                                  onClick={() => props.onRemoveBoundaryPillar?.(bp.id)}
                                  className="text-emerald-600 hover:text-rose-600 cursor-pointer"
                                  aria-label={`Remove ${bp.label}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={walkState.outerPoints.length < 3}
                          onClick={() => props.onFinishOuterWalkEarly?.()}
                          className="min-h-[38px] px-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{lang === 'mr' ? 'सीमा थांबवा व पूर्ण' : 'Stop & Finish'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onCancelWorkableWalk?.()}
                          className="min-h-[38px] px-2.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{lang === 'mr' ? 'रद्द करा' : 'Cancel'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* Compact Field Utilities */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={props.onAutoPrepareMap}
                    className="min-h-[40px] px-3 bg-white/98 hover:bg-[#f4faf6] active:scale-[0.99] border border-[#d4e3d9] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[#0f5132] rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#0f5132]" />
                    <span>{lang === 'mr' ? 'Auto-Setup A4' : 'Auto-Prepare A4'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={props.onClearMap}
                    className="min-h-[40px] px-3 bg-white/98 hover:bg-rose-50 active:scale-[0.99] border border-[#d4e3d9] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[#4f6d5e] hover:text-rose-700 hover:border-rose-200 rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    {t('clear_map')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            STEP 2: BEAT & PLOT INFO (Modular Form Cards)
           ============================================================ */}
        {activeStep === 2 && (
          <div className="space-y-3 animate-fadeIn">
            {/* Card 1: Treatment Work Type & Spacing */}
            <div className={`${tileCardClass} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Sprout className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[13px] font-bold text-slate-900 truncate">
                      {lang === 'mr' ? 'उपचार कामाचा प्रकार' : 'Treatment Work Type'}
                    </h2>
                    <span className="block text-[11px] text-slate-500">
                      {lang === 'mr' ? 'लागवड, निर्मूलन किंवा मृद संधारण' : 'Plantation, Nirmulan, SMC or ANR'}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 shrink-0">Required</span>
              </div>

              <select
                value={props.treatmentType}
                onChange={(e) => props.onTreatmentTypeChange(e.target.value)}
                className={`${inputClass} font-semibold cursor-pointer`}
              >
                <option value="nirmulan">{t('nirmulan')}</option>
                <option value="plantation">{t('plantation')}</option>
                <option value="smc">{t('smc')}</option>
                <option value="anr">{t('anr')}</option>
                <option value="custom">{t('custom_feature')}…</option>
              </select>

              {props.treatmentType === 'custom' && (
                <input
                  type="text"
                  value={props.customTreatmentType}
                  onChange={(e) => props.onCustomTreatmentTypeChange(e.target.value)}
                  placeholder="Type custom treatment work name..."
                  className={inputClass}
                />
              )}

              {props.treatmentType === 'plantation' &&
                (() => {
                  const currentHa = parseFloat(props.treatmentArea) || parseFloat(props.totalArea) || 0;
                  const perHaPlants = Math.round(10000 / (props.plantSpacingM * props.plantSpacingM));
                  const calculatedTotal = currentHa > 0 ? Math.round(currentHa * perHaPlants) : perHaPlants;
                  const spacingPresets = [2, 2.5, 3, 4, 5];

                  return (
                    <div className="pt-3 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Spacing & Seedlings</span>
                        <span className="font-mono font-bold text-emerald-800 tabular-nums">
                          {perHaPlants.toLocaleString()} / Ha
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {spacingPresets.map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => props.onPlantSpacingChange(sp)}
                            className={`min-h-[34px] py-1.5 rounded-xl text-[11px] font-mono font-semibold border cursor-pointer transition ${
                              props.plantSpacingM === sp
                                ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {sp}×{sp}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                            {t('plant_spacing')} (m)
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={props.plantSpacingM}
                            onChange={(e) =>
                              props.onPlantSpacingChange(Math.max(0.5, parseFloat(e.target.value) || 3))
                            }
                            className={`${compactInputClass} font-mono font-semibold tabular-nums`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] text-slate-600 font-semibold">Total Plants</label>
                            <button
                              type="button"
                              onClick={() => props.onTargetTotalPlantsChange(calculatedTotal)}
                              className="text-[11px] text-emerald-700 font-semibold cursor-pointer hover:underline"
                            >
                              Auto Calc
                            </button>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={props.targetTotalPlants}
                            onChange={(e) =>
                              props.onTargetTotalPlantsChange(Math.max(0, parseInt(e.target.value) || 0))
                            }
                            className={`${compactInputClass} font-mono font-semibold tabular-nums`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </div>

            {/* Card 2: Plot Identity, Date & Map Title (Compact Grid — Area lives in pinned strip above) */}
            <div className={`${tileCardClass} space-y-2.5`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#eaf6ee] border border-[#c6e1cf] flex items-center justify-center flex-shrink-0">
                  <FileCheck2 className="w-4 h-4 text-[#0f5132]" />
                </div>
                <h2 className="text-[13px] font-bold text-[#10251c] truncate">
                  {lang === 'mr' ? 'कूप, गाव व दिनांक' : 'Plot Identity & Date'}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-[#3c594b] mb-1 text-[11px]">
                    {t('village')} *
                  </label>
                  <input
                    type="text"
                    value={props.village}
                    onChange={(e) => props.onVillageChange(e.target.value)}
                    className={compactInputClass}
                    placeholder="मौजा / गाव नाव"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#3c594b] mb-1 text-[11px]">{t('map_date')}</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY"
                      value={props.mapDate}
                      onChange={(e) => props.onMapDateChange(e.target.value)}
                      className={`${compactInputClass} pr-8 font-mono font-semibold tabular-nums`}
                    />
                    <input
                      type="date"
                      title="Select Date"
                      onChange={(e) => {
                        if (e.target.value) {
                          const [y, m, d] = e.target.value.split('-');
                          props.onMapDateChange(`${d}/${m}/${y}`);
                        }
                      }}
                      className="absolute right-2 w-5 h-5 opacity-40 hover:opacity-100 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#e8f1eb] rounded-xl border border-[#cfe0d4]">
                  {(['compartment', 'survey', 'gut'] as LandIdentifierType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => props.onLandIdentifierTypeChange(type)}
                      className={`min-h-[32px] py-1 px-1.5 text-[11px] rounded-lg font-semibold transition cursor-pointer whitespace-nowrap truncate ${
                        props.landIdentifierType === type
                          ? 'bg-[#0f5132] text-white shadow-2xs'
                          : 'text-[#3c594b] hover:text-[#10251c]'
                      }`}
                    >
                      {type === 'compartment' ? t('compartment_no') : type === 'survey' ? t('survey_no') : t('gut_no')}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={props.landIdentifierValue}
                    onChange={(e) => {
                      props.onLandIdentifierValueChange(e.target.value);
                      props.onCompartmentNoChange(e.target.value);
                    }}
                    className={`${compactInputClass} font-semibold`}
                    placeholder={
                      props.landIdentifierType === 'compartment'
                        ? 'e.g. Comp. No. 42'
                        : props.landIdentifierType === 'survey'
                        ? 'e.g. Survey No. 124'
                        : 'e.g. Gut No. 58'
                    }
                  />
                  <input
                    type="text"
                    value={props.treatmentTitle}
                    onChange={(e) => props.onTreatmentTitleChange(e.target.value)}
                    className={compactInputClass}
                    placeholder={lang === 'mr' ? 'कस्टम शीर्षक (ऐच्छिक)' : 'Custom title (optional)'}
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Collapsible Officer & Range Defaults ("Remember My Range") */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] overflow-hidden">
              <div className="w-full p-3.5 hover:bg-[#f4f9f6] flex items-center justify-between gap-2 transition">
                <button
                  type="button"
                  onClick={() => setShowOfficeDefaultsPanel((v) => !v)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#eaf6ee] border border-[#c6e1cf] flex items-center justify-center flex-shrink-0">
                    <Save className="w-4 h-4 text-[#0f5132]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-bold text-[#10251c] text-[13px] truncate">
                      {lang === 'mr' ? 'कार्यालय, बीट व अधिकारी स्वाक्षरी' : 'Office, Beat & Officer Signatures'}
                    </span>
                    <span className="block text-[11px] text-[#527060] truncate mt-0.5">
                      {props.hasSavedOfficerDefaults
                        ? props.savedOfficerSummary ||
                          (lang === 'mr'
                            ? 'माझी रेंज माहिती सेव्ह आहे'
                            : 'Saved defaults ready to auto-fill')
                        : lang === 'mr'
                        ? 'एकदा सेव्ह करा — रोज पुन्हा लिहावे लागणार नाही'
                        : 'Save once to auto-fill Range & Names'}
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {props.hasSavedOfficerDefaults && props.onApplyOfficerDefaults && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onApplyOfficerDefaults?.();
                      }}
                      className="h-8 px-2.5 rounded-xl bg-[#0f5132] hover:bg-[#0b3f26] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                      title={
                        lang === 'mr'
                          ? 'जतन केलेली रेंज, बीट व अधिकारी नावे एका क्लिकवर भरा'
                          : 'Fill saved Division, Range, Beat & Officer names in 1 tap'
                      }
                    >
                      <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                      <span>{lang === 'mr' ? 'स्वयं-भरा' : 'Auto-Fill'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowOfficeDefaultsPanel((v) => !v)}
                    className="w-8 h-8 rounded-xl bg-[#ebf3ed] hover:bg-[#dcebe1] flex items-center justify-center flex-shrink-0 cursor-pointer transition"
                    aria-label="Toggle Office Details"
                  >
                    {showOfficeDefaultsPanel ? (
                      <ChevronUp className="w-4 h-4 text-[#1d4231]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1d4231]" />
                    )}
                  </button>
                </div>
              </div>

              {showOfficeDefaultsPanel && (
                <div className="p-4 space-y-3 border-t border-[#e3ede6]">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold text-slate-600 text-[11px] mb-1">{t('division')}</label>
                      <input
                        type="text"
                        value={props.division}
                        onChange={(e) => props.onDivisionChange(e.target.value)}
                        className={compactInputClass}
                        placeholder="वनविभाग"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 text-[11px] mb-1">{t('sub_division')}</label>
                      <input
                        type="text"
                        value={props.subDivision}
                        onChange={(e) => props.onSubDivisionChange(e.target.value)}
                        className={compactInputClass}
                        placeholder="उपविभाग"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-600 text-[11px] mb-1">{t('range')}</label>
                      <input
                        type="text"
                        value={props.range}
                        onChange={(e) => props.onRangeChange(e.target.value)}
                        className={compactInputClass}
                        placeholder="परिक्षेत्र"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 text-[11px] mb-1">{t('round')}</label>
                      <input
                        type="text"
                        value={props.round}
                        onChange={(e) => props.onRoundChange(e.target.value)}
                        className={compactInputClass}
                        placeholder="परिमंडळ"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 text-[11px] mb-1">{t('beat')}</label>
                      <input
                        type="text"
                        value={props.beat}
                        onChange={(e) => props.onBeatChange(e.target.value)}
                        className={compactInputClass}
                        placeholder="नियतक्षेत्र"
                      />
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                    <span className="text-xs font-bold text-slate-800 block">{t('signatures_title')}</span>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          1. {t('forest_guard')}
                        </label>
                        <input
                          type="text"
                          value={props.vanrakshak}
                          onChange={(e) => props.onVanrakshakChange(e.target.value)}
                          placeholder="नाव व पदनाम"
                          className={compactInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          2. {t('forest_beat_officer')}
                        </label>
                        <input
                          type="text"
                          value={props.vanpal}
                          onChange={(e) => props.onVanpalChange(e.target.value)}
                          placeholder="नाव व पदनाम"
                          className={compactInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">3. {t('rfo')}</label>
                        <input
                          type="text"
                          value={props.rfo}
                          onChange={(e) => props.onRfoChange(e.target.value)}
                          placeholder="नाव व पदनाम"
                          className={compactInputClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={props.onSaveOfficerDefaults}
                      className="flex-1 min-h-[42px] py-2 px-3 bg-emerald-800 hover:bg-emerald-900 active:scale-[0.99] text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer text-xs shadow-2xs"
                    >
                      <Save className="w-4 h-4" />
                      <span>{lang === 'mr' ? 'माझी रेंज माहिती सेव्ह करा' : 'Save Default Office Info'}</span>
                    </button>
                    {props.hasSavedOfficerDefaults && props.onApplyOfficerDefaults && (
                      <button
                        type="button"
                        onClick={props.onApplyOfficerDefaults}
                        className="min-h-[42px] px-3 bg-[#eaf5ee] hover:bg-[#d8eee0] border border-[#b9dac4] text-[#0c452a] rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{lang === 'mr' ? 'भरा' : 'Fill'}</span>
                      </button>
                    )}
                    {props.hasSavedOfficerDefaults && props.onClearOfficerDefaults && (
                      <button
                        type="button"
                        onClick={props.onClearOfficerDefaults}
                        className="min-h-[42px] px-3 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded-xl font-semibold text-xs cursor-pointer transition"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 3: MAP SETUP (1-Open-At-A-Time Modular Accordion Tiles)
           ============================================================ */}
        {activeStep === 3 && (
          <div className="space-y-2.5 animate-fadeIn">
            {/* Card 1: Base Line Alignment & Polygon Rotation (Accordion) */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleStep3Section('baseline')}
                className="w-full px-3.5 py-3 hover:bg-[#f4f9f6] flex items-center justify-between gap-2 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center flex-shrink-0">
                    <Compass className="w-4 h-4 text-rose-700" />
                  </div>
                  <h2 className="text-[13px] font-bold text-[#10251c] truncate">
                    {t('baseline_section_title')}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono font-bold text-[#2b4d3c] tabular-nums">
                    {props.baselineOption === 'longest_axis'
                      ? `${props.bearingDeg}° ${bearingToCompass(props.bearingDeg)}`
                      : props.baselineOption === 'vertical'
                      ? 'N-S'
                      : 'E-W'}
                    {(props.rotationDeg ?? 0) !== 0 ? ` · ${props.rotationDeg}°` : ''}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#ebf3ed] flex items-center justify-center">
                    {openStep3Section === 'baseline' ? (
                      <ChevronUp className="w-4 h-4 text-[#1d4231]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1d4231]" />
                    )}
                  </div>
                </div>
              </button>

              {openStep3Section === 'baseline' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-[#e3ede6] space-y-2.5 animate-fadeIn">

              {/* Alignment Segmented Control */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#e8f1eb] rounded-xl border border-[#cfe0d4]">
                <button
                  type="button"
                  onClick={() => props.onBaselineOptionChange('horizontal')}
                  className={`min-h-[38px] py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap truncate ${
                    props.baselineOption === 'horizontal' || props.baselineOption === 'grid_parallel'
                      ? 'bg-rose-700 text-white shadow-2xs'
                      : 'text-[#284738] hover:text-[#10251c] hover:bg-white/70'
                  }`}
                >
                  {lang === 'mr' ? 'आडवी (E-W)' : 'Horizontal'}
                </button>
                <button
                  type="button"
                  onClick={() => props.onBaselineOptionChange('longest_axis')}
                  className={`min-h-[38px] py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap truncate ${
                    props.baselineOption === 'longest_axis'
                      ? 'bg-rose-700 text-white shadow-2xs'
                      : 'text-[#284738] hover:text-[#10251c] hover:bg-white/70'
                  }`}
                >
                  {lang === 'mr' ? `अक्ष (${props.bearingDeg}°)` : `Bearing (${props.bearingDeg}°)`}
                </button>
                <button
                  type="button"
                  onClick={() => props.onBaselineOptionChange('vertical')}
                  className={`min-h-[38px] py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap truncate ${
                    props.baselineOption === 'vertical'
                      ? 'bg-rose-700 text-white shadow-2xs'
                      : 'text-[#284738] hover:text-[#10251c] hover:bg-white/70'
                  }`}
                >
                  {lang === 'mr' ? 'उभी (N-S)' : 'Vertical'}
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  props.onSetInteractionMode(props.activeInteractionMode === 'baseline' ? 'pan' : 'baseline')
                }
                className={`w-full min-h-[44px] py-2 px-3 rounded-xl border font-semibold flex items-center justify-center gap-2 transition cursor-pointer text-xs ${
                  props.activeInteractionMode === 'baseline'
                    ? 'bg-rose-700 text-white border-rose-700 shadow-2xs'
                    : 'bg-[#f4f8f5] hover:bg-rose-50/70 text-[#183829] border-[#cde0d3] hover:border-rose-200'
                }`}
              >
                <Move className="w-4 h-4" />
                <span>
                  {props.activeInteractionMode === 'baseline'
                    ? lang === 'mr'
                      ? 'बेस लाईन ड्रॅग सुरू आहे'
                      : 'Dragging Base Line Active'
                    : lang === 'mr'
                    ? 'नकाशावर बेस लाईन ड्रॅग करा'
                    : 'Drag Base Line on Map'}
                </span>
              </button>

              {/* Step Base Line on Darkest Green Line (±100m) */}
              <div className="pt-2.5 border-t border-[#e3ede6] space-y-2">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-semibold text-[#234535]">
                    {lang === 'mr' ? 'डार्क लाईनवर बेस लाईन हलवा (±100m)' : 'Step Base Line (±100m Grid)'}
                  </span>
                  <button
                    type="button"
                    onClick={props.onResetBaselineOffset}
                    className="text-rose-700 hover:underline font-semibold cursor-pointer"
                  >
                    {lang === 'mr' ? 'मध्यवर्ती ठेवा' : 'Center'}
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => props.onNudgeBaseline?.(-100, 0)}
                    className="min-h-[40px] py-1.5 px-1 bg-[#f4f8f5] hover:bg-white hover:shadow-2xs active:scale-[0.98] text-[#173628] rounded-xl border border-[#cde0d3] font-semibold text-[11px] cursor-pointer transition"
                  >
                    ← 100m
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onNudgeBaseline?.(100, 0)}
                    className="min-h-[40px] py-1.5 px-1 bg-[#f4f8f5] hover:bg-white hover:shadow-2xs active:scale-[0.98] text-[#173628] rounded-xl border border-[#cde0d3] font-semibold text-[11px] cursor-pointer transition"
                  >
                    → 100m
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onNudgeBaseline?.(0, 100)}
                    className="min-h-[40px] py-1.5 px-1 bg-[#f4f8f5] hover:bg-white hover:shadow-2xs active:scale-[0.98] text-[#173628] rounded-xl border border-[#cde0d3] font-semibold text-[11px] cursor-pointer transition"
                  >
                    ↑ 100m
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onNudgeBaseline?.(0, -100)}
                    className="min-h-[40px] py-1.5 px-1 bg-[#f4f8f5] hover:bg-white hover:shadow-2xs active:scale-[0.98] text-[#173628] rounded-xl border border-[#cde0d3] font-semibold text-[11px] cursor-pointer transition"
                  >
                    ↓ 100m
                  </button>
                </div>
              </div>

              {/* Rotate KML Polygon */}
              <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                    <span>{lang === 'mr' ? 'नकाशा फिरवा (Rotate)' : 'Rotate Polygon'}</span>
                  </span>
                  <div className="flex items-center gap-0.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/90">
                    <input
                      type="number"
                      min="0"
                      max="359"
                      value={props.rotationDeg ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) props.onRotationChange?.(((val % 360) + 360) % 360);
                      }}
                      className="w-10 text-center font-mono font-bold text-slate-900 text-xs bg-transparent focus:outline-none tabular-nums"
                    />
                    <span className="text-slate-500 font-mono text-xs">°</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={props.rotationDeg ?? 0}
                  onChange={(e) => props.onRotationChange?.(Number(e.target.value))}
                  className="w-full accent-emerald-700 cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.((((props.rotationDeg ?? 0) - 10) % 360 + 360) % 360)}
                    className="min-h-[34px] py-1.5 bg-slate-50 hover:bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono font-semibold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    -10°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.((((props.rotationDeg ?? 0) - 5) % 360 + 360) % 360)}
                    className="min-h-[34px] py-1.5 bg-slate-50 hover:bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono font-semibold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    -5°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.((((props.rotationDeg ?? 0) - 1) % 360 + 360) % 360)}
                    className="min-h-[34px] py-1.5 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-900 font-mono font-bold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    -1°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.(((props.rotationDeg ?? 0) + 1) % 360)}
                    className="min-h-[34px] py-1.5 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-900 font-mono font-bold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    +1°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.(((props.rotationDeg ?? 0) + 5) % 360)}
                    className="min-h-[34px] py-1.5 bg-slate-50 hover:bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono font-semibold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    +5°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.(((props.rotationDeg ?? 0) + 10) % 360)}
                    className="min-h-[34px] py-1.5 bg-slate-50 hover:bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono font-semibold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    +10°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.(((props.rotationDeg ?? 0) + 90) % 360)}
                    className="min-h-[34px] py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300/80 rounded-xl text-slate-900 font-mono font-bold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    +90°
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRotationChange?.(0)}
                    className="min-h-[32px] py-1 bg-[#f4f8f5] hover:bg-white border border-[#cde0d3] rounded-xl text-[#173628] font-mono font-semibold text-[11px] cursor-pointer transition tabular-nums"
                  >
                    0°
                  </button>
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Card 2: Section Line (Auto 50% + Step Along ±50m / ±100m — Accordion) */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] overflow-hidden">
              <div className="px-3.5 py-2.5 hover:bg-[#f4f9f6] flex items-center justify-between gap-2 transition">
                <button
                  type="button"
                  onClick={() => toggleStep3Section('section')}
                  className="flex-1 flex items-center gap-2.5 min-w-0 text-left cursor-pointer py-0.5"
                >
                  <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-4 h-4 text-purple-700" />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-bold text-[#10251c] text-[13px] truncate">
                      {lang === 'mr' ? 'विभाग रेषा (Section Line)' : 'Section Line'}
                    </span>
                    <span className="block text-[10.5px] font-mono text-[#527060] truncate tabular-nums">
                      {props.displayOptions.showSectionLines
                        ? (props.sectionLineOffset ?? 0) === 0
                          ? '50% Auto'
                          : `${(props.sectionLineOffset ?? 0) > 0 ? '+' : ''}${props.sectionLineOffset}m`
                        : lang === 'mr'
                        ? 'बंद (OFF)'
                        : 'OFF'}
                    </span>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !props.displayOptions.showSectionLines;
                      props.onToggleDisplayOption('showSectionLines', next);
                      props.onToggleSectionLines(next);
                      if (next) setOpenStep3Section('section');
                    }}
                    className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold border transition cursor-pointer shrink-0 ${
                      props.displayOptions.showSectionLines
                        ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                        : 'bg-[#f4f8f5] text-[#3c594b] border-[#cde0d3] hover:bg-white'
                    }`}
                  >
                    {props.displayOptions.showSectionLines ? (lang === 'mr' ? 'सुरू' : 'ON') : lang === 'mr' ? 'बंद' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleStep3Section('section')}
                    className="w-7 h-7 rounded-lg bg-[#ebf3ed] flex items-center justify-center cursor-pointer"
                    aria-label="Toggle Section Line controls"
                  >
                    {openStep3Section === 'section' ? (
                      <ChevronUp className="w-4 h-4 text-[#1d4231]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1d4231]" />
                    )}
                  </button>
                </div>
              </div>

              {openStep3Section === 'section' && props.displayOptions.showSectionLines && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-[#e3ede6] space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200/80">
                    <span className="font-mono font-semibold tabular-nums">
                      {props.sectionDistanceM ? `${props.sectionDistanceM} m` : '~50% Auto'}
                    </span>
                    <span className="font-mono text-purple-700 font-bold tabular-nums">
                      {(props.sectionLineOffset ?? 0) === 0
                        ? '50% Auto'
                        : `${(props.sectionLineOffset ?? 0) > 0 ? '+' : ''}${props.sectionLineOffset} m`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => props.onStepSectionLine?.(-50)}
                      className="min-h-[38px] py-1.5 px-2.5 bg-slate-50 hover:bg-emerald-50/70 active:scale-[0.98] text-slate-800 rounded-xl border border-slate-200/90 font-semibold text-[11px] cursor-pointer transition"
                    >
                      ← {lang === 'mr' ? 'मध्यम (-50m)' : 'Med (-50m)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onStepSectionLine?.(50)}
                      className="min-h-[38px] py-1.5 px-2.5 bg-slate-50 hover:bg-emerald-50/70 active:scale-[0.98] text-slate-800 rounded-xl border border-slate-200/90 font-semibold text-[11px] cursor-pointer transition"
                    >
                      {lang === 'mr' ? 'मध्यम (+50m)' : 'Med (+50m)'} →
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onStepSectionLine?.(-100)}
                      className="min-h-[38px] py-1.5 px-2.5 bg-slate-50 hover:bg-emerald-50/70 active:scale-[0.98] text-slate-900 rounded-xl border border-slate-200/90 font-semibold text-[11px] cursor-pointer transition"
                    >
                      ← {lang === 'mr' ? 'डार्क (-100m)' : 'Dark (-100m)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onStepSectionLine?.(100)}
                      className="min-h-[38px] py-1.5 px-2.5 bg-slate-50 hover:bg-emerald-50/70 active:scale-[0.98] text-slate-900 rounded-xl border border-slate-200/90 font-semibold text-[11px] cursor-pointer transition"
                    >
                      {lang === 'mr' ? 'डार्क (+100m)' : 'Dark (+100m)'} →
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={props.onResetSectionLineOffset}
                    className="w-full py-1 text-center text-purple-700 hover:underline text-[11.5px] font-semibold cursor-pointer"
                  >
                    {lang === 'mr' ? 'मध्यवर्ती 50% (Auto) वर ठेवा' : 'Reset to Auto 50% Midpoint'}
                  </button>
                </div>
              )}
              {openStep3Section === 'section' && !props.displayOptions.showSectionLines && (
                <div className="px-3.5 pb-3 pt-2 border-t border-[#e3ede6] text-[11px] text-[#527060]">
                  {lang === 'mr'
                    ? 'विभाग रेषा पाहण्यासाठी वरील सुरू (ON) बटण दाबा.'
                    : 'Tap ON above to display and adjust the 50% section cut line.'}
                </div>
              )}
            </div>

            {/* Card 3: Landmark Features & Manual GPS Reading (Accordion) */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleStep3Section('landmarks')}
                className="w-full px-3.5 py-3 hover:bg-[#f4f9f6] flex items-center justify-between gap-2 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-4 h-4 text-amber-700" />
                  </div>
                  <h2 className="text-[13px] font-bold text-[#10251c] truncate">
                    {lang === 'mr' ? 'महत्त्वाची ठिकाणे व GPS' : 'Landmark Features & GPS'}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono font-semibold text-[#527060] tabular-nums">
                    {totalLandmarksCount} {lang === 'mr' ? 'नोंद' : 'saved'}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#ebf3ed] flex items-center justify-center">
                    {openStep3Section === 'landmarks' ? (
                      <ChevronUp className="w-4 h-4 text-[#1d4231]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1d4231]" />
                    )}
                  </div>
                </div>
              </button>

              {openStep3Section === 'landmarks' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-[#e3ede6] space-y-2.5 animate-fadeIn">

              <select
                value={selectedFeature?.id || gpsFeatureId}
                onChange={(e) => setGpsFeatureId(e.target.value)}
                className={`${inputClass} font-semibold cursor-pointer`}
              >
                {props.features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {getFeatureName(f)}
                    {f.markers.length > 0 ? ` (${f.markers.length})` : ''}
                  </option>
                ))}
              </select>

              {selectedFeature && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedFeature.enabled}
                      onChange={(e) => props.onToggleFeature(selectedFeature.id, e.target.checked)}
                      className="rounded text-emerald-700 focus:ring-emerald-600 w-4 h-4"
                    />
                    <span>{lang === 'mr' ? 'नकाशावर दाखवा' : 'Show on Map'}</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {props.onToggleGPS && (
                      <button
                        type="button"
                        onClick={props.onToggleGPS}
                        className={`min-h-[34px] py-1 px-2.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                          props.isWatchingGPS
                            ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200/90'
                        }`}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>{props.isWatchingGPS ? t('gps_stop') : 'Live GPS'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedFeature.enabled) props.onToggleFeature(selectedFeature.id, true);
                        props.onStartPlaceFeature(selectedFeature.id);
                      }}
                      className={`min-h-[34px] py-1 px-2.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                        props.activePlaceFeatureId === selectedFeature.id
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200/90'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        {props.activePlaceFeatureId === selectedFeature.id
                          ? lang === 'mr'
                            ? 'टॅप करा…'
                            : 'Tap Map…'
                          : lang === 'mr'
                          ? 'नकाशावर ठेवा'
                          : 'Tap Map'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleAddCustom} className="flex gap-2">
                <input
                  type="text"
                  value={customFeatureName}
                  onChange={(e) => setCustomFeatureName(e.target.value)}
                  placeholder={lang === 'mr' ? 'नवीन खूण प्रकार जोडा (उदा: तलाव)' : 'Add custom feature type…'}
                  className={`flex-1 ${compactInputClass}`}
                />
                <button
                  type="submit"
                  className="min-h-[38px] py-1.5 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition"
                >
                  + Add
                </button>
              </form>

              {/* Manual GPS Entry (DMS + Decimal) */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-800">
                    {lang === 'mr' ? 'मॅन्युअल GPS नोंद' : 'Manual GPS Coordinates'}
                  </span>
                  <div className="flex p-0.5 rounded-xl bg-slate-100 border border-slate-200/60 text-[10.5px] font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setGpsCoordMode('dms');
                        setGpsInputError('');
                      }}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                        gpsCoordMode === 'dms' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      DMS (° ′ ″)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGpsCoordMode('decimal');
                        setGpsInputError('');
                      }}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                        gpsCoordMode === 'decimal' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Lat / Long
                    </button>
                  </div>
                </div>

                <form onSubmit={handleManualGpsSubmit} className="space-y-2.5">
                  {gpsCoordMode === 'dms' ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          {lang === 'mr' ? 'अक्षवृत्त (Lat DMS) *' : 'Latitude (DMS) *'}
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          <input type="number" min="0" max="90" step="1" value={dmsLatDeg} onChange={(e) => setDmsLatDeg(e.target.value)} placeholder="Deg °" className={`${compactInputClass} px-2 font-mono`} />
                          <input type="number" min="0" max="59" step="1" value={dmsLatMin} onChange={(e) => setDmsLatMin(e.target.value)} placeholder="Min ′" className={`${compactInputClass} px-2 font-mono`} />
                          <input type="number" min="0" max="59.999" step="any" value={dmsLatSec} onChange={(e) => setDmsLatSec(e.target.value)} placeholder="Sec ″" className={`${compactInputClass} px-2 font-mono`} />
                          <select value={dmsLatHemi} onChange={(e) => setDmsLatHemi(e.target.value as 'N' | 'S')} className={`${compactInputClass} px-2 font-semibold`}>
                            <option value="N">N</option>
                            <option value="S">S</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          {lang === 'mr' ? 'रेखावृत्त (Long DMS) *' : 'Longitude (DMS) *'}
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          <input type="number" min="0" max="180" step="1" value={dmsLonDeg} onChange={(e) => setDmsLonDeg(e.target.value)} placeholder="Deg °" className={`${compactInputClass} px-2 font-mono`} />
                          <input type="number" min="0" max="59" step="1" value={dmsLonMin} onChange={(e) => setDmsLonMin(e.target.value)} placeholder="Min ′" className={`${compactInputClass} px-2 font-mono`} />
                          <input type="number" min="0" max="59.999" step="any" value={dmsLonSec} onChange={(e) => setDmsLonSec(e.target.value)} placeholder="Sec ″" className={`${compactInputClass} px-2 font-mono`} />
                          <select value={dmsLonHemi} onChange={(e) => setDmsLonHemi(e.target.value as 'E' | 'W')} className={`${compactInputClass} px-2 font-semibold`}>
                            <option value="E">E</option>
                            <option value="W">W</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Latitude *</label>
                        <input type="text" value={gpsLatInput} onChange={(e) => setGpsLatInput(e.target.value)} placeholder="21.14588" className={`${compactInputClass} font-mono`} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Longitude *</label>
                        <input type="text" value={gpsLonInput} onChange={(e) => setGpsLonInput(e.target.value)} placeholder="79.23145" className={`${compactInputClass} font-mono`} />
                      </div>
                    </div>
                  )}

                  <input
                    type="text"
                    value={gpsLabelInput}
                    onChange={(e) => setGpsLabelInput(e.target.value)}
                    placeholder={lang === 'mr' ? 'ठिकाणाचे नाव (उदा: विहीर क्र. १)' : 'Label / Note (Optional)'}
                    className={compactInputClass}
                  />

                  {gpsInputError && (
                    <p className="text-[11px] font-medium text-rose-700 bg-rose-50 px-3 py-2 rounded-xl border border-rose-200">
                      {gpsInputError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[40px] py-2 px-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {lang === 'mr'
                        ? `${selectedFeature ? getFeatureName(selectedFeature) : ''} GPS जोडा`
                        : `Add ${selectedFeature ? getFeatureName(selectedFeature) : 'Feature'} GPS`}
                    </span>
                  </button>
                </form>

                {props.features.some((f) => f.markers.length > 0) && (
                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-700">
                      <span>{lang === 'mr' ? 'नोंदवलेली ठिकाणे' : 'Placed GPS Points'}</span>
                      <button type="button" onClick={props.onClearMarkers} className="text-rose-600 hover:underline cursor-pointer">
                        {lang === 'mr' ? 'सर्व हटवा' : 'Clear All'}
                      </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1.5">
                      {props.features.flatMap((f) =>
                        f.markers.map((m, mIdx) => (
                          <div key={`${f.id}_${mIdx}`} className="flex items-center justify-between bg-slate-50/90 px-2.5 py-2 rounded-xl border border-slate-200/80 text-[11px]">
                            <div className="flex flex-col flex-1 min-w-0 pr-2">
                              <span className="font-semibold text-slate-800 truncate">{m.label || getFeatureName(f)}</span>
                              <span className="text-[10px] font-mono text-slate-500 truncate tabular-nums">
                                {m.lat !== undefined && m.lon !== undefined
                                  ? `${toDMS(m.lat, true)}, ${toDMS(m.lon, false)}`
                                  : `(${Math.round(m.mx)}m, ${Math.round(m.my)}m)`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => props.onRemoveFeatureMarker?.(f.id, mIdx)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 cursor-pointer transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                </div>
                </div>
              )}
            </div>

            {/* Card 3.5: Compact Index / Legend Box Controls (Accordion) */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleStep3Section('legend')}
                className="w-full px-3.5 py-3 hover:bg-[#f4f9f6] flex items-center justify-between gap-2 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#eaf6ee] border border-[#c6e1cf] flex items-center justify-center flex-shrink-0">
                    <FileCheck2 className="w-4 h-4 text-[#0f5132]" />
                  </div>
                  <h4 className="font-bold text-[#10251c] text-[13px] truncate">
                    {lang === 'mr' ? 'सूची चौकोन (Index Box)' : 'Index / Legend Box'}
                  </h4>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-[#527060] truncate max-w-[90px]">
                    {legendPosShortLabel}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#ebf3ed] flex items-center justify-center">
                    {openStep3Section === 'legend' ? (
                      <ChevronUp className="w-4 h-4 text-[#1d4231]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1d4231]" />
                    )}
                  </div>
                </div>
              </button>

              {openStep3Section === 'legend' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-[#e3ede6] space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#527060] truncate">
                      {lang === 'mr' ? 'अनावश्यक ओळी आपोआप लपवल्या जातात' : 'Unused items auto-hide'}
                    </span>
                    <button
                      type="button"
                      onClick={props.onResetLegendPos}
                      className="text-[11px] font-semibold text-[#0f5132] hover:underline cursor-pointer shrink-0"
                    >
                      {lang === 'mr' ? 'स्थान रीसेट' : 'Reset Drag'}
                    </button>
                  </div>

              {/* Layout & Size Controls */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                    {lang === 'mr' ? 'रचना (Layout)' : 'Layout Style'}
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => props.onLegendLayoutChange?.('box')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        (props.legendLayout || 'box') === 'box'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'mr' ? 'चौकोन' : 'Corner Box'}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onLegendLayoutChange?.('strip')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        props.legendLayout === 'strip'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'mr' ? 'तळ पट्टी' : 'Bottom Strip'}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                    {lang === 'mr' ? 'आकार (Size)' : 'Size'}
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => props.onLegendSizeChange?.('compact')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        (props.legendSize || 'compact') === 'compact'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'mr' ? 'लहान' : 'Compact'}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onLegendSizeChange?.('standard')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        props.legendSize === 'standard'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'mr' ? 'मध्यम' : 'Standard'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 4-Corner Preset Buttons (shown in Corner Box mode) */}
              {(props.legendLayout || 'box') === 'box' ? (
                <div>
                  <span className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                    {lang === 'mr' ? 'कोपरा निवडा (किंवा नकाशावर ड्रॅग करा)' : 'Corner Position (or drag directly on map)'}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'top_left', en: 'Top Left', mr: 'वर डावीकडे' },
                      { id: 'top_right', en: 'Top Right', mr: 'वर उजवीकडे' },
                      { id: 'bottom_left', en: 'Bottom Left', mr: 'खाली डावीकडे' },
                      { id: 'bottom_right', en: 'Bottom Right', mr: 'खाली उजवीकडे' }
                    ].map((corner) => (
                      <button
                        key={corner.id}
                        type="button"
                        onClick={() => props.onLegendPosChange(corner.id)}
                        className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                          props.legendPos === corner.id
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-1 ring-emerald-500/30'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
                        }`}
                      >
                        {lang === 'mr' ? corner.mr : corner.en}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800 bg-emerald-50/80 border border-emerald-200/80 rounded-xl px-2.5 py-2 leading-snug">
                  {lang === 'mr'
                    ? 'तळाची पट्टी नकाशाच्या खालच्या कडेला बसते आणि उत्तर दिशा बाण वर उजव्या कोपऱ्यात दिसतो.'
                    : 'Bottom strip docks cleanly along the lower border with a compact North Arrow in the top-right corner.'}
                </p>
              )}
                </div>
              )}
            </div>

            {/* Card 4: Collapsible Advanced Settings Accordion */}
            <div className="bg-white/98 rounded-2xl border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06),0_1px_2px_rgba(11,53,39,0.04)] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleStep3Section('advanced')}
                className="w-full px-3.5 py-3 hover:bg-[#f4f9f6] flex items-center justify-between gap-2 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#eaf6ee] border border-[#c6e1cf] flex items-center justify-center flex-shrink-0">
                    <Settings className="w-4 h-4 text-[#0f5132]" />
                  </div>
                  <span className="font-bold text-[#10251c] text-[13px] truncate">
                    {lang === 'mr' ? 'प्रगत सेटिंग्ज (Advanced)' : 'Advanced Settings'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono font-semibold text-[#527060] tabular-nums">
                    {scaleShortLabel} · {props.gridWidthM}m
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#ebf3ed] flex items-center justify-center">
                    {openStep3Section === 'advanced' ? (
                      <ChevronUp className="w-4 h-4 text-[#1d4231]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#1d4231]" />
                    )}
                  </div>
                </div>
              </button>

              {openStep3Section === 'advanced' && (
                <div className="px-3.5 pb-3.5 pt-2.5 space-y-3 border-t border-[#e3ede6] animate-fadeIn">
                  <div className="space-y-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-[11.5px]">{t('scale_ratio')}</label>
                      <select
                        value={props.scaleId}
                        onChange={(e) => props.onScaleChange(e.target.value)}
                        className={`${compactInputClass} cursor-pointer`}
                      >
                        <option value="2cm_100m">2 cm = 100 m (1:5,000) - Standard Forestry</option>
                        <option value="1cm_100m">1 cm = 100 m (1:10,000)</option>
                        <option value="1cm_50m">1 cm = 50 m (1:2,500)</option>
                        <option value="1cm_200m">1 cm = 200 m (1:20,000)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1.5 text-[11.5px]">{t('grid_dimensions')}</label>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {[
                          { l: '100m', w: 100, h: 100 },
                          { l: '50m', w: 50, h: 50 },
                          { l: '200m', w: 200, h: 200 }
                        ].map((preset) => (
                          <button
                            key={preset.l}
                            type="button"
                            onClick={() => {
                              props.onGridSizeChange(preset.w, preset.h);
                              setIsManualGrid(false);
                            }}
                            className={`min-h-[34px] py-1.5 px-1 rounded-xl text-[11px] font-mono font-semibold border cursor-pointer transition ${
                              !isManualGrid && props.gridWidthM === preset.w && props.gridHeightM === preset.h
                                ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
                            }`}
                          >
                            {preset.l}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setIsManualGrid(true)}
                          className={`min-h-[34px] py-1.5 px-1 rounded-xl text-[11px] font-semibold border cursor-pointer transition ${
                            isManualGrid ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
                          }`}
                        >
                          Manual
                        </button>
                      </div>

                      {isManualGrid && (
                        <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-2.5 grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">{t('grid_width_m')}</label>
                            <input
                              type="number"
                              min="10"
                              max="1000"
                              step="5"
                              value={props.gridWidthM}
                              onChange={(e) => props.onGridSizeChange(Math.max(10, Number(e.target.value) || 10), props.gridHeightM)}
                              className={`${compactInputClass} font-mono font-semibold`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">{t('grid_height_m')}</label>
                            <input
                              type="number"
                              min="10"
                              max="1000"
                              step="5"
                              value={props.gridHeightM}
                              onChange={(e) => props.onGridSizeChange(props.gridWidthM, Math.max(10, Number(e.target.value) || 10))}
                              className={`${compactInputClass} font-mono font-semibold`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Display Options Grid */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="block font-semibold text-slate-700 text-[11.5px]">{t('display_options_title')}</span>
                    <div className="grid grid-cols-2 gap-2 text-slate-700">
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input type="checkbox" checked={props.displayOptions.showBaseline} onChange={(e) => props.onToggleDisplayOption('showBaseline', e.target.checked)} className="rounded text-emerald-700 w-4 h-4" />
                        <span className="text-[11px] font-medium truncate">{t('opt_baseline')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input type="checkbox" checked={props.displayOptions.showBaselineMeas} onChange={(e) => props.onToggleDisplayOption('showBaselineMeas', e.target.checked)} className="rounded text-emerald-700 w-4 h-4" />
                        <span className="text-[11px] font-medium truncate">{t('opt_baseline_meas')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input
                          type="checkbox"
                          checked={props.displayOptions.showSectionLines}
                          onChange={(e) => {
                            props.onToggleDisplayOption('showSectionLines', e.target.checked);
                            props.onToggleSectionLines(e.target.checked);
                          }}
                          className="rounded text-purple-700 w-4 h-4"
                        />
                        <span className="text-[11px] font-medium truncate">{t('opt_section_lines')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input type="checkbox" checked={props.displayOptions.showEdgeGps} onChange={(e) => props.onToggleDisplayOption('showEdgeGps', e.target.checked)} className="rounded text-emerald-700 w-4 h-4" />
                        <span className="text-[11px] font-medium truncate">{t('opt_edge_gps')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input type="checkbox" checked={props.displayOptions.showGridNaming} onChange={(e) => props.onToggleDisplayOption('showGridNaming', e.target.checked)} className="rounded text-emerald-700 w-4 h-4" />
                        <span className="text-[11px] font-medium truncate">{t('opt_grid_naming')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input type="checkbox" checked={props.displayOptions.showGridNumbers} onChange={(e) => props.onToggleDisplayOption('showGridNumbers', e.target.checked)} className="rounded text-emerald-700 w-4 h-4" />
                        <span className="text-[11px] font-medium truncate">{t('opt_grid_numbers')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
                        <input type="checkbox" checked={props.displayOptions.showGridLines} onChange={(e) => props.onToggleDisplayOption('showGridLines', e.target.checked)} className="rounded text-emerald-700 w-4 h-4" />
                        <span className="text-[11px] font-medium truncate">{t('opt_grid_lines')}</span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer col-span-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80">
                        <input
                          type="checkbox"
                          checked={props.displayOptions.combineTitleLines ?? true}
                          onChange={(e) => props.onToggleDisplayOption('combineTitleLines', e.target.checked)}
                          className="rounded text-emerald-700 w-4 h-4 mt-0.5"
                        />
                        <div className="flex flex-col">
                          <span className="text-[11.5px] font-semibold text-slate-900">{t('opt_combine_title_lines')}</span>
                          <span className="text-[10.5px] text-slate-500 leading-snug">{t('opt_combine_title_lines_hint')}</span>
                        </div>
                      </label>
                    </div>
                  </div>


                  {/* Font & Color */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1 text-[11px]">{t('font_size')}</label>
                      <select
                        value={props.fontSize}
                        onChange={(e) => props.onFontSizeChange(e.target.value)}
                        className={compactInputClass}
                      >
                        <option value="small">{t('font_small')}</option>
                        <option value="medium">{t('font_medium')}</option>
                        <option value="large">{t('font_large')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1 text-[11px]">{t('text_color')}</label>
                      <div className="flex items-center gap-2 min-h-[38px] px-2.5 bg-slate-50/70 rounded-xl border border-slate-200/90">
                        <input
                          type="color"
                          value={props.textColor}
                          onChange={(e) => props.onTextColorChange(e.target.value)}
                          className="w-7 h-7 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <span className="font-mono text-xs text-slate-700">{props.textColor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 4: PDF, KMZ & WHATSAPP SHARE (Modular Action Cards)
           ============================================================ */}
        {activeStep === 4 && (() => {
          const hasBoundary = Boolean(props.workingFileName || parseFloat(props.totalArea || '0') > 0);
          const hasComp = Boolean((props.landIdentifierValue || props.compartmentNo || '').trim());
          const hasVillageOrBeat = Boolean((props.village || props.beat || '').trim());
          const hasSignatures = Boolean(props.vanrakshak.trim() || props.vanpal.trim() || props.rfo.trim());
          const missingFields: string[] = [];
          if (!hasComp) missingFields.push(lang === 'mr' ? 'कक्ष/सर्व्हे क्र.' : 'Comp./Survey No.');
          if (!hasVillageOrBeat) missingFields.push(lang === 'mr' ? 'मौजा/नियतक्षेत्र' : 'Village/Beat');
          if (!hasSignatures) missingFields.push(lang === 'mr' ? 'स्वाक्षरी नावे' : 'Officer Names');
          const isFullyReady = hasBoundary && missingFields.length === 0;

          return (
          <div className="space-y-3 animate-fadeIn">
            {/* Compact Pre-Export Readiness Check (Zero-Error Official A4 PDFs) */}
            <div
              className={`rounded-2xl border p-3.5 text-xs space-y-2 shadow-[0_2px_8px_rgba(11,53,39,0.06)] ${
                isFullyReady
                  ? 'bg-gradient-to-br from-[#eaf7ef] to-[#e0f3e7] border-emerald-300/90 text-[#0a3622]'
                  : 'bg-[#fdf8ec] border-amber-200/90 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-[12.5px]">
                  {isFullyReady ? (
                    <CheckCircle2 className="w-4 h-4 text-[#0f5132] shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  )}
                  <span>
                    {isFullyReady
                      ? lang === 'mr'
                        ? 'अधिकृत PDF साठी सर्व माहिती पूर्ण'
                        : 'Ready for Official A4 PDF Print'
                      : lang === 'mr'
                      ? 'प्रिंटपूर्वी तपासणी (Pre-Export Check)'
                      : 'Pre-Export Readiness Check'}
                  </span>
                </div>
                {!isFullyReady && hasBoundary && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-2.5 py-1 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-[11px] font-bold cursor-pointer shrink-0 transition"
                  >
                    {lang === 'mr' ? 'तपशील भरा' : 'Fill Details'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium">
                <span className={hasBoundary ? 'text-[#0f5132]' : 'text-rose-700'}>
                  {hasBoundary ? '✓' : '✕'}{' '}
                  {lang === 'mr'
                    ? `सीमा व क्षेत्र (${props.treatmentArea || '0.00'} Ha)`
                    : `Boundary & Net (${props.treatmentArea || '0.00'} Ha)`}
                </span>
                <span className={props.a4FitInfo?.fitsInA4 !== false ? 'text-[#0f5132]' : 'text-amber-800'}>
                  {props.a4FitInfo?.fitsInA4 !== false ? '✓ A4 Scale OK' : '⚠ A3 Scale'}
                </span>
                {missingFields.length > 0 && (
                  <span className="text-amber-900">
                    ⚠ {lang === 'mr' ? 'अपूर्ण:' : 'Missing:'} {missingFields.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Card 1: Orientation & A4 Fit */}
            <div className={`${tileCardClass} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-bold text-[#10251c]">{t('paper_orientation')}</h2>
                {props.a4FitInfo && (
                  <span
                    className={`text-xs font-semibold ${
                      props.a4FitInfo.fitsInA4 ? 'text-[#0f5132]' : 'text-amber-700'
                    }`}
                  >
                    {props.a4FitInfo.fitsInA4 ? 'Fits A4' : 'A3 Recommended'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => props.onOrientationChange('portrait')}
                  className={`min-h-[64px] p-3 rounded-2xl border flex items-center gap-3 transition cursor-pointer ${
                    props.orientation === 'portrait'
                      ? 'bg-gradient-to-b from-[#0f5132] to-[#0b3e26] text-white border-[#0b3e26] shadow-[0_3px_10px_rgba(11,62,38,0.22)]'
                      : 'bg-[#f4f8f5] text-[#173528] border-[#d2e2d7] hover:bg-white'
                  }`}
                >
                  <span
                    className={`w-4 h-5 rounded-xs border-2 flex-shrink-0 ${
                      props.orientation === 'portrait' ? 'border-emerald-200' : 'border-[#6d8a7a]'
                    }`}
                  />
                  <div className="text-left min-w-0">
                    <span className="block font-bold text-[13px] truncate">{t('portrait')}</span>
                    <span
                      className={`block text-[11px] ${
                        props.orientation === 'portrait' ? 'text-emerald-100/90' : 'text-[#527060]'
                      }`}
                    >
                      उभा (A4)
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => props.onOrientationChange('landscape')}
                  className={`min-h-[64px] p-3 rounded-2xl border flex items-center gap-3 transition cursor-pointer ${
                    props.orientation === 'landscape'
                      ? 'bg-gradient-to-b from-[#0f5132] to-[#0b3e26] text-white border-[#0b3e26] shadow-[0_3px_10px_rgba(11,62,38,0.22)]'
                      : 'bg-[#f4f8f5] text-[#173528] border-[#d2e2d7] hover:bg-white'
                  }`}
                >
                  <span
                    className={`w-5 h-4 rounded-xs border-2 flex-shrink-0 ${
                      props.orientation === 'landscape' ? 'border-emerald-200' : 'border-[#6d8a7a]'
                    }`}
                  />
                  <div className="text-left min-w-0">
                    <span className="block font-bold text-[13px] truncate">{t('landscape')}</span>
                    <span
                      className={`block text-[11px] ${
                        props.orientation === 'landscape' ? 'text-emerald-100/90' : 'text-[#527060]'
                      }`}
                    >
                      आडवा (A4)
                    </span>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={props.onAutoOptimizeA4}
                className="w-full min-h-[44px] py-2 px-3 bg-[#f4f8f5] hover:bg-[#e8f3ec] text-[#153a2a] border border-[#cde0d3] hover:border-emerald-300 rounded-xl font-semibold flex items-center justify-center gap-2 transition text-xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#0f5132]" />
                <span>{t('smart_a4_optimize_btn')}</span>
              </button>
            </div>

            {/* Precision Advisory Card if coupe exceeds A4 */}
            {props.a4FitInfo && !props.a4FitInfo.fitsInA4 && (
              <div className="bg-[#fdf8ec] rounded-2xl border border-amber-200/90 shadow-[0_2px_10px_rgba(180,83,9,0.08)] p-4 space-y-2.5 text-xs">
                <div className="font-bold text-amber-950 flex items-center gap-2 text-[13px]">
                  <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>{lang === 'mr' ? 'कूप A4 मर्यादेबाहेर — पर्याय निवडा' : 'Exceeds A4 — Choose Option'}</span>
                </div>
                <p className="text-[11.5px] text-amber-900 leading-relaxed">{props.a4FitInfo.reason}</p>
                <div className="grid grid-cols-1 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={props.onOpenPdfModal}
                    className="w-full min-h-[42px] text-left px-3 py-2 rounded-xl bg-gradient-to-b from-[#0f5132] to-[#0b3e26] hover:from-[#125d3a] hover:to-[#0c452a] text-white font-semibold flex items-center justify-between cursor-pointer text-xs shadow-2xs transition"
                  >
                    <span>{lang === 'mr' ? 'पर्याय १: A3 पृष्ठावर प्रिंट करा' : 'Option 1: Print on A3 Paper'}</span>
                    <span className="font-mono text-emerald-200">A3</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onScaleChange('1cm_100m')}
                    className="w-full min-h-[42px] text-left px-3 py-2 rounded-xl bg-white hover:bg-amber-100/70 border border-amber-200 text-[#10251c] font-semibold flex items-center justify-between cursor-pointer text-xs transition"
                  >
                    <span>{lang === 'mr' ? 'पर्याय २: मोजपट्टी १:१०,००० करा' : 'Option 2: Scale 1:10,000'}</span>
                    <span className="font-mono text-amber-800">1:10K</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onGridSizeChange(200, 200)}
                    className="w-full min-h-[42px] text-left px-3 py-2 rounded-xl bg-white hover:bg-amber-100/70 border border-amber-200 text-[#10251c] font-semibold flex items-center justify-between cursor-pointer text-xs transition"
                  >
                    <span>{lang === 'mr' ? 'पर्याय ३: ग्रीड २०० × २०० मी करा' : 'Option 3: Grid 200m × 200m'}</span>
                    <span className="font-mono text-[#0f5132]">200m</span>
                  </button>
                </div>
              </div>
            )}

            {/* Primary Export Tile + 2-Up Secondary Export Tiles */}
            <button
              type="button"
              onClick={props.onOpenPdfModal}
              className="w-full min-h-[60px] p-4 bg-gradient-to-r from-[#0d4a2d] via-[#0f5132] to-[#145e3b] hover:from-[#105736] hover:to-[#186d45] active:scale-[0.99] text-white rounded-2xl font-bold flex items-center justify-between shadow-[0_4px_14px_rgba(11,62,38,0.26)] border border-[#1d6e48]/40 transition cursor-pointer text-[13.5px]"
            >
              <span className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/15 border border-white/15 flex items-center justify-center">
                  <FileDown className="w-4.5 h-4.5 text-emerald-100" />
                </span>
                <span>{t('download_pdf')} (A4 / A3)</span>
              </span>
              <ChevronRight className="w-4.5 h-4.5 text-emerald-200" />
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={props.onExportKmz}
                className="bg-white/98 hover:bg-[#f4faf6] active:scale-[0.99] border border-[#d4e3d9] shadow-[0_2px_10px_rgba(11,53,39,0.06)] text-[#10251c] rounded-2xl p-3.5 flex flex-col items-start justify-between gap-2.5 text-left cursor-pointer transition min-h-[90px]"
              >
                <div className="w-9 h-9 rounded-xl bg-[#eef5f0] border border-[#cfe0d4] flex items-center justify-center">
                  <Globe className="w-4.5 h-4.5 text-[#1b4633]" />
                </div>
                <div className="w-full min-w-0">
                  <span className="block font-bold text-[13px] truncate">
                    {lang === 'mr' ? 'KMZ फाईल' : 'Export KMZ'}
                  </span>
                  <span className="block text-[11px] text-[#527060] truncate mt-0.5">Google Earth</span>
                </div>
              </button>

              <button
                type="button"
                onClick={props.onOpenShareModal}
                className="bg-white/98 hover:bg-[#edf8f1] active:scale-[0.99] border border-emerald-300/80 shadow-[0_2px_10px_rgba(15,81,50,0.08)] text-[#10251c] rounded-2xl p-3.5 flex flex-col items-start justify-between gap-2.5 text-left cursor-pointer transition min-h-[90px]"
              >
                <div className="w-9 h-9 rounded-xl bg-[#eaf6ee] border border-[#c6e1cf] flex items-center justify-center">
                  <Share2 className="w-4.5 h-4.5 text-[#0f5132]" />
                </div>
                <div className="w-full min-w-0">
                  <span className="block font-bold text-[13px] truncate">
                    {lang === 'mr' ? 'WhatsApp शेअर' : 'WhatsApp Share'}
                  </span>
                  <span className="block text-[11px] text-[#0f5132] font-semibold truncate mt-0.5">PDF + KMZ</span>
                </div>
              </button>
            </div>

            {/* Compact Offline Library, Pre-Cache Tiles & JSON Backup Row */}
            {(props.onOpenSavedCoupes || props.onExportProjectBackup || props.onOpenOfflineTiles) && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2.5">
                  {props.onOpenSavedCoupes && (
                    <button
                      type="button"
                      onClick={props.onOpenSavedCoupes}
                      className="min-h-[42px] px-3 rounded-xl bg-white/98 hover:bg-[#f4faf6] border border-[#d4e3d9] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[#1a3a2b] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#0f5132]" />
                      <span className="truncate">
                        {lang === 'mr' ? 'KMZ फोल्डर' : 'KMZ Folder'}
                      </span>
                    </button>
                  )}
                  {props.onExportProjectBackup && (
                    <button
                      type="button"
                      onClick={props.onExportProjectBackup}
                      className="min-h-[42px] px-3 rounded-xl bg-white/98 hover:bg-[#f4faf6] border border-[#d4e3d9] shadow-[0_1px_4px_rgba(11,53,39,0.05)] text-[#1a3a2b] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Save className="w-3.5 h-3.5 text-sky-700" />
                      <span className="truncate">
                        {lang === 'mr' ? 'बॅकअप (.json)' : 'Backup (.json)'}
                      </span>
                    </button>
                  )}
                </div>
                {props.onOpenOfflineTiles && (
                  <button
                    type="button"
                    onClick={props.onOpenOfflineTiles}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#f2f9f4] hover:bg-[#e5f4ea] border border-[#c3dfcc] text-[#0c452a] font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <MapIcon className="w-4 h-4 text-[#0f5132] shrink-0" />
                    <span className="truncate">
                      {lang === 'mr'
                        ? 'जंगलासाठी ऑफलाईन उपग्रह नकाशा टाईल्स कॅश करा'
                        : 'Pre-cache Offline Forest Map Tiles'}
                    </span>
                    {(props.cachedTileCount ?? 0) > 0 && (
                      <span className="font-mono text-[10.5px] font-bold text-[#0f5132] tabular-nums">
                        ({props.cachedTileCount})
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          );
        })()}
      </div>

      {/* Wizard Footer: Back / Step Indicator / Next */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t border-[#d4e3d9] px-3.5 py-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => activeStep > 1 && setStep((activeStep - 1) as 1 | 2 | 3 | 4)}
          disabled={activeStep === 1}
          className={`min-h-[42px] px-3.5 py-1.5 rounded-xl font-semibold flex items-center gap-1 text-xs transition ${
            activeStep === 1
              ? 'text-[#a5bab0] bg-[#f4f8f5] cursor-not-allowed'
              : 'text-[#173a2b] bg-[#ebf3ed] hover:bg-[#dfece3] border border-[#d2e2d7] cursor-pointer'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{lang === 'mr' ? 'मागे' : 'Back'}</span>
        </button>

        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => setStep(num as 1 | 2 | 3 | 4)}
              aria-label={`Step ${num}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                activeStep === num ? 'w-6 bg-[#0f5132]' : 'w-2 bg-[#c3d7c9] hover:bg-[#9bb9a5]'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => activeStep < 4 && setStep((activeStep + 1) as 1 | 2 | 3 | 4)}
          disabled={activeStep === 4}
          className={`min-h-[42px] px-4 py-1.5 rounded-xl font-semibold flex items-center gap-1 text-xs transition ${
            activeStep === 4
              ? 'text-[#a5bab0] bg-[#f4f8f5] cursor-not-allowed'
              : 'text-white bg-gradient-to-b from-[#0f5132] to-[#0b3e26] hover:from-[#125d3a] hover:to-[#0c452a] shadow-[0_2px_6px_rgba(11,62,38,0.24)] cursor-pointer'
          }`}
        >
          <span>{lang === 'mr' ? 'पुढे' : 'Next'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
