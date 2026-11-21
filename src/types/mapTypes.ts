/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface LatLonPoint {
  lat: number;
  lon: number;
}

export interface MeterPoint {
  mx: number;
  my: number;
  lat?: number;
  lon?: number;
  label?: string;
}

export interface GeoRef {
  hasGeo: boolean;
  centerLat: number;
  centerLon: number;
  northLat: number;
  southLat: number;
  eastLon: number;
  westLon: number;
}

export interface ScaleConfig {
  id: string;
  name: string;
  pxPer100m: number;
  gridStepXPx: number;
  gridStepYPx: number;
  metersX: number;
  metersY: number;
}

export type NonWorkingFeatureKind = 'road' | 'nala' | 'patch';
export type NalaSide = 'left' | 'right';

export interface NonWorkingAreaItem {
  id: string;
  fileName: string;
  pts: Point2D[];
  areaHa: number;
  category?: 'patch' | 'road' | 'nala';
  roadWidthM?: number;
  roadLengthM?: number;
  nalaSide?: NalaSide;
  centerlinePts?: Point2D[];
  /** Original unclipped walked bank/centerline preserved so Left/Right Nala side toggling remains accurate even after boundary clipping */
  sourceCenterlinePts?: Point2D[];
}

export interface BaselineData {
  p1: Point2D;
  p2: Point2D;
  origin0?: Point2D;
  bearingDeg: number;
  manualOffset: Point2D;
}

export interface SectionLineData {
  p1: Point2D;
  p2: Point2D;
  distanceFromStart: number;
  label: string;
}

export interface FeaturePreset {
  id: string;
  key?: string;
  label?: string;
  symbol: string;
  color: string;
  enabled: boolean;
  markers: MeterPoint[];
  custom?: boolean;
}

export interface EdgeGpsPoint {
  point: Point2D;
  lat: number;
  lon: number;
  dmsLat: string;
  dmsLon: string;
  tag: 'N' | 'S' | 'E' | 'W' | 'CORNER';
  label: string;
  normalX: number;
  normalY: number;
}

export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1' | 'a0';
export type Orientation = 'portrait' | 'landscape';
export type LandIdentifierType = 'compartment' | 'survey' | 'gut';

export interface GridStatementData {
  title: string;
  village: string;
  landIdentifierType: LandIdentifierType;
  landIdentifierValue: string;
  division: string;
  subDivision: string;
  range: string;
  round: string;
  beat: string;
  treatmentArea: string;
  totalArea: string;
  plantSpacingM: number;
  targetTotalPlants: number;
  cells: ForestryCellBlock[];
  vanrakshak: string;
  vanpal: string;
  rfo: string;
  lang: string;
  date?: string;
  nonTreatmentArea?: string;
  gridWidthM?: number;
  gridHeightM?: number;
  pegs?: ForestryStationPeg[];
  geoRef?: GeoRef;
  polygonAreaHa?: number;
  isNonWorkingNil?: boolean;
}

export interface PaperChoice {
  size: PaperSize;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  fitsInA4: boolean;
  recommendedSize: 'a4' | 'a3';
}

export interface PageValidationResult {
  paperSize: 'a4' | 'a3';
  orientation: 'landscape' | 'portrait';
  fits: boolean;
  message?: string;
  shrinkFactor?: number;
}

export interface MapTransform {
  panX: number;
  panY: number;
  rotationDeg: number;
  zoom: number; // Viewport zoom for mobile & desktop
}

export interface UserLocation {
  mx: number;
  my: number;
  lat?: number;
  lon?: number;
  accuracy: number;
  headingDeg?: number | null;
  speedMps?: number;
}

export interface TouchedGpsLocation {
  canvasX: number;
  canvasY: number;
  mx: number;
  my: number;
  lat: number;
  lon: number;
  dmsLat: string;
  dmsLon: string;
  gridCode: string;
  distToEdge: number;
  isInside: boolean;
}

export interface ForestryStationPeg {
  colIndex: number;
  rowIndex: number;
  colLetter: string;
  label: string;
  pointM: Point2D;
  geoPointM?: Point2D;
  isBaselineStation: boolean;
  isEndPointOfLine: boolean;
  side: 'baseline' | 'L' | 'R';
  rowNum: number;
}

export interface ForestryGridLineSegment {
  p1: Point2D;
  p2: Point2D;
  type: 'baseline' | 'column' | 'row';
  colIndex?: number;
  rowIndex?: number;
  label?: string;
}

export interface ForestryCellBlock {
  cellNumber: number;
  colIndex: number;
  rowIndex: number;
  colLetter: string;
  label: string;
  centerM: Point2D;
  cornersM?: Point2D[];
  areaHa: number;
  estimatedPlants: number;
  grossAreaHa?: number;
  nonWorkingAreaHa?: number;
  workableAreaHa?: number;
  isFullCell?: boolean;
}

export type GpsSignalQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface LiveGpsTelemetry {
  rawAccuracyM: number | null;
  filteredAccuracyM: number | null;
  /** Estimated Horizontal Position Error (95% confidence radius, meters) */
  ehpeM?: number | null;
  /** Estimated locked GNSS satellites derived from EHPE, 3D lock & fix stability */
  estimatedSatellites?: number;
  /** Signal strength percentage (0–100) */
  signalStrengthPct?: number;
  /** Discrete signal bars (0–5) */
  signalBars?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Estimated Horizontal Dilution of Precision (HDOP) */
  hdopEst?: number | null;
  /** GNSS fix dimension (3D when altitude is locked, 2D horizontal only, or none) */
  fixMode?: 'none' | '2D' | '3D';
  /** Timestamp of latest fix (ms) */
  lastFixTimestamp?: number;
  quality: GpsSignalQuality;
  acceptedFixes: number;
  rejectedFixes: number;
  speedMps: number;
  maxAccuracyGateM: number;
  lat?: number;
  lon?: number;
  isLocked: boolean;
}

export interface BoundaryPillar {
  id: string;
  label: string;
  mx: number;
  my: number;
  lat: number;
  lon: number;
  accuracyM?: number;
  timestamp: number;
}

export interface LayerVisibility {
  showBoundary: boolean;
  showNonWorking: boolean;
  showBaseline: boolean;
  showSectionLines: boolean;
  showGridLines: boolean;
  showLandmarks: boolean;
}

export type WorkableWalkPhase = 'idle' | 'setup' | 'road_walk' | 'road_review' | 'outer_walk';

export interface LiveWorkableWalkState {
  active: boolean;
  phase: WorkableWalkPhase;
  inputMode: 'gps' | 'map';
  isPaused?: boolean;
  wakeLockActive?: boolean;
  targetWorkableHa: number;
  includeRoadFirst: boolean;
  activeNonWorkingKind: NonWorkingFeatureKind;
  roadWidthM: number;
  nalaWidthM: number;
  nalaSide: NalaSide;
  roadDraftPoints: Point2D[];
  sessionRoadItems: NonWorkingAreaItem[];
  roadAreaHa: number;
  targetGrossHa: number;
  outerPoints: Point2D[];
  currentGrossHa: number;
  remainingGrossHa: number;
  currentNetWorkableHa: number;
  remainingWorkableHa: number;
  perimeterM: number;
  activeDraftDistanceM?: number;
  activeDraftAreaHa?: number;
  totalSessionNonWorkingHa?: number;
  liveOuterWalkedM?: number;
  distToStartM?: number | null;
  bearingToStartDeg?: number | null;
  bearingToStartCompass?: string;
  pillars?: BoundaryPillar[];
}

export type NavTargetCategory = 'pillar' | 'corner' | 'baseline' | 'peg' | 'landmark' | 'custom';

export interface NavTarget {
  id: string;
  label: string;
  sublabel?: string;
  category: NavTargetCategory;
  mx: number;
  my: number;
  lat: number;
  lon: number;
}



