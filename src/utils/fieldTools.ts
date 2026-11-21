/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BoundaryPillar,
  FeaturePreset,
  GeoRef,
  LandIdentifierType,
  NalaSide,
  NonWorkingAreaItem,
  NonWorkingFeatureKind,
  Orientation,
  Point2D,
  WorkableWalkPhase
} from '../types/mapTypes';
import { saveOrShareBlobFile } from './nativeBridge';

const ACTIVE_WALK_DRAFT_KEY = 'forest_active_walk_draft_v1';
const SAVED_COUPES_KEY = 'forest_saved_coupes_v1';
const OFFICER_PROFILE_KEY = 'forest_officer_profile_v1';

export interface OfficerProfileDefaults {
  division: string;
  subDivision: string;
  range: string;
  round: string;
  beat: string;
  village: string;
  vanrakshak: string;
  vanpal: string;
  rfo: string;
  plantSpacingM?: number;
  savedAt: number;
}

export function loadOfficerProfileDefaults(): OfficerProfileDefaults | null {
  try {
    const raw = localStorage.getItem(OFFICER_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfficerProfileDefaults;
    if (!parsed || typeof parsed !== 'object') return null;
    const hasAny = Boolean(
      parsed.division ||
        parsed.subDivision ||
        parsed.range ||
        parsed.round ||
        parsed.beat ||
        parsed.village ||
        parsed.vanrakshak ||
        parsed.vanpal ||
        parsed.rfo
    );
    return hasAny ? parsed : null;
  } catch {
    return null;
  }
}

export function saveOfficerProfileDefaults(
  profile: Omit<OfficerProfileDefaults, 'savedAt'>
): OfficerProfileDefaults {
  const payload: OfficerProfileDefaults = {
    ...profile,
    savedAt: Date.now()
  };
  try {
    localStorage.setItem(OFFICER_PROFILE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
  return payload;
}

export function clearOfficerProfileDefaults(): void {
  try {
    localStorage.removeItem(OFFICER_PROFILE_KEY);
  } catch {
    // Ignore
  }
}

// ============================================================================
// 1. SCREEN WAKE LOCK (Keeps Phone Screen Awake During Active Jungle GPS Walks)
// ============================================================================

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

let activeWakeLock: WakeLockSentinelLike | null = null;

export async function acquireScreenWakeLock(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
      return false;
    }
    if (activeWakeLock && !activeWakeLock.released) {
      return true;
    }
    activeWakeLock = await nav.wakeLock.request('screen');
    activeWakeLock.addEventListener?.('release', () => {
      activeWakeLock = null;
    });
    return true;
  } catch {
    return false;
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  try {
    if (activeWakeLock && !activeWakeLock.released) {
      await activeWakeLock.release();
    }
  } catch {
    // Ignore browser release errors
  } finally {
    activeWakeLock = null;
  }
}

// ============================================================================
// 2. SUBTLE HAPTIC VIBRATION & AUDIO CUES (Hands-Free Forest Trail Feedback)
// ============================================================================

function playSoftTone(freqs: number[], durationMs = 90, gainLevel = 0.06) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    let offset = ctx.currentTime;
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, offset);
      gain.gain.setValueAtTime(0.001, offset);
      gain.gain.exponentialRampToValueAtTime(gainLevel, offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, offset + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(offset);
      osc.stop(offset + durationMs / 1000 + 0.02);
      offset += durationMs / 1000 + 0.035;
    });
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, freqs.length * (durationMs + 50) + 150);
  } catch {
    // Ignore autoplay/audio restrictions
  }
}

export function triggerVertexCapturedFeedback(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(35);
    }
  } catch {
    // Ignore
  }
  playSoftTone([740], 65, 0.04);
}

export function triggerPillarStampedFeedback(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([45, 45, 60]);
    }
  } catch {
    // Ignore
  }
  playSoftTone([660, 880], 85, 0.055);
}

export function triggerTargetCompletedFeedback(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([120, 70, 140, 70, 220]);
    }
  } catch {
    // Ignore
  }
  playSoftTone([587.33, 783.99, 1046.5], 115, 0.07);
}

export function triggerArrivalFeedback(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([80, 60, 120]);
    }
  } catch {
    // Ignore
  }
  playSoftTone([783.99, 1046.5], 110, 0.065);
}

// ============================================================================
// 3. CRASH-PROOF ACTIVE WALK AUTO-SAVE & RECOVERY
// ============================================================================

export interface ActiveWalkDraft {
  savedAt: number;
  phase: WorkableWalkPhase;
  inputMode: 'gps' | 'map';
  targetWorkableHa: number;
  includeRoadFirst: boolean;
  activeNonWorkingKind?: NonWorkingFeatureKind;
  roadWidthM: number;
  nalaWidthM?: number;
  nalaSide?: NalaSide;
  roadDraftPoints: Point2D[];
  sessionRoadItems: NonWorkingAreaItem[];
  outerWalkPoints: Point2D[];
  fieldOrigin: { lat: number; lon: number } | null;
  pillars: BoundaryPillar[];
}

export function saveActiveWalkDraft(draft: ActiveWalkDraft): void {
  try {
    localStorage.setItem(ACTIVE_WALK_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota errors
  }
}

export function loadActiveWalkDraft(): ActiveWalkDraft | null {
  try {
    const raw = localStorage.getItem(ACTIVE_WALK_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveWalkDraft;
    if (!parsed || parsed.phase === 'idle') return null;
    const hasProgress =
      (parsed.outerWalkPoints?.length ?? 0) > 0 ||
      (parsed.roadDraftPoints?.length ?? 0) > 0 ||
      (parsed.sessionRoadItems?.length ?? 0) > 0;
    if (!hasProgress) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveWalkDraft(): void {
  try {
    localStorage.removeItem(ACTIVE_WALK_DRAFT_KEY);
  } catch {
    // Ignore
  }
}

// ============================================================================
// 4. OFFLINE SAVED COUPES LIBRARY & 1-TAP JSON PROJECT BACKUP
// ============================================================================

export interface SavedCoupeProject {
  id: string;
  name: string;
  savedAt: number;
  schemaVersion: 1;
  // Geometry & GeoRef
  rawWorkingPoints: Point2D[];
  nonWorkingFiles: NonWorkingAreaItem[];
  isNonWorkingNil: boolean;
  geoRef: GeoRef;
  workingFileName: string;
  nonWorkingFileName: string;
  // Pillars & Landmarks
  boundaryPillars: BoundaryPillar[];
  features: FeaturePreset[];
  // Map Setup
  scaleId: string;
  customScaleCm: number;
  customScaleM: number;
  gridWidthM: number;
  gridHeightM: number;
  orientation: Orientation;
  baselineOption: 'horizontal' | 'vertical' | 'grid_parallel' | 'longest_axis';
  manualBaselineOffset: Point2D;
  showSectionLines: boolean;
  sectionLineOffset: number;
  rotationDeg: number;
  legendPos: string;
  legendLayout?: 'box' | 'strip';
  legendSize?: 'compact' | 'standard';
  legendOffset: Point2D;
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
  // Admin Details & Signatures
  treatmentTitle: string;
  village: string;
  landIdentifierType: LandIdentifierType;
  landIdentifierValue: string;
  division: string;
  subDivision: string;
  range: string;
  round: string;
  beat: string;
  compartmentNo: string;
  mapDate: string;
  treatmentType: string;
  customTreatmentType: string;
  plantSpacingM: number;
  targetTotalPlants: number;
  vanrakshak: string;
  vanpal: string;
  rfo: string;
  // Summary preview fields
  totalAreaHa: string;
  treatmentAreaHa: string;
  // Folder source & KMZ metadata
  source?: 'app' | 'kmz_import' | 'json_import';
  kmzFileName?: string;
}

export function listSavedCoupes(): SavedCoupeProject[] {
  try {
    const raw = localStorage.getItem(SAVED_COUPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } catch {
    return [];
  }
}

export function upsertSavedCoupe(project: SavedCoupeProject): SavedCoupeProject[] {
  const existing = listSavedCoupes().filter((p) => p.id !== project.id);
  const next = [project, ...existing].slice(0, 40);
  try {
    localStorage.setItem(SAVED_COUPES_KEY, JSON.stringify(next));
  } catch {
    // If localStorage is tight, keep newest 16
    const trimmed = next.slice(0, 16);
    try {
      localStorage.setItem(SAVED_COUPES_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return existing;
    }
  }
  return next;
}

export function deleteSavedCoupe(id: string): SavedCoupeProject[] {
  const next = listSavedCoupes().filter((p) => p.id !== id);
  try {
    localStorage.setItem(SAVED_COUPES_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function downloadProjectJsonBackup(project: SavedCoupeProject): string {
  const safeBase = (project.landIdentifierValue || project.compartmentNo || project.name || 'Coupe_Map')
    .replace(/[^\w\d-_]/g, '_')
    .slice(0, 48);
  const filename = `${safeBase}_ForestProject.json`;
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  void saveOrShareBlobFile(blob, filename, {
    title: filename,
    dialogTitle: 'Save or Share Coupe Backup (.json)',
  });
  return filename;
}

export function parseProjectJsonBackup(rawText: string): SavedCoupeProject | null {
  try {
    const data = JSON.parse(rawText);
    if (!data || !Array.isArray(data.rawWorkingPoints) || !data.geoRef) {
      return null;
    }
    return {
      ...data,
      id: data.id || `coupe_${Date.now()}`,
      name: data.name || data.landIdentifierValue || data.compartmentNo || 'Imported Coupe',
      savedAt: Date.now(),
      schemaVersion: 1,
      boundaryPillars: Array.isArray(data.boundaryPillars) ? data.boundaryPillars : [],
      nonWorkingFiles: Array.isArray(data.nonWorkingFiles) ? data.nonWorkingFiles : []
    } as SavedCoupeProject;
  } catch {
    return null;
  }
}
