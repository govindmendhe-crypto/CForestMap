/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Compass,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileCheck,
  Maximize2,
  Sparkles,
  Info
} from 'lucide-react';
import { Point2D, GeoRef, FeaturePreset, Orientation } from '../types/mapTypes';
import { calcAreaHa } from '../utils/geoUtils';
import { getTranslation } from '../utils/i18n';

interface AccuracyCheckerProps {
  lang: string;
  rawWorkingPoints: Point2D[];
  geoRef: GeoRef;
  compartmentNo: string;
  division: string;
  range: string;
  round: string;
  beat: string;
  treatmentArea: string;
  totalArea: string;
  rotationDeg: number;
  baselineOption: 'horizontal' | 'vertical' | 'grid_parallel' | 'longest_axis';
  manualBaselineOffset: Point2D;
  showEdgeGps: boolean;
  vanrakshak: string;
  vanpal: string;
  rfo: string;
  orientation: Orientation;
  fitsInA4: boolean;
  onAutoFixBaseline?: () => void;
  onSetField?: (field: string, val: string) => void;
  onClose?: () => void;
}

export interface AccuracyItem {
  id: string;
  category: 'direction' | 'geometry' | 'baseline' | 'gps' | 'admin';
  title: string;
  marathiTitle: string;
  status: 'passed' | 'warning' | 'error';
  message: string;
  guidance: string;
}

export const AccuracyChecker: React.FC<AccuracyCheckerProps> = ({
  lang,
  rawWorkingPoints,
  geoRef,
  compartmentNo,
  division,
  range,
  round,
  beat,
  treatmentArea,
  totalArea,
  rotationDeg,
  showEdgeGps,
  vanrakshak,
  vanpal,
  rfo,
  fitsInA4,
  onClose
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const t = (k: string) => getTranslation(k, lang);

  // Compute calculated area from working points
  const calcHa = calcAreaHa(rawWorkingPoints);
  const declaredHa = parseFloat(treatmentArea) || 0;
  const areaDiff = Math.abs(calcHa - declaredHa);
  const areaMatch = declaredHa > 0 ? areaDiff < 0.25 || (areaDiff / declaredHa) < 0.05 : false;

  // Directions & North Checks
  const items: AccuracyItem[] = [];

  // 1. Direction & North Alignment
  const isNorthStandard = rotationDeg === 0;
  items.push({
    id: 'north_direction',
    category: 'direction',
    title: 'North Alignment & Map Orientation',
    marathiTitle: 'उत्तर दिशा व नकाशा दिशा संरेखन',
    status: isNorthStandard ? 'passed' : 'warning',
    message: isNorthStandard
      ? 'North arrow points strictly Upward (0° True North).'
      : `Map rotated to ${rotationDeg}°. Ensure North pointer matches field azimuth.`,
    guidance: isNorthStandard
      ? 'Standard forestry direction is maintained.'
      : 'If rotating to fit paper, keep the North arrow clearly visible in the legend.'
  });

  // 2. Geographic Coordinates Bounds
  const hasGeo = geoRef.hasGeo && geoRef.centerLat !== 0 && geoRef.centerLon !== 0;
  items.push({
    id: 'geo_bounds',
    category: 'direction',
    title: 'Cardinal Geographic Directions (N/S/E/W)',
    marathiTitle: 'चारही दिशांचे अक्षांश-रेखांश',
    status: hasGeo ? 'passed' : 'error',
    message: hasGeo
      ? `Lat: ${geoRef.southLat.toFixed(4)}° to ${geoRef.northLat.toFixed(4)}° N · Lon: ${geoRef.westLon.toFixed(4)}° to ${geoRef.eastLon.toFixed(4)}° E`
      : 'Geographic spatial reference missing. Import KML/KMZ or GPX to locate coupe.',
    guidance: hasGeo
      ? 'All 4 cardinal bounds are within valid terrestrial coordinates.'
      : 'Upload a GPS KML/KMZ file with coordinates.'
  });

  // 3. Polygon Loop & Closure
  const hasPolygon = rawWorkingPoints.length >= 3;
  items.push({
    id: 'polygon_closure',
    category: 'geometry',
    title: 'Coupe Boundary Loop Closure',
    marathiTitle: 'कूप हद्द बहुभुज बंदिस्तता',
    status: hasPolygon ? 'passed' : 'error',
    message: hasPolygon
      ? `Closed boundary loop verified (${rawWorkingPoints.length} survey vertices).`
      : 'No valid closed polygon boundary detected.',
    guidance: hasPolygon
      ? 'Coupe perimeter forms a complete closed topological polygon.'
      : 'Upload a Garmin track or KML polygon.'
  });

  // 4. Area Discrepancy Reconciliation
  items.push({
    id: 'area_accuracy',
    category: 'geometry',
    title: 'Coupe Area Accuracy (Calculated vs Declared)',
    marathiTitle: 'क्षेत्रफळ अचूकता (मोजलेले वि. घोषित)',
    status: hasPolygon && (declaredHa === 0 || areaMatch) ? 'passed' : 'warning',
    message: hasPolygon
      ? `Calculated: ${calcHa.toFixed(2)} Ha. · Declared: ${declaredHa.toFixed(2)} Ha.`
      : 'Cannot calculate area without boundary points.',
    guidance: areaMatch
      ? 'Calculated polygon area matches declared coupe treatment area within 5%.'
      : 'Calculated area differs from declared area. Verify compartment survey records.'
  });

  // 5. Edge GPS Readings
  items.push({
    id: 'edge_gps_check',
    category: 'gps',
    title: 'Edge GPS Location Visibility',
    marathiTitle: 'हद्दीवरील GPS स्थान वाचन',
    status: showEdgeGps ? 'passed' : 'warning',
    message: showEdgeGps
      ? '4 cardinal edge GPS coordinates enabled on outer perimeter.'
      : 'Edge GPS readings are currently toggled OFF.',
    guidance: showEdgeGps
      ? 'Forest survey guidelines require edge coordinates to establish ground boundaries.'
      : 'Click "Edge GPS: ON" in the toolbar to display edge coordinates.'
  });

  // 6. Paper Scale & Fitting
  items.push({
    id: 'scale_fit',
    category: 'direction',
    title: 'Engineering Scale & Paper Fitting',
    marathiTitle: 'प्रमाण व कागद जुळवणी',
    status: fitsInA4 ? 'passed' : 'warning',
    message: fitsInA4
      ? 'Map fits standard A4 paper strictly at declared scale.'
      : 'Large compartment exceeds standard A4 printable area at strict scale.',
    guidance: fitsInA4
      ? 'Can be printed on ubiquitous A4 printers across forest offices.'
      : 'Shift to A3 in export modal or click Smart A4 Auto-Fit to preserve strict ruler scale.'
  });

  // 7. Administrative Compartment & Beat Details
  const adminComplete = compartmentNo.trim() !== '' && range.trim() !== '' && beat.trim() !== '' && division.trim() !== '';
  items.push({
    id: 'admin_details',
    category: 'admin',
    title: 'Forest Administrative Hierarchy',
    marathiTitle: 'प्रशासकीय माहिती (कक्ष, बीट, परिक्षेत्र, विभाग)',
    status: adminComplete ? 'passed' : 'warning',
    message: adminComplete
      ? `${compartmentNo} · Beat: ${beat} · Range: ${range} · Div: ${division}`
      : 'Incomplete administrative hierarchy fields.',
    guidance: adminComplete
      ? 'All administrative divisions are properly identified.'
      : 'Fill in Compartment No., Beat, Round, and Range in the sidebar.'
  });

  // 8. Mandatory Signatures
  const sigsCount = [vanrakshak.trim(), vanpal.trim(), rfo.trim()].filter(Boolean).length;
  items.push({
    id: 'signatures',
    category: 'admin',
    title: 'Verification & Endorsement Signatures',
    marathiTitle: 'वनरक्षक, वनपाल, वनपरिक्षेत्र अधिकारी स्वाक्षरी',
    status: sigsCount === 3 ? 'passed' : sigsCount > 0 ? 'warning' : 'error',
    message: `${sigsCount} of 3 official signatures entered (Vanrakshak, Vanpal, RFO).`,
    guidance: sigsCount === 3
      ? 'All required survey verification endorsements are filled.'
      : 'Forest department regulations require Forest Guard, Beat Officer, and RFO signatures before field execution.'
  });

  // Calculate Accuracy Score
  const passedCount = items.filter((i) => i.status === 'passed').length;
  const warningCount = items.filter((i) => i.status === 'warning').length;
  const totalItems = items.length;
  const accuracyScore = Math.round(((passedCount + warningCount * 0.5) / totalItems) * 100);

  const filteredItems = filter === 'issues' ? items.filter((i) => i.status !== 'passed') : items;

  return (
    <div className="absolute top-14 left-4 z-20 max-w-sm sm:max-w-md w-full bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-emerald-500/40 text-xs overflow-hidden transition-all duration-200">
      {/* Header Bar */}
      <div className="p-3 bg-gradient-to-r from-emerald-950 to-slate-900 border-b border-emerald-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-800/80 rounded-lg text-emerald-300">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
              <span>{t('accuracy_monitor')}</span>
              <span className="text-[10px] bg-emerald-700/80 text-emerald-100 px-1.5 py-0.2 rounded font-mono">
                {accuracyScore}%
              </span>
            </h3>
            <p className="text-[10px] text-emerald-300/80">{t('app_tagline')}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-800 rounded-md text-slate-300 hover:text-white transition"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition"
              title="Close"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Accuracy Status Summary Banner */}
      <div className="px-3.5 py-2 bg-slate-800/70 border-b border-slate-700/60 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          {accuracyScore >= 90 ? (
            <span className="flex items-center gap-1 text-emerald-300 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('accuracy_certified')}</span>
            </span>
          ) : accuracyScore >= 70 ? (
            <span className="flex items-center gap-1 text-amber-300 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('accuracy_good')}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-300 font-bold">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>{t('accuracy_incomplete')}</span>
            </span>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
              filter === 'all' ? 'bg-emerald-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('all_items')} ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('issues')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
              filter === 'issues' ? 'bg-amber-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('alerts_only')} ({items.filter((i) => i.status !== 'passed').length})
          </button>
        </div>
      </div>

      {/* Expanded Checklist & Intelligence Guidance */}
      {isExpanded && (
        <div className="p-3 max-h-72 overflow-y-auto space-y-2.5 custom-scrollbar">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`p-2.5 rounded-xl border text-[11px] space-y-1 transition ${
                item.status === 'passed'
                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-100'
                  : item.status === 'warning'
                  ? 'bg-amber-950/40 border-amber-800/50 text-amber-100'
                  : 'bg-rose-950/40 border-rose-800/50 text-rose-100'
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  {item.status === 'passed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                  {item.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                  {item.status === 'error' && <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                  <span className="font-bold text-white leading-tight">{item.title}</span>
                </div>
                <span className="text-[9px] text-slate-400 font-sans">{item.marathiTitle}</span>
              </div>

              <p className="text-[10px] text-slate-300 pl-5">{item.message}</p>

              <div className="pl-5 pt-0.5 text-[10px] font-sans text-emerald-300/90 flex items-start gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{item.guidance}</span>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="text-center py-4 text-emerald-300 font-medium text-xs">
              ✨ All direction, geometry, and survey criteria are 100% verified!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
