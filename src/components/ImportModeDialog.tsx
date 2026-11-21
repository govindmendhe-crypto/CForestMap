/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pre-Open Mode Dialog for Imported KML / KMZ / Saved Treatment Maps:
 * Lets the officer choose between 'Just View (Locked)' — preventing accidental dragging
 * of the polygon, baseline, or legend on mobile — or 'Edit Map' before opening.
 */

import React from 'react';
import { Eye, PencilLine, Lock, Navigation, FileText, X } from 'lucide-react';

export interface PendingImportPreview {
  fileName: string;
  areaSummaryText?: string;
  detailsText?: string;
  isAppKmz?: boolean;
}

interface ImportModeDialogProps {
  isOpen: boolean;
  lang: string;
  preview: PendingImportPreview | null;
  onChooseViewOnly: () => void;
  onChooseEdit: () => void;
  onCancel: () => void;
}

export const ImportModeDialog: React.FC<ImportModeDialogProps> = ({
  isOpen,
  lang,
  preview,
  onChooseViewOnly,
  onChooseEdit,
  onCancel
}) => {
  if (!isOpen || !preview) return null;
  const isMr = lang === 'mr';

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isMr ? 'नकाशा कसा उघडायचा?' : 'How would you like to open this map?'}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[#cce0d2] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3.5 bg-[#0b3326] text-white">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              {isMr ? 'उपचार नकाशा कसा उघडायचा?' : 'Open Treatment Map Mode'}
            </h2>
            <p className="text-[11px] text-emerald-200/90 mt-0.5 truncate">
              {isMr
                ? 'फक्त पाहण्यासाठी (ड्रॅग लॉक) की संपादनासाठी निवडा'
                : 'Choose locked view-only or full editing before opening'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0 transition"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File Summary */}
        <div className="px-4 pt-4 pb-2">
          <div className="px-3.5 py-2.5 rounded-xl bg-[#f4f9f6] border border-[#d4e3d9] flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-[#0f5132] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#10251c] truncate">{preview.fileName}</div>
              {(preview.areaSummaryText || preview.detailsText) && (
                <div className="text-[11px] text-[#4a6758] mt-0.5 tabular-nums">
                  {[preview.areaSummaryText, preview.detailsText].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two Primary Mode Buttons */}
        <div className="p-4 space-y-2.5">
          {/* Option 1: Just View (Locked, Smooth Pan/Zoom, No Accidental Dragging) */}
          <button
            type="button"
            onClick={onChooseViewOnly}
            className="w-full min-h-[68px] px-4 py-3 rounded-xl bg-[#0f5132] hover:bg-[#0b3e26] active:scale-[0.99] text-white text-left flex items-center gap-3.5 cursor-pointer transition shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5 text-emerald-100" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-bold">
                <span>{isMr ? 'फक्त पहा (Just View · लॉक)' : 'Just View (Locked Mode)'}</span>
                <Lock className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
              </div>
              <div className="text-[11px] text-emerald-100/90 leading-snug mt-0.5">
                {isMr
                  ? 'सीमा, पाया रेषा व सूची हलणार नाही — झूम, GPS व गो-टू कंपॉसने सहज पहा.'
                  : 'Prevents accidental dragging of boundary, baseline or legend. Smooth zoom, GPS & Go-To Compass.'}
              </div>
            </div>
            <Navigation className="w-4 h-4 text-emerald-200 shrink-0" />
          </button>

          {/* Option 2: Edit Map (Full Controls Unlocked) */}
          <button
            type="button"
            onClick={onChooseEdit}
            className="w-full min-h-[64px] px-4 py-3 rounded-xl bg-white hover:bg-[#f4f9f6] active:scale-[0.99] border border-[#c8ddd0] text-[#10251c] text-left flex items-center gap-3.5 cursor-pointer transition"
          >
            <div className="w-10 h-10 rounded-xl bg-[#ebf5ee] flex items-center justify-center shrink-0">
              <PencilLine className="w-5 h-5 text-[#0f5132]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">
                {isMr ? 'नकाशा संपादित करा (Edit Map)' : 'Edit Map'}
              </div>
              <div className="text-[11px] text-[#4b6859] leading-snug mt-0.5">
                {isMr
                  ? 'पाया रेषा, ग्रीड, खुणा, रस्ते, शीर्षक व नकाशा स्थान बदलण्यासाठी उघडा.'
                  : 'Unlock full editing for baseline, grid, landmarks, roads, title, and sheet layout.'}
              </div>
            </div>
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className="w-full min-h-[42px] rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition"
          >
            {isMr ? 'रद्द करा' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
