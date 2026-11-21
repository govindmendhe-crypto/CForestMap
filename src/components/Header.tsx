/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trees, Languages, MapPin, Info } from 'lucide-react';
import { getTranslation } from '../utils/i18n';
import { AboutDesignerModal } from './AboutDesignerModal';

interface HeaderProps {
  currentLang: string;
  onLanguageChange: (lang: string) => void;
  userLocationText: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentLang,
  onLanguageChange,
  userLocationText
}) => {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const t = (key: string) => getTranslation(key, currentLang);
  const isMr = currentLang === 'mr';

  const languages = [
    { code: 'mr', label: 'मराठी (Marathi)' },
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'en', label: 'English' },
    { code: 'bn', label: 'বাংলা (Bengali)' },
    { code: 'ta', label: 'தமிழ் (Tamil)' },
    { code: 'te', label: 'తెలుగు (Telugu)' },
    { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
    { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
    { code: 'ml', label: 'മലയാളം (Malayalam)' },
    { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
    { code: 'or', label: 'ଓଡ଼ିଆ (Odia)' },
    { code: 'as', label: 'অসমীয়া (Assamese)' },
    { code: 'ur', label: 'اردو (Urdu)' },
    { code: 'sa', label: 'संस्कृतम् (Sanskrit)' },
    { code: 'kok', label: 'कोंकणी (Konkani)' },
    { code: 'mai', label: 'मैथिली (Maithili)' },
    { code: 'doi', label: 'डोगरी (Dogri)' },
    { code: 'sat', label: 'ᱥᱟᱱᱛᱟᱲᱤ (Santali)' },
    { code: 'ks', label: 'کٲشُر (Kashmiri)' },
    { code: 'sd', label: 'سنڌي (Sindhi)' },
    { code: 'brx', label: 'बड़ो (Bodo)' },
    { code: 'mni', label: 'মৈতৈলোন্ (Manipuri)' },
    { code: 'ne', label: 'नेपाली (Nepali)' }
  ];

  return (
    <>
      <header className="flex-shrink-0 forest-canopy-header text-white border-b border-emerald-950/60 shadow-[0_2px_10px_rgba(7,36,26,0.20)] z-30">
        <div className="max-w-[1600px] mx-auto px-2.5 sm:px-4 h-10 sm:h-12 flex items-center justify-between gap-2">
          {/* Brand Wordmark + Subtle Designer Credit (tappable for full About Card) */}
          <button
            type="button"
            onClick={() => setIsAboutOpen(true)}
            className="flex items-center gap-2 min-w-0 text-left group cursor-pointer rounded-xl py-0.5 pr-1.5 -ml-0.5 hover:bg-white/10 transition"
            title={
              isMr
                ? 'ॲप डिझायनर माहिती पहा — Govind Mendhe'
                : 'View App Designer Info — Govind Mendhe'
            }
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-600/45 to-emerald-900/75 border border-emerald-400/35 text-emerald-100 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:border-amber-300/60 transition">
              <Trees className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-200 group-hover:text-amber-200 transition" />
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1 min-w-0">
                <h1 className="text-[12.5px] sm:text-[13.5px] font-bold tracking-tight text-white truncate leading-tight">
                  {t('app_title')}
                </h1>
                <Info className="w-3 h-3 sm:hidden shrink-0 text-emerald-200/80 group-hover:text-amber-200 transition" />
              </div>
              <span className="hidden sm:flex items-center gap-1 text-[10.5px] font-medium text-emerald-200/85 group-hover:text-amber-200 truncate leading-tight mt-0.5 transition">
                <span className="truncate">
                  {isMr
                    ? 'Govind Mendhe · पेंच व्याघ्र प्रकल्प'
                    : 'By Govind Mendhe · Pench Tiger Reserve'}
                </span>
                <Info className="w-2.5 h-2.5 shrink-0 opacity-75 group-hover:opacity-100" />
              </span>
            </div>
          </button>

          {/* Language Selector Only */}
          <div className="relative flex-shrink-0">
            <select
              value={currentLang}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Language"
              className="appearance-none pl-6.5 pr-2.5 h-7 sm:h-8 bg-emerald-950/65 hover:bg-emerald-900/85 text-emerald-50 border border-emerald-500/35 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300/60 cursor-pointer w-[108px] sm:w-[152px] truncate transition"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#082d22] text-white">
                  {l.label}
                </option>
              ))}
            </select>
            <Languages className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-emerald-300 pointer-events-none" />
          </div>
        </div>

        {/* Live GPS status strip when actively locked */}
        {userLocationText && (
          <div className="bg-sky-950/90 border-t border-sky-800/60 px-3 sm:px-4 py-1 text-[11px] flex items-center justify-between gap-2 text-sky-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3 h-3 text-sky-300 flex-shrink-0" />
              <span className="font-mono font-medium text-white truncate">{userLocationText}</span>
            </div>
            <span className="text-[10px] text-sky-300 font-mono hidden sm:inline shrink-0">
              GPS Lock
            </span>
          </div>
        )}
      </header>

      <AboutDesignerModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        lang={currentLang}
      />
    </>
  );
};
