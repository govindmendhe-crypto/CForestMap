import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'sw-share-target.js',
          'privacy-policy.html',
        ],
        manifest: {
          id: '/',
          name: 'Forest Treatment Map Generator',
          short_name: 'TreatmentMap',
          description: 'Grid Base Map for Forestry Working Plans & Coupes - Works 100% Offline in Deep Forest',
          lang: 'en',
          dir: 'ltr',
          theme_color: '#064e3b',
          background_color: '#064e3b',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          categories: ['navigation', 'productivity', 'utilities'],
          prefer_related_applications: false,
          start_url: '/',
          scope: '/',
          launch_handler: {
            client_mode: ['focus-existing', 'auto'],
          },
          file_handlers: [
            {
              action: '/?openfile=1',
              accept: {
                'application/vnd.google-earth.kmz': ['.kmz'],
                'application/vnd.google-earth.kml+xml': ['.kml'],
                'application/zip': ['.kmz'],
                'application/x-zip-compressed': ['.kmz'],
                'application/octet-stream': ['.kmz', '.kml'],
                'application/geo+json': ['.geojson'],
                'application/gpx+xml': ['.gpx'],
              },
            },
          ],
          share_target: {
            action: '/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
              files: [
                {
                  name: 'mapfile',
                  accept: [
                    '.kmz',
                    '.kml',
                    '.zip',
                    '.geojson',
                    '.gpx',
                    '.json',
                    'application/vnd.google-earth.kmz',
                    'application/vnd.google-earth.kml+xml',
                    'application/zip',
                    'application/x-zip-compressed',
                    'application/octet-stream',
                    'application/xml',
                    'text/xml',
                    'application/json',
                    'application/geo+json',
                  ],
                },
              ],
            },
          },
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        } as any,
        workbox: {
          importScripts: ['/sw-share-target.js'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/\.well-known\//, /^\/privacy-policy\.html$/],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      allowedHosts: true as const,
    },
  };
});
