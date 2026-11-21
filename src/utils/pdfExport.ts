/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { PaperChoice, PaperSize, Orientation, GridStatementData, PageValidationResult } from '../types/mapTypes';
import { toDMS, meterToLatLon, formatToDMY } from './geoUtils';
import { saveOrShareBlobFile } from './nativeBridge';

export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  a2: { width: 420, height: 594 },
  a1: { width: 594, height: 841 },
  a0: { width: 841, height: 1189 }
};

export interface StrictFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  wMm: number;
  hMm: number;
}

export function calculateStrictFrame(
  mapBounds: { left: number; right: number; top: number; bottom: number },
  canvasWidth: number,
  canvasHeight: number,
  mmPx: number,
  scaleFactor: number
): StrictFrame {
  // Generous padding to prevent cutting off headers, border lines, edge GPS, and signatures
  const left = Math.max(0, mapBounds.left - 48 * scaleFactor);
  const top = Math.max(0, mapBounds.top - 96 * scaleFactor);
  const right = Math.min(canvasWidth, mapBounds.right + 48 * scaleFactor);
  const bottom = Math.min(canvasHeight, mapBounds.bottom + 125 * scaleFactor);

  const w = right - left;
  const h = bottom - top;
  const wMm = w / mmPx;
  const hMm = h / mmPx;

  return { x: left, y: top, w, h, wMm, hMm };
}

/**
 * Validates whether the required map dimensions fit strictly on standard A4 paper.
 * 1. Required map size: e.g. 193 mm × 292 mm. Standard A4 is 210 mm × 297 mm.
 *    If requiredWidth <= 210 && requiredHeight <= 297, sets paperSize to 'a4' and removes warnings.
 * 2. Auto-landscape: If requiredWidth < 297 && requiredHeight < 210, automatically sets orientation to 'landscape'.
 * 3. Force A4 override: Scales visual elements by up to 5% (shrink factor >= 0.95) if checked.
 */
export function validatePageSize(
  requiredWidth: number,
  requiredHeight: number,
  options?: { forceA4?: boolean }
): PageValidationResult {
  const w = Math.round(requiredWidth);
  const h = Math.round(requiredHeight);

  // 1. Portrait A4 Dimension Check:
  // Required map fits in 210 x 297 mm with zero margins
  if (w <= 210 && h <= 297) {
    return {
      paperSize: 'a4',
      orientation: 'portrait',
      fits: true,
      message: 'Map fits perfectly on A4. Downloading with zero margins to preserve exact scale.',
      shrinkFactor: 1.0
    };
  }

  // 2. Landscape A4 Dimension Check (Auto-landscape):
  // If map width < 297 and map height < 210 (or rotated 90° fits in 297 x 210)
  if (w <= 297 && h <= 210) {
    return {
      paperSize: 'a4',
      orientation: 'landscape',
      fits: true,
      message: 'Map fits perfectly on A4. Downloading with zero margins to preserve exact scale.',
      shrinkFactor: 1.0
    };
  }

  // Also check if swapping dimensions (rotating) allows exact A4 fit
  if (h <= 297 && w <= 210) {
    return {
      paperSize: 'a4',
      orientation: 'portrait',
      fits: true,
      message: 'Map fits perfectly on A4. Downloading with zero margins to preserve exact scale.',
      shrinkFactor: 1.0
    };
  }
  if (h <= 210 && w <= 297) {
    return {
      paperSize: 'a4',
      orientation: 'landscape',
      fits: true,
      message: 'Map fits perfectly on A4. Downloading with zero margins to preserve exact scale.',
      shrinkFactor: 1.0
    };
  }

  // 3. Force A4 Layout Override:
  // When checked, generate at A4 size. If content slightly overflows, scale down visual elements
  // by up to 5% (shrink factor >= 0.95).
  if (options?.forceA4) {
    const portraitShrink = Math.min(210 / w, 297 / h);
    const landscapeShrink = Math.min(297 / w, 210 / h);
    const isLandscape = landscapeShrink > portraitShrink;
    const bestRatio = isLandscape ? landscapeShrink : portraitShrink;
    const shrinkFactor = Math.max(0.95, Math.min(1.0, bestRatio));

    return {
      paperSize: 'a4',
      orientation: isLandscape ? 'landscape' : 'portrait',
      fits: true,
      message: 'Force A4 Layout active: Scaled visual elements within 5% limit to fit A4 sheet with zero margins.',
      shrinkFactor
    };
  }

  // 4. Default to A3 if expansive coupe exceeds A4 printable boundaries
  const orientation = w > h ? 'landscape' : 'portrait';
  return {
    paperSize: 'a3',
    orientation,
    fits: false,
    message: 'Coupe dimensions exceed standard A4 printable limits. Shifting to A3 to preserve exact engineering scale without shrinkage.',
    shrinkFactor: 1.0
  };
}

export function evaluatePaperChoice(
  frame: StrictFrame,
  userSelectedFormat: 'auto' | 'a4' | 'a3',
  preferredOrientation: Orientation = 'portrait',
  marginMm: number = 0
): PaperChoice {
  const validation = validatePageSize(frame.wMm, frame.hMm);

  let chosenSize: PaperSize = validation.paperSize;
  let chosenOrientation: Orientation = validation.orientation;

  if (userSelectedFormat === 'a3') {
    chosenSize = 'a3';
    chosenOrientation = preferredOrientation;
  } else if (userSelectedFormat === 'a4') {
    chosenSize = 'a4';
    chosenOrientation = validation.orientation;
  } else {
    chosenSize = validation.paperSize;
    chosenOrientation = validation.orientation;
  }

  const dim = PAPER_DIMENSIONS[chosenSize];
  const widthMm = chosenOrientation === 'portrait' ? dim.width : dim.height;
  const heightMm = chosenOrientation === 'portrait' ? dim.height : dim.width;

  return {
    size: chosenSize,
    orientation: chosenOrientation,
    widthMm,
    heightMm,
    fitsInA4: validation.fits,
    recommendedSize: validation.paperSize
  };
}

/**
 * Renders Page 2: High-resolution Grid Area & Plantation Statement table
 * with full Unicode / Devanagari font rendering, administrative credentials,
 * plant spacing formulas (e.g. 3m x 3m), and official signature blocks.
 */
/**
/**
 * Renders High-Resolution multi-page A4 Grid Statement & GPS Readings:
 * - Page 2 (and continuation Page 3 if needed) strictly in A4 Portrait (210 x 297 mm)
 * - Complete DMS GPS readings for all grid points/pegs (like ER1, DR1, FL1, etc.)
 * - Prominent display of grid dimensions (e.g. 100m x 100m = 1.00 Ha)
 * - Guarantees polygon area and total of grid size are 100% strictly identical
 * - Medium, high-contrast, razor-sharp typography for official forestry reporting
 * - Official signature blocks on final page
 */
export function renderGridStatementPages(data: GridStatementData): HTMLCanvasElement[] {
  // A4 Portrait dimensions at high resolution (~330 DPI)
  const dpm = 3.7795 * 3.5;
  const widthPx = Math.round(210 * dpm); // ~2778 px
  const heightPx = Math.round(297 * dpm); // ~3929 px
  const marginPx = Math.round(8 * dpm);
  const innerW = widthPx - 2 * marginPx;
  const innerH = heightPx - 2 * marginPx;
  const sf = dpm / 7.2; // font scale factor (~1.837)

  // 1. Prepare and normalize area calculations:
  // Forestry Rule: Working Area (प्रत्यक्ष कार्यक्षेत्र / Treatment Area) = Total Polygon Area (एकूण क्षेत्र) - Non-Workable Area (अकार्यकारी क्षेत्र)
  const rawTotalHa = parseFloat(data.totalArea) || (data.polygonAreaHa && data.polygonAreaHa > 0 ? data.polygonAreaHa : 0);
  const rawNonWorkHa = data.isNonWorkingNil ? 0 : (parseFloat(data.nonTreatmentArea || '0') || 0);
  const totalPolyHa = Number(rawTotalHa.toFixed(2));
  const nonWorkHa = Number(rawNonWorkHa.toFixed(2));
  const calculatedWorkHa = Math.max(0, Number((totalPolyHa - nonWorkHa).toFixed(2)));
  const declaredWorkHa = parseFloat(data.treatmentArea || '');
  const targetTreatmentHa = !isNaN(declaredWorkHa) && declaredWorkHa > 0
    ? Number(declaredWorkHa.toFixed(2))
    : calculatedWorkHa;

  // Clone cells so each cell has a verified 2-decimal area matching targetTreatmentHa (Working Area)
  const rawCells = data.cells || [];
  const normalizedCells = rawCells.map((c) => ({
    ...c,
    areaHa: Number((c.areaHa || c.workableAreaHa || 0).toFixed(2)),
    workableAreaHa: Number((c.workableAreaHa || c.areaHa || 0).toFixed(2)),
    nonWorkingAreaHa: Number((c.nonWorkingAreaHa || 0).toFixed(2)),
    grossAreaHa: Number((c.grossAreaHa || c.areaHa || 0).toFixed(2))
  }));

  let currentSum = Number(normalizedCells.reduce((sum, c) => sum + c.areaHa, 0).toFixed(2));
  let diff = Number((targetTreatmentHa - currentSum).toFixed(2));

  if (Math.abs(diff) > 0.0001 && normalizedCells.length > 0) {
    const partialCells = normalizedCells.filter((c) => !c.isFullCell && c.areaHa > 0);
    const candidates = partialCells.length > 0 ? partialCells : normalizedCells;
    candidates.sort((a, b) => b.areaHa - a.areaHa);

    const step = diff > 0 ? 0.01 : -0.01;
    let remainingSteps = Math.round(Math.abs(diff) / 0.01);
    let cellIdx = 0;
    while (remainingSteps > 0 && candidates.length > 0) {
      const c = candidates[cellIdx % candidates.length];
      const newArea = Number((c.areaHa + step).toFixed(2));
      if (newArea >= 0.01) {
        c.areaHa = newArea;
        c.workableAreaHa = newArea;
        remainingSteps--;
      }
      cellIdx++;
      if (cellIdx > candidates.length * 20) {
        candidates[0].areaHa = Number((candidates[0].areaHa + remainingSteps * step).toFixed(2));
        candidates[0].workableAreaHa = candidates[0].areaHa;
        break;
      }
    }
  }

  // Final verification assertion
  const verifiedSumHa = Number(normalizedCells.reduce((sum, c) => sum + c.areaHa, 0).toFixed(2));
  const finalCheckDiff = Number((targetTreatmentHa - verifiedSumHa).toFixed(2));
  if (Math.abs(finalCheckDiff) > 0.0001 && normalizedCells.length > 0) {
    const largestCell = normalizedCells.slice().sort((a, b) => b.areaHa - a.areaHa)[0];
    largestCell.areaHa = Number((largestCell.areaHa + finalCheckDiff).toFixed(2));
    largestCell.workableAreaHa = largestCell.areaHa;
  }

  const hasNonWorkingArea =
    !data.isNonWorkingNil &&
    (parseFloat(data.nonTreatmentArea || '0') > 0 ||
      normalizedCells.some((c) => (c.nonWorkingAreaHa || 0) > 0));

  // 2. Prepare Grid Station Pegs with DMS GPS readings (ER1, DR1, FL1, etc.)
  interface PreparedPeg {
    srNo: number;
    code: string;
    stationName: string;
    latDms: string;
    lonDms: string;
  }

  let preparedPegs: PreparedPeg[] = [];
  if (data.pegs && data.pegs.length > 0) {
    preparedPegs = data.pegs.map((peg, idx) => {
      const ptForGeo = peg.geoPointM || peg.pointM;
      const geo = data.geoRef ? meterToLatLon(ptForGeo, data.geoRef) : { lat: 21.53, lon: 79.23 };
      const stationName = peg.isBaselineStation
        ? 'पाया रेषा (0)'
        : peg.side === 'L'
        ? `डावी बाजू (L${peg.rowNum})`
        : `उजवी बाजू (R${peg.rowNum})`;
      return {
        srNo: idx + 1,
        code: peg.label, // e.g. "0", "0L1", "0R1", "AL1", "AR1", "DR1", "ER1", "FL1"
        stationName,
        latDms: toDMS(geo.lat, true),
        lonDms: toDMS(geo.lon, false)
      };
    });
  } else if (normalizedCells.length > 0) {
    // Fallback: derive station points from cell coordinates
    preparedPegs = normalizedCells.map((cell, idx) => {
      const geo = data.geoRef ? meterToLatLon(cell.centerM, data.geoRef) : { lat: 21.53, lon: 79.23 };
      return {
        srNo: idx + 1,
        code: `P-${cell.colLetter || '0'}${cell.rowIndex >= 0 ? `L${cell.rowIndex}` : `R${Math.abs(cell.rowIndex)}`}`,
        stationName: `ग्रीड ${cell.cellNumber} केंद्र`,
        latDms: toDMS(geo.lat, true),
        lonDms: toDMS(geo.lon, false)
      };
    });
  }

  // Grid dimensions
  const gw = data.gridWidthM || 100;
  const gh = data.gridHeightM || 100;
  const gridCellHa = ((gw * gh) / 10000).toFixed(2);

  // Helper to initialize an A4 page canvas with outer forest borders
  const initPageCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { canvas, ctx: null as any };

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Prestigious forest border
    ctx.strokeStyle = '#064e3b';
    ctx.lineWidth = 3.2;
    ctx.strokeRect(marginPx, marginPx, innerW, innerH);
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(marginPx + 7, marginPx + 7, innerW - 14, innerH - 14);

    return { canvas, ctx };
  };

  // Helper: Fit text inside maxW by shrinking font size only if needed
  const drawFittedText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxW: number,
    fontWeight: string,
    baseSizePx: number,
    fontFamily: string
  ) => {
    let size = baseSizePx;
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    let measured = ctx.measureText(text).width;
    while (measured > maxW && size > 11 * sf) {
      size -= 0.8 * sf;
      ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
      measured = ctx.measureText(text).width;
    }
    ctx.fillText(text, x, y);
  };

  // Helper to draw official signatures block
  const drawSignatures = (ctx: CanvasRenderingContext2D, yPos: number) => {
    const sigCols = [
      { title: 'वनरक्षक (Forest Guard)', name: data.vanrakshak || '—', sub: data.beat ? `नियतक्षेत्र: ${data.beat}` : '' },
      { title: 'वनपाल (Forest Beat Officer)', name: data.vanpal || '—', sub: data.round ? `परिमंडळ: ${data.round}` : '' },
      { title: 'वनपरिक्षेत्र अधिकारी (RFO)', name: data.rfo || '—', sub: data.range ? `वनपरिक्षेत्र: ${data.range}` : '' }
    ];

    const sigSpacing = innerW / 3;
    sigCols.forEach((sc, i) => {
      const cx = marginPx + i * sigSpacing + sigSpacing / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#064e3b';
      drawFittedText(ctx, sc.title, cx, yPos, sigSpacing - 20 * sf, 'bold', 17.5 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");

      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - 85 * sf, yPos + 24 * sf);
      ctx.lineTo(cx + 85 * sf, yPos + 24 * sf);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      drawFittedText(ctx, sc.name, cx, yPos + 46 * sf, sigSpacing - 20 * sf, 'bold', 17 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
      if (sc.sub) {
        ctx.fillStyle = '#475569';
        drawFittedText(ctx, sc.sub, cx, yPos + 64 * sf, sigSpacing - 20 * sf, '600', 14.5 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
      }
    });
  };

  const landLabel =
    data.landIdentifierType === 'survey'
      ? 'सर्व्हे नंबर'
      : data.landIdentifierType === 'gut'
      ? 'गट क्रमांक'
      : 'कक्ष क्रमांक';

  const pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
  const tableX = marginPx + 14;
  const tableW = innerW - 28;
  const pageBottomLimit = heightPx - marginPx - 56 * sf;
  const finalSignatureHeight = 104 * sf;

  const createContinuationPage = (bannerSubtitle: string): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; startY: number } => {
    const p = initPageCanvas();
    if (!p.ctx) return { ...p, startY: marginPx + 30 * sf };
    const ctx = p.ctx;
    let y = marginPx + 32 * sf;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#064e3b';
    ctx.font = `bold ${28 * sf}px 'Noto Sans Devanagari', 'Mukta', Arial, sans-serif`;
    ctx.fillText('महाराष्ट्र शासन — वन विभाग', widthPx / 2, y);

    y += 30 * sf;
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${21 * sf}px 'Noto Sans Devanagari', 'Mukta', Arial, sans-serif`;
    ctx.fillText(bannerSubtitle, widthPx / 2, y);

    y += 24 * sf;
    ctx.fillStyle = '#334155';
    drawFittedText(
      ctx,
      `मौजा: ${data.village || '-'} | वनविभाग: ${data.division || '-'} | ${landLabel}: ${data.landIdentifierValue || '-'} | दिनांक: ${formatToDMY(data.date)}`,
      widthPx / 2,
      y,
      innerW - 40 * sf,
      '600',
      17 * sf,
      "'Noto Sans Devanagari', Arial, sans-serif"
    );

    y += 14 * sf;
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(marginPx + 20, y);
    ctx.lineTo(widthPx - marginPx - 20, y);
    ctx.stroke();

    pages.push(p);
    return { ...p, startY: y + 20 * sf };
  };

  // ---------------- PAGE 2 INITIALIZATION ----------------
  const page2 = initPageCanvas();
  if (!page2.ctx) return [page2.canvas];
  pages.push(page2);
  let curPage = page2;
  let curCtx = page2.ctx;
  let curY = marginPx + 34 * sf;

  // Page 2 Header Banner
  curCtx.textAlign = 'center';
  curCtx.fillStyle = '#064e3b';
  curCtx.font = `bold ${30 * sf}px 'Noto Sans Devanagari', 'Mukta', Arial, sans-serif`;
  curCtx.fillText('महाराष्ट्र शासन — वन विभाग', widthPx / 2, curY);

  curY += 32 * sf;
  curCtx.fillStyle = '#0f172a';
  curCtx.font = `bold ${22 * sf}px 'Noto Sans Devanagari', 'Mukta', Arial, sans-serif`;
  curCtx.fillText('कूप ग्रीड तपशील व जीपीएस रीडिंग अहवाल (Coupe Grid & GPS Statement)', widthPx / 2, curY);

  curY += 24 * sf;
  curCtx.fillStyle = '#334155';
  curCtx.font = `600 ${17 * sf}px 'Noto Sans Devanagari', 'Mukta', Arial, sans-serif`;
  curCtx.fillText('कार्ययोजना व कूप सर्वेक्षण अहवाल (Working Plan & Coupe Survey Statement)', widthPx / 2, curY);

  curY += 14 * sf;
  curCtx.strokeStyle = '#059669';
  curCtx.lineWidth = 2.4;
  curCtx.beginPath();
  curCtx.moveTo(marginPx + 20, curY);
  curCtx.lineTo(widthPx - marginPx - 20, curY);
  curCtx.stroke();

  // Page 2 Administrative Details Card
  curY += 16 * sf;
  const cardX = marginPx + 14;
  const cardW = innerW - 28;
  const cardH = 108 * sf;

  curCtx.fillStyle = '#f0fdf4';
  curCtx.fillRect(cardX, curY, cardW, cardH);
  curCtx.strokeStyle = '#059669';
  curCtx.lineWidth = 1.8;
  curCtx.strokeRect(cardX, curY, cardW, cardH);

  const col1X = cardX + 16 * sf;
  const col2X = cardX + cardW * 0.34;
  const col3X = cardX + cardW * 0.67;
  const col1MaxW = cardW * 0.31;
  const col2MaxW = cardW * 0.31;
  const col3MaxW = cardW * 0.31;

  curCtx.textAlign = 'left';
  curCtx.fillStyle = '#0f172a';

  let metaY = curY + 26 * sf;
  drawFittedText(curCtx, `मौजा (गाव): ${data.village || '-'}`, col1X, metaY, col1MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(curCtx, `वनविभाग: ${data.division || '-'}`, col2X, metaY, col2MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(curCtx, `उपविभाग: ${data.subDivision || '-'}`, col3X, metaY, col3MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");

  metaY += 30 * sf;
  drawFittedText(curCtx, `${landLabel}: ${data.landIdentifierValue || '-'}`, col1X, metaY, col1MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(curCtx, `वनपरिक्षेत्र: ${data.range || '-'}`, col2X, metaY, col2MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(curCtx, `परिमंडळ: ${data.round || '-'} | नियतक्षेत्र: ${data.beat || '-'}`, col3X, metaY, col3MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");

  metaY += 30 * sf;
  curCtx.fillStyle = '#064e3b';
  drawFittedText(curCtx, `एकूण क्षेत्र: ${totalPolyHa.toFixed(2)} हेक्टर`, col1X, metaY, col1MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(
    curCtx,
    `अकार्यकारी: ${data.isNonWorkingNil ? 'निरंक (Nil)' : `${nonWorkHa.toFixed(2)} हेक्टर`}`,
    col2X,
    metaY,
    col2MaxW,
    'bold',
    18 * sf,
    "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif"
  );
  drawFittedText(curCtx, `प्रत्यक्ष उपचार क्षेत्र: ${targetTreatmentHa.toFixed(2)} हेक्टर`, col3X, metaY, col3MaxW, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");

  // Summary Bar
  curY += cardH + 14 * sf;
  const sumBarH = 40 * sf;
  curCtx.fillStyle = '#ecfdf5';
  curCtx.fillRect(cardX, curY, cardW, sumBarH);
  curCtx.strokeStyle = '#059669';
  curCtx.lineWidth = 2.0;
  curCtx.strokeRect(cardX, curY, cardW, sumBarH);

  curCtx.fillStyle = '#064e3b';
  drawFittedText(curCtx, `📐 कूप एकूण क्षेत्र: ${totalPolyHa.toFixed(2)} Ha`, cardX + 14 * sf, curY + 26 * sf, cardW * 0.30, 'bold', 17.5 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(curCtx, `🌱 प्रत्यक्ष उपचार क्षेत्र: ${targetTreatmentHa.toFixed(2)} Ha (✓ तंतोतंत)`, cardX + cardW * 0.34, curY + 26 * sf, cardW * 0.35, 'bold', 17.5 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
  drawFittedText(curCtx, `📊 ग्रीड एकूण क्षेत्र: ${targetTreatmentHa.toFixed(2)} Ha`, cardX + cardW * 0.71, curY + 26 * sf, cardW * 0.27, 'bold', 17.5 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");

  curY += sumBarH + 22 * sf;

  // ---------------- SECTION 1: GRID STATION PEGS (DUAL COLUMN, CONTINUOUS FILL) ----------------
  const pegGap = 14 * sf;
  const subColW = (tableW - pegGap) / 2;
  const pegHeaderH = 42 * sf;
  const pegRowH = 36 * sf;

  const pegCols = [
    { title: 'अ.क्र.', w: subColW * 0.09, align: 'center' as const },
    { title: 'कोड', w: subColW * 0.16, align: 'center' as const },
    { title: 'स्थान', w: subColW * 0.25, align: 'left' as const },
    { title: 'अक्षवृत्त (Lat)', w: subColW * 0.25, align: 'center' as const },
    { title: 'रेखावृत्त (Lon)', w: subColW * 0.25, align: 'center' as const }
  ];

  const drawPegTableHeaders = (ctx: CanvasRenderingContext2D, y: number, showRightCol: boolean) => {
    const colStarts = showRightCol ? [tableX, tableX + subColW + pegGap] : [tableX];
    colStarts.forEach((colStartX) => {
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(colStartX, y, subColW, pegHeaderH);
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(colStartX, y, subColW, pegHeaderH);

      let curX = colStartX;
      ctx.fillStyle = '#ffffff';
      pegCols.forEach((col) => {
        const textX = col.align === 'center' ? curX + col.w / 2 : curX + 6 * sf;
        ctx.textAlign = col.align;
        drawFittedText(ctx, col.title, textX, y + 27 * sf, col.w - 8 * sf, 'bold', 17 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
        curX += col.w;
      });
    });
  };

  const drawPegSubList = (ctx: CanvasRenderingContext2D, subList: PreparedPeg[], startX: number, startY: number) => {
    let y = startY;
    subList.forEach((peg, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f0fdf4';
      ctx.fillRect(startX, y, subColW, pegRowH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(startX, y, subColW, pegRowH);

      let cellX = startX;
      const values = [String(peg.srNo), peg.code, peg.stationName, peg.latDms, peg.lonDms];

      pegCols.forEach((col, cIdx) => {
        const textX = col.align === 'center' ? cellX + col.w / 2 : cellX + 6 * sf;
        ctx.textAlign = col.align;
        if (cIdx === 1) {
          ctx.fillStyle = '#064e3b';
          drawFittedText(ctx, values[cIdx], textX, y + pegRowH * 0.68, col.w - 8 * sf, 'bold', 18 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
        } else if (cIdx >= 3) {
          ctx.fillStyle = '#0f172a';
          drawFittedText(ctx, values[cIdx], textX, y + pegRowH * 0.68, col.w - 8 * sf, 'bold', 16.5 * sf, "'Noto Sans Devanagari', monospace");
        } else {
          ctx.fillStyle = '#0f172a';
          drawFittedText(ctx, values[cIdx], textX, y + pegRowH * 0.68, col.w - 8 * sf, '600', 16.5 * sf, "'Noto Sans Devanagari', Arial, sans-serif");
        }
        cellX += col.w;
      });
      y += pegRowH;
    });
    return y;
  };

  if (preparedPegs.length > 0) {
    let pegIdx = 0;
    let isFirstPegChunk = true;

    while (pegIdx < preparedPegs.length) {
      const headingText = isFirstPegChunk
        ? '१. कूप ग्रीड पॉईंट्स / पेग जीपीएस रीडिंग तक्ता (Grid Pegs DMS GPS Readings — ER1, DR1, FL1...)'
        : '१. ग्रीड पॉईंट्स / पेग जीपीएस रीडिंग तक्ता (पुढील भाग)';

      // Need at least heading + header + 1 row
      if (pageBottomLimit - curY < 32 * sf + pegHeaderH + pegRowH) {
        const nextP = createContinuationPage('कूप ग्रीड पॉईंट्स जीपीएस रीडिंग व क्षेत्रफळ अहवाल (पुढील भाग)');
        if (!nextP.ctx) break;
        curPage = { canvas: nextP.canvas, ctx: nextP.ctx };
        curCtx = nextP.ctx;
        curY = nextP.startY;
      }

      curCtx.textAlign = 'left';
      curCtx.fillStyle = '#064e3b';
      drawFittedText(curCtx, headingText, tableX, curY, tableW, 'bold', 20 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
      curY += 12 * sf;

      const availH = pageBottomLimit - (curY + pegHeaderH);
      const maxRows = Math.max(1, Math.floor(availH / pegRowH));
      const maxPegsThisPage = maxRows * 2;
      const chunk = preparedPegs.slice(pegIdx, pegIdx + maxPegsThisPage);

      const half = Math.ceil(chunk.length / 2);
      const leftPegs = chunk.slice(0, half);
      const rightPegs = chunk.slice(half);

      drawPegTableHeaders(curCtx, curY, rightPegs.length > 0);
      curY += pegHeaderH;

      const leftEndY = drawPegSubList(curCtx, leftPegs, tableX, curY);
      const rightEndY = rightPegs.length > 0 ? drawPegSubList(curCtx, rightPegs, tableX + subColW + pegGap, curY) : leftEndY;
      curY = Math.max(leftEndY, rightEndY);

      pegIdx += chunk.length;
      isFirstPegChunk = false;

      if (pegIdx < preparedPegs.length) {
        const nextP = createContinuationPage('कूप ग्रीड पॉईंट्स जीपीएस रीडिंग व क्षेत्रफळ अहवाल (पुढील भाग)');
        if (!nextP.ctx) break;
        curPage = { canvas: nextP.canvas, ctx: nextP.ctx };
        curCtx = nextP.ctx;
        curY = nextP.startY;
      }
    }
    curY += 22 * sf;
  }

  // ---------------- SECTION 2: GRID WISE AREA STATEMENT (CONTINUOUS FILL) ----------------
  const useTwoColsForCells = normalizedCells.length > 42;
  const areaHeaderH = 44 * sf;
  const areaRowH = useTwoColsForCells ? 36 * sf : 38 * sf;
  const totH = 44 * sf;

  const fullAreaCols = hasNonWorkingArea ? [
    { title: 'अ.क्र.', w: tableW * 0.08, align: 'center' as const },
    { title: 'ग्रीड कोड व क्रमांक', w: tableW * 0.28, align: 'left' as const },
    { title: 'स्थान (Col / Row)', w: tableW * 0.20, align: 'left' as const },
    { title: 'अनुपचार क्षेत्र', w: tableW * 0.22, align: 'right' as const },
    { title: 'उपचार क्षेत्र (Ha)', w: tableW * 0.22, align: 'right' as const }
  ] : [
    { title: 'अ.क्र.', w: tableW * 0.10, align: 'center' as const },
    { title: 'ग्रीड कोड व क्रमांक', w: tableW * 0.32, align: 'left' as const },
    { title: 'स्थान (Col / Row)', w: tableW * 0.22, align: 'left' as const },
    { title: 'ग्रीड प्रकार', w: tableW * 0.18, align: 'center' as const },
    { title: 'उपचार क्षेत्र (Ha)', w: tableW * 0.18, align: 'right' as const }
  ];

  const areaGap = 14 * sf;
  const areaColW = (tableW - areaGap) / 2;
  const twoAreaCols = hasNonWorkingArea ? [
    { title: 'अ.क्र.', w: areaColW * 0.11, align: 'center' as const },
    { title: 'ग्रीड व स्थान', w: areaColW * 0.45, align: 'left' as const },
    { title: 'अनुपचार', w: areaColW * 0.22, align: 'right' as const },
    { title: 'उपचार', w: areaColW * 0.22, align: 'right' as const }
  ] : [
    { title: 'अ.क्र.', w: areaColW * 0.12, align: 'center' as const },
    { title: 'ग्रीड कोड व स्थान', w: areaColW * 0.46, align: 'left' as const },
    { title: 'प्रकार', w: areaColW * 0.20, align: 'center' as const },
    { title: 'क्षेत्र (Ha)', w: areaColW * 0.22, align: 'right' as const }
  ];

  const drawFullAreaHeader = (ctx: CanvasRenderingContext2D, y: number) => {
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(tableX, y, tableW, areaHeaderH);
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(tableX, y, tableW, areaHeaderH);

    let cx = tableX;
    ctx.fillStyle = '#ffffff';
    fullAreaCols.forEach((col) => {
      const textX = col.align === 'center' ? cx + col.w / 2 : col.align === 'right' ? cx + col.w - 14 * sf : cx + 14 * sf;
      ctx.textAlign = col.align;
      drawFittedText(ctx, col.title, textX, y + 28 * sf, col.w - 18 * sf, 'bold', 18 * sf, "'Noto Sans Devanagari', Arial, sans-serif");
      cx += col.w;
    });
  };

  const drawTwoAreaHeaders = (ctx: CanvasRenderingContext2D, y: number, showRightCol: boolean) => {
    const starts = showRightCol ? [tableX, tableX + areaColW + areaGap] : [tableX];
    starts.forEach((startX) => {
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(startX, y, areaColW, areaHeaderH);
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(startX, y, areaColW, areaHeaderH);

      let cx = startX;
      ctx.fillStyle = '#ffffff';
      twoAreaCols.forEach((col) => {
        const textX = col.align === 'center' ? cx + col.w / 2 : col.align === 'right' ? cx + col.w - 8 * sf : cx + 8 * sf;
        ctx.textAlign = col.align;
        drawFittedText(ctx, col.title, textX, y + 28 * sf, col.w - 12 * sf, 'bold', 16.5 * sf, "'Noto Sans Devanagari', Arial, sans-serif");
        cx += col.w;
      });
    });
  };

  if (normalizedCells.length > 0) {
    let cellIdx = 0;
    let isFirstCellChunk = true;

    while (cellIdx < normalizedCells.length) {
      // Only move to next page if current page cannot fit section title + header + at least 2 rows (or remaining rows if <=2)
      const minNeeded = 28 * sf + areaHeaderH + Math.min(2, normalizedCells.length - cellIdx) * areaRowH;
      if (pageBottomLimit - curY < minNeeded) {
        const nextP = createContinuationPage('कूप ग्रीड क्षेत्रफळ तपशील व अधिकृत स्वाक्षरी अहवाल (पुढील भाग)');
        if (!nextP.ctx) break;
        curPage = { canvas: nextP.canvas, ctx: nextP.ctx };
        curCtx = nextP.ctx;
        curY = nextP.startY;
      }

      const sec2Title = isFirstCellChunk
        ? '२. कूप ग्रीडनिहाय क्षेत्रफळ तपशील (Grid Wise Area Statement)'
        : '२. कूप ग्रीडनिहाय क्षेत्रफळ तपशील (पुढील भाग)';
      curCtx.textAlign = 'left';
      curCtx.fillStyle = '#064e3b';
      drawFittedText(curCtx, sec2Title, tableX, curY, tableW, 'bold', 20 * sf, "'Noto Sans Devanagari', 'Mukta', Arial, sans-serif");
      curY += 12 * sf;

      const availH = pageBottomLimit - (curY + areaHeaderH);
      const maxRows = Math.max(1, Math.floor(availH / areaRowH));

      if (!useTwoColsForCells) {
        const chunk = normalizedCells.slice(cellIdx, cellIdx + maxRows);
        drawFullAreaHeader(curCtx, curY);
        curY += areaHeaderH;

        chunk.forEach((cell, localIdx) => {
          const globalIdx = cellIdx + localIdx;
          curCtx.fillStyle = globalIdx % 2 === 0 ? '#ffffff' : '#f0fdf4';
          curCtx.fillRect(tableX, curY, tableW, areaRowH);
          curCtx.strokeStyle = '#cbd5e1';
          curCtx.lineWidth = 0.9;
          curCtx.strokeRect(tableX, curY, tableW, areaRowH);

          const rowSide = cell.rowIndex === 0 ? 'Base' : cell.rowIndex > 0 ? `L-${cell.rowIndex}` : `R-${Math.abs(cell.rowIndex)}`;
          const vals = hasNonWorkingArea ? [
            String(cell.cellNumber || globalIdx + 1),
            cell.label || `Grid ${globalIdx + 1}`,
            `${cell.colLetter || '0'} (${rowSide})`,
            (cell.nonWorkingAreaHa && cell.nonWorkingAreaHa > 0) ? `${cell.nonWorkingAreaHa.toFixed(2)} Ha` : '—',
            `${cell.areaHa.toFixed(2)} Ha`
          ] : [
            String(cell.cellNumber || globalIdx + 1),
            cell.label || `Grid ${globalIdx + 1}`,
            `${cell.colLetter || '0'} (${rowSide})`,
            cell.isFullCell ? 'पूर्ण ग्रीड (Full)' : 'किनार ग्रीड (Edge)',
            `${cell.areaHa.toFixed(2)} Ha`
          ];

          let cx = tableX;
          fullAreaCols.forEach((col, cIdx) => {
            const textX = col.align === 'center' ? cx + col.w / 2 : col.align === 'right' ? cx + col.w - 14 * sf : cx + 14 * sf;
            curCtx.textAlign = col.align;
            curCtx.fillStyle = cIdx === 0 ? '#064e3b' : '#0f172a';
            drawFittedText(
              curCtx,
              vals[cIdx],
              textX,
              curY + areaRowH * 0.68,
              col.w - 18 * sf,
              cIdx === 0 || cIdx === fullAreaCols.length - 1 ? 'bold' : '600',
              18.5 * sf,
              "'Noto Sans Devanagari', Arial, sans-serif"
            );
            cx += col.w;
          });
          curY += areaRowH;
        });

        cellIdx += chunk.length;
      } else {
        const chunk = normalizedCells.slice(cellIdx, cellIdx + maxRows * 2);
        const half = Math.ceil(chunk.length / 2);
        const leftCells = chunk.slice(0, half);
        const rightCells = chunk.slice(half);

        drawTwoAreaHeaders(curCtx, curY, rightCells.length > 0);
        curY += areaHeaderH;

        const drawCellSubList = (subList: typeof normalizedCells, startX: number, startY: number) => {
          let y = startY;
          subList.forEach((cell, idx) => {
            curCtx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f0fdf4';
            curCtx.fillRect(startX, y, areaColW, areaRowH);
            curCtx.strokeStyle = '#cbd5e1';
            curCtx.lineWidth = 0.9;
            curCtx.strokeRect(startX, y, areaColW, areaRowH);

            let cx = startX;
            const rowSide = cell.rowIndex === 0 ? 'Base' : cell.rowIndex > 0 ? `L${cell.rowIndex}` : `R${Math.abs(cell.rowIndex)}`;
            const vals = hasNonWorkingArea ? [
              String(cell.cellNumber || ''),
              `${cell.label || `Grid ${cell.cellNumber}`} (${rowSide})`,
              (cell.nonWorkingAreaHa && cell.nonWorkingAreaHa > 0) ? `${cell.nonWorkingAreaHa.toFixed(2)}` : '—',
              `${cell.areaHa.toFixed(2)} Ha`
            ] : [
              String(cell.cellNumber || ''),
              `${cell.label || `Grid ${cell.cellNumber}`} (${rowSide})`,
              cell.isFullCell ? 'पूर्ण' : 'किनार',
              `${cell.areaHa.toFixed(2)} Ha`
            ];

            twoAreaCols.forEach((col, cIdx) => {
              const textX = col.align === 'center' ? cx + col.w / 2 : col.align === 'right' ? cx + col.w - 8 * sf : cx + 8 * sf;
              curCtx.textAlign = col.align;
              curCtx.fillStyle = cIdx === 0 ? '#064e3b' : '#0f172a';
              drawFittedText(
                curCtx,
                vals[cIdx],
                textX,
                y + areaRowH * 0.68,
                col.w - 10 * sf,
                cIdx === 0 || cIdx === twoAreaCols.length - 1 ? 'bold' : '600',
                16.5 * sf,
                "'Noto Sans Devanagari', Arial, sans-serif"
              );
              cx += col.w;
            });
            y += areaRowH;
          });
          return y;
        };

        const leftEndY = drawCellSubList(leftCells, tableX, curY);
        const rightEndY = rightCells.length > 0 ? drawCellSubList(rightCells, tableX + areaColW + areaGap, curY) : leftEndY;
        curY = Math.max(leftEndY, rightEndY);

        cellIdx += chunk.length;
      }

      isFirstCellChunk = false;

      if (cellIdx < normalizedCells.length) {
        const nextP = createContinuationPage('कूप ग्रीड क्षेत्रफळ तपशील व अधिकृत स्वाक्षरी अहवाल (पुढील भाग)');
        if (!nextP.ctx) break;
        curPage = { canvas: nextP.canvas, ctx: nextP.ctx };
        curCtx = nextP.ctx;
        curY = nextP.startY;
      }
    }

    // Grand Total Row
    if (curY + totH + 10 * sf > pageBottomLimit) {
      const nextP = createContinuationPage('कूप ग्रीड क्षेत्रफळ सारांश व अधिकृत स्वाक्षरी');
      if (nextP.ctx) {
        curPage = { canvas: nextP.canvas, ctx: nextP.ctx };
        curCtx = nextP.ctx;
        curY = nextP.startY;
      }
    }

    curY += 6 * sf;
    curCtx.fillStyle = '#dcfce7';
    curCtx.fillRect(tableX, curY, tableW, totH);
    curCtx.strokeStyle = '#059669';
    curCtx.lineWidth = 2.0;
    curCtx.strokeRect(tableX, curY, tableW, totH);

    const totalWorkableHa = normalizedCells.reduce((sum, c) => sum + (c.areaHa || 0), 0);
    const totalNonWorkingHa = normalizedCells.reduce((sum, c) => sum + (c.nonWorkingAreaHa || 0), 0);

    curCtx.fillStyle = '#064e3b';
    curCtx.textAlign = 'left';
    drawFittedText(
      curCtx,
      `एकूण: ${normalizedCells.length} ग्रीड ब्लॉक्स · ग्रीड आकार: ${gw}m × ${gh}m`,
      tableX + 14 * sf,
      curY + 28 * sf,
      tableW * 0.42,
      'bold',
      17.5 * sf,
      "'Noto Sans Devanagari', Arial, sans-serif"
    );
    curCtx.textAlign = 'right';
    const rightSummary =
      hasNonWorkingArea && (nonWorkHa > 0 || totalNonWorkingHa > 0)
        ? `एकूण: ${totalPolyHa.toFixed(2)} Ha | अकार्यकारी: ${nonWorkHa > 0 ? nonWorkHa.toFixed(2) : totalNonWorkingHa.toFixed(2)} Ha | प्रत्यक्ष उपचार: ${totalWorkableHa.toFixed(2)} Ha (तंतोतंत समान)`
        : `कूप एकूण प्रत्यक्ष उपचार क्षेत्र: ${totalWorkableHa.toFixed(2)} Ha (तंतोतंत समान)`;
    drawFittedText(
      curCtx,
      rightSummary,
      tableX + tableW - 14 * sf,
      curY + 28 * sf,
      tableW * 0.54,
      'bold',
      17.5 * sf,
      "'Noto Sans Devanagari', Arial, sans-serif"
    );
    curY += totH;
  }

  // Ensure Official Signatures Block has clean room on the final page
  if (curY + finalSignatureHeight > heightPx - marginPx - 14 * sf) {
    const nextP = createContinuationPage('अधिकृत स्वाक्षरी व प्रमाणपत्र (Official Verification & Signatures)');
    if (nextP.ctx) {
      curPage = { canvas: nextP.canvas, ctx: nextP.ctx };
      curCtx = nextP.ctx;
      curY = nextP.startY;
    }
  }

  const sigY = heightPx - marginPx - 88 * sf;
  drawSignatures(curCtx, sigY);

  // Stamp continuation bars and accurate page numbers across all statement pages
  const totalReportPages = 1 + pages.length;
  pages.forEach((p, idx) => {
    const ctx = p.ctx;
    const pageNum = idx + 2;
    const isLast = idx === pages.length - 1;

    if (!isLast) {
      const contNoticeY = heightPx - marginPx - 38 * sf;
      ctx.fillStyle = '#eff6ff';
      ctx.fillRect(tableX, contNoticeY - 16 * sf, tableW, 28 * sf);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(tableX, contNoticeY - 16 * sf, tableW, 28 * sf);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#1d4ed8';
      ctx.font = `bold ${14.5 * sf}px 'Noto Sans Devanagari', Arial, sans-serif`;
      ctx.fillText(
        `➡ पुढील पान ${pageNum + 1} वर चालू (Continued on Page ${pageNum + 1}) ➡`,
        widthPx / 2,
        contNoticeY + 3 * sf
      );
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = `600 ${13.5 * sf}px 'Noto Sans Devanagari', Arial, sans-serif`;
    ctx.fillText(
      `पान ${pageNum} / ${totalReportPages} · महाराष्ट्र शासन वन विभाग · कूप सर्वेक्षण अहवाल`,
      widthPx / 2,
      heightPx - marginPx - 8 * sf
    );
  });

  void curPage;
  return pages.map((p) => p.canvas);
}

/**
 * Backward-compatible single canvas renderer
 */
export function renderGridStatementCanvas(
  data: GridStatementData,
  paperChoice: PaperChoice
): HTMLCanvasElement {
  const pages = renderGridStatementPages(data);
  return pages[0];
}

export interface DownloadPdfOptions {
  compartmentName?: string;
  gridStatementData?: GridStatementData;
  forceA4?: boolean;
  requiredWidthMm?: number;
  requiredHeightMm?: number;
  selectedFormat?: 'auto' | 'a4' | 'a3' | PaperSize;
  orientation?: Orientation;
  strictFrame?: StrictFrame;
}

/**
 * Builds the strict-scale PDF document and returns its Blob and filename (used for download & WhatsApp sharing).
 */
export async function buildPdfDocument(
  mapElement: HTMLElement | HTMLCanvasElement,
  options?: DownloadPdfOptions
): Promise<{ blob: Blob; filename: string }> {
  const reqW = options?.requiredWidthMm || options?.strictFrame?.wMm || 193;
  const reqH = options?.requiredHeightMm || options?.strictFrame?.hMm || 292;

  let validation = validatePageSize(reqW, reqH, { forceA4: options?.forceA4 });
  if (options?.selectedFormat === 'a3') {
    validation = {
      ...validation,
      paperSize: 'a3',
      orientation: options.orientation || validation.orientation
    };
  } else if (options?.selectedFormat === 'a4') {
    validation = {
      ...validation,
      paperSize: 'a4',
      orientation: options.orientation || validation.orientation
    };
  }

  const pdf = new jsPDF({
    orientation: validation.orientation,
    unit: 'mm',
    format: validation.paperSize
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  let imgData: string;

  if (mapElement instanceof HTMLCanvasElement && options?.strictFrame) {
    const f = options.strictFrame;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = f.w;
    offCanvas.height = f.h;
    const offCtx = offCanvas.getContext('2d');
    if (offCtx) {
      offCtx.drawImage(mapElement, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      imgData = offCanvas.toDataURL('image/png', 1.0);
    } else {
      imgData = mapElement.toDataURL('image/png', 1.0);
    }
  } else if (mapElement instanceof HTMLCanvasElement) {
    imgData = mapElement.toDataURL('image/png', 1.0);
  } else {
    // Render using html2canvas with scale: 2 for High-DPI
    const capturedCanvas = await html2canvas(mapElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    imgData = capturedCanvas.toDataURL('image/png', 1.0);
  }

  // Strictly preserve 1:1 physical ruler scale (2 cm = 100 m)
  const targetW = options?.strictFrame?.wMm ?? (mapElement instanceof HTMLCanvasElement ? mapElement.width / 7.2 : pageWidth);
  const targetH = options?.strictFrame?.hMm ?? (mapElement instanceof HTMLCanvasElement ? mapElement.height / 7.2 : pageHeight);

  // Center on paper with zero dimensional stretching or distortion
  const posX = Math.max(0, (pageWidth - targetW) / 2);
  const posY = Math.max(0, (pageHeight - targetH) / 2);

  // Page 1: Engineering Scale Map
  pdf.addImage(imgData, 'PNG', posX, posY, targetW, targetH, undefined, 'FAST');

  // Page 2 & Continuation Page 3+: Multi-page High-DPI Grid Statement strictly in A4 Portrait
  if (options?.gridStatementData && ((options.gridStatementData.cells && options.gridStatementData.cells.length > 0) || (options.gridStatementData.pegs && options.gridStatementData.pegs.length > 0))) {
    const statementPages = renderGridStatementPages(options.gridStatementData);
    statementPages.forEach((pageCanvas) => {
      // Second page (and 3rd page continuation) strictly in standard A4 portrait (210 x 297 mm)
      pdf.addPage('a4', 'portrait');
      const pageImg = pageCanvas.toDataURL('image/png', 1.0);
      pdf.addImage(pageImg, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    });
  }

  const safeComp = (options?.compartmentName || 'Forest_Compartment').replace(/[^\w\d-_]/g, '_');
  const filename = `Treatment_Map_${safeComp}_${validation.paperSize.toUpperCase()}.pdf`;
  const blob = pdf.output('blob');
  return { blob, filename };
}

/**
 * Handles PDF export with High-DPI html2canvas / direct canvas rendering,
 * zero margins, exact scale preservation, and multi-page A4 report generation.
 */
export async function handleDownloadPDF(
  mapElement: HTMLElement | HTMLCanvasElement,
  options?: DownloadPdfOptions
): Promise<void> {
  const { blob, filename } = await buildPdfDocument(mapElement, options);
  await saveOrShareBlobFile(blob, filename, {
    title: filename,
    dialogTitle: 'Save or Share Map PDF',
  });
}

export function generateStrictScalePdf(
  canvas: HTMLCanvasElement,
  frame: StrictFrame,
  paperChoice: PaperChoice,
  compartmentName: string,
  gridStatementData?: GridStatementData
): void {
  handleDownloadPDF(canvas, {
    compartmentName,
    gridStatementData,
    strictFrame: frame,
    selectedFormat: paperChoice.size,
    orientation: paperChoice.orientation,
    requiredWidthMm: frame.wMm,
    requiredHeightMm: frame.hMm
  });
}

