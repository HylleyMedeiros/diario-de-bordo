const CACHE_PREFIX = 'diario-de-bordo-';
const CACHE_NAME = 'diario-de-bordo-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/icons.js',
  './js/echo.js',
  './js/sara.js',
  './js/gratitude.js',
  './js/mural.js',
  './js/editor.js',
  './js/calendar.js',
  './js/stats.js',
  './js/more.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(APP_SHELL.map((asset) => new Request(asset, { cache: 'reload' })))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.href.startsWith(self.registration.scope)) return;

  const isNav = request.mode === 'navigate';
  const isMediaAsset = !isNav && /\.(png|svg|jpg|jpeg|webp|ico)$/i.test(url.pathname);

  if (isMediaAsset) {
    // Cache-First with background revalidation for static icons/images
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkUpdate = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkUpdate;
      })
    );
    return;
  }

  // Network-First with offline cache fallback for HTML, JS, CSS and manifest
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isNav) return caches.match('./index.html');
        return Response.error();
      })
  );
});
