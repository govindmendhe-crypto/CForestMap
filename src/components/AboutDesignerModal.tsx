/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Mail, Copy, Check, ShieldCheck, Trees, Award } from 'lucide-react';

interface AboutDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
}

const DESIGNER_EMAIL = 'govind.mendhe@gmail.com';

export const AboutDesignerModal: React.FC<AboutDesignerModalProps> = ({
  isOpen,
  onClose,
  lang
}) => {
  const [copied, setCopied] = useState(false);
  const isMr = lang === 'mr';

  if (!isOpen) return null;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(DESIGNER_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy for restricted contexts
      const input = document.createElement('input');
      input.value = DESIGNER_EMAIL;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-designer-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Forest Official Header Band */}
        <div className="bg-[#062e23] text-white px-5 py-4 relative">
          <button
            type="button"
            onClick={onClose}
            aria-label={isMr ? 'बंद करा' : 'Close'}
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-emerald-200/80 hover:text-white hover:bg-emerald-900/70 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 pr-8">
            <div className="w-11 h-11 rounded-xl bg-emerald-800/80 border border-emerald-600/50 flex items-center justify-center text-emerald-100 font-bold text-sm tracking-wide shrink-0 shadow-inner">
              GM
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                {isMr ? 'ॲप डिझायनर व निर्माता' : 'App Designer & Creator'}
              </p>
              <h2
                id="about-designer-title"
                className="text-base font-bold text-white leading-tight truncate"
              >
                Govind Mendhe
              </h2>
              {isMr && (
                <p className="text-[11px] text-emerald-200/90 leading-tight mt-0.5">
                  गोविंद मेंढे
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Clean Details Body */}
        <div className="p-5 space-y-3.5">
          {/* Designation & Reserve */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {isMr ? 'पद व कार्यक्षेत्र' : 'Designation & Reserve'}
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                Forest Guard
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 mt-0.5">
                <Trees className="w-3.5 h-3.5 shrink-0" />
                <span>Pench Tiger Reserve</span>
              </div>
              {isMr && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  वनरक्षक, पेंच व्याघ्र प्रकल्प
                </div>
              )}
            </div>
          </div>

          {/* Contact Email */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {isMr ? 'संपर्क ईमेल' : 'Contact Email'}
                </div>
                <div className="text-xs font-mono font-semibold text-slate-800 truncate mt-0.5">
                  {DESIGNER_EMAIL}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={`mailto:${DESIGNER_EMAIL}?subject=${encodeURIComponent(
                  'Forest Treatment Map App Feedback'
                )}`}
                className="h-9 px-3 rounded-lg bg-[#062e23] hover:bg-emerald-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{isMr ? 'ईमेल पाठवा' : 'Send Email'}</span>
              </a>
              <button
                type="button"
                onClick={handleCopyEmail}
                className="h-9 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">{isMr ? 'कॉपी झाले' : 'Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isMr ? 'ईमेल कॉपी' : 'Copy Email'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Official Sheet & Offline Note */}
          <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed pt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              {isMr
                ? 'पूर्णतः ऑफलाईन वन क्षेत्र सर्वेक्षण व प्रमाणित A4 नकाशा निर्मिती ॲप.'
                : 'Offline-first forestry field survey & official A4 scale map generator.'}
            </span>
          </div>

          {/* Privacy Policy Link (Required for Google Play Store) */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              {isMr ? 'गोपनीयता धोरण' : 'Privacy & Data Safety'}
            </span>
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2"
            >
              {isMr ? 'गोपनीयता धोरण वाचा' : 'View Privacy Policy'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
