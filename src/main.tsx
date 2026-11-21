import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import {initNativeAndroidShell, isNativeAndroidApp} from './utils/nativeBridge';

if (isNativeAndroidApp()) {
  // Bundled Capacitor APK serves all assets directly from inside the APK at 0ms offline
  void initNativeAndroidShell();
} else {
  // Register Service Worker on Web/PWA so all assets are cached for 100% zero-internet offline use
  const updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
    },
    onNeedRefresh() {
      updateSW(true);
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
