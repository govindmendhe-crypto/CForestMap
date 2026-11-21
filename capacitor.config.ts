import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.foresttreatmentmap.app',
  appName: 'Forest Treatment Map Generator',
  webDir: 'dist',
  server: {
    // Serving local bundled assets over https://localhost ensures Geolocation,
    // IndexedDB, Screen Wake Lock, and Canvas exports behave identically to HTTPS.
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#064e3b',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#064e3b',
    },
  },
};

export default config;
