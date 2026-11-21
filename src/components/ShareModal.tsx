/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Share2,
  X,
  FileDown,
  MessageCircle,
  Globe,
  FileText,
  Loader2,
  ExternalLink,
  WifiOff
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  isNativeAndroidApp,
  saveOrShareBlobFile,
  shareMultipleFilesNative
} from '../utils/nativeBridge';

interface BuiltFile {
  blob: Blob;
  filename: string;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  compartment: string;
  range: string;
  round: string;
  beat: string;
  workArea: string;
  onBuildPdf: () => Promise<BuiltFile | null>;
  onBuildKmz: () => Promise<BuiltFile | null>;
}

async function triggerBlobDownload(blob: Blob, filename: string, openShareSheet = true) {
  await saveOrShareBlobFile(blob, filename, {
    title: filename,
    openShareSheet
  });
}

/**
 * Redirects directly to the installed WhatsApp Application.
 * - On Mobile (Android / iOS): invokes the native `whatsapp://send?text=...` deep link
 *   so it opens the WhatsApp app directly without an intermediate browser page,
 *   with an automatic `https://wa.me/?text=...` universal-link fallback if not handled.
 * - On Desktop: invokes `whatsapp://send?text=...` for WhatsApp Desktop app,
 *   falling back smoothly to `https://wa.me/?text=...`.
 */
function redirectToWhatsAppApp(text: string) {
  const encoded = encodeURIComponent(text);
  const nativeUri = `whatsapp://send?text=${encoded}`;
  const universalUrl = `https://wa.me/?text=${encoded}`;
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

  // Trigger native WhatsApp application deep link
  const nativeLink = document.createElement('a');
  nativeLink.href = nativeUri;
  nativeLink.style.display = 'none';
  document.body.appendChild(nativeLink);
  nativeLink.click();
  document.body.removeChild(nativeLink);

  // If WhatsApp app did not take focus within 900ms, fall back to universal wa.me link
  // (which triggers Android App Links / iOS Universal Links or WhatsApp Web)
  let appOpened = false;
  const onVisibilityChange = () => {
    if (document.hidden) appOpened = true;
  };
  const onBlur = () => {
    appOpened = true;
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onBlur);

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onBlur);

    if (!appOpened) {
      const fallbackLink = document.createElement('a');
      fallbackLink.href = universalUrl;
      if (!isMobile) {
        fallbackLink.target = '_blank';
        fallbackLink.rel = 'noopener noreferrer';
      }
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      document.body.removeChild(fallbackLink);
    }
  }, 900);
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  compartment,
  range,
  round,
  beat,
  workArea,
  onBuildPdf,
  onBuildKmz
}) => {
  const [busyMode, setBusyMode] = useState<'pdf' | 'kmz' | 'both' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  if (!isOpen) return null;

  const summaryText =
    `Forest Treatment Map (Grid Base Map)\n` +
    `Compartment / Survey No: ${compartment || '-'}\n` +
    `Range: ${range || '-'} | Round: ${round || '-'} | Beat: ${beat || '-'}\n` +
    `Workable Area: ${workArea || '0.00'} Ha.`;

  const shareOrDownloadFiles = async (mode: 'pdf' | 'kmz' | 'both', openWhatsApp: boolean) => {
    setBusyMode(mode);
    setStatusMsg(null);
    try {
      const filesToShare: File[] = [];
      const builtItems: BuiltFile[] = [];

      if (mode === 'pdf' || mode === 'both') {
        const pdfRes = await onBuildPdf();
        if (pdfRes) {
          builtItems.push(pdfRes);
          filesToShare.push(new File([pdfRes.blob], pdfRes.filename, { type: 'application/pdf' }));
        }
      }

      if (mode === 'kmz' || mode === 'both') {
        const kmzRes = await onBuildKmz();
        if (kmzRes) {
          builtItems.push(kmzRes);
          filesToShare.push(
            new File([kmzRes.blob], kmzRes.filename, { type: 'application/vnd.google-earth.kmz' })
          );
        }
      }

      if (filesToShare.length === 0) {
        setStatusMsg('कृपया आधी KML नकाशा लोड करा. (Load KML boundary first.)');
        setBusyMode(null);
        return;
      }

      if (openWhatsApp) {
        // Inside compiled Android APK, use Android's native multi-file Share sheet
        // so PDF & KMZ attach directly to WhatsApp without manual file picking!
        if (isNativeAndroidApp()) {
          await shareMultipleFilesNative(
            builtItems,
            `Treatment Map - ${compartment || 'Coupe'}`,
            summaryText
          );
          setBusyMode(null);
          onClose();
          return;
        }

        // Web/PWA: save generated PDF/KMZ locally first, then open WhatsApp
        for (const item of builtItems) {
          await triggerBlobDownload(item.blob, item.filename, false);
        }

        const fileNote =
          mode === 'both'
            ? 'PDF व Google Earth KMZ फाईल्स डाऊनलोड झाल्या आहेत — कृपया WhatsApp मध्ये संलग्न (Attach) करा.'
            : mode === 'kmz'
            ? 'Google Earth KMZ फाईल डाऊनलोड झाली आहे — कृपया WhatsApp मध्ये संलग्न (Attach) करा.'
            : 'Strict Scale PDF फाईल डाऊनलोड झाली आहे — कृपया WhatsApp मध्ये संलग्न (Attach) करा.';

        // Redirect directly to the native WhatsApp application
        redirectToWhatsAppApp(`${summaryText}\n${fileNote}`);
        setBusyMode(null);
        onClose();
      } else {
        for (const item of builtItems) {
          await triggerBlobDownload(item.blob, item.filename, true);
        }
        setBusyMode(null);
        onClose();
      }
    } catch (err: any) {
      setStatusMsg(err?.message || 'Share failed');
      setBusyMode(null);
    }
  };

  const handleNativeSystemShare = async () => {
    setBusyMode('both');
    setStatusMsg(null);
    try {
      const filesToShare: File[] = [];
      const builtItems: BuiltFile[] = [];
      const pdfRes = await onBuildPdf();
      if (pdfRes) {
        builtItems.push(pdfRes);
        filesToShare.push(new File([pdfRes.blob], pdfRes.filename, { type: 'application/pdf' }));
      }
      const kmzRes = await onBuildKmz();
      if (kmzRes) {
        builtItems.push(kmzRes);
        filesToShare.push(
          new File([kmzRes.blob], kmzRes.filename, { type: 'application/vnd.google-earth.kmz' })
        );
      }

      if (filesToShare.length === 0) {
        setStatusMsg('कृपया आधी KML नकाशा लोड करा. (Load KML boundary first.)');
        setBusyMode(null);
        return;
      }

      if (isNativeAndroidApp()) {
        await shareMultipleFilesNative(
          builtItems,
          `Treatment Map - ${compartment || 'Coupe'}`,
          summaryText
        );
        setBusyMode(null);
        onClose();
        return;
      }

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: filesToShare }))) {
        await nav.share({
          title: `Treatment Map - ${compartment || 'Coupe'}`,
          text: summaryText,
          files: filesToShare
        });
        setBusyMode(null);
        onClose();
        return;
      }

      // Fallback directly to WhatsApp app
      redirectToWhatsAppApp(summaryText);
      setBusyMode(null);
      onClose();
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        redirectToWhatsAppApp(summaryText);
      }
      setBusyMode(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 rounded-lg text-green-700">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Share on WhatsApp App</h3>
              <p className="text-[10.5px] text-slate-500">थेट WhatsApp अॅपवर नकाशा PDF व KMZ पाठवा</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1 font-mono text-slate-700">
          <div className="font-bold text-emerald-800">Compartment: {compartment || '-'}</div>
          <div>Range: {range || '-'} | Round: {round || '-'} | Beat: {beat || '-'}</div>
          <div>Workable Area: {workArea || '0.00'} Ha.</div>
        </div>

        {!isOnline && (
          <div className="flex items-start gap-2 text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              ऑफलाइन मोड: PDF व KMZ फोनमध्ये सेव्ह होऊन WhatsApp अॅप उघडेल. नेटवर्क मिळताच संदेश पाठवला जाईल.
            </span>
          </div>
        )}

        {statusMsg && (
          <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {statusMsg}
          </div>
        )}

        <div className="space-y-2">
          {/* Primary: Download PDF + KMZ & Redirect Directly to WhatsApp App */}
          <button
            type="button"
            disabled={busyMode !== null}
            onClick={() => shareOrDownloadFiles('both', true)}
            className="w-full min-h-[44px] py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            {busyMode === 'both' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4" />
            )}
            <span>Open WhatsApp App (PDF + KMZ)</span>
          </button>

          {/* Share PDF Only or KMZ Only -> Redirect directly to WhatsApp App */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busyMode !== null}
              onClick={() => shareOrDownloadFiles('pdf', true)}
              className="min-h-[40px] py-2 px-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-[11.5px] font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              {busyMode === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>PDF → WhatsApp</span>
            </button>

            <button
              type="button"
              disabled={busyMode !== null}
              onClick={() => shareOrDownloadFiles('kmz', true)}
              className="min-h-[40px] py-2 px-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-[11.5px] font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              {busyMode === 'kmz' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              <span>KMZ → WhatsApp</span>
            </button>
          </div>

          {/* Direct WhatsApp Summary + OS File Attachment Share */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busyMode !== null}
              onClick={() => {
                redirectToWhatsAppApp(summaryText);
                onClose();
              }}
              className="min-h-[38px] py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
              <span>WhatsApp App Only</span>
            </button>
            <button
              type="button"
              disabled={busyMode !== null}
              onClick={handleNativeSystemShare}
              className="min-h-[38px] py-2 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-600" />
              <span>Attach via Phone</span>
            </button>
          </div>

          {/* Direct Offline Download Shortcuts */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={busyMode !== null}
              onClick={() => shareOrDownloadFiles('pdf', false)}
              className="min-h-[38px] py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Save PDF Offline</span>
            </button>
            <button
              type="button"
              disabled={busyMode !== null}
              onClick={() => shareOrDownloadFiles('kmz', false)}
              className="min-h-[38px] py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Save KMZ Offline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
