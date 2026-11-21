/**
 * Service Worker extension for Web Share Target API (Android WhatsApp -> Share/Open in TreatmentMap).
 * Intercepts POST /share-target, saves the incoming KMZ/KML/ZIP file into CacheStorage,
 * and redirects cleanly to /?shared=1 so the app opens the Just View / Edit dialog.
 */

const SHARED_FILES_CACHE = 'forest-shared-files-v1';
const SHARED_FILE_KEY = '/__shared_map_file__';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'POST') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.pathname !== '/share-target') return;

  event.respondWith(
    (async () => {
      try {
        const formData = await req.formData();
        let file = formData.get('mapfile');

        // Fallback: pick the first File field if Android/WhatsApp uses a different field name
        if (!file || typeof file.arrayBuffer !== 'function') {
          for (const value of formData.values()) {
            if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
              file = value;
              break;
            }
          }
        }

        if (file && typeof file.arrayBuffer === 'function') {
          const buffer = await file.arrayBuffer();
          const rawName = (file.name && String(file.name).trim()) || 'WhatsApp_Map.kmz';
          const cache = await caches.open(SHARED_FILES_CACHE);
          const headers = new Headers({
            'Content-Type': file.type || 'application/octet-stream',
            'X-Shared-Filename': encodeURIComponent(rawName),
            'X-Shared-Timestamp': String(Date.now())
          });
          await cache.put(SHARED_FILE_KEY, new Response(buffer, { headers }));

          // Notify any already-open TreatmentMap window in case focus-existing is active
          try {
            const clientList = await self.clients.matchAll({
              type: 'window',
              includeUncontrolled: true
            });
            for (const client of clientList) {
              client.postMessage({ type: 'SHARED_MAP_FILE_READY' });
            }
          } catch {
            // Ignore client broadcast errors
          }

          return Response.redirect('/?shared=1', 303);
        }
      } catch {
        // Ignore and redirect with error flag
      }

      return Response.redirect('/?shared=error', 303);
    })()
  );
});
