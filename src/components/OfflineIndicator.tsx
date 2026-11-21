/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  lang: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  const [offlineReadyBanner, setOfflineReadyBanner] = useState(false);
  const isMr = lang === 'mr';

  useEffect(() => {
    const handleReady = () => {
      setOfflineReadyBanner(true);
      const timer = window.setTimeout(() => setOfflineReadyBanner(false), 4500);
      return () => window.clearTimeout(timer);
    };

    window.addEventListener('pwa-offline-ready', handleReady);
    return () => {
      window.removeEventListener('pwa-offline-ready', handleReady);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="fixed bottom-16 lg:bottom-4 left-3 z-40 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/95 text-slate-100 border border-emerald-600/60 px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-sm text-xs">
          <WifiOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="font-semibold text-white">
            {isMr ? 'ऑफलाइन मोड · GPS व नकाशा कार्यरत' : 'Offline Mode · GPS & Maps Ready'}
          </span>
        </div>
      </div>
    );
  }

  if (offlineReadyBanner) {
    return (
      <div className="fixed bottom-16 lg:bottom-4 left-3 z-40 pointer-events-none animate-slideUp">
        <div className="flex items-center gap-2 bg-emerald-900/95 text-emerald-50 border border-emerald-500/60 px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-sm text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
          <span className="font-semibold">
            {isMr ? 'ऑफलाइन वापरासाठी अ‍ॅप सेव्ह झाले' : 'Cached — Ready for 100% Offline Use'}
          </span>
        </div>
      </div>
    );
  }

  return null;
};
