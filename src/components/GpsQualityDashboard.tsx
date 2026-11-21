/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Satellite,
  ChevronDown,
  ChevronUp,
  Power,
  ShieldCheck,
  AlertTriangle,
  Crosshair,
  RefreshCw,
  WifiOff
} from 'lucide-react';
import { LiveGpsTelemetry } from '../types/mapTypes';
import { OfflineGnssStatus } from '../utils/offlineGnss';

interface GpsQualityDashboardProps {
  lang: string;
  telemetry?: LiveGpsTelemetry;
  isGpsActive: boolean;
  onToggleGps?: () => void;
  gpsAccuracyGateM?: number;
  onGpsAccuracyGateChange?: (gateM: number) => void;
  gnssStatus?: OfflineGnssStatus | null;
  onRetryGpsLock?: () => void;
}

export const GpsQualityDashboard: React.FC<GpsQualityDashboardProps> = ({
  lang,
  telemetry,
  isGpsActive,
  onToggleGps,
  gpsAccuracyGateM = 12,
  onGpsAccuracyGateChange,
  gnssStatus = null,
  onRetryGpsLock
}) => {
  const [expanded, setExpanded] = useState(false);
  const isMr = lang === 'mr';
  const isOfflineNow = gnssStatus?.isOffline ?? (typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const searchSec = gnssStatus?.elapsedSearchSec ?? 0;

  const hasFix = Boolean(
    isGpsActive &&
      telemetry &&
      (telemetry.ehpeM != null || telemetry.filteredAccuracyM != null || telemetry.rawAccuracyM != null)
  );

  const ehpeM = hasFix
    ? telemetry?.ehpeM ?? telemetry?.filteredAccuracyM ?? telemetry?.rawAccuracyM ?? null
    : null;
  const rawEhpeM = hasFix ? telemetry?.rawAccuracyM ?? null : null;
  const satCount = hasFix ? telemetry?.estimatedSatellites ?? 0 : 0;
  const signalBars = hasFix ? telemetry?.signalBars ?? 0 : 0;
  const signalPct = hasFix ? telemetry?.signalStrengthPct ?? 0 : 0;
  const hdopEst = hasFix ? telemetry?.hdopEst ?? null : null;
  const fixMode = hasFix ? telemetry?.fixMode ?? '2D' : 'none';
  const quality = hasFix ? telemetry?.quality ?? 'poor' : 'poor';

  const barColorClass = !hasFix
    ? 'bg-slate-600'
    : quality === 'excellent'
    ? 'bg-emerald-400'
    : quality === 'good'
    ? 'bg-teal-400'
    : quality === 'fair'
    ? 'bg-amber-400'
    : 'bg-rose-400';

  const qualityTextColor = !isGpsActive
    ? 'text-slate-300'
    : !hasFix
    ? 'text-sky-300'
    : quality === 'excellent'
    ? 'text-emerald-300'
    : quality === 'good'
    ? 'text-teal-300'
    : quality === 'fair'
    ? 'text-amber-300'
    : 'text-rose-300';

  const reliabilityLabel = !isGpsActive
    ? isMr
      ? 'GPS बंद'
      : 'Standby'
    : !hasFix
    ? isMr
      ? 'सॅटेलाइट शोधत...'
      : 'Acquiring...'
    : quality === 'excellent'
    ? isMr
      ? 'उत्कृष्ट · सर्वेक्षण योग्य'
      : 'Excellent · Survey Ready'
    : quality === 'good'
    ? isMr
      ? 'चांगले · अचूक नोंद'
      : 'Good · Reliable Fix'
    : quality === 'fair'
    ? isMr
      ? 'मध्यम · झाडी अडथळा'
      : 'Fair · Canopy Drift'
    : isMr
    ? 'कमकुवत · थांबा'
    : 'Weak · Wait for Lock';

  const shortStatus = !isGpsActive
    ? 'GPS'
    : !hasFix
    ? searchSec > 0
      ? isMr
        ? `शोध ${searchSec}s`
        : `Lock ${searchSec}s`
      : isMr
      ? 'शोध...'
      : 'Lock...'
    : ehpeM !== null
    ? `±${ehpeM.toFixed(1)}m`
    : '--';

  const barHeights = ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5'];

  return (
    <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 flex flex-col items-end">
      {/* Subtle minimal chip when GPS is idle & collapsed so the map remains uncluttered */}
      {!isGpsActive && !expanded ? (
        <button
          type="button"
          onClick={() => {
            if (onToggleGps) {
              onToggleGps();
            }
            setExpanded(true);
          }}
          className="h-8 px-2.5 rounded-lg bg-white/88 hover:bg-white backdrop-blur-md text-slate-700 border border-slate-200/90 shadow-xs flex items-center gap-1.5 text-[11px] font-semibold transition cursor-pointer"
          aria-expanded={false}
          aria-label={isMr ? 'GPS गुणवत्ता डॅशबोर्ड सुरू करा' : 'Open GPS Quality Dashboard'}
          title={
            isMr
              ? 'GPS सुरू करा व गुणवत्ता पहा (उपग्रह, EHPE, सिग्नल)'
              : 'Start Live GPS & View Quality (Satellites, EHPE, Signal)'
          }
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true" />
          <Satellite className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>GPS</span>
        </button>
      ) : (
        /* Active or Expanded Compact Header Bar — Tap to open/close full GPS Quality Dashboard */
        <div className="flex items-center bg-slate-900/92 backdrop-blur-md text-white rounded-xl border border-slate-700/80 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="min-h-[34px] px-2.5 py-1 flex items-center gap-2 hover:bg-slate-800/80 active:bg-slate-800 transition cursor-pointer"
            aria-expanded={expanded}
            aria-label={isMr ? 'GPS गुणवत्ता डॅशबोर्ड' : 'GPS Quality Dashboard'}
            title={
              isMr
                ? 'GPS गुणवत्ता डॅशबोर्ड (उपग्रह, EHPE, सिग्नल)'
                : 'GPS Quality Dashboard (Satellites, EHPE, Signal)'
            }
          >
            {/* 5-Bar Live Signal Strength Indicator */}
            <div className="flex items-end gap-[2px] h-3.5 shrink-0" aria-hidden="true">
              {barHeights.map((hClass, idx) => (
                <span
                  key={idx}
                  className={`w-[3px] rounded-[1px] transition-colors ${hClass} ${
                    idx < signalBars ? barColorClass : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {/* EHPE Readout */}
            <span className={`font-mono text-[11px] font-bold tabular-nums whitespace-nowrap ${qualityTextColor}`}>
              {shortStatus}
            </span>

            <span aria-hidden="true" className="text-slate-600 text-[10px]">
              ·
            </span>

            {/* Satellite Count Readout */}
            <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-200 tabular-nums whitespace-nowrap">
              <Satellite className={`w-3.5 h-3.5 shrink-0 ${hasFix ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{satCount}</span>
            </span>

            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>
        </div>
      )}

      {/* Expanded Real-Time GPS Quality Dashboard Popover */}
      {expanded && (
        <div className="mt-1.5 w-[256px] max-w-[86vw] bg-slate-900/95 backdrop-blur-md text-white rounded-2xl border border-slate-700/90 shadow-2xl p-3 space-y-2.5 animate-fadeIn">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="min-w-0">
              <div className="text-[11.5px] font-bold text-white leading-tight truncate">
                {isMr ? 'GPS गुणवत्ता डॅशबोर्ड' : 'GPS Quality Dashboard'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className={`font-semibold ${qualityTextColor}`}>{reliabilityLabel}</span>
                {isOfflineNow && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/30 text-[9px] font-bold">
                    <WifiOff className="w-2.5 h-2.5" />
                    <span>{isMr ? 'ऑफलाईन GNSS' : 'Offline GNSS'}</span>
                  </span>
                )}
              </div>
            </div>

            {onToggleGps && (
              <button
                type="button"
                onClick={onToggleGps}
                className={`min-h-[30px] px-2.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0 ${
                  isGpsActive
                    ? 'bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Power className="w-3 h-3" />
                <span>{isGpsActive ? (isMr ? 'थांबवा' : 'Stop') : isMr ? 'सुरू' : 'Start'}</span>
              </button>
            )}
          </div>

          {/* Offline Satellite Acquisition Banner (shown while locking hardware GNSS without internet) */}
          {isGpsActive && !hasFix && (
            <div className="rounded-xl bg-sky-500/15 border border-sky-400/35 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-bold text-sky-200">
                  {isOfflineNow
                    ? isMr
                      ? `इंटरनेटशिवाय उपग्रह शोध सुरू (${searchSec}s)`
                      : `Offline Satellite Lock (${searchSec}s)`
                    : isMr
                    ? `GPS उपग्रह शोध सुरू (${searchSec}s)`
                    : `Acquiring Satellites (${searchSec}s)`}
                </span>
                {onRetryGpsLock && (
                  <button
                    type="button"
                    onClick={onRetryGpsLock}
                    className="px-1.5 py-0.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[9.5px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{isMr ? 'पुन्हा' : 'Retry'}</span>
                  </button>
                )}
              </div>
              <p className="text-[9.5px] text-slate-300 leading-snug">
                {isMr
                  ? 'इंटरनेट बंद असताना फोनचा GPS चिप थेट उपग्रहांशी जोडतो (20–45 सेकंद). फोन लोकेशन ON ठेवा आणि खुल्या आकाशाखाली थांबा.'
                  : 'Without internet, hardware GNSS locks directly to satellites (20–45s). Keep phone Location ON and hold under open sky.'}
              </p>
            </div>
          )}

          {/* 3-Column Primary Telemetry Metrics: Satellites, EHPE, Signal Strength */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* 1. Satellite Count */}
            <div className="bg-slate-800/80 border border-slate-700/70 rounded-xl p-2 text-center">
              <span className="block text-[9.5px] font-semibold text-slate-400">
                {isMr ? 'उपग्रह (अंदाजे)' : 'Satellites'}
              </span>
              <span className="mt-0.5 flex items-center justify-center gap-1 font-mono font-bold text-sm text-white tabular-nums">
                <Satellite className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{hasFix ? satCount : '--'}</span>
              </span>
              <span className="block text-[9.5px] font-mono text-slate-400 mt-0.5">
                {hasFix ? `${fixMode} Lock` : 'No Lock'}
              </span>
            </div>

            {/* 2. EHPE (Estimated Horizontal Position Error) */}
            <div className="bg-slate-800/80 border border-slate-700/70 rounded-xl p-2 text-center">
              <span className="block text-[9.5px] font-semibold text-slate-400">EHPE (95%)</span>
              <span className={`block mt-0.5 font-mono font-bold text-sm tabular-nums ${qualityTextColor}`}>
                {ehpeM !== null ? `±${ehpeM.toFixed(1)}m` : '--'}
              </span>
              <span className="block text-[9.5px] font-mono text-slate-400 mt-0.5 truncate">
                {rawEhpeM !== null ? `Raw ±${rawEhpeM.toFixed(0)}m` : 'Error Radius'}
              </span>
            </div>

            {/* 3. Signal Strength Indicator */}
            <div className="bg-slate-800/80 border border-slate-700/70 rounded-xl p-2 text-center">
              <span className="block text-[9.5px] font-semibold text-slate-400">
                {isMr ? 'सिग्नल' : 'Signal'}
              </span>
              <div className="mt-1 flex items-end justify-center gap-[3px] h-4">
                {barHeights.map((hClass, idx) => (
                  <span
                    key={idx}
                    className={`w-[4px] rounded-[1px] ${hClass} ${
                      idx < signalBars ? barColorClass : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
              <span className="block text-[9.5px] font-mono text-slate-300 mt-0.5 tabular-nums">
                {hasFix ? `${signalPct}%` : '0%'}
              </span>
            </div>
          </div>

          {/* Signal Strength Continuous Meter Bar + HDOP & Kalman Filter Stats */}
          <div className="space-y-1.5">
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${barColorClass}`}
                style={{ width: `${signalPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
              <span>
                HDOP: <strong className="text-slate-200">{hdopEst !== null ? hdopEst.toFixed(1) : '--'}</strong>
              </span>
              <span>
                {isMr ? 'अचूक:' : 'Fixes:'}{' '}
                <strong className="text-slate-200">{telemetry?.acceptedFixes ?? 0}</strong>
                {(telemetry?.rejectedFixes ?? 0) > 0 && (
                  <span className="text-amber-300"> · {telemetry?.rejectedFixes} rej</span>
                )}
              </span>
            </div>
          </div>

          {/* Live Coordinates (when locked) */}
          {hasFix && telemetry?.lat != null && telemetry?.lon != null && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10.5px] font-mono tabular-nums">
              <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-slate-200 truncate">
                {telemetry.lat.toFixed(6)}°, {telemetry.lon.toFixed(6)}°
              </span>
            </div>
          )}

          {/* Reliability Advice + Strict / Canopy Accuracy Gate */}
          <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] text-slate-300 min-w-0 truncate">
              {hasFix && (quality === 'excellent' || quality === 'good') ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className="truncate">
                {!isGpsActive
                  ? isMr
                    ? 'ऑफलाइन GNSS सज्ज'
                    : 'Offline GNSS Ready'
                  : hasFix && (quality === 'excellent' || quality === 'good')
                  ? isMr
                    ? 'सीमा नोंदीस विश्वासार्ह'
                    : 'Trusted for survey'
                  : isMr
                  ? 'खुल्या आकाशात थांबा'
                  : 'Move to clearer sky'}
              </span>
            </span>

            {onGpsAccuracyGateChange && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onGpsAccuracyGateChange(10)}
                  className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-mono font-bold cursor-pointer transition ${
                    gpsAccuracyGateM <= 12
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ≤10m
                </button>
                <button
                  type="button"
                  onClick={() => onGpsAccuracyGateChange(25)}
                  className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-mono font-bold cursor-pointer transition ${
                    gpsAccuracyGateM > 12
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ≤25m
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
