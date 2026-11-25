const CACHE_NAME = 'belcam-static-v1';

// Keširamo samo statičke ikonice i manifest — NIKAD index.html ni cameras.json
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  // Odmah preuzmi ulogu bez čekanja zatvaranja starih tabova na iOS-u
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Omogućava dugmetu "Ažuriraj aplikaciju sada" da odmah aktivira novi Service Worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignoriši sve što nije GET (npr. POST) ili HLS video strimove (.m3u8 / .ts)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Video strimovi i eksterne mape idu direktno na mrežu bez mešanja SW-a
  if (
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // 1. NETWORK FIRST za HTML stranicu i cameras.json (uvek povlači sveže sa GitHub-a)
  if (
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('cameras.json')
  ) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((networkRes) => {
          // Sačuvaj kopiju za offline režim ako internet padne
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 2. CACHE FIRST za ikonice i manifest
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
      );
    })
  );
});
