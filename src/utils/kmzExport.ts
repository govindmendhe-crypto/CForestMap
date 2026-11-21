/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import {
  Point2D,
  LatLonPoint,
  GeoRef,
  FeaturePreset,
  ForestryCellBlock,
  ForestryStationPeg,
  ForestryGridLineSegment,
  MeterPoint,
  NonWorkingAreaItem,
  BoundaryPillar,
  LayerVisibility
} from '../types/mapTypes';
import {
  meterToLatLon,
  toDMS,
  formatToDMY,
  bearingToCompass,
  calculateGeographicBearing,
  ForestrySurveyResult,
  computeStrictInteriorBaseline,
  generateForestrySurveyGrid,
  computeSectionLines,
  unrotatePoint,
  calcAreaHa
} from './geoUtils';
import type { SavedCoupeProject } from './fieldTools';

export interface KmzExportOptions {
  canvas?: HTMLCanvasElement;
  mapBounds?: { left: number; right: number; top: number; bottom: number };
  pixelToMeter?: (px: number, py: number) => Point2D;
  boundaryPoints: Point2D[];
  nonWorkingPolygons?: Point2D[][];
  nonWorkingItems?: NonWorkingAreaItem[];
  isNonWorkingNil?: boolean;
  baseline: { p1: Point2D; p2: Point2D; origin0?: Point2D; bearingDeg?: number } | null;
  sectionLines?: { p1: Point2D; p2: Point2D }[];
  surveyGrid: ForestrySurveyResult;
  geoRef: GeoRef;
  features: FeaturePreset[];
  pillars?: BoundaryPillar[];
  layerVisibility?: Partial<LayerVisibility>;
  metadata: {
    village: string;
    division: string;
    subDivision: string;
    range: string;
    round: string;
    beat: string;
    compartmentNo: string;
    landIdentifierType: string;
    landIdentifierValue: string;
    totalArea: string;
    treatmentArea: string;
    nonTreatmentArea: string;
    treatmentTitle: string;
    treatmentType: string;
    date: string;
    plantSpacingM: number;
    targetTotalPlants: number;
    scaleName: string;
    lang: string;
    vanrakshak?: string;
    vanpal?: string;
    rfo?: string;
  };
  /** Optional lossless app project snapshot embedded in files/forest_project.json for 1-tap KMZ re-import & field navigation */
  projectSnapshot?: SavedCoupeProject;
}

/**
 * Escapes XML special characters for valid KML generation.
 */
function escapeXml(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Renders a compact, cropped official legend card image for Google Earth ScreenOverlay.
 * Kept small (320x360 px) and docked to the screen corner so the Google Earth terrain remains 100% visible.
 */
function createLegendHudCanvas(options: KmzExportOptions): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const { metadata, surveyGrid, baseline } = options;
  const hasNonTreatment =
    !options.isNonWorkingNil &&
    metadata.nonTreatmentArea &&
    parseFloat(metadata.nonTreatmentArea) > 0;
  const hasRoadNonWorking =
    !options.isNonWorkingNil &&
    Boolean(options.nonWorkingItems?.some((it) => it.category === 'road'));

  // Compact dimensions: occupies ~10-15% screen, widened slightly to show Base Line & Grid Line bearings cleanly
  const W = 240;
  const H = 170 + (hasNonTreatment ? 20 : 0) + (hasRoadNonWorking ? 18 : 0);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, width: W, height: H };

  // Background card: crisp white card with dark forest green border
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(2, 2, W - 4, H - 4, 6);
  } else {
    ctx.rect(2, 2, W - 4, H - 4);
  }
  ctx.fill();

  ctx.strokeStyle = '#064e3b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Header Banner (Forest Green)
  ctx.fillStyle = '#064e3b';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(2, 2, W - 4, 22, [5, 5, 0, 0]);
  } else {
    ctx.fillRect(2, 2, W - 4, 22);
  }
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px Arial, sans-serif';
  ctx.fillText('महाराष्ट्र वन विभाग — नकाशा सूची', W / 2, 15);

  // Administrative summary panel
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(5, 26, W - 10, 26);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 0.75;
  ctx.strokeRect(5, 26, W - 10, 26);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = '8px Arial, sans-serif';

  const landLabel =
    metadata.landIdentifierType === 'survey'
      ? 'सर्व्हे'
      : metadata.landIdentifierType === 'gut'
      ? 'गट'
      : 'कक्ष';
  const landVal = metadata.landIdentifierValue || metadata.compartmentNo || '-';

  ctx.fillText(`मौजा: ${metadata.village || '-'}`, 8, 37, 110);
  ctx.fillText(`${landLabel}: ${landVal}`, 122, 37, 110);

  ctx.fillStyle = '#064e3b';
  ctx.font = 'bold 8.5px Arial, sans-serif';
  ctx.fillText(`उपचार: ${metadata.treatmentArea || '0.00'} Ha`, 8, 48, 110);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`एकूण: ${metadata.totalArea || '0.00'} Ha`, 122, 48, 110);

  const drawRow = (y: number, drawSymbol: () => void, label: string) => {
    drawSymbol();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 8.2px Arial, sans-serif';
    ctx.fillText(label, 28, y, W - 34);
  };

  let curY = 64;

  // 1. Boundary: Crimson outline, transparent fill
  drawRow(
    curY,
    () => {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.strokeRect(7, curY - 8, 15, 10);
    },
    'कूप सीमा (Treatment Boundary)'
  );

  // 2. Base Line: Vivid Blue line with terminal dot, length & automatic geographic bearing
  const bLenM =
    baseline?.p1 && baseline?.p2
      ? Math.round(Math.hypot(baseline.p2.x - baseline.p1.x, baseline.p2.y - baseline.p1.y))
      : 0;
  const baseBearingDeg =
    baseline?.p1 && baseline?.p2
      ? typeof baseline.bearingDeg === 'number'
        ? ((Math.round(baseline.bearingDeg) % 360) + 360) % 360
        : calculateGeographicBearing(baseline.p1, baseline.p2)
      : null;
  const baseCompass = baseBearingDeg !== null ? bearingToCompass(baseBearingDeg) : '';
  const gridLeftDeg = baseBearingDeg !== null ? (baseBearingDeg + 270) % 360 : null;
  const gridRightDeg = baseBearingDeg !== null ? (baseBearingDeg + 90) % 360 : null;

  curY += 17;
  drawRow(
    curY,
    () => {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(7, curY - 3);
      ctx.lineTo(21, curY - 3);
      ctx.stroke();
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(21, curY - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    },
    `पाया रेषा (${bLenM > 0 ? `${bLenM}m · ` : ''}${baseBearingDeg !== null ? `${baseBearingDeg}° ${baseCompass}` : 'Base Line'})`
  );

  // 3. Section Line: Dashed Purple line
  curY += 17;
  drawRow(
    curY,
    () => {
      ctx.strokeStyle = '#9333ea';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(7, curY - 3);
      ctx.lineTo(22, curY - 3);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    'विभाग रेषा (Section Line)'
  );

  // 4. Grid Lines: 100m x 100m green lines
  curY += 17;
  drawRow(
    curY,
    () => {
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(7, curY - 7);
      ctx.lineTo(22, curY - 7);
      ctx.moveTo(7, curY + 1);
      ctx.lineTo(22, curY + 1);
      ctx.moveTo(14, curY - 8);
      ctx.lineTo(14, curY + 2);
      ctx.stroke();
    },
    `१०० मी. ग्रीड्स (${surveyGrid.cells.length}${gridLeftDeg !== null && gridRightDeg !== null ? ` · ${gridLeftDeg}° ${bearingToCompass(gridLeftDeg)} / ${gridRightDeg}° ${bearingToCompass(gridRightDeg)}` : ' Grids'})`
  );

  // 5. Peg Stations: Red pins/circles
  curY += 17;
  drawRow(
    curY,
    () => {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(14, curY - 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    'पेग स्टेशन्स (Pegs 0, L1, R1...)'
  );

  // 6. Non-Treatment Area (if present)
  if (hasNonTreatment) {
    curY += 17;
    drawRow(
      curY,
      () => {
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
        ctx.fillRect(7, curY - 8, 15, 10);
        ctx.strokeRect(7, curY - 8, 15, 10);
      },
      `अनुपचार (${metadata.nonTreatmentArea} Ha)`
    );
  }

  // 6b. Road Non-Workable Area (distinct parallel road symbol)
  if (hasRoadNonWorking) {
    curY += 17;
    drawRow(
      curY,
      () => {
        ctx.fillStyle = '#475569';
        ctx.fillRect(7, curY - 7, 15, 8);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(7, curY - 7);
        ctx.lineTo(22, curY - 7);
        ctx.moveTo(7, curY + 1);
        ctx.lineTo(22, curY + 1);
        ctx.stroke();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(8, curY - 3);
        ctx.lineTo(21, curY - 3);
        ctx.stroke();
        ctx.setLineDash([]);
      },
      'रस्ता — अनुपचार (Road)'
    );
  }

  // Footer note
  curY += 16;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 7.5px Arial, sans-serif';
  ctx.fillText('Google Earth Native Vector · WGS84', W / 2, curY);

  return { canvas, width: W, height: H };
}

/**
 * Generates a lightweight 20x20 PNG icon directly in memory so Google Earth Mobile
 * never makes external http:// requests that stall or fail offline.
 */
function createLocalIconBase64(fillColor: string, shape: 'circle' | 'diamond' | 'dot' | 'none'): string {
  const size = shape === 'none' ? 2 : shape === 'dot' ? 12 : 20;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx && shape !== 'none') {
    const mid = size / 2;
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = shape === 'dot' ? 1.5 : 2;
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(mid, 2);
      ctx.lineTo(size - 2, mid);
      ctx.lineTo(mid, size - 2);
      ctx.lineTo(2, mid);
      ctx.closePath();
    } else if (shape === 'dot') {
      ctx.arc(mid, mid, 4, 0, Math.PI * 2);
    } else {
      ctx.arc(mid, mid, 7, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
  return c.toDataURL('image/png').split(',')[1];
}

/**
 * Main KMZ Export Function:
 * Generates a fast, lightweight, 100% native KML vector KMZ file optimized for both
 * Desktop and Mobile Google Earth (Android / iOS):
 * - All icons bundled locally inside KMZ (0 external HTTP requests, instant offline load)
 * - Direct <LookAt> camera framing so mobile Google Earth flies directly to the coupe
 * - NO background page image or graph paper (satellite imagery completely visible)
 * - 0% opacity transparent fill for Treatment Boundary (thick crimson outline, exact original WGS84 coords)
 * - Fast 100m x 100m Grid LineStrings + centered labels + Peg Stations + 30% translucent Non-Treatment zone
 * - Properly proportioned, un-distorted ScreenOverlay legend
 */
export async function generateCoupeKmz(options: KmzExportOptions): Promise<Blob> {
  const {
    boundaryPoints,
    nonWorkingPolygons,
    nonWorkingItems,
    isNonWorkingNil,
    baseline,
    sectionLines,
    surveyGrid,
    geoRef,
    features,
    pillars,
    layerVisibility,
    metadata
  } = options;

  const visBoundary = layerVisibility?.showBoundary !== false ? 1 : 0;
  const visNonWorking = layerVisibility?.showNonWorking !== false ? 1 : 0;
  const visBaseline = layerVisibility?.showBaseline !== false ? 1 : 0;
  const visSection = layerVisibility?.showSectionLines !== false ? 1 : 0;
  const visGrid = layerVisibility?.showGridLines !== false ? 1 : 0;
  const visLandmarks = layerVisibility?.showLandmarks !== false ? 1 : 0;

  const zip = new JSZip();

  // 1. Render and save the compact, un-distorted Legend HUD Card + bundled local icons
  const { canvas: legendCanvas, width: legendW, height: legendH } = createLegendHudCanvas(options);
  const legendBase64 = legendCanvas.toDataURL('image/png').split(',')[1];
  zip.file('files/map_legend.png', legendBase64, { base64: true });
  zip.file('files/icon_grid_dot.png', createLocalIconBase64('#10b981', 'dot'), { base64: true });
  zip.file('files/icon_start.png', createLocalIconBase64('#2563eb', 'circle'), { base64: true });
  zip.file('files/icon_end.png', createLocalIconBase64('#2563eb', 'diamond'), { base64: true });
  zip.file('files/icon_peg_base.png', createLocalIconBase64('#ef4444', 'circle'), { base64: true });
  zip.file('files/icon_peg_grid.png', createLocalIconBase64('#dc2626', 'circle'), { base64: true });
  zip.file('files/icon_feature.png', createLocalIconBase64('#0284c7', 'circle'), { base64: true });
  zip.file('files/icon_pillar.png', createLocalIconBase64('#047857', 'diamond'), { base64: true });

  // 2. Convert boundary polygon to exact untouched WGS-84 coordinates string & compute LookAt
  const boundaryGeoPoints = boundaryPoints.map((pt) => meterToLatLon(pt, geoRef));
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  boundaryGeoPoints.forEach((g) => {
    if (g.lat < minLat) minLat = g.lat;
    if (g.lat > maxLat) maxLat = g.lat;
    if (g.lon < minLon) minLon = g.lon;
    if (g.lon > maxLon) maxLon = g.lon;
  });
  const lookAtLat = isFinite(minLat) ? (minLat + maxLat) / 2 : geoRef.centerLat;
  const lookAtLon = isFinite(minLon) ? (minLon + maxLon) / 2 : geoRef.centerLon;
  const latSpanM = isFinite(minLat) ? (maxLat - minLat) * 111320 : 400;
  const lonSpanM = isFinite(minLon) ? (maxLon - minLon) * 111320 * Math.cos((lookAtLat * Math.PI) / 180) : 400;
  const lookAtRange = Math.max(550, Math.round(Math.hypot(latSpanM, lonSpanM) * 1.8));

  // Ensure polygon is closed for KML LinearRing
  const closedBoundary = [...boundaryGeoPoints];
  if (
    closedBoundary.length > 0 &&
    (closedBoundary[0].lat !== closedBoundary[closedBoundary.length - 1].lat ||
      closedBoundary[0].lon !== closedBoundary[closedBoundary.length - 1].lon)
  ) {
    closedBoundary.push(closedBoundary[0]);
  }
  const boundaryCoordinatesStr = closedBoundary
    .map((g) => `${g.lon.toFixed(7)},${g.lat.toFixed(7)},0`)
    .join(' ');

  // 3. Convert non-treatment polygons (distinguishing Road vs Patch)
  const resolvedNonWorkingItems: NonWorkingAreaItem[] = isNonWorkingNil
    ? []
    : nonWorkingItems && nonWorkingItems.length > 0
    ? nonWorkingItems
    : (nonWorkingPolygons || []).map((pts, idx) => ({
        id: `nw_${idx}`,
        fileName: `अनुपचार क्षेत्र ${idx + 1}`,
        pts,
        areaHa: parseFloat(metadata.nonTreatmentArea) || 0,
        category: 'patch' as const
      }));

  const nonWorkingPolysGeo = resolvedNonWorkingItems.map((item) => {
    const geo = item.pts.map((pt) => meterToLatLon(pt, geoRef));
    if (geo.length > 0 && (geo[0].lat !== geo[geo.length - 1].lat || geo[0].lon !== geo[geo.length - 1].lon)) {
      geo.push(geo[0]);
    }
    const coordsStr = geo.map((g) => `${g.lon.toFixed(7)},${g.lat.toFixed(7)},0`).join(' ');
    const centerGeo =
      item.centerlinePts && item.centerlinePts.length >= 2
        ? item.centerlinePts
            .map((pt) => meterToLatLon(pt, geoRef))
            .map((g) => `${g.lon.toFixed(7)},${g.lat.toFixed(7)},0`)
            .join(' ')
        : '';
    return { item, coordsStr, centerGeo };
  });

  // 4. Base Line geometry and DMS details (Connecting P1 and P2 with vivid blue line)
  let baselineKml = '';
  if (baseline?.p1 && baseline?.p2) {
    const p1Geo = meterToLatLon(baseline.p1, geoRef);
    const p2Geo = meterToLatLon(baseline.p2, geoRef);
    const distM = Math.hypot(baseline.p2.x - baseline.p1.x, baseline.p2.y - baseline.p1.y);

    baselineKml = `
      <Placemark>
        <name>पाया रेषा (Base Line P1 ➡ P2)</name>
        <description><![CDATA[<b>पाया रेषा (Base Line)</b><br/>लांबी: ${Math.round(distM)} मी | दिशा: ${baseline.bearingDeg ?? 0}°<br/>P-1: ${toDMS(p1Geo.lat, true)}, ${toDMS(p1Geo.lon, false)}<br/>P-2: ${toDMS(p2Geo.lat, true)}, ${toDMS(p2Geo.lon, false)}]]></description>
        <styleUrl>#baselineLineStyle</styleUrl>
        <LineString>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>${p1Geo.lon.toFixed(7)},${p1Geo.lat.toFixed(7)},0 ${p2Geo.lon.toFixed(7)},${p2Geo.lat.toFixed(7)},0</coordinates>
        </LineString>
      </Placemark>
      <Placemark>
        <name>P-1 (0-00 m)</name>
        <description><![CDATA[<b>P-1 (० / 0-00 m) Base Line Start</b><br/>Lat: ${toDMS(p1Geo.lat, true)}<br/>Lon: ${toDMS(p1Geo.lon, false)}]]></description>
        <styleUrl>#baselineStationStartStyle</styleUrl>
        <Point><coordinates>${p1Geo.lon.toFixed(7)},${p1Geo.lat.toFixed(7)},0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>P-2 (End)</name>
        <description><![CDATA[<b>P-2 Base Line End</b><br/>Lat: ${toDMS(p2Geo.lat, true)}<br/>Lon: ${toDMS(p2Geo.lon, false)}]]></description>
        <styleUrl>#baselineStationEndStyle</styleUrl>
        <Point><coordinates>${p2Geo.lon.toFixed(7)},${p2Geo.lat.toFixed(7)},0</coordinates></Point>
      </Placemark>
    `;
  }

  // 5. Section Lines (Perpendicular division lines)
  let sectionLinesKml = '';
  if (sectionLines && sectionLines.length > 0) {
    sectionLinesKml = sectionLines
      .map((sec, idx) => {
        const p1Geo = meterToLatLon(sec.p1, geoRef);
        const p2Geo = meterToLatLon(sec.p2, geoRef);
        return `<Placemark><name>विभाग रेषा ${idx + 1}</name><styleUrl>#sectionLineStyle</styleUrl><LineString><coordinates>${p1Geo.lon.toFixed(6)},${p1Geo.lat.toFixed(6)},0 ${p2Geo.lon.toFixed(6)},${p2Geo.lat.toFixed(6)},0</coordinates></LineString></Placemark>`;
      })
      .join('\n');
  }

  // 6. Grid Lines (100m x 100m emerald green lines inside single fast MultiGeometry)
  let gridLinesKml = '';
  if (surveyGrid.gridLines && surveyGrid.gridLines.length > 0) {
    const lineStrings = surveyGrid.gridLines
      .map((seg: ForestryGridLineSegment) => {
        const p1Geo = meterToLatLon(seg.p1, geoRef);
        const p2Geo = meterToLatLon(seg.p2, geoRef);
        return `<LineString><coordinates>${p1Geo.lon.toFixed(6)},${p1Geo.lat.toFixed(6)},0 ${p2Geo.lon.toFixed(6)},${p2Geo.lat.toFixed(6)},0</coordinates></LineString>`;
      })
      .join('');

    gridLinesKml = `
      <Placemark>
        <name>कूप ग्रीड रेषा जाळे १००मी x १००मी (Grid Lines)</name>
        <description>महाराष्ट्र वन विभाग कूप ग्रीड (${escapeXml(metadata.scaleName)})</description>
        <styleUrl>#gridLineStyle</styleUrl>
        <MultiGeometry>${lineStrings}</MultiGeometry>
      </Placemark>
    `;
  }

  // 7. Grid Cells & Labels (Compact HTML for fast Mobile Google Earth parsing)
  let ux = 1, uy = 0, vx = 0, vy = 1;
  const stepX = 100;
  const stepY = 100;
  if (baseline?.p1 && baseline?.p2) {
    const bdx = baseline.p2.x - baseline.p1.x;
    const bdy = baseline.p2.y - baseline.p1.y;
    const bLen = Math.hypot(bdx, bdy) || 1;
    ux = bdx / bLen;
    uy = bdy / bLen;
    vx = -uy;
    vy = ux;
  }

  let gridCellsKml = '';
  let gridLabelsKml = '';

  if (surveyGrid.cells && surveyGrid.cells.length > 0) {
    const labelParts: string[] = [];
    const cellParts: string[] = [];

    surveyGrid.cells.forEach((cell: ForestryCellBlock) => {
      const centerGeo = meterToLatLon(cell.centerM, geoRef);
      const latDms = toDMS(centerGeo.lat, true);
      const lonDms = toDMS(centerGeo.lon, false);

      const colStr = cell.colLetter === '0' ? 'O' : (cell.colLetter || 'A');
      const rowStr = cell.rowIndex === 0 ? '0' : cell.rowIndex > 0 ? `L${cell.rowIndex}` : `R${Math.abs(cell.rowIndex)}`;
      const cellCode = `${colStr}-${rowStr}`;
      const workableVal = cell.workableAreaHa != null ? cell.workableAreaHa : cell.areaHa;

      let cellPolyCoords = '';
      if (cell.cornersM && cell.cornersM.length === 4) {
        const g0 = meterToLatLon(cell.cornersM[0], geoRef);
        const g1 = meterToLatLon(cell.cornersM[1], geoRef);
        const g2 = meterToLatLon(cell.cornersM[2], geoRef);
        const g3 = meterToLatLon(cell.cornersM[3], geoRef);
        cellPolyCoords = `${g0.lon.toFixed(6)},${g0.lat.toFixed(6)},0 ${g1.lon.toFixed(6)},${g1.lat.toFixed(6)},0 ${g2.lon.toFixed(6)},${g2.lat.toFixed(6)},0 ${g3.lon.toFixed(6)},${g3.lat.toFixed(6)},0 ${g0.lon.toFixed(6)},${g0.lat.toFixed(6)},0`;
      } else if (baseline?.p1) {
        const c = cell.colIndex;
        const r = cell.rowIndex;
        const p00 = { x: baseline.p1.x + (c * stepX) * ux + (r * stepY) * vx, y: baseline.p1.y + (c * stepX) * uy + (r * stepY) * vy };
        const p10 = { x: baseline.p1.x + ((c + 1) * stepX) * ux + (r * stepY) * vx, y: baseline.p1.y + ((c + 1) * stepX) * uy + (r * stepY) * vy };
        const p11 = { x: baseline.p1.x + ((c + 1) * stepX) * ux + ((r + 1) * stepY) * vx, y: baseline.p1.y + ((c + 1) * stepX) * uy + ((r + 1) * stepY) * vy };
        const p01 = { x: baseline.p1.x + (c * stepX) * ux + ((r + 1) * stepY) * vx, y: baseline.p1.y + (c * stepX) * uy + ((r + 1) * stepY) * vy };

        const g0 = meterToLatLon(p00, geoRef);
        const g1 = meterToLatLon(p10, geoRef);
        const g2 = meterToLatLon(p11, geoRef);
        const g3 = meterToLatLon(p01, geoRef);
        cellPolyCoords = `${g0.lon.toFixed(6)},${g0.lat.toFixed(6)},0 ${g1.lon.toFixed(6)},${g1.lat.toFixed(6)},0 ${g2.lon.toFixed(6)},${g2.lat.toFixed(6)},0 ${g3.lon.toFixed(6)},${g3.lat.toFixed(6)},0 ${g0.lon.toFixed(6)},${g0.lat.toFixed(6)},0`;
      } else {
        const half = 50;
        const c0 = meterToLatLon({ x: cell.centerM.x - half, y: cell.centerM.y - half }, geoRef);
        const c1 = meterToLatLon({ x: cell.centerM.x + half, y: cell.centerM.y - half }, geoRef);
        const c2 = meterToLatLon({ x: cell.centerM.x + half, y: cell.centerM.y + half }, geoRef);
        const c3 = meterToLatLon({ x: cell.centerM.x - half, y: cell.centerM.y + half }, geoRef);
        cellPolyCoords = `${c0.lon.toFixed(6)},${c0.lat.toFixed(6)},0 ${c1.lon.toFixed(6)},${c1.lat.toFixed(6)},0 ${c2.lon.toFixed(6)},${c2.lat.toFixed(6)},0 ${c3.lon.toFixed(6)},${c3.lat.toFixed(6)},0 ${c0.lon.toFixed(6)},${c0.lat.toFixed(6)},0`;
      }

      const nonWorkStr = (cell.nonWorkingAreaHa && cell.nonWorkingAreaHa > 0)
        ? ` | अनुपचार: ${cell.nonWorkingAreaHa.toFixed(2)} Ha`
        : '';
      const compactDesc = `<b>ग्रीड ${cell.cellNumber}: ${escapeXml(cellCode)}</b><br/>क्षेत्रफळ (Area): <b>${workableVal.toFixed(2)} Ha</b>${nonWorkStr}<br/>स्थिती: ${cell.isFullCell ? 'पूर्ण ग्रीड' : 'किनार ग्रीड'} | रोपे: ${cell.estimatedPlants ?? '—'}<br/>GPS: ${latDms}, ${lonDms}`;

      labelParts.push(`<Placemark><name>${cell.cellNumber} (${workableVal.toFixed(2)} Ha)</name><description><![CDATA[${compactDesc}]]></description><styleUrl>#gridLabelStyle</styleUrl><Point><coordinates>${centerGeo.lon.toFixed(6)},${centerGeo.lat.toFixed(6)},0</coordinates></Point></Placemark>`);

      cellParts.push(`<Placemark><name>${cell.cellNumber}. ${escapeXml(cellCode)} (${workableVal.toFixed(2)} Ha)</name><description><![CDATA[${compactDesc}]]></description><styleUrl>#gridCellPolyStyle</styleUrl><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${cellPolyCoords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`);
    });

    gridLabelsKml = labelParts.join('\n');
    gridCellsKml = cellParts.join('\n');
  }

  // 8. Peg Stations (0, L1, R1, AL1, AR1, DR1, ER1, FL1...)
  let pegStationsKml = '';
  if (surveyGrid.pegs && surveyGrid.pegs.length > 0) {
    pegStationsKml = surveyGrid.pegs
      .map((peg: ForestryStationPeg) => {
        const pegPt = peg.geoPointM || peg.pointM;
        const pegGeo = meterToLatLon(pegPt, geoRef);
        const latDms = toDMS(pegGeo.lat, true);
        const lonDms = toDMS(pegGeo.lon, false);
        const sideText = peg.isBaselineStation
          ? 'पाया रेषा (0)'
          : peg.side === 'L'
          ? `डावी बाजू (L${peg.rowNum})`
          : `उजवी बाजू (R${peg.rowNum})`;

        return `<Placemark><name>${escapeXml(peg.label)}</name><description><![CDATA[<b>पेग: ${escapeXml(peg.label)}</b> (${sideText})<br/>Lat: ${latDms}<br/>Lon: ${lonDms}<br/>Dec: ${pegGeo.lat.toFixed(6)}, ${pegGeo.lon.toFixed(6)}]]></description><styleUrl>${peg.isBaselineStation ? '#baselinePegStyle' : '#gridPegStyle'}</styleUrl><Point><coordinates>${pegGeo.lon.toFixed(6)},${pegGeo.lat.toFixed(6)},0</coordinates></Point></Placemark>`;
      })
      .join('\n');
  }

  // 9. Landmark Features (Trees, water bodies, wells, etc.)
  let featuresKml = '';
  if (features && features.length > 0) {
    const featParts: string[] = [];
    features.forEach((feat: FeaturePreset) => {
      if (!feat.enabled || !feat.markers || feat.markers.length === 0) return;
      feat.markers.forEach((m: MeterPoint) => {
        const markerGeo =
          m.lat != null && m.lon != null
            ? { lat: m.lat, lon: m.lon }
            : meterToLatLon({ x: m.mx, y: m.my }, geoRef);
        featParts.push(`<Placemark><name>${escapeXml(m.label || feat.label || feat.id)}</name><description>भूप्रदेश खूण (${escapeXml(feat.label)})</description><styleUrl>#featurePlacemarkStyle</styleUrl><Point><coordinates>${markerGeo.lon.toFixed(6)},${markerGeo.lat.toFixed(6)},0</coordinates></Point></Placemark>`);
      });
    });
    featuresKml = featParts.join('\n');
  }

  // 9b. Boundary Pillars (BP-1, BP-2...) stamped via GPS during field walks
  let pillarsKml = '';
  if (pillars && pillars.length > 0) {
    pillarsKml = pillars
      .map((bp) => {
        const latDms = toDMS(bp.lat, true);
        const lonDms = toDMS(bp.lon, false);
        const accStr = bp.accuracyM != null ? ` | GPS ±${bp.accuracyM.toFixed(1)}m` : '';
        return `<Placemark><name>${escapeXml(bp.label)}</name><description><![CDATA[<b>सीमा खांब (Boundary Pillar): ${escapeXml(bp.label)}</b><br/>Lat: ${latDms}<br/>Lon: ${lonDms}<br/>Dec: ${bp.lat.toFixed(6)}, ${bp.lon.toFixed(6)}${accStr}]]></description><styleUrl>#pillarPlacemarkStyle</styleUrl><Point><coordinates>${bp.lon.toFixed(7)},${bp.lat.toFixed(7)},0</coordinates></Point></Placemark>`;
      })
      .join('\n');
  }

  // 10. Build the complete, fast, mobile-optimized native vector doc.kml
  const docKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(metadata.landIdentifierValue || metadata.compartmentNo || 'Coupe')}_Treatment_Map</name>
    <open>1</open>
    <LookAt>
      <longitude>${lookAtLon.toFixed(6)}</longitude>
      <latitude>${lookAtLat.toFixed(6)}</latitude>
      <altitude>0</altitude>
      <heading>0</heading>
      <tilt>0</tilt>
      <range>${lookAtRange}</range>
      <altitudeMode>clampToGround</altitudeMode>
    </LookAt>
    <description><![CDATA[<b>महाराष्ट्र शासन — वन विभाग</b><br/>${escapeXml(metadata.treatmentTitle || 'कूप उपचार नकाशा')}<br/>मौजा: ${escapeXml(metadata.village || '-')} | कक्ष/गट: ${escapeXml(metadata.landIdentifierValue || metadata.compartmentNo || '-')}<br/>उपचार क्षेत्र: ${escapeXml(metadata.treatmentArea)} Ha | एकूण: ${escapeXml(metadata.totalArea)} Ha]]></description>

    <Style id="boundaryStyle">
      <LineStyle><color>ff0000e6</color><width>4.0</width></LineStyle>
      <PolyStyle><color>00ffffff</color><fill>0</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="nonWorkingStyle">
      <LineStyle><color>ff1673f9</color><width>3.0</width></LineStyle>
      <PolyStyle><color>4d1673f9</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="roadNonWorkingStyle">
      <LineStyle><color>ff3b291e</color><width>2.5</width></LineStyle>
      <PolyStyle><color>80695547</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="roadCenterlineStyle">
      <LineStyle><color>ffffffff</color><width>2.0</width></LineStyle>
    </Style>
    <Style id="nalaNonWorkingStyle">
      <LineStyle><color>ffc78402</color><width>2.6</width></LineStyle>
      <PolyStyle><color>66f8bd38</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="nalaBankStyle">
      <LineStyle><color>ffa16903</color><width>2.0</width></LineStyle>
    </Style>
    <Style id="baselineLineStyle">
      <LineStyle><color>ffeb6325</color><width>4.5</width></LineStyle>
    </Style>
    <Style id="sectionLineStyle">
      <LineStyle><color>ffea3393</color><width>3.2</width></LineStyle>
    </Style>
    <Style id="gridLineStyle">
      <LineStyle><color>e615803d</color><width>2.2</width></LineStyle>
    </Style>
    <Style id="gridCellPolyStyle">
      <LineStyle><color>6615803d</color><width>1.2</width></LineStyle>
      <PolyStyle><color>00ffffff</color><fill>0</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="gridLabelStyle">
      <IconStyle><scale>0.35</scale><Icon><href>files/icon_grid_dot.png</href></Icon></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.9</scale></LabelStyle>
    </Style>
    <Style id="baselineStationStartStyle">
      <IconStyle><scale>1.1</scale><Icon><href>files/icon_start.png</href></Icon></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.9</scale></LabelStyle>
    </Style>
    <Style id="baselineStationEndStyle">
      <IconStyle><scale>1.1</scale><Icon><href>files/icon_end.png</href></Icon></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.9</scale></LabelStyle>
    </Style>
    <Style id="baselinePegStyle">
      <IconStyle><scale>0.9</scale><Icon><href>files/icon_peg_base.png</href></Icon></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="gridPegStyle">
      <IconStyle><scale>0.75</scale><Icon><href>files/icon_peg_grid.png</href></Icon></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.75</scale></LabelStyle>
    </Style>
    <Style id="featurePlacemarkStyle">
      <IconStyle><scale>1.0</scale><Icon><href>files/icon_feature.png</href></Icon></IconStyle>
    </Style>
    <Style id="pillarPlacemarkStyle">
      <IconStyle><scale>1.1</scale><Icon><href>files/icon_pillar.png</href></Icon></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.95</scale></LabelStyle>
    </Style>

    <Folder>
      <name>१. कूप बाह्य उपचार सीमा (Treatment Boundary)</name>
      <visibility>${visBoundary}</visibility>
      <open>1</open>
      <Placemark>
        <name>कूप सीमा — ${escapeXml(metadata.landIdentifierValue || metadata.compartmentNo)}</name>
        <visibility>${visBoundary}</visibility>
        <description><![CDATA[<b>कूप सीमा</b><br/>उपचार क्षेत्र: ${escapeXml(metadata.treatmentArea)} Ha<br/>एकूण क्षेत्र: ${escapeXml(metadata.totalArea)} Ha<br/>गाव: ${escapeXml(metadata.village)}]]></description>
        <styleUrl>#boundaryStyle</styleUrl>
        <Polygon>
          <extrude>0</extrude>
          <altitudeMode>clampToGround</altitudeMode>
          <outerBoundaryIs><LinearRing><coordinates>${boundaryCoordinatesStr}</coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>

    <Folder>
      <name>२. पाया रेषा (Base Line P1 ➡ P2)</name>
      <visibility>${visBaseline}</visibility>
      <open>1</open>
      ${baselineKml}
    </Folder>

    ${
      sectionLinesKml
        ? `<Folder><name>३. विभाग रेषा (Section Lines)</name><visibility>${visSection}</visibility><open>1</open>${sectionLinesKml}</Folder>`
        : ''
    }

    ${
      nonWorkingPolysGeo.length > 0
        ? `<Folder>
      <name>४. अनुपचार क्षेत्र व रस्ते (Non-Treatment Area &amp; Roads)</name>
      <visibility>${visNonWorking}</visibility>
      <open>1</open>
      ${nonWorkingPolysGeo
        .map(({ item, coordsStr, centerGeo }, pIdx) => {
          const isRoad = item.category === 'road';
          const isNala = item.category === 'nala';
          const label =
            isRoad || isNala
              ? `${escapeXml(item.fileName)} (${item.areaHa.toFixed(2)} Ha)`
              : `${escapeXml(item.fileName || `अनुपचार क्षेत्र ${pIdx + 1}`)} (${item.areaHa ? item.areaHa.toFixed(2) : escapeXml(metadata.nonTreatmentArea)} Ha)`;
          const styleId = isRoad
            ? '#roadNonWorkingStyle'
            : isNala
            ? '#nalaNonWorkingStyle'
            : '#nonWorkingStyle';
          const polyMark = `<Placemark><name>${label}</name><visibility>${visNonWorking}</visibility><styleUrl>${styleId}</styleUrl><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${coordsStr}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
          const centerMark =
            isRoad && centerGeo
              ? `<Placemark><name>${escapeXml(item.fileName)} — मध्यरेषा (Centerline)</name><visibility>${visNonWorking}</visibility><styleUrl>#roadCenterlineStyle</styleUrl><LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${centerGeo}</coordinates></LineString></Placemark>`
              : isNala && centerGeo
              ? `<Placemark><name>${escapeXml(item.fileName)} — काठ (Walked Bank)</name><visibility>${visNonWorking}</visibility><styleUrl>#nalaBankStyle</styleUrl><LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${centerGeo}</coordinates></LineString></Placemark>`
              : '';
          return `${polyMark}\n${centerMark}`;
        })
        .join('\n')}
    </Folder>`
        : ''
    }

    <Folder>
      <name>५. कूप ग्रीड रेषा जाळे १००मी x १००मी (Grid Lines)</name>
      <visibility>${visGrid}</visibility>
      <open>0</open>
      ${gridLinesKml}
    </Folder>

    <Folder>
      <name>६. कूप ग्रीड क्रमांक व क्षेत्रफळ (Grid Numbers &amp; Area Ha)</name>
      <visibility>${visGrid}</visibility>
      <open>0</open>
      ${gridLabelsKml}
    </Folder>

    <Folder>
      <name>७. ग्रीड ब्लॉक्स सीमा व क्षेत्रफळ (Grid Polygons &amp; Area Ha)</name>
      <visibility>0</visibility>
      <open>0</open>
      ${gridCellsKml}
    </Folder>

    <Folder>
      <name>८. ग्रीड पेग स्टेशन्स (Peg Stations GPS)</name>
      <visibility>${visGrid}</visibility>
      <open>0</open>
      ${pegStationsKml}
    </Folder>

    ${
      featuresKml
        ? `<Folder><name>९. भूप्रदेश खुणा (Landmarks)</name><visibility>${visLandmarks}</visibility><open>0</open>${featuresKml}</Folder>`
        : ''
    }

    ${
      pillarsKml
        ? `<Folder><name>१०. सीमा खांब GPS (Boundary Pillars)</name><visibility>${visLandmarks}</visibility><open>1</open>${pillarsKml}</Folder>`
        : ''
    }

    <Folder>
      <name>१०. नकाशा सूची (Map Legend)</name>
      <open>0</open>
      <ScreenOverlay id="treatmentMapScreenLegend">
        <name>नकाशा सूची (Map Legend)</name>
        <Icon><href>files/map_legend.png</href></Icon>
        <overlayXY x="1" y="1" xunits="fraction" yunits="fraction"/>
        <screenXY x="0.985" y="0.86" xunits="fraction" yunits="fraction"/>
        <rotationXY x="0" y="0" xunits="fraction" yunits="fraction"/>
        <size x="${legendW}" y="${legendH}" xunits="pixels" yunits="pixels"/>
      </ScreenOverlay>
    </Folder>
  </Document>
</kml>`;

  zip.file('doc.kml', docKml);

  // Embed full lossless app project snapshot so importing this .kmz back into the app
  // restores 100% of boundary, roads/nalas, pillars, base line, grid & metadata for field inspection.
  if (options.projectSnapshot) {
    try {
      zip.file('files/forest_project.json', JSON.stringify(options.projectSnapshot));
    } catch {
      // Non-fatal: KML still exports cleanly
    }
  }

  // Generate compact binary KMZ Blob
  const kmzBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.google-earth.kmz',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return kmzBlob;
}

/**
 * Builds a complete georeferenced Google Earth KMZ directly from any SavedCoupeProject
 * stored in the offline Saved KMZ Folder (without needing to load it into the canvas first).
 */
export async function generateKmzForSavedProject(
  project: SavedCoupeProject,
  lang = 'mr'
): Promise<{ blob: Blob; filename: string }> {
  const rawPts = project.rawWorkingPoints || [];
  if (rawPts.length < 3 || !project.geoRef?.hasGeo) {
    throw new Error('Saved project does not contain valid georeferenced boundary data.');
  }

  const rotDeg = project.rotationDeg || 0;
  let cx = 0;
  let cy = 0;
  rawPts.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  const centroid: Point2D = { x: cx / rawPts.length, y: cy / rawPts.length };

  const rotatePt = (pt: Point2D): Point2D => {
    if (rotDeg === 0) return pt;
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = pt.x - centroid.x;
    const dy = pt.y - centroid.y;
    return {
      x: centroid.x + dx * cos - dy * sin,
      y: centroid.y + dx * sin + dy * cos
    };
  };

  const rotatedWorking = rawPts.map(rotatePt);
  const nwItems = project.nonWorkingFiles || [];
  const rawNwPolys = nwItems.map((it) => it.pts);
  const rotatedNwPolys = rawNwPolys.map((poly) => poly.map(rotatePt));

  const baselineCalc = computeStrictInteriorBaseline(rotatedWorking, {
    option: project.baselineOption || 'horizontal',
    manualOffset: project.manualBaselineOffset || { x: 0, y: 0 }
  });

  const gridW = project.gridWidthM || 100;
  const gridH = project.gridHeightM || 100;

  const rotatedSurveyGrid: ForestrySurveyResult =
    baselineCalc?.p1 && baselineCalc?.p2
      ? generateForestrySurveyGrid(
          rotatedWorking,
          baselineCalc.p1,
          baselineCalc.p2,
          gridW,
          gridH,
          project.plantSpacingM || 2,
          project.targetTotalPlants,
          project.isNonWorkingNil ? [] : rotatedNwPolys,
          Boolean(project.isNonWorkingNil)
        )
      : { gridLines: [], pegs: [], cells: [], totalEstimatedPlants: 0 };

  const unrotatedSurveyGrid: ForestrySurveyResult = {
    ...rotatedSurveyGrid,
    gridLines: rotatedSurveyGrid.gridLines.map((l) => ({
      ...l,
      p1: unrotatePoint(l.p1, centroid, rotDeg),
      p2: unrotatePoint(l.p2, centroid, rotDeg)
    })),
    pegs: rotatedSurveyGrid.pegs.map((peg) => ({
      ...peg,
      pointM: unrotatePoint(peg.pointM, centroid, rotDeg)
    })),
    cells: rotatedSurveyGrid.cells.map((cell) => ({
      ...cell,
      centerM: unrotatePoint(cell.centerM, centroid, rotDeg),
      cornersM: cell.cornersM
        ? cell.cornersM.map((c) => unrotatePoint(c, centroid, rotDeg))
        : undefined
    }))
  };

  const unrotatedP1 = baselineCalc?.p1 ? unrotatePoint(baselineCalc.p1, centroid, rotDeg) : null;
  const unrotatedP2 = baselineCalc?.p2 ? unrotatePoint(baselineCalc.p2, centroid, rotDeg) : null;
  const trueBearingDeg =
    unrotatedP1 && unrotatedP2 ? calculateGeographicBearing(unrotatedP1, unrotatedP2) : 90;

  const showSec = Boolean(project.showSectionLines || project.displayOptions?.showSectionLines);
  const unrotatedSectionLines =
    showSec && baselineCalc?.p1 && baselineCalc?.p2
      ? computeSectionLines(
          baselineCalc.p1,
          baselineCalc.p2,
          rotatedWorking,
          gridW,
          project.sectionLineOffset || 0
        ).map((sec) => ({
          p1: unrotatePoint(sec.p1, centroid, rotDeg),
          p2: unrotatePoint(sec.p2, centroid, rotDeg)
        }))
      : [];

  const totalAreaHaNum = parseFloat(project.totalAreaHa) || calcAreaHa(rawPts);
  const nwAreaSum = project.isNonWorkingNil
    ? 0
    : nwItems.reduce((sum, it) => sum + (it.areaHa || calcAreaHa(it.pts)), 0);
  const workAreaNum = parseFloat(project.treatmentAreaHa) || Math.max(0, totalAreaHaNum - nwAreaSum);

  const blob = await generateCoupeKmz({
    boundaryPoints: rawPts,
    nonWorkingPolygons: rawNwPolys,
    nonWorkingItems: nwItems,
    isNonWorkingNil: Boolean(project.isNonWorkingNil),
    baseline:
      unrotatedP1 && unrotatedP2
        ? { p1: unrotatedP1, p2: unrotatedP2, origin0: unrotatedP1, bearingDeg: trueBearingDeg }
        : null,
    sectionLines: unrotatedSectionLines,
    surveyGrid: unrotatedSurveyGrid,
    geoRef: project.geoRef,
    features: project.features || [],
    pillars: project.boundaryPillars || [],
    layerVisibility: {
      showBoundary: project.displayOptions?.showBoundary !== false,
      showNonWorking: project.displayOptions?.showNonWorking !== false,
      showBaseline: project.displayOptions?.showBaseline !== false,
      showSectionLines: showSec,
      showGridLines: project.displayOptions?.showGridLines !== false,
      showLandmarks: project.displayOptions?.showLandmarks !== false
    },
    metadata: {
      village: project.village || '',
      division: project.division || '',
      subDivision: project.subDivision || '',
      range: project.range || '',
      round: project.round || '',
      beat: project.beat || '',
      compartmentNo: project.compartmentNo || '',
      landIdentifierType: project.landIdentifierType || 'compartment',
      landIdentifierValue: project.landIdentifierValue || project.compartmentNo || project.name,
      totalArea: project.totalAreaHa || totalAreaHaNum.toFixed(2),
      treatmentArea: project.treatmentAreaHa || workAreaNum.toFixed(2),
      nonTreatmentArea: project.isNonWorkingNil ? 'निरंक' : nwAreaSum.toFixed(2),
      treatmentTitle: project.treatmentTitle || project.name,
      treatmentType: project.treatmentType || 'nirmulan',
      date: project.mapDate || formatToDMY(),
      plantSpacingM: project.plantSpacingM || 2,
      targetTotalPlants: project.targetTotalPlants || 0,
      scaleName: project.scaleId || '1:5,000',
      lang,
      vanrakshak: project.vanrakshak,
      vanpal: project.vanpal,
      rfo: project.rfo
    },
    projectSnapshot: project
  });

  const safeName = (
    project.landIdentifierValue ||
    project.compartmentNo ||
    project.name ||
    'Coupe_Treatment_Map'
  )
    .replace(/[^\w\d-_]/g, '_')
    .slice(0, 48);
  const filename = project.kmzFileName || `${safeName}_GoogleEarth.kmz`;
  return { blob, filename };
}

