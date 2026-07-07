// BabyTrak service worker.
// - App shell (HTML/JS/CSS/icons) is cached so the app opens offline.
// - API requests always go to the network so data is never stale or stored.
const CACHE = 'babytrak-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Cache each shell URL independently so one missing file can't abort install.
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept POST/PUT/DELETE
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ignore cross-origin

  // Data is always live — go to the network, never serve a cached API response.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first so updates land; fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))));
    return;
  }

  // Static assets: serve from cache, otherwise fetch and cache for next time.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
    )
  );
});
