const CACHE_PREFIX = 'diario-de-bordo-';
const CACHE_NAME = 'diario-de-bordo-v9';
const SHARE_DB_NAME = 'DiarioDeBordoShareInbox';
const SHARE_DB_VERSION = 1;
const SHARE_STORE = 'pending_shares';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/icons.js',
  './js/echo.js',
  './js/sara.js',
  './js/export.js',
  './js/day-mural.js',
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

function openShareDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) {
        db.createObjectStore(SHARE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storePendingShare(payload) {
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(SHARE_STORE, 'readwrite');
    t.objectStore(SHARE_STORE).put(payload);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

async function handleShareTarget(request) {
  const scopeBase = self.registration.scope;
  try {
    const formData = await request.formData();
    const title = String(formData.get('title') || '').trim();
    const text = String(formData.get('text') || '').trim();
    const sharedUrl = String(formData.get('url') || '').trim();

    // Collect files from 'media' plus defensively any other Blob/File fields
    const collectedFiles = [];
    const seen = new Set();
    const rawMedia = formData.getAll('media');
    for (const item of rawMedia) {
      if (item && typeof item === 'object' && typeof item.arrayBuffer === 'function') {
        seen.add(item);
        collectedFiles.push(item);
      }
    }
    for (const [, val] of formData.entries()) {
      if (val && typeof val === 'object' && typeof val.arrayBuffer === 'function' && !seen.has(val)) {
        seen.add(val);
        collectedFiles.push(val);
      }
    }

    // Materialize file bytes immediately while Android content:// stream is alive
    const materializedFiles = [];
    for (let i = 0; i < collectedFiles.length; i++) {
      const f = collectedFiles[i];
      try {
        const buffer = await f.arrayBuffer();
        const type = f.type || 'application/octet-stream';
        const blob = new Blob([buffer], { type });
        if (blob.size > 0) {
          materializedFiles.push({
            name: f.name || `anexo_${i + 1}`,
            type,
            size: blob.size,
            blob
          });
        }
      } catch {
        // skip unreadable stream entry
      }
    }

    const id = `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await storePendingShare({
      id,
      title,
      text,
      url: sharedUrl,
      files: materializedFiles,
      receivedAt: Date.now()
    });

    const redirectUrl = new URL(`./index.html?share-target=${encodeURIComponent(id)}`, scopeBase).href;
    return Response.redirect(redirectUrl, 303);
  } catch {
    const errorRedirect = new URL('./index.html?share-target=error', scopeBase).href;
    return Response.redirect(errorRedirect, 303);
  }
}

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
  const url = new URL(request.url);

  if (request.method === 'POST' && url.href.startsWith(self.registration.scope) && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;
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
