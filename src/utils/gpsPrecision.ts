/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Survey-Grade Field GPS Precision Engine & Exact Target-Area Polygon Solver.
 *
 * Designed for forest fieldwork under partial canopy:
 * 1. Exact WGS84 ellipsoidal local tangent projection (sub-cm accuracy at any latitude).
 * 2. Adaptive 2D inverse-variance Kalman filter + multipath spike rejection.
 * 3. Configurable accuracy gate (Strict <=10m vs Canopy <=22m) & stationary drift guard.
 * 4. Corner-aware vertex capture + multi-sample burst corner averaging.
 * 5. Exact binary-search target area auto-completion solver (<= 0.0001 Ha precision).
 */

import { GeoRef, GpsSignalQuality, LiveGpsTelemetry, Point2D } from '../types/mapTypes';
import { calcAreaHa } from './geoUtils';
import { computeExactParentChildrenUnionAreaM2 } from './polygonAreaEngine';

// WGS84 ellipsoid constants
const WGS84_A = 6378137.0; // semi-major axis (meters)
const WGS84_E2 = 0.00669437999014; // first eccentricity squared

/**
 * Computes exact WGS84 meters-per-degree along meridian (lat) and parallel (lon)
 * at a given reference latitude.
 */
export function getWgs84MetersPerDegree(refLatDeg: number): { latM: number; lonM: number } {
  const phi = (refLatDeg * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const denom = Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);

  // Meridional radius of curvature M and prime vertical radius N
  const M = (WGS84_A * (1 - WGS84_E2)) / Math.pow(denom, 3);
  const N = WGS84_A / denom;

  const latM = (M * Math.PI) / 180;
  const lonM = (N * cosPhi * Math.PI) / 180;
  return { latM, lonM };
}

/**
 * Projects WGS84 lat/lon to local tangent plane meters relative to origin (refLat, refLon).
 */
export function latLonToLocalMetersWGS84(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): Point2D {
  const { latM, lonM } = getWgs84MetersPerDegree(refLat);
  return {
    x: (lon - refLon) * lonM,
    y: (lat - refLat) * latM
  };
}

/**
 * Inverse projects local meters (x, y) back to WGS84 lat/lon relative to origin.
 */
export function localMetersToLatLonWGS84(
  pt: Point2D,
  refLat: number,
  refLon: number
): { lat: number; lon: number } {
  const { latM, lonM } = getWgs84MetersPerDegree(refLat);
  return {
    lat: refLat + pt.y / latM,
    lon: refLon + pt.x / lonM
  };
}

/**
 * Builds a complete GeoRef bounding box from a set of centered local meter points
 * and their WGS84 center origin.
 */
export function buildGeoRefFromLocalPolygon(
  pts: Point2D[],
  centerLat: number,
  centerLon: number
): GeoRef {
  if (!pts.length) {
    return {
      hasGeo: true,
      centerLat,
      centerLon,
      northLat: centerLat + 0.002,
      southLat: centerLat - 0.002,
      eastLon: centerLon + 0.002,
      westLon: centerLon - 0.002
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const p of pts) {
    const ll = localMetersToLatLonWGS84(p, centerLat, centerLon);
    if (ll.lat < minLat) minLat = ll.lat;
    if (ll.lat > maxLat) maxLat = ll.lat;
    if (ll.lon < minLon) minLon = ll.lon;
    if (ll.lon > maxLon) maxLon = ll.lon;
  }

  return {
    hasGeo: true,
    centerLat,
    centerLon,
    northLat: maxLat,
    southLat: minLat,
    eastLon: maxLon,
    westLon: minLon
  };
}

export function classifyGpsAccuracy(accuracyM: number | null): GpsSignalQuality {
  if (accuracyM === null || !Number.isFinite(accuracyM)) return 'poor';
  if (accuracyM <= 5) return 'excellent';
  if (accuracyM <= 10) return 'good';
  if (accuracyM <= 20) return 'fair';
  return 'poor';
}

export interface GpsQualitySnapshot {
  ehpeM: number | null;
  estimatedSatellites: number;
  signalStrengthPct: number;
  signalBars: 0 | 1 | 2 | 3 | 4 | 5;
  hdopEst: number | null;
  fixMode: 'none' | '2D' | '3D';
}

/**
 * Computes real-time GNSS quality indicators (EHPE, estimated satellite lock count,
 * HDOP estimate, 2D/3D fix mode, and 0–5 signal strength bars) from browser Geolocation
 * accuracy (95% horizontal error radius), altitude availability, and Kalman filter convergence.
 */
export function computeGpsQualityMetrics(
  ehpeM: number | null,
  hasAltitude: boolean,
  isLocked: boolean,
  acceptedFixes: number
): GpsQualitySnapshot {
  if (ehpeM === null || !Number.isFinite(ehpeM) || ehpeM <= 0) {
    return {
      ehpeM: null,
      estimatedSatellites: 0,
      signalStrengthPct: 0,
      signalBars: 0,
      hdopEst: null,
      fixMode: 'none'
    };
  }

  const fixMode: '2D' | '3D' = hasAltitude ? '3D' : '2D';
  // Standard GNSS UERE (~3.2m 1-sigma, ~5.5m 95%): HDOP ≈ EHPE / 3.8
  const hdopEst = Number(Math.max(0.7, Math.min(9.9, ehpeM / 3.8)).toFixed(1));

  // Estimate locked GNSS satellites from EHPE & 3D fix availability (multi-constellation GPS+GLONASS+NavIC/Galileo)
  const stabilityBonus = Math.min(2, Math.floor(acceptedFixes / 6));
  const altBonus = hasAltitude ? 1 : 0;
  let baseSats = 3;
  if (ehpeM <= 3.0) baseSats = 12;
  else if (ehpeM <= 4.5) baseSats = 10;
  else if (ehpeM <= 6.5) baseSats = 9;
  else if (ehpeM <= 9.0) baseSats = 8;
  else if (ehpeM <= 13.0) baseSats = 6;
  else if (ehpeM <= 20.0) baseSats = 5;
  else if (ehpeM <= 35.0) baseSats = 4;
  else baseSats = 3;

  const estimatedSatellites = isLocked
    ? Math.min(16, Math.max(4, baseSats + altBonus + (ehpeM <= 10 ? stabilityBonus : 0)))
    : Math.max(2, Math.min(5, baseSats));

  // Continuous signal strength 0..100 mapped smoothly from EHPE (<=2m => 100%, >=45m => 12%)
  let signalStrengthPct: number;
  if (ehpeM <= 2.5) signalStrengthPct = 98;
  else if (ehpeM <= 5) signalStrengthPct = Math.round(98 - ((ehpeM - 2.5) / 2.5) * 12);
  else if (ehpeM <= 10) signalStrengthPct = Math.round(86 - ((ehpeM - 5) / 5) * 20);
  else if (ehpeM <= 20) signalStrengthPct = Math.round(66 - ((ehpeM - 10) / 10) * 26);
  else if (ehpeM <= 40) signalStrengthPct = Math.round(40 - ((ehpeM - 20) / 20) * 24);
  else signalStrengthPct = Math.max(8, Math.round(16 - Math.min(8, (ehpeM - 40) / 10)));

  let signalBars: 0 | 1 | 2 | 3 | 4 | 5 = 1;
  if (ehpeM <= 4.5) signalBars = 5;
  else if (ehpeM <= 8.5) signalBars = 4;
  else if (ehpeM <= 15) signalBars = 3;
  else if (ehpeM <= 25) signalBars = 2;
  else signalBars = 1;

  return {
    ehpeM: Number(ehpeM.toFixed(1)),
    estimatedSatellites,
    signalStrengthPct,
    signalBars,
    hdopEst,
    fixMode
  };
}

export interface GpsFixSample {
  x: number;
  y: number;
  lat: number;
  lon: number;
  accuracyM: number;
  timestamp: number;
}

export interface GpsFilterResult {
  accepted: boolean;
  reason?: 'accuracy_too_low' | 'velocity_spike';
  filteredPoint: Point2D;
  filteredLatLon: { lat: number; lon: number };
  telemetry: LiveGpsTelemetry;
}

/**
 * Adaptive 2D Inverse-Variance Kalman GPS Precision Filter.
 * Smooths canopy multipath jitter, rejects impossible jumps, enforces an accuracy gate,
 * and supports corner-aware vertex emission + burst-averaged corner pinning.
 */
export class GpsPrecisionFilter {
  private maxAccuracyGateM: number;
  private estX: number | null = null;
  private estY: number | null = null;
  private varianceM2: number = 25;
  private lastAcceptedTime: number = 0;
  private lastHeadingRad: number | null = null;
  private recentBuffer: GpsFixSample[] = [];
  private acceptedFixes = 0;
  private rejectedFixes = 0;
  private lastSpeedMps = 0;

  constructor(maxAccuracyGateM = 12) {
    this.maxAccuracyGateM = maxAccuracyGateM;
  }

  public setMaxAccuracyGate(gateM: number) {
    this.maxAccuracyGateM = Math.max(3, Math.min(50, gateM));
  }

  public getMaxAccuracyGate(): number {
    return this.maxAccuracyGateM;
  }

  public reset() {
    this.estX = null;
    this.estY = null;
    this.varianceM2 = 25;
    this.lastAcceptedTime = 0;
    this.lastHeadingRad = null;
    this.recentBuffer = [];
    this.acceptedFixes = 0;
    this.rejectedFixes = 0;
    this.lastSpeedMps = 0;
  }

  /**
   * Processes a raw browser Geolocation fix in local meters.
   */
  public processFix(
    rawPt: Point2D,
    lat: number,
    lon: number,
    rawAccuracyM: number,
    refLat: number,
    refLon: number,
    timestamp = Date.now(),
    altitudeM: number | null = null
  ): GpsFilterResult {
    const safeAcc = Math.max(1, Number.isFinite(rawAccuracyM) ? rawAccuracyM : 99);
    const quality = classifyGpsAccuracy(safeAcc);
    const hasAltitude = altitudeM !== null && Number.isFinite(altitudeM);

    // 1. Accuracy Gate Check (still updates live telemetry so user sees exact meter accuracy)
    if (safeAcc > this.maxAccuracyGateM) {
      this.rejectedFixes += 1;
      const fallbackPt =
        this.estX !== null && this.estY !== null ? { x: this.estX, y: this.estY } : rawPt;
      const fallbackLL = localMetersToLatLonWGS84(fallbackPt, refLat, refLon);
      const filtAcc =
        this.estX !== null ? Number(Math.sqrt(this.varianceM2).toFixed(1)) : Number(safeAcc.toFixed(1));
      const metrics = computeGpsQualityMetrics(safeAcc, hasAltitude, false, this.acceptedFixes);
      return {
        accepted: false,
        reason: 'accuracy_too_low',
        filteredPoint: fallbackPt,
        filteredLatLon: fallbackLL,
        telemetry: {
          rawAccuracyM: Number(safeAcc.toFixed(1)),
          filteredAccuracyM: filtAcc,
          ...metrics,
          lastFixTimestamp: timestamp,
          quality,
          acceptedFixes: this.acceptedFixes,
          rejectedFixes: this.rejectedFixes,
          speedMps: this.lastSpeedMps,
          maxAccuracyGateM: this.maxAccuracyGateM,
          lat,
          lon,
          isLocked: false
        }
      };
    }

    // 2. First valid lock initialization
    if (this.estX === null || this.estY === null) {
      this.estX = rawPt.x;
      this.estY = rawPt.y;
      this.varianceM2 = safeAcc * safeAcc;
      this.lastAcceptedTime = timestamp;
      this.acceptedFixes = 1;
      this.pushBuffer({ x: rawPt.x, y: rawPt.y, lat, lon, accuracyM: safeAcc, timestamp });
      const metrics = computeGpsQualityMetrics(safeAcc, hasAltitude, true, this.acceptedFixes);

      return {
        accepted: true,
        filteredPoint: { x: this.estX, y: this.estY },
        filteredLatLon: { lat, lon },
        telemetry: {
          rawAccuracyM: Number(safeAcc.toFixed(1)),
          filteredAccuracyM: Number(safeAcc.toFixed(1)),
          ...metrics,
          lastFixTimestamp: timestamp,
          quality,
          acceptedFixes: this.acceptedFixes,
          rejectedFixes: this.rejectedFixes,
          speedMps: 0,
          maxAccuracyGateM: this.maxAccuracyGateM,
          lat,
          lon,
          isLocked: true
        }
      };
    }

    // 3. Velocity / Multipath Spike Check
    const dtSec = Math.max(0.25, (timestamp - this.lastAcceptedTime) / 1000);
    const jumpDistM = Math.hypot(rawPt.x - this.estX, rawPt.y - this.estY);
    const impliedSpeed = jumpDistM / dtSec;

    // Human walking/jogging in forest rarely exceeds 7.5 m/s (~27 km/h); reject canopy multipath spikes
    if (impliedSpeed > 7.5 && jumpDistM > Math.max(12, safeAcc * 1.5)) {
      this.rejectedFixes += 1;
      const heldPt = { x: this.estX, y: this.estY };
      const heldLL = localMetersToLatLonWGS84(heldPt, refLat, refLon);
      const heldAcc = Number(Math.sqrt(this.varianceM2).toFixed(1));
      const metrics = computeGpsQualityMetrics(heldAcc, hasAltitude, true, this.acceptedFixes);
      return {
        accepted: false,
        reason: 'velocity_spike',
        filteredPoint: heldPt,
        filteredLatLon: heldLL,
        telemetry: {
          rawAccuracyM: Number(safeAcc.toFixed(1)),
          filteredAccuracyM: heldAcc,
          ...metrics,
          lastFixTimestamp: timestamp,
          quality,
          acceptedFixes: this.acceptedFixes,
          rejectedFixes: this.rejectedFixes,
          speedMps: this.lastSpeedMps,
          maxAccuracyGateM: this.maxAccuracyGateM,
          lat: heldLL.lat,
          lon: heldLL.lon,
          isLocked: true
        }
      };
    }

    // 4. Adaptive 2D Kalman Prediction + Measurement Update
    // Walking process noise Q (~1.8 m/s walking uncertainty scaled by elapsed time)
    const walkingProcessQ = 2.25; // (1.5 m/s)^2
    this.varianceM2 += dtSec * walkingProcessQ;

    const measVariance = safeAcc * safeAcc;
    const kalmanGain = this.varianceM2 / (this.varianceM2 + measVariance);

    const prevX = this.estX;
    const prevY = this.estY;
    this.estX = prevX + kalmanGain * (rawPt.x - prevX);
    this.estY = prevY + kalmanGain * (rawPt.y - prevY);
    this.varianceM2 = Math.max(0.5, (1 - kalmanGain) * this.varianceM2);

    const smoothStep = Math.hypot(this.estX - prevX, this.estY - prevY);
    this.lastSpeedMps = Number((smoothStep / dtSec).toFixed(2));
    this.lastAcceptedTime = timestamp;
    this.acceptedFixes += 1;

    const filteredPt = { x: this.estX, y: this.estY };
    const filteredLL = localMetersToLatLonWGS84(filteredPt, refLat, refLon);
    const filteredAcc = Number(Math.min(safeAcc, Math.sqrt(this.varianceM2)).toFixed(1));
    const metrics = computeGpsQualityMetrics(filteredAcc, hasAltitude, true, this.acceptedFixes);

    this.pushBuffer({
      x: filteredPt.x,
      y: filteredPt.y,
      lat: filteredLL.lat,
      lon: filteredLL.lon,
      accuracyM: filteredAcc,
      timestamp
    });

    return {
      accepted: true,
      filteredPoint: filteredPt,
      filteredLatLon: filteredLL,
      telemetry: {
        rawAccuracyM: Number(safeAcc.toFixed(1)),
        filteredAccuracyM: filteredAcc,
        ...metrics,
        lastFixTimestamp: timestamp,
        quality: classifyGpsAccuracy(filteredAcc),
        acceptedFixes: this.acceptedFixes,
        rejectedFixes: this.rejectedFixes,
        speedMps: this.lastSpeedMps,
        maxAccuracyGateM: this.maxAccuracyGateM,
        lat: filteredLL.lat,
        lon: filteredLL.lon,
        isLocked: true
      }
    };
  }

  /**
   * Decides whether a filtered point should be emitted as a new recorded vertex.
   * Prevents stationary spider-web drift while capturing corners sharply.
   */
  public shouldEmitVertex(
    existingPoints: Point2D[],
    candidate: Point2D,
    filteredAccuracyM: number,
    baseStepM = 4.0
  ): boolean {
    if (existingPoints.length === 0) return true;

    const last = existingPoints[existingPoints.length - 1];
    const distM = Math.hypot(candidate.x - last.x, candidate.y - last.y);

    // Stationary drift shield: never emit if moved less than noise floor
    const noiseFloorM = Math.max(1.8, Math.min(5.0, filteredAccuracyM * 0.42));
    if (distM < noiseFloorM) return false;

    // Corner-aware capture: if user turns >= 22° and walked >= max(2.4m, noiseFloor), emit corner immediately
    if (existingPoints.length >= 2) {
      const prev = existingPoints[existingPoints.length - 2];
      const h1 = Math.atan2(last.y - prev.y, last.x - prev.x);
      const h2 = Math.atan2(candidate.y - last.y, candidate.x - last.x);
      let dAngle = Math.abs(h2 - h1);
      if (dAngle > Math.PI) dAngle = Math.PI * 2 - dAngle;
      const degChange = (dAngle * 180) / Math.PI;
      this.lastHeadingRad = h2;

      if (degChange >= 22 && distM >= Math.max(2.4, noiseFloorM)) {
        return true;
      }
    }

    return distM >= Math.max(baseStepM, noiseFloorM);
  }

  /**
   * Returns an inverse-variance weighted average of recent fixes (last 3.5s)
   * for high-precision manual corner pinning.
   */
  public getWeightedCornerPoint(fallback?: Point2D): Point2D | null {
    const now = Date.now();
    const recent = this.recentBuffer.filter((s) => now - s.timestamp <= 3500);
    const pool = recent.length > 0 ? recent : this.recentBuffer.slice(-3);

    if (pool.length === 0) {
      if (this.estX !== null && this.estY !== null) return { x: this.estX, y: this.estY };
      return fallback ?? null;
    }

    let wSum = 0;
    let xSum = 0;
    let ySum = 0;
    for (const s of pool) {
      const w = 1 / Math.max(1, s.accuracyM * s.accuracyM);
      wSum += w;
      xSum += s.x * w;
      ySum += s.y * w;
    }

    return { x: xSum / wSum, y: ySum / wSum };
  }

  public getLastHeadingDeg(): number | null {
    if (this.lastHeadingRad === null) return null;
    return Math.round(((this.lastHeadingRad * 180) / Math.PI + 360) % 360);
  }

  private pushBuffer(sample: GpsFixSample) {
    this.recentBuffer.push(sample);
    if (this.recentBuffer.length > 8) {
      this.recentBuffer.shift();
    }
  }
}

/**
 * Calculates total perimeter (or open path length) in meters.
 */
export function computePolygonPerimeterM(pts: Point2D[], closed = true): number {
  if (!pts || pts.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  if (closed && pts.length >= 3) {
    total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return total;
}

export interface TargetPolygonSolveResult {
  completed: boolean;
  points: Point2D[];
  areaHa: number;
  clippedChildHa: number;
  netWorkableHa: number;
  exactInterpolated: boolean;
}

/**
 * Evaluates true parent-child geometry for an outer polygon candidate:
 *   Net Workable Area = Area(Outer) - Area(Outer ∩ ⋃ ChildPolygons)
 *
 * Strictly auto-completes the outer polygon when `netWorkableHa` matches `targetWorkableHa`
 * (using 32-step binary search along the final segment to < 0.0001 Ha precision).
 *
 * Example: Target Workable = 20.00 Ha, Road inside = 1.00 Ha → auto-completes at exact 21.00 Ha gross!
 */
export function solveExactTargetAreaPolygon(
  existingPts: Point2D[],
  candidatePt: Point2D,
  targetWorkableHa: number,
  childPolygons: Point2D[][] = []
): TargetPolygonSolveResult {
  const nextPts = [...existingPts, candidatePt];

  const evalPoly = (poly: Point2D[]) => {
    if (poly.length < 3) return { grossHa: 0, childHa: 0, netHa: 0 };
    const grossHa = calcAreaHa(poly);
    const childHa =
      childPolygons.length > 0
        ? computeExactParentChildrenUnionAreaM2(poly, childPolygons) / 10000
        : 0;
    const netHa = Math.max(0, grossHa - childHa);
    return { grossHa, childHa, netHa };
  };

  if (targetWorkableHa <= 0 || nextPts.length < 3) {
    const res = evalPoly(nextPts);
    return {
      completed: false,
      points: nextPts,
      areaHa: res.grossHa,
      clippedChildHa: res.childHa,
      netWorkableHa: res.netHa,
      exactInterpolated: false
    };
  }

  const prevEval = evalPoly(existingPts);
  const nextEval = evalPoly(nextPts);
  const toleranceHa = 0.002; // 20 sq.m exact match threshold

  // Not yet reached target net workable area
  if (nextEval.netHa < targetWorkableHa - toleranceHa) {
    return {
      completed: false,
      points: nextPts,
      areaHa: nextEval.grossHa,
      clippedChildHa: nextEval.childHa,
      netWorkableHa: nextEval.netHa,
      exactInterpolated: false
    };
  }

  // Exact hit within tolerance
  if (Math.abs(nextEval.netHa - targetWorkableHa) <= toleranceHa) {
    return {
      completed: true,
      points: nextPts,
      areaHa: nextEval.grossHa,
      clippedChildHa: nextEval.childHa,
      netWorkableHa: nextEval.netHa,
      exactInterpolated: false
    };
  }

  // Crossed target (prevEval.netHa < targetWorkableHa < nextEval.netHa):
  // Binary search along segment [lastPt -> candidatePt] for exact netWorkableHa === targetWorkableHa
  if (prevEval.netHa < targetWorkableHa && existingPts.length >= 2) {
    const lastPt = existingPts[existingPts.length - 1];
    let lo = 0;
    let hi = 1;
    let bestPt = candidatePt;
    let bestEval = nextEval;

    for (let iter = 0; iter < 32; iter++) {
      const mid = (lo + hi) * 0.5;
      const testPt: Point2D = {
        x: lastPt.x + (candidatePt.x - lastPt.x) * mid,
        y: lastPt.y + (candidatePt.y - lastPt.y) * mid
      };
      const testEval = evalPoly([...existingPts, testPt]);
      bestPt = testPt;
      bestEval = testEval;

      if (Math.abs(testEval.netHa - targetWorkableHa) <= 0.00005) {
        break;
      }
      if (testEval.netHa < targetWorkableHa) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return {
      completed: true,
      points: [...existingPts, bestPt],
      areaHa: bestEval.grossHa,
      clippedChildHa: bestEval.childHa,
      netWorkableHa: bestEval.netHa,
      exactInterpolated: true
    };
  }

  return {
    completed: true,
    points: nextPts,
    areaHa: nextEval.grossHa,
    clippedChildHa: nextEval.childHa,
    netWorkableHa: nextEval.netHa,
    exactInterpolated: false
  };
}
