/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import {
  Point2D,
  LatLonPoint,
  GeoRef,
  EdgeGpsPoint,
  SectionLineData,
  ForestryStationPeg,
  ForestryGridLineSegment,
  ForestryCellBlock
} from '../types/mapTypes';
import { computeExactCellAreaBreakdownM2 } from './polygonAreaEngine';

export function isPointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function getMetersPerDegree(latDeg: number): { latM: number; lonM: number } {
  const phi = (latDeg * Math.PI) / 180;
  // WGS-84 ellipsoid constants
  const a = 6378137.0; // semi-major axis (meters)
  const e2 = 0.00669437999014; // first eccentricity squared
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const w = Math.sqrt(1 - e2 * sinPhi * sinPhi);

  // Meridian radius of curvature (meters per radian of latitude)
  const mRad = (a * (1 - e2)) / (w * w * w);
  const latM = (mRad * Math.PI) / 180;

  // Prime vertical radius of curvature times cos(phi) (meters per radian of longitude)
  const nRad = a / w;
  const lonM = ((nRad * cosPhi) * Math.PI) / 180;

  return { latM, lonM };
}

export function calcGeodesicAreaHa(coords: LatLonPoint[]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6378137.0;
  let total = 0;
  const rad = Math.PI / 180;
  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length];
    const p0 = coords[(i - 1 + coords.length) % coords.length];
    total += (p2.lon - p0.lon) * rad * Math.sin(p1.lat * rad);
  }
  const areaM2 = Math.abs((total * R * R) / 2);
  return areaM2 / 10000;
}

export function calcAreaHa(pts: Point2D[]): number {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 20000;
}

export function toDMS(deg: number | null | undefined, isLat: boolean): string {
  if (deg == null || isNaN(deg)) return '--';
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mF = (abs - d) * 60;
  const m = Math.floor(mF);
  const s = ((mF - m) * 60).toFixed(1);
  return `${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(4, '0')}" ${dir}`;
}

export function formatToDMY(dateInput?: string | Date | null): string {
  if (!dateInput) {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  if (typeof dateInput === 'string') {
    const s = dateInput.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const parts = s.split('T')[0].split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function parseGpsCoordinate(input: string, isLat: boolean): number | null {
  if (!input) return null;
  const s = input.trim().toUpperCase();

  // 1. Decimal degree check: e.g. "21.145889" or "21.145889 N"
  const decMatch = s.match(/^([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$/);
  if (decMatch) {
    let val = parseFloat(decMatch[1]);
    const dir = decMatch[2];
    if (dir === 'S' || dir === 'W') val = -Math.abs(val);
    else if (dir === 'N' || dir === 'E') val = Math.abs(val);
    return isNaN(val) ? null : val;
  }

  // 2. DMS format: e.g. 21°08'45.2" N or 21 08 45.2 or 21d 8m 45.2s
  const dmsMatch = s.match(/(\d+)[°\s_dD]+(\d+)['\s_mM]+(\d+(?:\.\d+)?)["]?\s*([NSEW])?/);
  if (dmsMatch) {
    const d = parseFloat(dmsMatch[1]);
    const m = parseFloat(dmsMatch[2]);
    const sec = parseFloat(dmsMatch[3]);
    const dir = dmsMatch[4] || (isLat ? 'N' : 'E');
    let val = d + m / 60 + sec / 3600;
    if (dir === 'S' || dir === 'W') val = -val;
    return val;
  }

  // 3. Simple space-separated: "21 8.75 N"
  const dmMatch = s.match(/(\d+)\s+(\d+(?:\.\d+)?)\s*([NSEW])?/);
  if (dmMatch) {
    const d = parseFloat(dmMatch[1]);
    const m = parseFloat(dmMatch[2]);
    const dir = dmMatch[3] || (isLat ? 'N' : 'E');
    let val = d + m / 60;
    if (dir === 'S' || dir === 'W') val = -val;
    return val;
  }

  return null;
}

export function bearingToCompass(deg: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function meterToLatLon(m: Point2D, geoRef: GeoRef): LatLonPoint {
  const cLat = geoRef.hasGeo ? geoRef.centerLat : 21.53;
  const cLon = geoRef.hasGeo ? geoRef.centerLon : 79.23;
  const { latM, lonM } = getMetersPerDegree(cLat);
  return {
    lat: cLat + m.y / latM,
    lon: cLon + m.x / lonM
  };
}

export function latLonToMeter(geo: LatLonPoint, geoRef: GeoRef): Point2D {
  const cLat = geoRef.hasGeo ? geoRef.centerLat : 21.53;
  const cLon = geoRef.hasGeo ? geoRef.centerLon : 79.23;
  const { latM, lonM } = getMetersPerDegree(cLat);
  return {
    x: (geo.lon - cLon) * lonM,
    y: (geo.lat - cLat) * latM
  };
}

export async function parseSpatialFile(file: File): Promise<LatLonPoint[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let xml = '';

  if (ext === 'kmz') {
    const zip = await JSZip.loadAsync(file);
    // Find any file ending with .kml in any folder
    const kmlEntry = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) throw new Error('No KML file found inside the KMZ archive.');
    xml = await zip.files[kmlEntry].async('string');
  } else {
    xml = await file.text();
  }

  let rawCoords: LatLonPoint[] = [];

  // 1. Try DOMParser
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    // Helper to parse comma/space separated coordinate strings (lon,lat,alt)
    const parseCoordString = (text: string) => {
      const tokens = text.trim().split(/\s+/);
      const list: LatLonPoint[] = [];
      for (const tkn of tokens) {
        const parts = tkn.split(',');
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            list.push({ lat, lon });
          }
        }
      }
      return list;
    };

    // A. Check Polygon / LinearRing outer boundary
    const polys = doc.getElementsByTagName('Polygon');
    for (let i = 0; i < polys.length; i++) {
      const outer = polys[i].getElementsByTagName('outerBoundaryIs')[0] || polys[i];
      const ce = outer.getElementsByTagName('coordinates')[0];
      if (ce && ce.textContent) {
        const pts = parseCoordString(ce.textContent);
        if (pts.length >= 3) {
          rawCoords = pts;
          break;
        }
      }
    }

    // B. Check LineString (Standard Garmin KML export for boundary walks)
    if (rawCoords.length < 3) {
      const lineStrings = doc.getElementsByTagName('LineString');
      let longestLine: LatLonPoint[] = [];
      for (let i = 0; i < lineStrings.length; i++) {
        const ce = lineStrings[i].getElementsByTagName('coordinates')[0];
        if (ce && ce.textContent) {
          const pts = parseCoordString(ce.textContent);
          if (pts.length > longestLine.length) {
            longestLine = pts;
          }
        }
      }
      if (longestLine.length >= 3) {
        rawCoords = longestLine;
      }
    }

    // C. Check all <coordinates> tags in any Placemark / Geometry
    if (rawCoords.length < 3) {
      const allCoordNodes = doc.getElementsByTagName('coordinates');
      let bestCoords: LatLonPoint[] = [];
      for (let i = 0; i < allCoordNodes.length; i++) {
        if (allCoordNodes[i].textContent) {
          const pts = parseCoordString(allCoordNodes[i].textContent!);
          if (pts.length > bestCoords.length) {
            bestCoords = pts;
          }
        }
      }
      if (bestCoords.length >= 3) {
        rawCoords = bestCoords;
      }
    }

    // D. Check Google Earth gx:Track / gx:coord
    if (rawCoords.length < 3) {
      const gxCoords = doc.getElementsByTagName('gx:coord');
      const gxList: LatLonPoint[] = [];
      for (let i = 0; i < gxCoords.length; i++) {
        const parts = gxCoords[i].textContent?.trim().split(/\s+/) || [];
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon)) gxList.push({ lat, lon });
        }
      }
      if (gxList.length >= 3) rawCoords = gxList;
    }

    // E. Check GPX track points (Garmin eTrex, GPSMAP, Montana, Oregon)
    // Handle XML namespace quirks: look up trkpt, rtept, and wpt
    if (rawCoords.length < 3) {
      const gpxNodes: Element[] = [];
      ['trkpt', 'rtept', 'wpt'].forEach((tagName) => {
        const elements = doc.getElementsByTagName(tagName);
        for (let i = 0; i < elements.length; i++) {
          gpxNodes.push(elements[i]);
        }
      });

      // Also try wildcard query
      if (gpxNodes.length === 0) {
        const allElements = doc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
          const local = allElements[i].localName?.toLowerCase() || '';
          if (local === 'trkpt' || local === 'rtept') {
            gpxNodes.push(allElements[i]);
          }
        }
      }

      const gpxList: LatLonPoint[] = [];
      gpxNodes.forEach((pt) => {
        const latStr = pt.getAttribute('lat');
        const lonStr = pt.getAttribute('lon');
        if (latStr && lonStr) {
          const lat = parseFloat(latStr);
          const lon = parseFloat(lonStr);
          if (!isNaN(lat) && !isNaN(lon)) {
            gpxList.push({ lat, lon });
          }
        }
      });
      if (gpxList.length >= 3) rawCoords = gpxList;
    }
  } catch (err) {
    // DOMParser error, proceed to regex fallback below
  }

  // 2. Fallback: Robust Regex Pattern Extraction (handles corrupted XML, missing namespaces)
  if (rawCoords.length < 3) {
    // Regex for GPX <trkpt lat="..." lon="...">
    const gpxRegex = /<(?:[\w]+:)?(?:trkpt|rtept|wpt)[^>]*\s+lat=["']([^"']+)["'][^>]*\s+lon=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    const regexGpxList: LatLonPoint[] = [];
    while ((match = gpxRegex.exec(xml)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lon)) regexGpxList.push({ lat, lon });
    }

    if (regexGpxList.length === 0) {
      // Reversed lon/lat order in GPX
      const gpxRegex2 = /<(?:[\w]+:)?(?:trkpt|rtept|wpt)[^>]*\s+lon=["']([^"']+)["'][^>]*\s+lat=["']([^"']+)["']/gi;
      while ((match = gpxRegex2.exec(xml)) !== null) {
        const lon = parseFloat(match[1]);
        const lat = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lon)) regexGpxList.push({ lat, lon });
      }
    }
    if (regexGpxList.length >= 3) rawCoords = regexGpxList;
  }

  // Fallback: coordinates tag content via Regex
  if (rawCoords.length < 3) {
    const coordTagRegex = /<coordinates>([\s\S]*?)<\/coordinates>/gi;
    let coordMatch: RegExpExecArray | null;
    while ((coordMatch = coordTagRegex.exec(xml)) !== null) {
      const tokens = coordMatch[1].trim().split(/\s+/);
      const list: LatLonPoint[] = [];
      for (const tkn of tokens) {
        const parts = tkn.split(',');
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            list.push({ lat, lon });
          }
        }
      }
      if (list.length > rawCoords.length) rawCoords = list;
    }
  }

  if (rawCoords.length < 3) {
    throw new Error(
      'Could not read GPS coordinates from the file. Please ensure the file is an exported Garmin GPX, KML, or KMZ file.'
    );
  }

  // 3. Remove consecutive identical duplicate points (GPS stationary jitter)
  const deduped: LatLonPoint[] = [rawCoords[0]];
  for (let i = 1; i < rawCoords.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = rawCoords[i];
    const distM = Math.hypot((curr.lon - prev.lon) * 111320 * Math.cos((curr.lat * Math.PI) / 180), (curr.lat - prev.lat) * 111320);
    if (distM > 0.4) {
      deduped.push(curr);
    }
  }

  if (deduped.length < 3) {
    return rawCoords;
  }

  // 4. Garmin Track-to-Polygon Processing:
  // In Garmin handheld GPS fieldwork, foresters start tracking, walk the coupe boundary,
  // and return to the start point. Sometimes they walk an approach track before reaching the loop,
  // or the track crosses itself (self-intersection) when closing the circuit.
  return extractClosedPolygonFromGarminTrack(deduped);
}

/**
 * Extracts a valid closed boundary polygon from Garmin handheld GPS tracks.
 * Handles:
 * 1. Tracks with an approach trail that intersect/cross themselves to form a closed coupe loop.
 * 2. Tracks that return to within 50m of the starting point.
 * 3. Full closed loops.
 */
export function extractClosedPolygonFromGarminTrack(track: LatLonPoint[]): LatLonPoint[] {
  if (track.length < 3) return track;

  const latM = 111320;
  const cLat = track[0].lat;
  const lonM = 111320 * Math.cos((cLat * Math.PI) / 180);

  // Convert to local meter coordinates for robust geometric intersection
  const meterPts: Point2D[] = track.map((p) => ({
    x: (p.lon - track[0].lon) * lonM,
    y: (p.lat - track[0].lat) * latM
  }));

  // A. Check for self-intersections (where the forester walked a trail and completed a loop)
  // Check if non-adjacent segments intersect
  let bestLoop: LatLonPoint[] | null = null;
  let maxLoopArea = 0;

  for (let i = 0; i < meterPts.length - 3; i++) {
    const a1 = meterPts[i];
    const a2 = meterPts[i + 1];

    for (let j = i + 2; j < meterPts.length - 1; j++) {
      // Skip adjacent segments
      if (Math.abs(i - j) <= 1) continue;

      const b1 = meterPts[j];
      const b2 = meterPts[j + 1];

      const inter = lineIntersection(a1, a2, b1, b2);
      if (inter) {
        // We found a self-intersection crossing point!
        // The loop is formed from segment i+1 to segment j, closed with the intersection point.
        const interLatLon: LatLonPoint = {
          lat: track[0].lat + inter.y / latM,
          lon: track[0].lon + inter.x / lonM
        };

        const loop = [interLatLon, ...track.slice(i + 1, j + 1), interLatLon];
        const loopMeterPts = loop.map((p) => ({
          x: (p.lon - track[0].lon) * lonM,
          y: (p.lat - track[0].lat) * latM
        }));
        const area = calcAreaHa(loopMeterPts);

        if (area > maxLoopArea && loop.length >= 4) {
          maxLoopArea = area;
          bestLoop = loop;
        }
      }
    }
  }

  if (bestLoop && maxLoopArea > 0.05) {
    return bestLoop;
  }

  // B. Check if track start and end are close to each other (forester walked around boundary back to start)
  const first = meterPts[0];
  const last = meterPts[meterPts.length - 1];
  const gapMeters = Math.hypot(last.x - first.x, last.y - first.y);

  // If gap is less than 65 meters or less than 10% of total boundary length, close it!
  let totalPerimeter = 0;
  for (let i = 0; i < meterPts.length - 1; i++) {
    totalPerimeter += Math.hypot(meterPts[i + 1].x - meterPts[i].x, meterPts[i + 1].y - meterPts[i].y);
  }

  if (gapMeters < 65 || gapMeters < totalPerimeter * 0.1) {
    const closed = [...track];
    // If last is not exactly equal to first, connect back to first to form closed polygon
    if (track[track.length - 1].lat !== track[0].lat || track[track.length - 1].lon !== track[0].lon) {
      closed.push({ lat: track[0].lat, lon: track[0].lon });
    }
    return closed;
  }

  // C. Find the closest pair of non-adjacent points along the track
  let minPairDist = Infinity;
  let bestI = 0;
  let bestJ = track.length - 1;

  for (let i = 0; i < meterPts.length - 5; i++) {
    for (let j = i + 5; j < meterPts.length; j++) {
      const d = Math.hypot(meterPts[i].x - meterPts[j].x, meterPts[i].y - meterPts[j].y);
      if (d < minPairDist) {
        minPairDist = d;
        bestI = i;
        bestJ = j;
      }
    }
  }

  if (minPairDist < 60 && bestJ - bestI >= 3) {
    const subLoop = track.slice(bestI, bestJ + 1);
    subLoop.push({ lat: subLoop[0].lat, lon: subLoop[0].lon });
    return subLoop;
  }

  // Fallback: Return track closed with the first point so it forms a valid polygon
  const result = [...track];
  if (track[track.length - 1].lat !== track[0].lat || track[track.length - 1].lon !== track[0].lon) {
    result.push({ lat: track[0].lat, lon: track[0].lon });
  }
  return result;
}

/**
 * Unrotates a point in visual drafting space back to true geographic ground meters.
 * Inverse rotation by -angleDeg around the polygon centroid.
 */
export function unrotatePoint(pt: Point2D, centroid: Point2D, angleDeg: number): Point2D {
  if (!angleDeg || !pt) return pt;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - centroid.x;
  const dy = pt.y - centroid.y;
  return {
    x: centroid.x + dx * cos + dy * sin,
    y: centroid.y - dx * sin + dy * cos
  };
}

/**
 * Unrotates an array of points from visual drafting space back to true geographic ground meters.
 */
export function unrotatePoints(pts: Point2D[], centroid: Point2D, angleDeg: number): Point2D[] {
  if (!angleDeg || !pts) return pts;
  return pts.map((p) => unrotatePoint(p, centroid, angleDeg));
}

/**
 * Computes the true geographic bearing in degrees from True North (0° = North, 90° = East)
 * between two points in ground meters (where +x is East, +y is North).
 */
export function calculateGeographicBearing(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let deg = Math.atan2(dx, dy) * (180 / Math.PI);
  if (deg < 0) deg += 360;
  return Math.round(deg);
}

/**
 * Finds EXACTLY 4 GPS locations on the North, South, East, and West extreme edges
 * of the polygon perimeter without disturbing or covering the map area.
 */
export function extract4CardinalEdgeGpsPoints(
  rawPoints: Point2D[],
  rotatedPoints: Point2D[],
  geoRef: GeoRef
): EdgeGpsPoint[] {
  if (rawPoints.length < 3 || rotatedPoints.length < 3) return [];

  let nIdx = 0;
  let sIdx = 0;
  let eIdx = 0;
  let wIdx = 0;
  let maxLat = -Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let minLon = Infinity;

  rawPoints.forEach((p, idx) => {
    const geo = meterToLatLon(p, geoRef);
    if (geo.lat > maxLat) {
      maxLat = geo.lat;
      nIdx = idx;
    }
    if (geo.lat < minLat) {
      minLat = geo.lat;
      sIdx = idx;
    }
    if (geo.lon > maxLon) {
      maxLon = geo.lon;
      eIdx = idx;
    }
    if (geo.lon < minLon) {
      minLon = geo.lon;
      wIdx = idx;
    }
  });

  const cardinals: Array<{ idx: number; tag: 'N' | 'S' | 'E' | 'W'; labelPrefix: string }> = [
    { idx: nIdx, tag: 'N', labelPrefix: 'North Boundary Edge' },
    { idx: sIdx, tag: 'S', labelPrefix: 'South Boundary Edge' },
    { idx: eIdx, tag: 'E', labelPrefix: 'East Boundary Edge' },
    { idx: wIdx, tag: 'W', labelPrefix: 'West Boundary Edge' }
  ];

  // Calculate polygon centroid for outward normal orientation
  let cx = 0;
  let cy = 0;
  rotatedPoints.forEach((pt) => {
    cx += pt.x;
    cy += pt.y;
  });
  cx /= rotatedPoints.length;
  cy /= rotatedPoints.length;

  const result: EdgeGpsPoint[] = [];

  cardinals.forEach(({ idx, tag, labelPrefix }) => {
    const raw = rawPoints[idx];
    const rotated = rotatedPoints[idx];
    const geo = meterToLatLon(raw, geoRef);

    // Direction vector pointing strictly outward from centroid
    const dx = rotated.x - cx;
    const dy = rotated.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    let nx = dx / dist;
    let ny = dy / dist;

    // Direct cardinal bias so North points up, South points down, East points right, West points left
    if (tag === 'N') { nx = 0; ny = -1; }
    else if (tag === 'S') { nx = 0; ny = 1; }
    else if (tag === 'E') { nx = 1; ny = 0; }
    else if (tag === 'W') { nx = -1; ny = 0; }

    result.push({
      point: rotated,
      lat: geo.lat,
      lon: geo.lon,
      dmsLat: toDMS(geo.lat, true),
      dmsLon: toDMS(geo.lon, false),
      tag,
      label: `${tag}: ${toDMS(geo.lat, true)}, ${toDMS(geo.lon, false)}`,
      normalX: nx,
      normalY: ny
    });
  });

  return result;
}

/**
 * Forestry Coupe Grid Labeling:
 * Baseline stations: 0 at start P-1, then A, B, C, D... at each grid step.
 * Left portion of baseline: 0L1, 0L2, 0L3... AL1, AL2, AL3... BL1, BL2...
 * Right portion of baseline: 0R1, 0R2, 0R3... AR1, AR2, AR3... BR1, BR2...
 */
export function computeForestryCellLabel(
  cellCenterM: Point2D,
  baselineP1: Point2D,
  baselineP2: Point2D,
  stepXMeters: number,
  stepYMeters: number
): string {
  const dx = baselineP2.x - baselineP1.x;
  const dy = baselineP2.y - baselineP1.y;
  const baselineLen = Math.hypot(dx, dy);

  if (baselineLen < 1) return '0L1';

  // Unit vector along baseline
  const ux = dx / baselineLen;
  const uy = dy / baselineLen;

  // Vector from P1 to cell center
  const vx = cellCenterM.x - baselineP1.x;
  const vy = cellCenterM.y - baselineP1.y;

  // Projection along baseline (chainage distance from 0 / P1)
  const alongDist = vx * ux + vy * uy;

  // Perpendicular distance from baseline (cross product)
  // cross > 0: Left side of baseline, cross < 0: Right side of baseline
  const cross = vx * uy - vy * ux;
  const perpDist = Math.abs(cross);

  // Column letters: 0 = '0', 1 = 'A', 2 = 'B', 3 = 'C', 4 = 'D', etc.
  const colIndex = Math.floor(alongDist / Math.max(10, stepXMeters));
  let colLetter = '0';
  if (colIndex === 0) {
    colLetter = '0';
  } else if (colIndex > 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    colLetter = alphabet[(colIndex - 1) % 26];
  } else {
    // If cell extends slightly before P-1
    colLetter = '0';
  }

  // Row index from baseline: 1, 2, 3...
  const rowIndex = Math.floor(perpDist / Math.max(10, stepYMeters)) + 1;

  // Forestry survey: Left side has 'L', Right side has 'R'
  // In screen space (Y increases downwards), cross > 0 corresponds to one side
  const isLeft = cross >= 0;
  const side = isLeft ? 'L' : 'R';

  return `${colLetter}${side}${rowIndex}`;
}

export interface ForestrySurveyResult {
  pegs: ForestryStationPeg[];
  gridLines: ForestryGridLineSegment[];
  cells: ForestryCellBlock[];
  totalEstimatedPlants: number;
}

/**
 * Generates the complete Maharashtra Forest Department coupe survey grid framework:
 * - Station pegs aligned to baseline stations (0, A, B, C, D... and negative extensions)
 * - Left/Right peg codes (0L1, 0L2... AL1, AL2... 0R1, 0R2... AR1, AR2, AR3, AR4...)
 * - Explicit detection of line end points (e.g. AR4, 0R5)
 * - Grid lines (green) and Base line (red)
 * - Numbered grid blocks (1, 2, 3... 21) with plantation plant estimation
 */
export function generateForestrySurveyGrid(
  polygon: Point2D[],
  baselineP1: Point2D,
  baselineP2: Point2D,
  stepXMeters: number,
  stepYMeters: number,
  plantSpacingM: number = 3,
  targetTotalPlants?: number,
  nonWorkingPolygons?: Point2D[][],
  isNonWorkingNil?: boolean,
  targetNetAreaHaOverride?: number,
  originStation0?: Point2D
): ForestrySurveyResult {
  if (!polygon || polygon.length < 3) {
    return { pegs: [], gridLines: [], cells: [], totalEstimatedPlants: 0 };
  }

  const dx = baselineP2.x - baselineP1.x;
  const dy = baselineP2.y - baselineP1.y;
  const L = Math.hypot(dx, dy);
  if (L < 1) {
    return { pegs: [], gridLines: [], cells: [], totalEstimatedPlants: 0 };
  }

  // Unit vector along baseline
  const ux = dx / L;
  const uy = dy / L;

  // Perpendicular unit vector to Left (North / UP in screen space)
  const vx = -uy;
  const vy = ux;

  // Survey grid origin: Locked to Station 0 (the intersection of two darkest green lines)
  const station0 = originStation0 || baselineP1;

  const stepX = Math.max(10, stepXMeters);
  const stepY = Math.max(10, stepYMeters);
  const nominalCellAreaHa = (stepX * stepY) / 10000;

  const activeNonWorkingPolys =
    (!isNonWorkingNil && nonWorkingPolygons)
      ? nonWorkingPolygons.filter((p) => p && p.length >= 3)
      : [];
  const hasNonWorking = activeNonWorkingPolys.length > 0;

  // Project polygon bounds relative to Station 0
  let minS = Infinity, maxS = -Infinity;
  let minD = Infinity, maxD = -Infinity;

  polygon.forEach((pt) => {
    const rx = pt.x - station0.x;
    const ry = pt.y - station0.y;
    const s = rx * ux + ry * uy;
    const d = rx * vx + ry * vy;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  });

  const colMin = Math.floor(minS / stepX) - 1;
  const colMax = Math.ceil(maxS / stepX) + 1;
  const rowMin = Math.floor(minD / stepY) - 1;
  const rowMax = Math.ceil(maxD / stepY) + 1;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const getColLetter = (colIndex: number): string => {
    if (colIndex === 0) return '0';
    if (colIndex > 0) return alphabet[(colIndex - 1) % 26];
    return `-${alphabet[(Math.abs(colIndex) - 1) % 26]}`;
  };

  const getPegLabel = (colIndex: number, rowIndex: number): string => {
    const colStr = getColLetter(colIndex);
    if (rowIndex === 0) return colStr;
    if (rowIndex > 0) return `${colStr}L${rowIndex}`;
    return `${colStr}R${Math.abs(rowIndex)}`;
  };

  const getMeterPoint = (c: number, r: number): Point2D => {
    const s = c * stepX;
    const d = r * stepY;
    return {
      x: station0.x + s * ux + d * vx,
      y: station0.y + s * uy + d * vy
    };
  };

  // 1. Identify active cells with high-precision sub-sampling grid
  interface RawCell {
    c: number;
    r: number;
    center: Point2D;
    corners: Point2D[];
    grossAreaHa: number;
    nonWorkingAreaHa: number;
    workableAreaHa: number;
    isFullCell: boolean;
  }

  const activeRawCells: RawCell[] = [];
  const activePegMap = new Map<string, { c: number; r: number; pt: Point2D }>();

  for (let c = colMin; c < colMax; c++) {
    for (let r = rowMin; r < rowMax; r++) {
      const p00 = getMeterPoint(c, r);
      const p10 = getMeterPoint(c + 1, r);
      const p11 = getMeterPoint(c + 1, r + 1);
      const p01 = getMeterPoint(c, r + 1);
      const mid = {
        x: (p00.x + p10.x + p11.x + p01.x) / 4,
        y: (p00.y + p10.y + p11.y + p01.y) / 4
      };

      // Exact analytical polygon intersection/subtraction for cell (captures even narrow 3m roads!)
      const cellCorners: Point2D[] = [p00, p10, p11, p01];
      const cellExact = computeExactCellAreaBreakdownM2(
        cellCorners,
        polygon,
        hasNonWorking ? activeNonWorkingPolys : []
      );

      if (cellExact.grossM2 > 1.0) {
        const nominalCellM2 = stepX * stepY;
        const isFullCell =
          Math.abs(cellExact.grossM2 - nominalCellM2) <= 0.5 && cellExact.nonWorkingM2 <= 0.5;

        const grossAreaHa = isFullCell
          ? nominalCellAreaHa
          : Number((cellExact.grossM2 / 10000).toFixed(4));
        const nonWorkingAreaHa = isFullCell
          ? 0
          : Number((cellExact.nonWorkingM2 / 10000).toFixed(4));
        const workableAreaHa = isFullCell
          ? nominalCellAreaHa
          : Math.max(0, Number((grossAreaHa - nonWorkingAreaHa).toFixed(4)));

        activeRawCells.push({
          c,
          r,
          center: mid,
          corners: cellCorners,
          grossAreaHa,
          nonWorkingAreaHa,
          workableAreaHa,
          isFullCell
        });

        // Register corner pegs
        const key00 = `${c},${r}`;
        const key10 = `${c + 1},${r}`;
        const key11 = `${c + 1},${r + 1}`;
        const key01 = `${c},${r + 1}`;
        if (!activePegMap.has(key00)) activePegMap.set(key00, { c, r, pt: p00 });
        if (!activePegMap.has(key10)) activePegMap.set(key10, { c: c + 1, r, pt: p10 });
        if (!activePegMap.has(key11)) activePegMap.set(key11, { c: c + 1, r: r + 1, pt: p11 });
        if (!activePegMap.has(key01)) activePegMap.set(key01, { c, r: r + 1, pt: p01 });
      }
    }
  }

  // 2. Build list of Pegs and detect Line End Points (like AR4, 0R5, AL2)
  // Group active pegs by column
  const pegsByCol = new Map<number, { r: number; pt: Point2D }[]>();
  const pegsByRow = new Map<number, { c: number; pt: Point2D }[]>();

  activePegMap.forEach(({ c, r, pt }) => {
    // Check if point is inside or very close to polygon
    const inside = isPointInPolygon(pt, polygon);
    let close = false;
    if (!inside) {
      const nearest = findNearestPointOnPolygon(pt, polygon);
      if (nearest.dist <= 15) close = true;
    }

    if (inside || close) {
      if (!pegsByCol.has(c)) pegsByCol.set(c, []);
      pegsByCol.get(c)!.push({ r, pt });

      if (!pegsByRow.has(r)) pegsByRow.set(r, []);
      pegsByRow.get(r)!.push({ c, pt });
    }
  });

  const pegs: ForestryStationPeg[] = [];

  pegsByCol.forEach((rowsInCol, c) => {
    rowsInCol.sort((a, b) => a.r - b.r);
    const minRow = rowsInCol[0].r;
    const maxRow = rowsInCol[rowsInCol.length - 1].r;

    rowsInCol.forEach(({ r, pt }) => {
      const colLetter = getColLetter(c);
      const isBaseline = r === 0;
      const isEndPoint = r === minRow || r === maxRow;
      const side = isBaseline ? 'baseline' : r > 0 ? 'L' : 'R';
      const label = getPegLabel(c, r);

      pegs.push({
        colIndex: c,
        rowIndex: r,
        colLetter,
        label,
        pointM: pt,
        geoPointM: pt,
        isBaselineStation: isBaseline,
        isEndPointOfLine: isEndPoint,
        side,
        rowNum: Math.abs(r)
      });
    });
  });

  // 3. Grid Lines (Extended to touch polygon perimeter edges seamlessly)
  const gridLines: ForestryGridLineSegment[] = [];

  // Active columns and rows that intersect the polygon
  const activeColSet = new Set<number>();
  const activeRowSet = new Set<number>();
  activeRawCells.forEach((cell) => {
    activeColSet.add(cell.c);
    activeColSet.add(cell.c + 1);
    activeRowSet.add(cell.r);
    activeRowSet.add(cell.r + 1);
  });

  // Margin buffer to guarantee grid lines reach and intersect polygon perimeter edges
  const marginBuffer = 60;

  // Column lines (perpendicular to baseline)
  Array.from(activeColSet)
    .sort((a, b) => a - b)
    .forEach((c) => {
      const s = c * stepX;
      // Only draw if column line falls within polygon horizontal span
      if (s < minS - 5 || s > maxS + 5) return;

      const p1 = {
        x: station0.x + s * ux + (minD - marginBuffer) * vx,
        y: station0.y + s * uy + (minD - marginBuffer) * vy
      };
      const p2 = {
        x: station0.x + s * ux + (maxD + marginBuffer) * vx,
        y: station0.y + s * uy + (maxD + marginBuffer) * vy
      };

      gridLines.push({
        p1,
        p2,
        type: 'column',
        colIndex: c,
        label: getColLetter(c)
      });
    });

  // Row lines (parallel to baseline)
  Array.from(activeRowSet)
    .sort((a, b) => a - b)
    .forEach((r) => {
      const d = r * stepY;
      // Only draw if row line falls within polygon vertical span
      if (d < minD - 5 || d > maxD + 5) return;

      const p1 = {
        x: station0.x + (minS - marginBuffer) * ux + d * vx,
        y: station0.y + (minS - marginBuffer) * uy + d * vy
      };
      const p2 = {
        x: station0.x + (maxS + marginBuffer) * ux + d * vx,
        y: station0.y + (maxS + marginBuffer) * uy + d * vy
      };

      gridLines.push({
        p1,
        p2,
        type: r === 0 ? 'baseline' : 'row',
        rowIndex: r,
        label: r === 0 ? 'BASELINE' : r > 0 ? `L${r}` : `R${Math.abs(r)}`
      });
    });

  // 4. Sequential Grid Cells (Reordered per Forestry Standard)
  // 1. First, number all grids on the right side of the baseline (r <= baseR).
  // 2. Start numbering from the bottom of the baseline (lowest c) along each row outward from baseline.
  // 1. Right side of baseline strictly first:
  // Vector along baseline P1 -> P2 is (ux, uy).
  // Vector perpendicular pointing to the RIGHT is w_right = (uy, -ux).
  const getRightDist = (rc: RawCell): number => {
    const rx = rc.center.x - baselineP1.x;
    const ry = rc.center.y - baselineP1.y;
    return rx * uy - ry * ux;
  };

  const getAlongDist = (rc: RawCell): number => {
    const rx = rc.center.x - baselineP1.x;
    const ry = rc.center.y - baselineP1.y;
    return rx * ux + ry * uy;
  };

  // Right side of baseline: getRightDist > 0.001 (strictly to the right of baseline)
  // Left side of baseline: getRightDist <= 0.001 (strictly to the left of baseline)
  const rightSideCells = activeRawCells.filter((rc) => getRightDist(rc) > 0.001);
  const leftSideCells = activeRawCells.filter((rc) => getRightDist(rc) <= 0.001);

  // Helper to sort cells on the RIGHT side:
  // Rows ordered outward from baseline (closest row to baseline first, e.g. R1, then R2, then R3...),
  // and within each row, sorted from bottom of baseline (lowest along-distance s) to top
  const sortRightSide = (cells: RawCell[]): RawCell[] => {
    // Sort rows by row index r descending into negative: -1 (R1), -2 (R2), -3 (R3)...
    // (i.e. closest to baseline outward to the right)
    const rows = Array.from(new Set(cells.map((c) => c.r))).sort((a, b) => b - a);
    const result: RawCell[] = [];
    rows.forEach((rowIdx) => {
      const rowCells = cells.filter((c) => c.r === rowIdx);
      // Strictly number from bottom of baseline (lowest along-distance) to top of baseline
      rowCells.sort((a, b) => getAlongDist(a) - getAlongDist(b));
      result.push(...rowCells);
    });
    return result;
  };

  // Helper to sort cells on the LEFT side:
  // Rows ordered outward from baseline (closest row to baseline first, e.g. L1/0, then L2, then L3...),
  // and within each row, sorted from bottom of baseline (lowest along-distance s) to top
  const sortLeftSide = (cells: RawCell[]): RawCell[] => {
    // Sort rows by row index r ascending: 0 (L1), 1 (L2), 2 (L3)...
    // (i.e. closest to baseline outward to the left)
    const rows = Array.from(new Set(cells.map((c) => c.r))).sort((a, b) => a - b);
    const result: RawCell[] = [];
    rows.forEach((rowIdx) => {
      const rowCells = cells.filter((c) => c.r === rowIdx);
      // Strictly number from bottom of baseline (lowest along-distance) to top of baseline
      rowCells.sort((a, b) => getAlongDist(a) - getAlongDist(b));
      result.push(...rowCells);
    });
    return result;
  };

  // Sequence: Number all grids on the RIGHT side of the baseline first, then continue to the LEFT side
  const orderedCells = [
    ...sortRightSide(rightSideCells),
    ...sortLeftSide(leftSideCells)
  ];

  const plantsPerSqM = 1 / (plantSpacingM * plantSpacingM);
  const nominalPlants = Math.round(stepX * stepY * plantsPerSqM);

  const polyGrossHa = Number(calcAreaHa(polygon).toFixed(2));
  const polyNonWorkingHa = hasNonWorking
    ? Number(activeNonWorkingPolys.reduce((sum, p) => sum + calcAreaHa(p), 0).toFixed(2))
    : 0;
  const computedNetAreaHa = Math.max(0, Number((polyGrossHa - polyNonWorkingHa).toFixed(2)));
  const targetNetAreaHa = (targetNetAreaHaOverride && targetNetAreaHaOverride > 0)
    ? Number(targetNetAreaHaOverride.toFixed(2))
    : computedNetAreaHa;

  let rawTotalPlants = 0;
  const calibratedCells = orderedCells.map((rc, idx) => {
    const colStr = getColLetter(rc.c);
    const rowStr = rc.r === 0 ? '0' : rc.r > 0 ? `L${rc.r}` : `R${Math.abs(rc.r)}`;
    const plants = Math.max(0, Math.round(nominalPlants * (rc.workableAreaHa / nominalCellAreaHa)));
    rawTotalPlants += plants;

    return {
      cellNumber: idx + 1,
      colIndex: rc.c,
      rowIndex: rc.r,
      colLetter: colStr,
      label: `Grid ${idx + 1} (${colStr}-${rowStr})`,
      centerM: rc.center,
      cornersM: rc.corners,
      areaHa: rc.workableAreaHa,
      grossAreaHa: rc.grossAreaHa,
      nonWorkingAreaHa: rc.nonWorkingAreaHa,
      workableAreaHa: rc.workableAreaHa,
      isFullCell: rc.isFullCell,
      estimatedPlants: plants
    };
  });

  // Strictly reconcile rounding diff on partial edge cells so sum of cells is 100% strictly equal to targetNetAreaHa
  let sumWorkable = Number(calibratedCells.reduce((sum, c) => sum + Number(c.workableAreaHa.toFixed(2)), 0).toFixed(2));
  let diffNet = Number((targetNetAreaHa - sumWorkable).toFixed(2));

  if (Math.abs(diffNet) > 0.0001 && calibratedCells.length > 0) {
    const edgeCandidates = calibratedCells.filter((c) => !c.isFullCell && c.workableAreaHa > 0);
    const candidates = edgeCandidates.length > 0 ? edgeCandidates : calibratedCells;
    candidates.sort((a, b) => b.workableAreaHa - a.workableAreaHa);

    const step = diffNet > 0 ? 0.01 : -0.01;
    let remainingSteps = Math.round(Math.abs(diffNet) / 0.01);
    let idx = 0;
    while (remainingSteps > 0 && candidates.length > 0) {
      const targetCell = candidates[idx % candidates.length];
      const updated = Number((targetCell.workableAreaHa + step).toFixed(2));
      if (updated >= 0.01) {
        targetCell.workableAreaHa = updated;
        targetCell.areaHa = updated;
        remainingSteps--;
      }
      idx++;
      if (idx > candidates.length * 20) {
        candidates[0].workableAreaHa = Number((candidates[0].workableAreaHa + remainingSteps * step).toFixed(2));
        candidates[0].areaHa = candidates[0].workableAreaHa;
        break;
      }
    }
  }

  // Final verification assertion for 100% exact match
  sumWorkable = Number(calibratedCells.reduce((sum, c) => sum + Number(c.workableAreaHa.toFixed(2)), 0).toFixed(2));
  diffNet = Number((targetNetAreaHa - sumWorkable).toFixed(2));
  if (Math.abs(diffNet) > 0.0001 && calibratedCells.length > 0) {
    const largest = calibratedCells.slice().sort((a, b) => b.workableAreaHa - a.workableAreaHa)[0];
    largest.workableAreaHa = Number((largest.workableAreaHa + diffNet).toFixed(2));
    largest.areaHa = largest.workableAreaHa;
  }

  // If a target total plant count is provided (e.g. 7,777), scale proportionally
  let finalCells: ForestryCellBlock[] = calibratedCells;
  if (targetTotalPlants && targetTotalPlants > 0 && rawTotalPlants > 0) {
    const factor = targetTotalPlants / rawTotalPlants;
    let accumulated = 0;
    finalCells = calibratedCells.map((cell, idx) => {
      let scaled = Math.round(cell.estimatedPlants * factor);
      if (idx === calibratedCells.length - 1) {
        // Last cell takes up rounding remainder to match exact total
        scaled = Math.max(1, targetTotalPlants - accumulated);
      } else {
        accumulated += scaled;
      }
      return {
        ...cell,
        estimatedPlants: scaled
      };
    });
  }

  const totalEstimatedPlants = finalCells.reduce((sum, c) => sum + c.estimatedPlants, 0);

  return {
    pegs,
    gridLines,
    cells: finalCells,
    totalEstimatedPlants
  };
}

/**
 * Evaluates whether changing page orientation (Portrait vs Landscape)
 * saves space and allows the treatment map to be strictly printed on A4 paper.
 */
export function evaluateSmartA4Orientation(
  polygonPoints: Point2D[],
  scalePxPer100m: number,
  mmPx: number
): {
  recommendedOrientation: 'portrait' | 'landscape';
  fitsInA4: boolean;
  fitsInPortrait: boolean;
  fitsInLandscape: boolean;
  spaceSavedPercent: number;
  reason: string;
} {
  if (!polygonPoints || polygonPoints.length < 3) {
    return {
      recommendedOrientation: 'portrait',
      fitsInA4: true,
      fitsInPortrait: true,
      fitsInLandscape: true,
      spaceSavedPercent: 0,
      reason: 'Standard A4 Portrait default.'
    };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  polygonPoints.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const polyWMeters = maxX - minX;
  const polyHMeters = maxY - minY;

  // Convert meters to paper millimeters at strict scale
  const ppm = scalePxPer100m / 100;
  const polyWMm = (polyWMeters * ppm) / mmPx;
  const polyHMm = (polyHMeters * ppm) / mmPx;

  // Narrow boundary margins: compact header and streamlined signatures
  const totalWMm = polyWMm + 16;
  const totalHMm = polyHMm + 36;

  // A4 printable bounds with narrow margins (maximizing graph paper area)
  const a4Portrait = { w: 202, h: 286 }; // 202 × 286 mm
  const a4Landscape = { w: 288, h: 198 }; // 288 × 198 mm

  const fitsInPortrait = totalWMm <= a4Portrait.w && totalHMm <= a4Portrait.h;
  const fitsInLandscape = totalWMm <= a4Landscape.w && totalHMm <= a4Landscape.h;

  let recommendedOrientation: 'portrait' | 'landscape' = 'portrait';
  let fitsInA4 = false;
  let reason = '';
  let spaceSavedPercent = 0;

  if (fitsInPortrait && !fitsInLandscape) {
    recommendedOrientation = 'portrait';
    fitsInA4 = true;
    reason = 'उभा आकार (Portrait) योग्य: कूप नकाशा A4 पृष्ठावर तंतोतंत बसतो.';
  } else if (!fitsInPortrait && fitsInLandscape) {
    recommendedOrientation = 'landscape';
    fitsInA4 = true;
    spaceSavedPercent = Math.round(((totalWMm - a4Portrait.w) / a4Portrait.w) * 100);
    reason = 'आडवा आकार (Landscape) योग्य: कूप रुंद असल्याने A4 आडवे पृष्ठ वापरले.';
  } else if (fitsInPortrait && fitsInLandscape) {
    if (polyWMeters > polyHMeters) {
      recommendedOrientation = 'landscape';
      reason = 'कूप आडव्या दिशेने पसरलेला असल्याने आडवा नकाशा (Landscape) सर्वोत्तम आहे.';
    } else {
      recommendedOrientation = 'portrait';
      reason = 'कूप उभ्या दिशेने पसरलेला असल्याने उभा नकाशा (Portrait) सर्वोत्तम आहे.';
    }
    fitsInA4 = true;
  } else {
    const overflowP = Math.max(0, totalWMm - a4Portrait.w) + Math.max(0, totalHMm - a4Portrait.h);
    const overflowL = Math.max(0, totalWMm - a4Landscape.w) + Math.max(0, totalHMm - a4Landscape.h);
    recommendedOrientation = overflowL < overflowP ? 'landscape' : 'portrait';
    fitsInA4 = false;
    reason = 'कूप क्षेत्र मोठे असल्याने १:५००० मोजपट्टीनुसार A4 पृष्ठाच्या मर्यादेबाहेर जाते. अचूकतेसाठी A3 पृष्ठ किंवा योग्य मोजपट्टी निवडा.';
  }

  return {
    recommendedOrientation,
    fitsInA4,
    fitsInPortrait,
    fitsInLandscape,
    spaceSavedPercent,
    reason
  };
}

function computeSectionAutoDist(baselineLength: number, gridStepMeters: number = 100): number {
  const gridStep = gridStepMeters && gridStepMeters > 0 ? gridStepMeters : 100;
  let targetDist = baselineLength / 2;
  if (baselineLength > gridStep + 10) {
    const midCols =
      baselineLength >= 10 * gridStep
        ? Math.floor(baselineLength / 2 / gridStep)
        : Math.round(baselineLength / 2 / gridStep);
    const maxCols = Math.max(1, Math.floor((baselineLength - 10) / gridStep));
    const targetCol = Math.max(1, Math.min(maxCols, midCols));
    targetDist = targetCol * gridStep;
  }
  return targetDist;
}

/**
 * Clamps a requested Section Line offset (in meters from the auto ~50% midpoint)
 * safely inside the baseline span while staying aligned to 50m/100m grid steps.
 */
export function clampSectionLineOffset(
  baselineP1: Point2D,
  baselineP2: Point2D,
  gridStepMeters: number = 100,
  requestedOffsetMeters: number = 0
): number {
  if (!requestedOffsetMeters) return 0;
  const baselineLength = Math.hypot(baselineP2.x - baselineP1.x, baselineP2.y - baselineP1.y);
  if (baselineLength < 10) return 0;

  const gridStep = gridStepMeters && gridStepMeters > 0 ? gridStepMeters : 100;
  const autoDist = computeSectionAutoDist(baselineLength, gridStep);
  const halfStep = Math.max(10, gridStep / 2); // 50m Medium Green line when gridStep = 100m

  const minEdgeDist = Math.min(25, baselineLength * 0.1);
  const maxEdgeDist = Math.max(minEdgeDist, baselineLength - minEdgeDist);

  const minAligned = Math.ceil(minEdgeDist / halfStep) * halfStep;
  const maxAligned = Math.floor(maxEdgeDist / halfStep) * halfStep;

  const rawTarget = autoDist + requestedOffsetMeters;
  const clampedTarget =
    maxAligned >= minAligned
      ? Math.max(minAligned, Math.min(maxAligned, rawTarget))
      : Math.max(minEdgeDist, Math.min(maxEdgeDist, rawTarget));

  return Math.round(clampedTarget - autoDist);
}

/**
 * Calculates a single Section Line perpendicular to the baseline, clipped inside the polygon.
 * Automatically placed strictly on the grid line nearest the middle (~50%) of the baseline by default:
 * e.g., 950m -> 500m, 1000m -> 500m, 1150m -> 500m, and optionally stepped by ±50m (Medium Green)
 * or ±100m (Darkest Green) along the baseline.
 */
export function computeSectionLines(
  baselineP1: Point2D,
  baselineP2: Point2D,
  polygon: Point2D[],
  gridStepMeters: number = 100,
  sectionOffsetMeters: number = 0
): SectionLineData[] {
  if (!polygon || polygon.length < 3) return [];

  const dx = baselineP2.x - baselineP1.x;
  const dy = baselineP2.y - baselineP1.y;
  const baselineLength = Math.hypot(dx, dy);
  if (baselineLength < 1) return [];

  const ux = dx / baselineLength;
  const uy = dy / baselineLength;

  // Perpendicular unit vector
  const px = -uy;
  const py = ux;

  // Find polygon bounding diameter
  let maxPolyDist = 0;
  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      const d = Math.hypot(polygon[i].x - polygon[j].x, polygon[i].y - polygon[j].y);
      if (d > maxPolyDist) maxPolyDist = d;
    }
  }
  const rayHalfLength = maxPolyDist * 2;

  // Auto-select the grid line overlapping the ~50% midpoint of the Base Line + optional step offset
  const autoDist = computeSectionAutoDist(baselineLength, gridStepMeters);
  const clampedOffset = clampSectionLineOffset(baselineP1, baselineP2, gridStepMeters, sectionOffsetMeters);
  const targetDist = autoDist + clampedOffset;

  const originX = baselineP1.x + targetDist * ux;
  const originY = baselineP1.y + targetDist * uy;

  // Perpendicular line segment endpoints: A and B
  const ax = originX - rayHalfLength * px;
  const ay = originY - rayHalfLength * py;
  const bx = originX + rayHalfLength * px;
  const by = originY + rayHalfLength * py;

  // Find intersections with polygon boundary segments
  const intersections: Point2D[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const seg1 = { x: ax, y: ay };
    const seg2 = { x: bx, y: by };
    const poly1 = polygon[i];
    const poly2 = polygon[j];

    const inter = lineIntersection(seg1, seg2, poly1, poly2);
    if (inter) {
      intersections.push(inter);
    }
  }

  if (intersections.length >= 2) {
    // Sort intersections along the perpendicular direction
    intersections.sort((p1, p2) => {
      const t1 = (p1.x - ax) * px + (p1.y - ay) * py;
      const t2 = (p2.x - ax) * px + (p2.y - ay) * py;
      return t1 - t2;
    });

    // Find the pair enclosing or closest to the midpoint that lies inside the polygon
    for (let k = 0; k < intersections.length - 1; k += 2) {
      const pStart = intersections[k];
      const pEnd = intersections[k + 1];
      const midPoint = { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };
      if (isPointInPolygon(midPoint, polygon)) {
        return [{
          p1: pStart,
          p2: pEnd,
          distanceFromStart: Math.round(targetDist),
          label: `Section Line (${Math.round(targetDist)}m)`
        }];
      }
    }
  }

  return [];
}

export function lineIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(denom) < 1e-9) return null;

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y)
    };
  }
  return null;
}

export function findNearestPointOnPolygon(pt: Point2D, poly: Point2D[]): { nearest: Point2D; dist: number } {
  let minDist = Infinity;
  let nearest: Point2D = { x: pt.x, y: pt.y };

  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i];
    const b = poly[j];
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    let t = l2 === 0 ? 0 : ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const d = Math.hypot(pt.x - proj.x, pt.y - proj.y);
    if (d < minDist) {
      minDist = d;
      nearest = proj;
    }
  }

  return { nearest, dist: minDist };
}

export interface StrictInteriorBaselineOptions {
  option: 'horizontal' | 'vertical' | 'longest_axis' | 'grid_parallel';
  manualOffset: Point2D;
  bearingDeg?: number;
  screenSnap?: {
    mapBounds: { left: number; right: number; top: number; bottom: number };
    baseOrigin: Point2D;
    panOffset: Point2D;
    ppm: number;
    primaryMajorStep: number;
  };
}

export interface StrictInteriorBaselineResult {
  p1: Point2D;
  p2: Point2D;
  origin0: Point2D;
  bearingDeg: number;
  clampedOffset: Point2D;
  interiorLengthM: number;
  autoAlignOffset?: Point2D;
}

/**
 * Strict Baseline Inside Polygon Generator:
 * Enforces that the baseline segment (P1 -> P2), both endpoints, and intermediate points
 * ALWAYS lie strictly within the compartment polygon boundary.
 *
 * It automatically adjusts the polygon / baseline alignment such that:
 * 1. The baseline is on a Primary Darkest Green line of the graph paper (20mm = PRIMARY_MAJOR_STEP).
 * 2. It traverses through the polygon interior with maximum interior length.
 * 3. Both ends of the Base Line touch the exact edges of the polygon boundary (no falling short inside, no extending outside).
 * 4. The 0-metre starting point (P1) begins exactly at the intersection of two darkest green lines crossing each other.
 * 5. Dragged offsets are clamped strictly to valid Darkest Green lines passing through the polygon.
 */
export function computeStrictInteriorBaseline(
  polygon: Point2D[],
  options: StrictInteriorBaselineOptions
): StrictInteriorBaselineResult {
  if (!polygon || polygon.length < 3) {
    return {
      p1: { x: -100, y: 0 },
      p2: { x: 100, y: 0 },
      origin0: { x: -100, y: 0 },
      bearingDeg: 0,
      clampedOffset: { x: 0, y: 0 },
      interiorLengthM: 200,
      autoAlignOffset: { x: 0, y: 0 }
    };
  }

  // 1. Calculate polygon bounds and geometric centroid
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let sumX = 0, sumY = 0;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }
  const n = polygon.length;
  let cx = sumX / n;
  let cy = sumY / n;

  // Verify that (cx, cy) is strictly inside the polygon.
  // For irregular concave shapes (horseshoe / L-shape), search for the interior point with maximum clearance from edges.
  if (!isPointInPolygon({ x: cx, y: cy }, polygon)) {
    let bestDist = -1;
    let bestPt = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const gridCols = 15;
    const gridRows = 15;
    const stepX = (maxX - minX) / gridCols;
    const stepY = (maxY - minY) / gridRows;

    for (let i = 1; i < gridCols; i++) {
      for (let j = 1; j < gridRows; j++) {
        const testPt = { x: minX + i * stepX, y: minY + j * stepY };
        if (isPointInPolygon(testPt, polygon)) {
          const { dist } = findNearestPointOnPolygon(testPt, polygon);
          if (dist > bestDist) {
            bestDist = dist;
            bestPt = testPt;
          }
        }
      }
    }
    if (bestDist > 0) {
      cx = bestPt.x;
      cy = bestPt.y;
    }
  }

  // 2. Determine baseline direction angle and unit vectors
  let bearing = 0;
  let isHorizontal = true;
  let isVertical = false;

  if (options.option === 'vertical') {
    bearing = 90;
    isHorizontal = false;
    isVertical = true;
  } else if (options.option === 'longest_axis') {
    let maxDist = 0;
    let autoBearing = options.bearingDeg ?? 0;
    for (let i = 0; i < polygon.length; i++) {
      for (let j = i + 1; j < polygon.length; j++) {
        const dx = polygon[j].x - polygon[i].x;
        const dy = polygon[j].y - polygon[i].y;
        const d = Math.hypot(dx, dy);
        if (d > maxDist) {
          maxDist = d;
          let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (deg < 0) deg += 360;
          autoBearing = Math.round(deg);
        }
      }
    }
    bearing = autoBearing;
    isHorizontal = false;
    isVertical = false;
  } else {
    // horizontal / grid_parallel default
    bearing = 0;
    isHorizontal = true;
    isVertical = false;
  }

  const rad = (bearing * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  // Helper: Find all interior segments of line passing through anchorPt along vector u
  const getInteriorSegments = (anchorPt: Point2D): Array<{ seg: [number, number]; len: number }> => {
    const tIntersects: number[] = [];
    for (let i = 0; i < n; i++) {
      const pA = polygon[i];
      const pB = polygon[(i + 1) % n];
      const segDx = pB.x - pA.x;
      const segDy = pB.y - pA.y;
      const det = ux * segDy - uy * segDx;
      if (Math.abs(det) > 1e-6) {
        const s = ((anchorPt.x - pA.x) * uy - (anchorPt.y - pA.y) * ux) / -det;
        if (s >= 0 && s <= 1) {
          const t = ((pA.x - anchorPt.x) * segDy - (pA.y - anchorPt.y) * segDx) / det;
          tIntersects.push(t);
        }
      }
    }
    tIntersects.sort((a, b) => a - b);

    const segments: Array<{ seg: [number, number]; len: number }> = [];
    for (let k = 0; k < tIntersects.length - 1; k++) {
      const t1 = tIntersects[k];
      const t2 = tIntersects[k + 1];
      const len = t2 - t1;
      if (len >= 5) {
        // Test midpoint, 25%, 75%
        const m1 = { x: anchorPt.x + (t1 + len * 0.25) * ux, y: anchorPt.y + (t1 + len * 0.25) * uy };
        const m2 = { x: anchorPt.x + (t1 + len * 0.5) * ux, y: anchorPt.y + (t1 + len * 0.5) * uy };
        const m3 = { x: anchorPt.x + (t1 + len * 0.75) * ux, y: anchorPt.y + (t1 + len * 0.75) * uy };
        if (isPointInPolygon(m1, polygon) && isPointInPolygon(m2, polygon) && isPointInPolygon(m3, polygon)) {
          segments.push({ seg: [t1, t2], len });
        }
      }
    }
    return segments;
  };

  let anchorPoint: Point2D = { x: cx, y: cy };
  let clampedOffset: Point2D = { ...options.manualOffset };

  // 3. Screen Grid Snapping & Alignment: Find Darkest Green lines & exact line crossings inside polygon
  if (options.screenSnap) {
    const { mapBounds, baseOrigin, panOffset, ppm, primaryMajorStep } = options.screenSnap;

    if (isHorizontal) {
      // Find all Darkest Green horizontal lines that cross the polygon interior
      const kMin = Math.floor((mapBounds.top - mapBounds.top) / primaryMajorStep);
      const kMax = Math.ceil((mapBounds.bottom - mapBounds.top) / primaryMajorStep);

      interface CandidateLineH {
        k: number;
        meterY: number;
        seg: [number, number];
        len: number;
        interiorCrossings: Point2D[];
      }

      const validKList: CandidateLineH[] = [];

      for (let k = kMin; k <= kMax; k++) {
        const screenY = mapBounds.top + k * primaryMajorStep;
        const meterY = cy + (baseOrigin.y + panOffset.y - screenY) / ppm;
        if (meterY >= minY && meterY <= maxY) {
          const segs = getInteriorSegments({ x: cx, y: meterY });
          if (segs.length > 0) {
            const best = segs.reduce((prev, curr) => (curr.len > prev.len ? curr : prev), segs[0]);
            if (best.len >= 15) {
              // Find all vertical Darkest Green lines that cross this line strictly INSIDE the polygon
              const iMin = Math.floor((mapBounds.left - mapBounds.left) / primaryMajorStep);
              const iMax = Math.ceil((mapBounds.right - mapBounds.left) / primaryMajorStep);
              const crossings: Point2D[] = [];

              for (let i = iMin; i <= iMax; i++) {
                const screenX = mapBounds.left + i * primaryMajorStep;
                const meterX = cx + (screenX - (baseOrigin.x + panOffset.x)) / ppm;
                const t = meterX - cx;
                if (t >= best.seg[0] - 0.01 && t <= best.seg[1] + 0.01) {
                  const pt = { x: meterX, y: meterY };
                  if (isPointInPolygon(pt, polygon)) {
                    crossings.push(pt);
                  }
                }
              }

              crossings.sort((a, b) => a.x - b.x);
              validKList.push({ k, meterY, seg: best.seg, len: best.len, interiorCrossings: crossings });
            }
          }
        }
      }

      if (validKList.length > 0) {
        const reqMeterY = cy + options.manualOffset.y;
        // Prioritize candidate lines that contain at least one crossing point of two darkest green lines inside the polygon
        const linesWithCrossings = validKList.filter((c) => c.interiorCrossings.length > 0);
        const candidates = linesWithCrossings.length > 0 ? linesWithCrossings : validKList;

        candidates.sort((a, b) => Math.abs(a.meterY - reqMeterY) - Math.abs(b.meterY - reqMeterY));
        const chosen = candidates[0];
        anchorPoint = { x: cx, y: chosen.meterY };
        clampedOffset = { x: options.manualOffset.x, y: Math.round(chosen.meterY - cy) };

        // MANDATORY: Both ends of the Base Line must touch the exact edges of the polygon boundary:
        // Spanning fully from one side of the polygon to the other, never falling short inside, and never extending outside.
        const leftEdgeX = anchorPoint.x + chosen.seg[0];
        const rightEdgeX = anchorPoint.x + chosen.seg[1];

        // Screen coordinate of the left edge point
        const screenLeftX = baseOrigin.x + panOffset.x + (leftEdgeX - cx) * ppm;
        // Nearest vertical Darkest Green line on graph paper (20mm = primaryMajorStep)
        const targetGridX = mapBounds.left + Math.round((screenLeftX - mapBounds.left) / primaryMajorStep) * primaryMajorStep;
        const autoAlignX = targetGridX - screenLeftX;

        // The 0-metre point (P1) is ALWAYS the starting point of the Base Line, on the edge of the polygon
        const p1 = { x: leftEdgeX, y: chosen.meterY };
        const p2 = { x: rightEdgeX, y: chosen.meterY };

        return {
          p1,
          p2,
          origin0: p1,
          bearingDeg: 0,
          clampedOffset,
          interiorLengthM: Math.max(10, rightEdgeX - leftEdgeX),
          autoAlignOffset: { x: autoAlignX, y: 0 }
        };
      }
    } else if (isVertical) {
      // Find all Darkest Green vertical lines that cross the polygon interior
      const kMin = Math.floor((mapBounds.left - mapBounds.left) / primaryMajorStep);
      const kMax = Math.ceil((mapBounds.right - mapBounds.left) / primaryMajorStep);

      interface CandidateLineV {
        k: number;
        meterX: number;
        seg: [number, number];
        len: number;
        interiorCrossings: Point2D[];
      }

      const validKList: CandidateLineV[] = [];

      for (let k = kMin; k <= kMax; k++) {
        const screenX = mapBounds.left + k * primaryMajorStep;
        const meterX = cx + (screenX - (baseOrigin.x + panOffset.x)) / ppm;
        if (meterX >= minX && meterX <= maxX) {
          const segs = getInteriorSegments({ x: meterX, y: cy });
          if (segs.length > 0) {
            const best = segs.reduce((prev, curr) => (curr.len > prev.len ? curr : prev), segs[0]);
            if (best.len >= 15) {
              const jMin = Math.floor((mapBounds.top - mapBounds.top) / primaryMajorStep);
              const jMax = Math.ceil((mapBounds.bottom - mapBounds.top) / primaryMajorStep);
              const crossings: Point2D[] = [];

              for (let j = jMin; j <= jMax; j++) {
                const screenY = mapBounds.top + j * primaryMajorStep;
                const meterY = cy + (baseOrigin.y + panOffset.y - screenY) / ppm;
                const t = meterY - cy;
                if (t >= best.seg[0] - 0.01 && t <= best.seg[1] + 0.01) {
                  const pt = { x: meterX, y: meterY };
                  if (isPointInPolygon(pt, polygon)) {
                    crossings.push(pt);
                  }
                }
              }

              crossings.sort((a, b) => a.y - b.y);
              validKList.push({ k, meterX, seg: best.seg, len: best.len, interiorCrossings: crossings });
            }
          }
        }
      }

      if (validKList.length > 0) {
        const reqMeterX = cx + options.manualOffset.x;
        const linesWithCrossings = validKList.filter((c) => c.interiorCrossings.length > 0);
        const candidates = linesWithCrossings.length > 0 ? linesWithCrossings : validKList;

        candidates.sort((a, b) => Math.abs(a.meterX - reqMeterX) - Math.abs(b.meterX - reqMeterX));
        const chosen = candidates[0];
        anchorPoint = { x: chosen.meterX, y: cy };
        clampedOffset = { x: Math.round(chosen.meterX - cx), y: options.manualOffset.y };

        const topEdgeY = anchorPoint.y + chosen.seg[0];
        const bottomEdgeY = anchorPoint.y + chosen.seg[1];

        const screenTopY = baseOrigin.y + panOffset.y - (topEdgeY - cy) * ppm;
        const targetGridY = mapBounds.top + Math.round((screenTopY - mapBounds.top) / primaryMajorStep) * primaryMajorStep;
        const autoAlignY = targetGridY - screenTopY;

        const p1 = { x: chosen.meterX, y: topEdgeY };
        const p2 = { x: chosen.meterX, y: bottomEdgeY };

        return {
          p1,
          p2,
          origin0: p1,
          bearingDeg: 90,
          clampedOffset,
          interiorLengthM: Math.max(10, bottomEdgeY - topEdgeY),
          autoAlignOffset: { x: 0, y: autoAlignY }
        };
      }
    }
  }

  // 4. Retrieve interior segment for the chosen anchor point
  let activeSegments = getInteriorSegments(anchorPoint);

  // If the requested line somehow has no interior segment:
  // Automatically search the polygon's interior chords to find the optimal interior baseline!
  if (activeSegments.length === 0) {
    let bestCandidate: { pt: Point2D; seg: [number, number]; len: number } | null = null;
    const searchSteps = 25;
    for (let s = 1; s < searchSteps; s++) {
      const frac = s / searchSteps;
      const testPt = isHorizontal
        ? { x: cx, y: minY + frac * (maxY - minY) }
        : isVertical
        ? { x: minX + frac * (maxX - minX), y: cy }
        : { x: minX + frac * (maxX - minX), y: minY + frac * (maxY - minY) };

      const segs = getInteriorSegments(testPt);
      if (segs.length > 0) {
        const topSeg = segs.reduce((p, c) => (c.len > p.len ? c : p), segs[0]);
        if (!bestCandidate || topSeg.len > bestCandidate.len) {
          bestCandidate = { pt: testPt, seg: topSeg.seg, len: topSeg.len };
        }
      }
    }

    if (bestCandidate) {
      anchorPoint = bestCandidate.pt;
      activeSegments = [{ seg: bestCandidate.seg, len: bestCandidate.len }];
      clampedOffset = {
        x: Math.round(anchorPoint.x - cx),
        y: Math.round(anchorPoint.y - cy)
      };
    }
  }

  // If still no segment (extremely degenerate polygon), fallback to center inset
  if (activeSegments.length === 0) {
    const halfSpan = Math.min((maxX - minX) * 0.35, (maxY - minY) * 0.35, 50);
    return {
      p1: { x: cx - halfSpan * ux, y: cy - halfSpan * uy },
      p2: { x: cx + halfSpan * ux, y: cy + halfSpan * uy },
      origin0: { x: cx, y: cy },
      bearingDeg: Math.round(bearing),
      clampedOffset: { x: 0, y: 0 },
      interiorLengthM: halfSpan * 2
    };
  }

  // Pick the longest interior segment
  const bestSegObj = activeSegments.reduce((prev, curr) => (curr.len > prev.len ? curr : prev), activeSegments[0]);
  const [t1Raw, t2Raw] = bestSegObj.seg;
  const segLen = t2Raw - t1Raw;

  // Both ends of Base Line touch the exact edges of the polygon boundary
  const p1: Point2D = { x: anchorPoint.x + t1Raw * ux, y: anchorPoint.y + t1Raw * uy };
  const p2: Point2D = { x: anchorPoint.x + t2Raw * ux, y: anchorPoint.y + t2Raw * uy };

  // Origin 0 (Station 0) at the first 100m grid crossing inside polygon
  const gridStepM = 100;
  const firstGridCrossing = Math.ceil(t1Raw / gridStepM) * gridStepM;
  let origin0: Point2D = { x: anchorPoint.x + firstGridCrossing * ux, y: anchorPoint.y + firstGridCrossing * uy };
  if (!isPointInPolygon(origin0, polygon)) {
    origin0 = { ...p1 };
  }

  if (isHorizontal) {
    p1.y = anchorPoint.y;
    p2.y = anchorPoint.y;
    origin0.y = anchorPoint.y;
  } else if (isVertical) {
    p1.x = anchorPoint.x;
    p2.x = anchorPoint.x;
    origin0.x = anchorPoint.x;
  }

  const finalLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  return {
    p1,
    p2,
    origin0,
    bearingDeg: Math.round(bearing),
    clampedOffset,
    interiorLengthM: Math.max(10, finalLen)
  };
}

/**
 * Calculates total Euclidean length (in meters) along a 2D meter polyline.
 */
export function calculatePolylineLengthM(pts: Point2D[]): number {
  if (!pts || pts.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/**
 * Converts a walked/traced road centerline (in meters) and road width (in meters)
 * into a clean closed corridor polygon (Point2D[]) with clamped miter joins.
 */
export function bufferPolylineToPolygon(centerline: Point2D[], widthM: number): Point2D[] {
  if (!centerline || centerline.length < 2) return [];
  const safeWidth = Math.max(0.5, Number(widthM) || 4);
  const halfW = safeWidth / 2;

  // Deduplicate consecutive near-identical points (< 0.25m)
  const clean: Point2D[] = [centerline[0]];
  for (let i = 1; i < centerline.length; i++) {
    const prev = clean[clean.length - 1];
    if (Math.hypot(centerline[i].x - prev.x, centerline[i].y - prev.y) >= 0.25) {
      clean.push(centerline[i]);
    }
  }
  if (clean.length < 2) return [];

  // Compute unit normals for each segment
  const segNormals: Point2D[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const dx = clean[i + 1].x - clean[i].x;
    const dy = clean[i + 1].y - clean[i].y;
    const len = Math.hypot(dx, dy) || 1;
    segNormals.push({ x: -dy / len, y: dx / len });
  }

  const leftSide: Point2D[] = [];
  const rightSide: Point2D[] = [];
  const maxMiter = halfW * 1.75;

  for (let i = 0; i < clean.length; i++) {
    let nx = 0;
    let ny = 0;
    let offsetDist = halfW;

    if (i === 0) {
      nx = segNormals[0].x;
      ny = segNormals[0].y;
    } else if (i === clean.length - 1) {
      nx = segNormals[segNormals.length - 1].x;
      ny = segNormals[segNormals.length - 1].y;
    } else {
      const n1 = segNormals[i - 1];
      const n2 = segNormals[i];
      const bx = n1.x + n2.x;
      const by = n1.y + n2.y;
      const bLen = Math.hypot(bx, by);
      if (bLen < 1e-4) {
        // 180-degree hair-pin turn fallback
        nx = n2.x;
        ny = n2.y;
      } else {
        nx = bx / bLen;
        ny = by / bLen;
        const dot = Math.max(0.35, nx * n1.x + ny * n1.y);
        offsetDist = Math.min(maxMiter, halfW / dot);
      }
    }

    leftSide.push({
      x: clean[i].x + nx * offsetDist,
      y: clean[i].y + ny * offsetDist
    });
    rightSide.push({
      x: clean[i].x - nx * offsetDist,
      y: clean[i].y - ny * offsetDist
    });
  }

  return [...leftSide, ...rightSide.reverse()];
}

/**
 * Converts a walked/traced single-bank Nala/Stream polyline (in meters), nala width/span (in meters),
 * and side ('left' | 'right' relative to walking direction) into a closed one-sided non-workable polygon.
 * In Cartesian meters (+x East, +y North), walking from P_i -> P_{i+1} has Left normal (-dy/len, dx/len)
 * and Right normal (dy/len, -dx/len).
 */
export function oneSidedBufferPolylineToPolygon(
  bankLine: Point2D[],
  widthM: number,
  side: 'left' | 'right'
): Point2D[] {
  if (!bankLine || bankLine.length < 2) return [];
  const safeWidth = Math.max(0.5, Number(widthM) || 6);
  const sign = side === 'left' ? 1 : -1;

  // Deduplicate consecutive near-identical points (< 0.25m)
  const clean: Point2D[] = [bankLine[0]];
  for (let i = 1; i < bankLine.length; i++) {
    const prev = clean[clean.length - 1];
    if (Math.hypot(bankLine[i].x - prev.x, bankLine[i].y - prev.y) >= 0.25) {
      clean.push(bankLine[i]);
    }
  }
  if (clean.length < 2) return [];

  // Compute left-hand unit normals for each segment
  const segNormals: Point2D[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const dx = clean[i + 1].x - clean[i].x;
    const dy = clean[i + 1].y - clean[i].y;
    const len = Math.hypot(dx, dy) || 1;
    segNormals.push({ x: (-dy / len) * sign, y: (dx / len) * sign });
  }

  const oppositeBank: Point2D[] = [];
  const maxMiter = safeWidth * 1.75;

  for (let i = 0; i < clean.length; i++) {
    let nx = 0;
    let ny = 0;
    let offsetDist = safeWidth;

    if (i === 0) {
      nx = segNormals[0].x;
      ny = segNormals[0].y;
    } else if (i === clean.length - 1) {
      nx = segNormals[segNormals.length - 1].x;
      ny = segNormals[segNormals.length - 1].y;
    } else {
      const n1 = segNormals[i - 1];
      const n2 = segNormals[i];
      const bx = n1.x + n2.x;
      const by = n1.y + n2.y;
      const bLen = Math.hypot(bx, by);
      if (bLen < 1e-4) {
        nx = n2.x;
        ny = n2.y;
      } else {
        nx = bx / bLen;
        ny = by / bLen;
        const dot = Math.max(0.35, nx * n1.x + ny * n1.y);
        offsetDist = Math.min(maxMiter, safeWidth / dot);
      }
    }

    oppositeBank.push({
      x: clean[i].x + nx * offsetDist,
      y: clean[i].y + ny * offsetDist
    });
  }

  return [...clean, ...oppositeBank.reverse()];
}


