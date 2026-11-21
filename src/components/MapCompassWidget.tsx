/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  X,
  RotateCcw,
  Navigation,
  Eye,
  EyeOff,
  Target,
  Search,
  LocateFixed,
  CheckCircle2,
  ArrowUp,
  CornerUpRight,
  CornerUpLeft
} from 'lucide-react';
import { NavTarget, NavTargetCategory } from '../types/mapTypes';
import { calculateGeographicBearing } from '../utils/geoUtils';
import { triggerArrivalFeedback } from '../utils/fieldTools';

interface MapCompassWidgetProps {
  lang: string;
  rotationDeg: number;
  baseLineBearingDeg: number | null;
  gpsHeadingDeg: number | null;
  isGpsActive: boolean;
  showMapCompass: boolean;
  onToggleMapCompass?: (val: boolean) => void;
  onResetNorth?: () => void;
  targetBearing?: { bearingDeg: number; distanceM: number } | null;
  navTarget?: NavTarget | null;
  navWaypoints?: NavTarget[];
  userLocation?: { mx: number; my: number; accuracy: number } | null;
  onSelectNavTarget?: (target: NavTarget | null) => void;
  onStartGpsForNav?: () => void;
  hidden?: boolean;
}

type SensorSource = 'magnetometer' | 'gps' | 'map';

const DIRS_16_EN = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW'
];

const DIRS_8_MR = [
  'उत्तर', 'ईशान्य', 'पूर्व', 'आग्नेय',
  'दक्षिण', 'नैऋत्य', 'पश्चिम', 'वायव्य'
];

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function formatBearing(deg: number): string {
  const n = Math.round(normalizeDeg(deg)) % 360;
  return `${String(n).padStart(3, '0')}°`;
}

function toCompass16(deg: number): string {
  const idx = Math.round(normalizeDeg(deg) / 22.5) % 16;
  return DIRS_16_EN[idx];
}

function toCompass8Mr(deg: number): string {
  const idx = Math.round(normalizeDeg(deg) / 45) % 8;
  return DIRS_8_MR[idx];
}

function formatDist(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m < 10) return `${m.toFixed(1)} m`;
  return `${Math.round(m)} m`;
}

function getCategoryLabel(cat: NavTargetCategory | 'all', isMr: boolean): string {
  switch (cat) {
    case 'all':
      return isMr ? 'सर्व' : 'All';
    case 'pillar':
      return isMr ? 'सीमा खांब' : 'Pillars';
    case 'corner':
      return isMr ? 'कोपरे' : 'Corners';
    case 'baseline':
      return isMr ? 'पाया' : 'Base';
    case 'peg':
      return isMr ? 'पेग्स' : 'Pegs';
    case 'landmark':
      return isMr ? 'खुणा' : 'Marks';
    case 'custom':
      return isMr ? 'टॅप' : 'Custom';
  }
}

function getCategoryBadgeClass(cat: NavTargetCategory): string {
  switch (cat) {
    case 'pillar':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
    case 'corner':
      return 'bg-sky-500/20 text-sky-300 border-sky-400/30';
    case 'baseline':
      return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
    case 'peg':
      return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
    case 'landmark':
      return 'bg-violet-500/20 text-violet-300 border-violet-400/30';
    default:
      return 'bg-slate-600/40 text-slate-200 border-slate-500/40';
  }
}

export const MapCompassWidget: React.FC<MapCompassWidgetProps> = ({
  lang,
  rotationDeg,
  baseLineBearingDeg,
  gpsHeadingDeg,
  isGpsActive,
  showMapCompass,
  onToggleMapCompass,
  onResetNorth,
  targetBearing,
  navTarget = null,
  navWaypoints = [],
  userLocation = null,
  onSelectNavTarget,
  onStartGpsForNav,
  hidden = false
}) => {
  const isMr = lang === 'mr';
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<NavTargetCategory | 'all'>('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [sensorEnabled, setSensorEnabled] = useState(true);
  const [sensorHeading, setSensorHeading] = useState<number | null>(null);
  const [sensorPermissionNeeded, setSensorPermissionNeeded] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);

  const smoothHeadingRef = useRef<number | null>(null);
  const arrivedTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sensorEnabled || typeof window === 'undefined') {
      setSensorHeading(null);
      smoothHeadingRef.current = null;
      return;
    }

    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (DOE && typeof DOE.requestPermission === 'function') {
      setSensorPermissionNeeded(true);
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let rawHeading: number | null = null;

      if (typeof ev.webkitCompassHeading === 'number' && Number.isFinite(ev.webkitCompassHeading)) {
        rawHeading = normalizeDeg(ev.webkitCompassHeading);
      } else if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        const screenAngle =
          typeof window.screen?.orientation?.angle === 'number'
            ? window.screen.orientation.angle
            : 0;
        rawHeading = normalizeDeg(360 - e.alpha + screenAngle);
      }

      if (rawHeading === null) return;

      setSensorPermissionNeeded(false);
      setSensorError(null);

      // Circular shortest-arc EMA smoothing to eliminate 359° <-> 0° jitter
      if (smoothHeadingRef.current === null) {
        smoothHeadingRef.current = rawHeading;
      } else {
        const prev = smoothHeadingRef.current;
        let delta = rawHeading - prev;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        smoothHeadingRef.current = normalizeDeg(prev + delta * 0.25);
      }

      setSensorHeading(Math.round(smoothHeadingRef.current));
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [sensorEnabled]);

  // Compute live Go-To Navigation vector (true unrotated local meters)
  const goToMetrics = useMemo(() => {
    if (!navTarget || !userLocation) return null;
    const dx = navTarget.mx - userLocation.mx;
    const dy = navTarget.my - userLocation.my;
    const distanceM = Math.hypot(dx, dy);
    const bearingDeg =
      distanceM >= 0.3
        ? calculateGeographicBearing(
            { x: userLocation.mx, y: userLocation.my },
            { x: navTarget.mx, y: navTarget.my }
          )
        : 0;
    const backBearingDeg = normalizeDeg(bearingDeg + 180);
    const isArrived = distanceM <= 6;
    return { distanceM, bearingDeg, backBearingDeg, isArrived };
  }, [navTarget, userLocation]);

  // Trigger haptic + chime once per target when user arrives within 6m
  useEffect(() => {
    if (!navTarget) {
      arrivedTargetIdRef.current = null;
      return;
    }
    if (goToMetrics?.isArrived && arrivedTargetIdRef.current !== navTarget.id) {
      arrivedTargetIdRef.current = navTarget.id;
      triggerArrivalFeedback();
    } else if (goToMetrics && goToMetrics.distanceM > 12 && arrivedTargetIdRef.current === navTarget.id) {
      // Allow re-trigger if user walks away and returns
      arrivedTargetIdRef.current = null;
    }
  }, [navTarget, goToMetrics]);

  // Available categories & filtered waypoints for the Go-To Picker
  const availableCategories = useMemo(() => {
    const order: NavTargetCategory[] = ['pillar', 'corner', 'baseline', 'peg', 'landmark'];
    const present = order.filter((cat) => navWaypoints.some((w) => w.category === cat));
    return ['all', ...present] as Array<NavTargetCategory | 'all'>;
  }, [navWaypoints]);

  const filteredWaypoints = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = navWaypoints.filter((w) => {
      if (pickerCategory !== 'all' && w.category !== pickerCategory) return false;
      if (!q) return true;
      return (
        w.label.toLowerCase().includes(q) ||
        (w.sublabel || '').toLowerCase().includes(q)
      );
    });
    if (userLocation) {
      return [...list].sort((a, b) => {
        const da = Math.hypot(a.mx - userLocation.mx, a.my - userLocation.my);
        const db = Math.hypot(b.mx - userLocation.mx, b.my - userLocation.my);
        return da - db;
      });
    }
    return list;
  }, [navWaypoints, pickerCategory, pickerQuery, userLocation]);

  const handleRequestSensorPermission = async () => {
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res === 'granted') {
          setSensorPermissionNeeded(false);
          setSensorError(null);
          setSensorEnabled(false);
          setTimeout(() => setSensorEnabled(true), 50);
        } else {
          setSensorError(isMr ? 'कंपॉस परवानगी नाकारली' : 'Compass permission denied');
        }
      } else {
        setSensorEnabled((v) => !v);
      }
    } catch {
      setSensorError(isMr ? 'डिव्हाइस कंपॉस उपलब्ध नाही' : 'Device compass unavailable');
    }
  };

  if (hidden) return null;

  // Determine active heading source: Live Magnetometer -> Live GPS Heading -> Map North Bearing
  const hasMag = sensorEnabled && sensorHeading !== null;
  const hasGpsH = isGpsActive && typeof gpsHeadingDeg === 'number' && Number.isFinite(gpsHeadingDeg);
  const mapNorthBearing = normalizeDeg(360 - rotationDeg);

  const source: SensorSource = hasMag ? 'magnetometer' : hasGpsH ? 'gps' : 'map';
  const activeBearing = hasMag
    ? sensorHeading!
    : hasGpsH
    ? normalizeDeg(gpsHeadingDeg!)
    : baseLineBearingDeg !== null
    ? normalizeDeg(baseLineBearingDeg)
    : mapNorthBearing;

  const activeBackBearing = normalizeDeg(activeBearing + 180);
  const activeDir16 = toCompass16(activeBearing);
  const activeDirMr = toCompass8Mr(activeBearing);

  const dialRotation = source === 'map' ? -rotationDeg : -activeBearing;

  // Compute relative turn angle when both live heading and Go-To bearing are available
  let turnDeltaDeg: number | null = null;
  if (goToMetrics && !goToMetrics.isArrived && (hasMag || hasGpsH)) {
    let delta = goToMetrics.bearingDeg - activeBearing;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    turnDeltaDeg = Math.round(delta);
  }

  const gridLeftBrg = baseLineBearingDeg !== null ? normalizeDeg(baseLineBearingDeg + 270) : null;
  const gridRightBrg = baseLineBearingDeg !== null ? normalizeDeg(baseLineBearingDeg + 90) : null;
  const baseBackBrg = baseLineBearingDeg !== null ? normalizeDeg(baseLineBearingDeg + 180) : null;

  const sourceLabel =
    source === 'magnetometer'
      ? isMr
        ? 'थेट कंपॉस'
        : 'Live Compass'
      : source === 'gps'
      ? isMr
        ? 'GPS दिशा'
        : 'GPS Heading'
      : baseLineBearingDeg !== null
      ? isMr
        ? 'पाया बेअरिंग'
        : 'Base Bearing'
      : isMr
      ? 'नकाशा उत्तर'
      : 'Map North';

  const handlePickWaypoint = (wp: NavTarget) => {
    onSelectNavTarget?.(wp);
    onStartGpsForNav?.();
    setPickerOpen(false);
    setPickerQuery('');
  };

  return (
    <div className="absolute bottom-11 left-2 sm:bottom-12 sm:left-2.5 z-20 flex flex-col items-start gap-1.5">
      {/* Go-To Waypoint Picker Drawer (Clean, Compact, Categorized) */}
      {pickerOpen && (
        <div className="w-[262px] sm:w-[292px] max-h-[330px] bg-slate-900/96 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-emerald-700/60 p-2.5 flex flex-col gap-2 select-none animate-slideUp">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Target className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold tracking-tight truncate">
                {isMr ? 'गो-टू बिंदू निवडा (Go-To)' : 'Go-To Field Waypoint'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition cursor-pointer"
              aria-label="Close Picker"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder={isMr ? 'शोधा: BP-1, C2, AL1, Start...' : 'Search BP-1, C2, AL1, Start...'}
              className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-[11.5px] text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            {availableCategories.map((cat) => {
              const active = pickerCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPickerCategory(cat)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {getCategoryLabel(cat, isMr)}
                </button>
              );
            })}
          </div>

          {/* Waypoint Scroll List */}
          <div className="flex-1 min-h-0 max-h-[185px] overflow-y-auto space-y-1 pr-0.5">
            {filteredWaypoints.length === 0 ? (
              <div className="py-5 text-center text-[11px] text-slate-400">
                {isMr ? 'कोणताही बिंदू सापडला नाही.' : 'No matching waypoints found.'}
              </div>
            ) : (
              filteredWaypoints.map((wp) => {
                const isSelected = navTarget?.id === wp.id;
                const distM = userLocation
                  ? Math.hypot(wp.mx - userLocation.mx, wp.my - userLocation.my)
                  : null;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => handlePickWaypoint(wp)}
                    className={`w-full px-2.5 py-1.5 rounded-xl border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400/70 text-white'
                        : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/70 text-slate-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11.5px] font-bold truncate">{wp.label}</span>
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${getCategoryBadgeClass(
                            wp.category
                          )}`}
                        >
                          {getCategoryLabel(wp.category, isMr)}
                        </span>
                      </div>
                      {wp.sublabel && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{wp.sublabel}</div>
                      )}
                    </div>
                    {distM !== null ? (
                      <span className="font-mono text-[11px] font-bold text-amber-300 tabular-nums shrink-0">
                        {formatDist(distM)}
                      </span>
                    ) : (
                      <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {expanded ? (
        <div className="w-[254px] sm:w-[274px] bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-slate-700/90 p-3 space-y-2.5 select-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Compass className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-bold tracking-tight truncate">
                {isMr ? 'कंपॉस आणि गो-टू' : 'Compass & Go-To'}
              </span>
              <span
                className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                  source === 'magnetometer'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : source === 'gps'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {sourceLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition cursor-pointer"
              aria-label="Collapse Compass"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Active Go-To Navigation Guidance Panel (when target selected) */}
          {navTarget && (
            <div
              className={`rounded-xl p-2 border space-y-1.5 ${
                goToMetrics?.isArrived
                  ? 'bg-emerald-600/25 border-emerald-400/70'
                  : 'bg-amber-500/15 border-amber-400/50'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {goToMetrics?.isArrived ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                  ) : (
                    <Target className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  )}
                  <span className="text-xs font-extrabold text-white truncate">
                    {navTarget.label}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {navWaypoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen((v) => !v)}
                      className="px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-[9.5px] font-semibold text-amber-200 cursor-pointer"
                    >
                      {isMr ? 'बदला' : 'Change'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectNavTarget?.(null)}
                    className="p-0.5 rounded bg-slate-800/80 hover:bg-rose-600/80 text-slate-300 hover:text-white cursor-pointer"
                    title={isMr ? 'गो-टू थांबवा' : 'Stop Go-To'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {goToMetrics ? (
                goToMetrics.isArrived ? (
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-200">
                    <span>{isMr ? 'लक्ष्यावर पोहोचलात!' : 'Arrived at Target!'}</span>
                    <span className="font-mono tabular-nums">{formatDist(goToMetrics.distanceM)}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-base font-extrabold text-amber-300 tabular-nums">
                        {formatDist(goToMetrics.distanceM)}
                      </span>
                      <span className="font-mono text-xs font-bold text-white tabular-nums">
                        {formatBearing(goToMetrics.bearingDeg)} {toCompass16(goToMetrics.bearingDeg)}
                      </span>
                    </div>

                    {/* Live Turn Guidance Pill */}
                    {turnDeltaDeg !== null && (
                      <div className="flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-slate-900/75 text-[11px] font-bold">
                        {Math.abs(turnDeltaDeg) <= 12 ? (
                          <>
                            <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">
                              {isMr ? 'सरळ पुढे चला' : 'Straight Ahead'}
                            </span>
                          </>
                        ) : turnDeltaDeg > 0 ? (
                          <>
                            <CornerUpRight className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-amber-200">
                              {isMr ? `उजवीकडे वळा ${Math.abs(turnDeltaDeg)}°` : `Turn Right ${Math.abs(turnDeltaDeg)}°`}
                            </span>
                          </>
                        ) : (
                          <>
                            <CornerUpLeft className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-amber-200">
                              {isMr ? `डावीकडे वळा ${Math.abs(turnDeltaDeg)}°` : `Turn Left ${Math.abs(turnDeltaDeg)}°`}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[10.5px] text-amber-200">
                    {isGpsActive
                      ? isMr
                        ? 'GPS लोकेशन मिळत आहे...'
                        : 'Acquiring GPS lock...'
                      : isMr
                      ? 'अंतरासाठी GPS सुरू करा'
                      : 'Start GPS for distance'}
                  </span>
                  {!isGpsActive && onStartGpsForNav && (
                    <button
                      type="button"
                      onClick={onStartGpsForNav}
                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <LocateFixed className="w-3 h-3" />
                      <span>{isMr ? 'GPS सुरू' : 'Start GPS'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 360° Precision Survey Compass Rose SVG */}
          <div className="flex items-center justify-center relative py-0.5">
            <svg viewBox="0 0 160 160" className="w-[144px] h-[144px] overflow-visible">
              {/* Fixed Outer Rim & Top Lubber Triangle */}
              <circle cx="80" cy="80" r="74" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
              <circle cx="80" cy="80" r="56" fill="none" stroke="#1e293b" strokeWidth="1" />
              {/* Top Red Lubber Sightline */}
              <polygon points="80,2 75.5,10 84.5,10" fill="#f43f5e" />

              {/* Rotating 360° Bezel & Compass Rose */}
              <g transform={`rotate(${dialRotation} 80 80)`}>
                {/* 10° Minor & 30° Major Ticks */}
                {Array.from({ length: 36 }).map((_, i) => {
                  const deg = i * 10;
                  const isCardinal = deg % 90 === 0;
                  const isMajor = deg % 30 === 0;
                  const rOuter = 71;
                  const rInner = isCardinal ? 62 : isMajor ? 64.5 : 67.5;
                  return (
                    <line
                      key={deg}
                      x1={80}
                      y1={80 - rOuter}
                      x2={80}
                      y2={80 - rInner}
                      stroke={deg === 0 ? '#f43f5e' : isCardinal ? '#f8fafc' : isMajor ? '#94a3b8' : '#475569'}
                      strokeWidth={isCardinal ? 1.8 : isMajor ? 1.2 : 0.8}
                      transform={`rotate(${deg} 80 80)`}
                    />
                  );
                })}

                {/* Degree Numbers every 30° */}
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
                  const rad = ((deg - 90) * Math.PI) / 180;
                  const rTxt = 52;
                  const tx = 80 + Math.cos(rad) * rTxt;
                  const ty = 80 + Math.sin(rad) * rTxt;
                  const isCard = deg % 90 === 0;
                  return (
                    <text
                      key={`lbl-${deg}`}
                      x={tx}
                      y={ty}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={isCard ? '7.5' : '6.5'}
                      fontWeight={isCard ? '700' : '500'}
                      fill={deg === 0 ? '#fda4af' : isCard ? '#e2e8f0' : '#94a3b8'}
                      transform={`rotate(${-dialRotation} ${tx} ${ty})`}
                    >
                      {deg}°
                    </text>
                  );
                })}

                {/* Cardinal Letters (N, E, S, W) */}
                {[
                  { label: 'N', deg: 0, color: '#fb7185' },
                  { label: 'E', deg: 90, color: '#f8fafc' },
                  { label: 'S', deg: 180, color: '#cbd5e1' },
                  { label: 'W', deg: 270, color: '#f8fafc' }
                ].map((c) => {
                  const rad = ((c.deg - 90) * Math.PI) / 180;
                  const tx = 80 + Math.cos(rad) * 37;
                  const ty = 80 + Math.sin(rad) * 37;
                  return (
                    <text
                      key={c.label}
                      x={tx}
                      y={ty}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10.5"
                      fontWeight="800"
                      fill={c.color}
                      transform={`rotate(${-dialRotation} ${tx} ${ty})`}
                    >
                      {c.label}
                    </text>
                  );
                })}

                {/* Base Line Azimuth Vector Line (if active on map) */}
                {baseLineBearingDeg !== null && (
                  <g transform={`rotate(${baseLineBearingDeg} 80 80)`}>
                    <line
                      x1="80"
                      y1="22"
                      x2="80"
                      y2="138"
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="3 2.5"
                      opacity="0.72"
                    />
                    <polygon points="80,19 76.5,26 83.5,26" fill="#f43f5e" />
                  </g>
                )}

                {/* Active Go-To Target Pointer Arrow (Glowing Amber / Green on Arrival) */}
                {goToMetrics && (
                  <g transform={`rotate(${goToMetrics.bearingDeg} 80 80)`}>
                    <line
                      x1="80"
                      y1="14"
                      x2="80"
                      y2="80"
                      stroke={goToMetrics.isArrived ? '#34d399' : '#fbbf24'}
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <polygon
                      points="80,8 73.5,21 80,17.5 86.5,21"
                      fill={goToMetrics.isArrived ? '#10b981' : '#f59e0b'}
                      stroke="#ffffff"
                      strokeWidth="0.9"
                    />
                  </g>
                )}

                {/* Intercardinal Slender Rays */}
                {[45, 135, 225, 315].map((deg) => (
                  <polygon
                    key={`ray-${deg}`}
                    points="80,58 82.2,80 80,82 77.8,80"
                    fill="#475569"
                    transform={`rotate(${deg} 80 80)`}
                  />
                ))}

                {/* Main North-South Survey Compass Needle */}
                <polygon points="80,46 84.5,80 80,76" fill="#e11d48" />
                <polygon points="80,46 75.5,80 80,76" fill="#fb7185" />
                <polygon points="80,114 84.5,80 80,84" fill="#94a3b8" />
                <polygon points="80,114 75.5,80 80,84" fill="#e2e8f0" />
                <circle cx="80" cy="80" r="3.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
              </g>
            </svg>
          </div>

          {/* Primary Forward / Back Bearing Readout */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl p-2 text-center">
            <div>
              <div className="text-[9.5px] uppercase tracking-wide text-slate-400">
                {isMr ? 'पुढील बेअरिंग (FB)' : 'Forward Bearing'}
              </div>
              <div className="font-mono font-bold text-sm text-rose-300 tabular-nums">
                {formatBearing(activeBearing)} {activeDir16}
              </div>
              {isMr && <div className="text-[10px] text-slate-300">{activeDirMr}</div>}
            </div>
            <div className="border-l border-slate-700/80 pl-1.5">
              <div className="text-[9.5px] uppercase tracking-wide text-slate-400">
                {isMr ? 'मागील बेअरिंग (BB)' : 'Back Bearing'}
              </div>
              <div className="font-mono font-bold text-sm text-slate-100 tabular-nums">
                {formatBearing(activeBackBearing)} {toCompass16(activeBackBearing)}
              </div>
              {isMr && <div className="text-[10px] text-slate-400">{toCompass8Mr(activeBackBearing)}</div>}
            </div>
          </div>

          {/* Map Geometry Bearings (North, Base Line, Grid, Target) */}
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg bg-slate-800/55">
              <span className="text-slate-400">{isMr ? 'नकाशा उत्तर' : 'Map North'}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-white tabular-nums">
                  {formatBearing(mapNorthBearing)} {toCompass16(mapNorthBearing)}
                </span>
                {rotationDeg !== 0 && onResetNorth && (
                  <button
                    type="button"
                    onClick={onResetNorth}
                    className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[9.5px] font-semibold flex items-center gap-0.5 cursor-pointer"
                    title={isMr ? 'उत्तर 0° वर सेट करा' : 'Reset Map North to 0°'}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>0°N</span>
                  </button>
                )}
              </div>
            </div>

            {baseLineBearingDeg !== null && baseBackBrg !== null && (
              <div className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg bg-slate-800/55">
                <span className="text-rose-300 font-medium">{isMr ? 'पाया रेषा' : 'Base Line'}</span>
                <span className="font-mono font-semibold text-rose-200 tabular-nums">
                  {formatBearing(baseLineBearingDeg)} {toCompass16(baseLineBearingDeg)} ↔{' '}
                  {formatBearing(baseBackBrg)} {toCompass16(baseBackBrg)}
                </span>
              </div>
            )}

            {gridLeftBrg !== null && gridRightBrg !== null && (
              <div className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg bg-slate-800/55">
                <span className="text-emerald-300 font-medium">{isMr ? 'ग्रीड रेषा' : 'Grid Lines'}</span>
                <span className="font-mono font-semibold text-emerald-200 tabular-nums">
                  {formatBearing(gridLeftBrg)} {toCompass16(gridLeftBrg)} /{' '}
                  {formatBearing(gridRightBrg)} {toCompass16(gridRightBrg)}
                </span>
              </div>
            )}

            {targetBearing && !navTarget && (
              <div className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30">
                <span className="text-amber-300 font-medium flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  <span>{isMr ? 'टॅप बिंदू' : 'To Tap'}</span>
                </span>
                <span className="font-mono font-semibold text-amber-200 tabular-nums">
                  {formatBearing(targetBearing.bearingDeg)} {toCompass16(targetBearing.bearingDeg)} ·{' '}
                  {Math.round(targetBearing.distanceM)}m
                </span>
              </div>
            )}
          </div>

          {/* Actions: Go-To Picker + Device Compass + Sheet Compass Toggle */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {navWaypoints.length > 0 && onSelectNavTarget && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Target className="w-3.5 h-3.5" />
                <span>
                  {navTarget
                    ? isMr
                      ? 'इतर खांब / पेग निवडा'
                      : 'Switch Pillar / Peg Target'
                    : isMr
                    ? 'खांब / कोपरा / पेग वर जा (Go-To)'
                    : 'Go-To Pillar / Corner / Peg'}
                </span>
              </button>
            )}

            {(sensorPermissionNeeded || !hasMag) && (
              <button
                type="button"
                onClick={handleRequestSensorPermission}
                className="flex-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-[10.5px] font-semibold text-slate-200 flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <Compass className="w-3 h-3 text-rose-400" />
                <span>
                  {sensorPermissionNeeded
                    ? isMr
                      ? 'कंपॉस सुरू करा'
                      : 'Enable Sensor'
                    : sensorEnabled
                    ? isMr
                      ? 'सेन्सर सक्रिय'
                      : 'Sensor Ready'
                    : isMr
                    ? 'सेन्सर बंद'
                    : 'Sensor Off'}
                </span>
              </button>
            )}

            {onToggleMapCompass && (
              <button
                type="button"
                onClick={() => onToggleMapCompass(!showMapCompass)}
                className={`flex-1 px-2 py-1.5 rounded-lg border text-[10.5px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                  showMapCompass
                    ? 'bg-emerald-700/80 hover:bg-emerald-700 border-emerald-500/60 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-600/80 text-slate-300'
                }`}
                title={isMr ? 'नकाशा शीटवर कंपॉस दाखवा/लपवा' : 'Show/Hide Compass Rose on Map Sheet'}
              >
                {showMapCompass ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>{isMr ? 'नकाशा कंपॉस' : 'Sheet Rose'}</span>
              </button>
            )}
          </div>

          {sensorError && (
            <div className="text-[10px] text-amber-300 text-center leading-tight">{sensorError}</div>
          )}
        </div>
      ) : (
        /* Compact Live Compass Dial + Sleek Go-To HUD Row */
        <div className="flex items-center gap-1.5 max-w-[calc(100vw-60px)]">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title={
              isMr
                ? 'कंपॉस आणि बेअरिंग तपशील पाहण्यासाठी टॅप करा'
                : 'Tap to open full 360° Survey Compass & Bearings'
            }
            className="group flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl bg-white/94 hover:bg-white backdrop-blur-md border border-slate-200/95 shadow-sm text-slate-800 transition cursor-pointer select-none shrink-0"
          >
            {/* Mini Crisp 360° Dial */}
            <div className="relative w-9 h-9 shrink-0">
              <svg viewBox="0 0 64 64" className="w-full h-full">
                <circle cx="32" cy="32" r="30" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.8" />
                {/* Top Lubber Pip */}
                <polygon points="32,1 29.5,5.5 34.5,5.5" fill="#dc2626" />
                <g transform={`rotate(${dialRotation} 32 32)`}>
                  {/* 30° Ring Ticks */}
                  {Array.from({ length: 12 }).map((_, i) => {
                    const deg = i * 30;
                    const isCard = deg % 90 === 0;
                    return (
                      <line
                        key={deg}
                        x1="32"
                        y1="4"
                        x2="32"
                        y2={isCard ? '9.5' : '7.5'}
                        stroke={deg === 0 ? '#dc2626' : '#475569'}
                        strokeWidth={isCard ? '1.6' : '1'}
                        transform={`rotate(${deg} 32 32)`}
                      />
                    );
                  })}
                  {/* Active Go-To Target Arrow on Mini Dial */}
                  {goToMetrics && (
                    <g transform={`rotate(${goToMetrics.bearingDeg} 32 32)`}>
                      <line
                        x1="32"
                        y1="8"
                        x2="32"
                        y2="32"
                        stroke={goToMetrics.isArrived ? '#059669' : '#d97706'}
                        strokeWidth="2.6"
                        strokeLinecap="round"
                      />
                      <polygon
                        points="32,5 28,12 36,12"
                        fill={goToMetrics.isArrived ? '#059669' : '#f59e0b'}
                      />
                    </g>
                  )}
                  {/* Base Line Azimuth Indicator */}
                  {baseLineBearingDeg !== null && !goToMetrics && (
                    <line
                      x1="32"
                      y1="10"
                      x2="32"
                      y2="54"
                      stroke="#dc2626"
                      strokeWidth="1.3"
                      strokeDasharray="2.5 2"
                      opacity="0.7"
                      transform={`rotate(${baseLineBearingDeg} 32 32)`}
                    />
                  )}
                  {/* North-South Needle */}
                  <polygon points="32,11 35.5,32 32,29.5 28.5,32" fill="#dc2626" />
                  <polygon points="32,53 35.5,32 32,34.5 28.5,32" fill="#334155" />
                  <circle cx="32" cy="32" r="2.2" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
                </g>
              </svg>
            </div>

            {/* Crisp Tabular Bearing & Direction */}
            <div className="flex flex-col items-start leading-tight text-left">
              <div className="flex items-center gap-1">
                <span className="font-mono font-extrabold text-[12px] text-slate-900 tabular-nums">
                  {formatBearing(activeBearing)}
                </span>
                <span className="text-[11px] font-bold text-rose-700">{activeDir16}</span>
              </div>
              <span className="text-[9.5px] font-medium text-slate-500">
                {source === 'magnetometer'
                  ? isMr
                    ? 'थेट कंपॉस'
                    : 'Compass'
                  : source === 'gps'
                  ? isMr
                    ? 'GPS दिशा'
                    : 'GPS Brg'
                  : baseLineBearingDeg !== null
                  ? isMr
                    ? `पाया ${formatBearing(baseLineBearingDeg)}`
                    : `Base ${formatBearing(baseLineBearingDeg)}`
                  : isMr
                  ? 'उत्तर 000°'
                  : 'True North'}
              </span>
            </div>
          </button>

          {/* Compact Go-To Active HUD Chip OR Sleek "Go-To" Trigger */}
          {navTarget ? (
            <div
              className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-xl backdrop-blur-md border shadow-md select-none min-w-0 ${
                goToMetrics?.isArrived
                  ? 'bg-emerald-900/95 border-emerald-400/80 text-white'
                  : 'bg-slate-900/94 border-amber-400/75 text-white'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex items-center gap-1.5 min-w-0 cursor-pointer text-left"
              >
                {goToMetrics?.isArrived ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                ) : (
                  <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-[11px] font-extrabold truncate max-w-[92px] sm:max-w-[130px]">
                    {navTarget.label}
                  </span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-amber-300">
                    {goToMetrics
                      ? goToMetrics.isArrived
                        ? isMr
                          ? `पोहोचलात! (${formatDist(goToMetrics.distanceM)})`
                          : `ARRIVED (${formatDist(goToMetrics.distanceM)})`
                        : `${formatDist(goToMetrics.distanceM)} · ${formatBearing(
                            goToMetrics.bearingDeg
                          )} ${toCompass16(goToMetrics.bearingDeg)}`
                      : isGpsActive
                      ? isMr
                        ? 'GPS शोधत...'
                        : 'Acquiring GPS…'
                      : isMr
                      ? 'GPS सुरू करा'
                      : 'Tap for GPS'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onSelectNavTarget?.(null)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
                title={isMr ? 'गो-टू थांबवा' : 'Stop Go-To'}
                aria-label="Stop Go-To"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            navWaypoints.length > 0 &&
            onSelectNavTarget && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="h-[46px] px-2.5 rounded-xl bg-[#0b3527]/95 hover:bg-[#0f4734] text-white border border-emerald-600/60 shadow-sm flex items-center gap-1.5 text-[11px] font-bold transition cursor-pointer select-none shrink-0"
                title={
                  isMr
                    ? 'कोणत्याही खांब, कोपऱ्या किंवा ग्रीड पेगवर परत जा (Go-To Compass)'
                    : 'Navigate back to any Pillar, Corner, or Grid Peg (Go-To Compass)'
                }
              >
                <Target className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{isMr ? 'गो-टू' : 'Go-To'}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
