/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  FolderOpen,
  Save,
  Trash2,
  Download,
  Upload,
  MapPin,
  Clock,
  Check,
  Search,
  Navigation,
  Globe,
  FileJson,
  Archive,
  HardDrive
} from 'lucide-react';
import { SavedCoupeProject } from '../utils/fieldTools';

interface SavedCoupesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
  savedCoupes: SavedCoupeProject[];
  storageEngine?: 'indexeddb' | 'localstorage';
  currentSuggestedName: string;
  hasActiveBoundary: boolean;
  onSaveCurrent: (customName?: string) => void;
  onLoadCoupe: (project: SavedCoupeProject) => void;
  onInspectCoupe?: (project: SavedCoupeProject) => void;
  onDeleteCoupe: (id: string) => void;
  onExportKmzForCoupe?: (project: SavedCoupeProject) => Promise<void> | void;
  onExportAllFolderZip?: () => Promise<void> | void;
  onExportBackup: (project?: SavedCoupeProject) => void;
  onImportBackupFile: (file: File) => void;
}

export const SavedCoupesModal: React.FC<SavedCoupesModalProps> = ({
  isOpen,
  onClose,
  lang,
  savedCoupes,
  storageEngine = 'indexeddb',
  currentSuggestedName,
  hasActiveBoundary,
  onSaveCurrent,
  onLoadCoupe,
  onInspectCoupe,
  onDeleteCoupe,
  onExportKmzForCoupe,
  onExportAllFolderZip,
  onExportBackup,
  onImportBackupFile
}) => {
  const isMr = lang === 'mr';
  const [nameInput, setNameInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [exportingKmzId, setExportingKmzId] = useState<string | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filteredCoupes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return savedCoupes;
    return savedCoupes.filter((item) => {
      const hay = [
        item.name,
        item.village,
        item.beat,
        item.range,
        item.round,
        item.compartmentNo,
        item.landIdentifierValue,
        item.kmzFileName
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [savedCoupes, searchQuery]);

  if (!isOpen) return null;

  const formatDate = (ts: number) => {
    try {
      return new Date(ts).toLocaleDateString(isMr ? 'mr-IN' : 'en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const handleSave = () => {
    onSaveCurrent(nameInput.trim() || currentSuggestedName);
    setNameInput('');
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const handleKmzExportClick = async (item: SavedCoupeProject) => {
    if (!onExportKmzForCoupe) return;
    try {
      setExportingKmzId(item.id);
      await onExportKmzForCoupe(item);
    } finally {
      setExportingKmzId(null);
    }
  };

  const handleExportAllZipClick = async () => {
    if (!onExportAllFolderZip || savedCoupes.length === 0) return;
    try {
      setExportingZip(true);
      await onExportAllFolderZip();
    } finally {
      setExportingZip(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isMr ? 'KMZ आणि कूप फोल्डर' : 'Saved KMZ & Field Folder'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88dvh] bg-[#f4f8f5] rounded-2xl shadow-2xl border border-[#c5d9cc] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Forest Canopy Header */}
        <div className="forest-canopy-header text-white px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-800/80 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold leading-tight truncate">
                  {isMr ? 'जतन केलेले KMZ व कूप फोल्डर' : 'Saved KMZ & Field Folder'}
                </h2>
                <span className="inline-flex items-center gap-1 text-[9.5px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-emerald-800/80 border border-emerald-500/40 text-emerald-100 shrink-0">
                  <HardDrive className="w-2.5 h-2.5" />
                  <span>{storageEngine === 'indexeddb' ? 'Offline DB' : 'Local'}</span>
                </span>
              </div>
              <p className="text-[10.5px] text-emerald-200/85 truncate mt-0.5">
                {isMr
                  ? `${savedCoupes.length} नकाशे सुरक्षित · KMZ / ZIP इम्पोर्ट व संपूर्ण फोल्डर बॅकअप`
                  : `${savedCoupes.length} maps stored offline · Import KMZ/ZIP & full folder backup`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-emerald-200 hover:text-white hover:bg-emerald-900/70 transition cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save Current Map + Import KMZ / ZIP + Backup All Action Tile */}
        <div className="p-3 bg-white border-b border-[#d4e3d9] space-y-2.5 shrink-0">
          {/* Save Current Coupe Row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={
                currentSuggestedName ||
                (isMr ? 'उदा. कक्ष १०४ — देवलापार' : 'e.g. Comp 104 — Deolapar')
              }
              className="flex-1 h-9 px-3 rounded-xl bg-[#f7faf8] border border-[#c7dbce] text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              type="button"
              disabled={!hasActiveBoundary}
              onClick={handleSave}
              className="h-9 px-3.5 rounded-xl bg-[#0f5132] hover:bg-[#0c4128] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              {justSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{justSaved ? (isMr ? 'जतन झाले' : 'Saved') : isMr ? 'जतन करा' : 'Save'}</span>
            </button>
          </div>

          {/* Primary Import App KMZ / ZIP + Backup Entire Folder (.zip) + Single JSON Row */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex-1 h-9 px-2.5 rounded-xl bg-[#eaf5ee] hover:bg-[#dcf0e3] border border-[#b9dac4] text-[#0c452a] text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#0f5132] shrink-0" />
              <span className="truncate">
                {isMr ? 'KMZ / ZIP उघडा' : 'Import KMZ / ZIP'}
              </span>
            </button>

            {onExportAllFolderZip && (
              <button
                type="button"
                disabled={savedCoupes.length === 0 || exportingZip}
                onClick={handleExportAllZipClick}
                className="flex-1 h-9 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-45 border border-amber-200/90 text-amber-950 text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                title={
                  isMr
                    ? 'फोल्डरमधील सर्व नकाशे एकाच .zip फाईलमध्ये सुरक्षित करा'
                    : 'Download entire KMZ folder as a single .zip backup'
                }
              >
                <Archive className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span className="truncate">
                  {exportingZip
                    ? isMr
                      ? 'ZIP तयार होत...'
                      : 'Zipping…'
                    : isMr
                    ? `सर्व बॅकअप (.zip)`
                    : `Backup All (.zip)`}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={!hasActiveBoundary}
              onClick={() => onExportBackup()}
              className="h-9 px-2.5 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-45 border border-[#d4e3d9] text-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
              title={isMr ? 'सध्याच्या कूपचा JSON बॅकअप' : 'Current coupe JSON backup'}
            >
              <FileJson className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="hidden sm:inline">.json</span>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".kmz,.kml,.json,.zip,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml,application/json,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  onImportBackupFile(f);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* Search bar (shown whenever there are 2+ saved coupes) */}
          {savedCoupes.length >= 2 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isMr
                    ? 'कक्ष क्र., गाव, बीट किंवा रेंज शोधा...'
                    : 'Search compartment, village, beat, or range...'
                }
                className="w-full h-8 pl-8 pr-3 rounded-xl bg-[#f7faf8] border border-[#d4e3d9] text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-700"
              />
            </div>
          )}
        </div>

        {/* Saved KMZ & Coupes List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {filteredCoupes.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2 bg-white/80 rounded-2xl border border-dashed border-[#c5d9cc]">
              <div className="w-10 h-10 rounded-xl bg-[#eaf5ee] text-[#0f5132] flex items-center justify-center mx-auto">
                <FolderOpen className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-[#143023]">
                {savedCoupes.length === 0
                  ? isMr
                    ? 'अद्याप कोणतेही KMZ / कूप जतन केलेले नाही'
                    : 'No saved KMZs or coupes yet'
                  : isMr
                  ? 'शोधाशी जुळणारा नकाशा सापडला नाही'
                  : 'No matching coupes found'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                {isMr
                  ? 'KMZ एक्सपोर्ट करताच नकाशा येथे आपोआप जतन होतो. किंवा WhatsApp वरून आलेली अ‍ॅपची .kmz फाईल इम्पोर्ट करून क्षेत्रात GPS ने तपासणी करा.'
                  : 'Every KMZ you export is auto-archived here. You can also import any app-made .kmz file to inspect corners, pillars & grid pegs in the field.'}
              </p>
            </div>
          ) : (
            filteredCoupes.map((item) => {
              const isExporting = exportingKmzId === item.id;
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-white border border-[#d4e3d9] hover:border-emerald-400 shadow-[0_1px_4px_rgba(11,53,39,0.05)] space-y-2.5 transition"
                >
                  {/* Top Info Row (Click to Open Map) */}
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onLoadCoupe(item);
                        onClose();
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-extrabold text-[#10251c] group-hover:text-[#0f5132] truncate max-w-[200px] sm:max-w-[240px]">
                          {item.name}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-[#0c452a] bg-[#eaf5ee] border border-[#c2decb] px-1.5 py-0.5 rounded-md shrink-0 tabular-nums">
                          {item.treatmentAreaHa || item.totalAreaHa || '0.00'} Ha
                        </span>
                        {(item.source === 'kmz_import' || item.kmzFileName) && (
                          <span className="font-mono text-[9.5px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-md shrink-0">
                            KMZ
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-slate-500 mt-1">
                        {(item.village || item.beat || item.range) && (
                          <span className="flex items-center gap-1 truncate max-w-[200px]">
                            <MapPin className="w-3 h-3 text-emerald-700/70 shrink-0" />
                            <span className="truncate">
                              {[item.village, item.beat, item.range].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        )}
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formatDate(item.savedAt)}</span>
                        </span>
                        {item.boundaryPillars?.length > 0 && (
                          <span className="font-mono font-semibold text-emerald-700 shrink-0">
                            {item.boundaryPillars.length} BP
                          </span>
                        )}
                        {item.nonWorkingFiles?.length > 0 && !item.isNonWorkingNil && (
                          <span className="font-mono text-amber-700 shrink-0">
                            {item.nonWorkingFiles.length} NW
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteCoupe(item.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                      title={isMr ? 'काढा' : 'Delete'}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Clean Action Strip: Open · Field Inspect (GPS) · Download KMZ */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#ebf2ed]">
                    <button
                      type="button"
                      onClick={() => {
                        onLoadCoupe(item);
                        onClose();
                      }}
                      className="h-8 px-2.5 rounded-xl bg-[#f3f7f4] hover:bg-[#e5efe8] border border-[#d4e3d9] text-[#1a3a2b] text-[11px] font-bold transition cursor-pointer"
                    >
                      {isMr ? 'उघडा' : 'Open'}
                    </button>

                    {onInspectCoupe && (
                      <button
                        type="button"
                        onClick={() => {
                          onInspectCoupe(item);
                          onClose();
                        }}
                        className="flex-1 h-8 px-2.5 rounded-xl bg-[#0f5132] hover:bg-[#0b3f26] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        <span className="truncate">
                          {isMr ? 'क्षेत्र तपासणी (GPS)' : 'Field Inspect (GPS)'}
                        </span>
                      </button>
                    )}

                    {onExportKmzForCoupe && (
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => handleKmzExportClick(item)}
                        className="h-8 px-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0 disabled:opacity-60"
                        title={isMr ? 'KMZ फाईल डाऊनलोड करा' : 'Download KMZ File'}
                      >
                        <Globe className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                        <span>{isExporting ? '…' : 'KMZ'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onExportBackup(item)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center bg-white hover:bg-slate-100 border border-[#d4e3d9] text-slate-600 hover:text-emerald-800 transition cursor-pointer shrink-0"
                      title={isMr ? 'JSON बॅकअप डाऊनलोड करा' : 'Export JSON Backup'}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
