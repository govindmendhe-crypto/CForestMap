/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileText, X, Download, Ruler, Printer, CheckCircle } from 'lucide-react';
import { Orientation, ScaleConfig } from '../types/mapTypes';
import { StrictFrame, validatePageSize } from '../utils/pdfExport';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  frame: StrictFrame | null;
  activeScale: ScaleConfig;
  compartmentName: string;
  onExport: (selectedFormat: 'auto' | 'a4' | 'a3', orientation: Orientation, forceA4?: boolean) => void;
  defaultOrientation: Orientation;
  lang?: string;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  frame,
  activeScale,
  onExport,
  defaultOrientation,
  compartmentName
}) => {
  if (!isOpen) return null;

  const wMm = frame ? Math.round(frame.wMm) : 193;
  const hMm = frame ? Math.round(frame.hMm) : 292;

  // Determine auto orientation based on map proportions
  const validation = validatePageSize(wMm, hMm, { forceA4: false });
  const effectiveOrientation: Orientation = validation.orientation || (wMm > hMm ? 'landscape' : 'portrait');
  const orientationText = effectiveOrientation === 'landscape' ? 'आडवा (Landscape)' : 'उभा (Portrait)';

  const handleDownload = () => {
    // Strictly preserve 100% exact ruler scale with zero shrinkage
    onExport('a4', effectiveOrientation, false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                नकाशा PDF डाऊनलोड (Download Survey Map PDF)
              </h3>
              <p className="text-[11px] text-emerald-700 font-semibold">
                १००% अचूक मोजपट्टी प्रमाण (Strict 1:1 Engineering Scale)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Scale & Document Guarantee Box */}
        <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
              <Ruler className="w-4 h-4 text-emerald-700" />
              मोजपट्टी प्रमाण: <span className="text-emerald-800 underline font-extrabold">{activeScale.name}</span>
            </span>
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-900 font-bold text-[11px]">
              A4 Sheet ({orientationText})
            </span>
          </div>

          <div className="bg-white rounded-lg p-2.5 border border-emerald-200 text-slate-700 space-y-1 text-[11.5px]">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span>२ पानांचा अधिकृत सर्वेक्षण अहवाल:</span>
            </div>
            <div className="pl-5 space-y-0.5 text-slate-600 text-[11px]">
              <div>• <strong>पृष्ठ १:</strong> कूप प्रमाणित नकाशा (ग्रीड लाईन्स, बेसलाईन व GPS सीमा)</div>
              <div>• <strong>पृष्ठ २:</strong> कूप ग्रीड क्षेत्रफळ तपशील तक्ता (Grid Wise Area Statement)</div>
            </div>
          </div>
        </div>

        {/* 2. Critical Print Scale Instructions Banner */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-amber-950 font-bold">
            <Printer className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span>प्रिंट करताना मोजपट्टी न बदलण्यासाठी महत्त्वाची सूचना:</span>
          </div>
          <div className="text-amber-900 text-[11.5px] leading-relaxed bg-white/80 p-2.5 rounded-lg border border-amber-200 space-y-1">
            <p>
              कागदावरील मोजपट्टी <strong>(२ सेमी = १०० मीटर)</strong> तंतोतंत अचूक राहण्यासाठी:
            </p>
            <ol className="list-decimal pl-4 space-y-0.5 font-medium text-amber-950">
              <li>
                प्रिंटर विंडोमध्ये <strong>Scale: 'Actual size' (किंवा 100%)</strong> निवडा.
              </li>
              <li>
                <span className="text-rose-700 font-bold">'Fit to page' किंवा 'Shrink to printable area' करू नका</span>, ज्यामुळे स्केल बदलणार नाही.
              </li>
            </ol>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            रद्द करा (Cancel)
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex-2 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>PDF डाऊनलोड करा (Download PDF)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
