/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Smartphone, X, Share, WifiOff, MoreVertical } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallProps {
  lang: string;
}

/**
 * Automatic In-Browser Install App Banner.
 * Appears automatically when opened in a regular browser so officers can install
 * the app for 100% zero-internet offline fieldwork. Automatically disappears
 * forever once running as an installed standalone app.
 */
export const PWAInstallBanner: React.FC<PWAInstallProps> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  const isMr = lang === 'mr';

  // Hide completely once installed as standalone app or dismissed for this session
  if (isInstalled || dismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) setDismissed(true);
    } else {
      setShowManualGuide(true);
    }
  };

  return (
    <>
      <div className="fixed bottom-2.5 left-2.5 right-2.5 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-40 animate-slideUp">
        <div className="bg-[#062e23]/95 backdrop-blur-md text-white rounded-2xl border border-emerald-600/60 shadow-2xl px-3 py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-700/80 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <WifiOff className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white leading-tight truncate">
                {isMr ? 'ऑफलाइन अॅप इन्स्टॉल करा' : 'Install Offline Field App'}
              </div>
              <div className="text-[10.5px] text-emerald-200/90 leading-tight mt-0.5 truncate">
                {isMr ? 'शून्य इंटरनेटवरही १००% चालते' : 'Works 100% with zero internet'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="min-h-[36px] px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-sm"
            >
              {isIOS && !isInstallable ? (
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isMr ? 'इन्स्टॉल' : 'Install'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="min-h-[36px] min-w-[32px] flex items-center justify-center rounded-xl text-emerald-200/75 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label={isMr ? 'बंद करा' : 'Dismiss'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Fallback Guided Install Modal (iOS Safari or browsers where native prompt hasn't fired) */}
      {showManualGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/50 p-5 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span>
                  {isIOS
                    ? isMr
                      ? 'iPhone / iPad वर इन्स्टॉल करा'
                      : 'Install on iPhone / iPad'
                    : isMr
                    ? 'अॅप होम स्क्रीनवर जोडा (ऑफलाइन)'
                    : 'Add App to Home Screen (Offline)'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowManualGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-200 leading-relaxed">
              <p className="text-slate-300">
                {isMr
                  ? 'जंगलात शून्य इंटरनेट नेटवर्कशिवाय वापरण्यासाठी अॅप होम स्क्रीनवर जोडा:'
                  : 'Install this app on your device so it opens and works 100% offline with zero internet:'}
              </p>

              {isIOS ? (
                <div className="p-3 bg-slate-800/80 rounded-xl space-y-2.5 border border-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      1
                    </span>
                    <span>
                      {isMr ? 'Safari मधील ' : 'Tap the '}
                      <strong>Share</strong> <Share className="w-3.5 h-3.5 inline text-sky-400" />
                      {isMr ? ' बटण दाबा.' : ' button in Safari’s bottom toolbar.'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      2
                    </span>
                    <span>
                      {isMr ? 'खाली स्क्रोल करून ' : 'Scroll down and tap '}
                      <strong>Add to Home Screen</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      3
                    </span>
                    <span>
                      <strong>Add</strong>
                      {isMr ? ' दाबा — आता अॅप ऑफलाइन चालेल!' : ' — launches offline with zero internet.'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-800/80 rounded-xl space-y-2.5 border border-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      1
                    </span>
                    <span>
                      {isMr ? 'ब्राउझरच्या उजव्या कोपऱ्यातील ' : 'Tap the browser menu '}
                      <MoreVertical className="w-3.5 h-3.5 inline text-emerald-300" />
                      {isMr ? ' (मेनू) दाबा.' : ' (top-right corner in Chrome / Edge).'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      2
                    </span>
                    <span>
                      <strong>{isMr ? 'Install App / Add to Home Screen' : 'Install App / Add to Home Screen'}</strong>{' '}
                      {isMr ? 'निवडा.' : 'option.'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      3
                    </span>
                    <span>
                      {isMr
                        ? 'एकदा जोडल्यावर इंटरनेटशिवायही पूर्ण नकाशा, GPS व PDF/KMZ चालते.'
                        : 'Once added, all map, GPS, PDF, and KMZ tools run 100% offline.'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowManualGuide(false)}
              className="w-full min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer"
            >
              {isMr ? 'समजले' : 'Got It'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallButton: React.FC<PWAInstallProps> = ({ lang }) => (
  <PWAInstallBanner lang={lang} />
);
