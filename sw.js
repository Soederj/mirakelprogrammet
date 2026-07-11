// ═══════════════════════════════════════════════════════════════════
// Mirakelprogrammet – Service Worker
// Strategi:
//   • index.html: NETWORK FIRST (du deployar ofta – uppdateringar ska
//     nå ut direkt), cache som offline-fallback
//   • Google Fonts: stale-while-revalidate (snabbt + funkar offline)
//   • API-anrop (workers.dev, analytics): rör aldrig – appen har egen cache
// Bumpa CACHE_VERSION vid behov för att tvinga ny cache.
// ═══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'mp-v1';
const APP_CACHE = CACHE_VERSION + '-app';
const FONT_CACHE = CACHE_VERSION + '-fonts';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API & analytics: gå alltid direkt mot nätet, cachea aldrig
  if (url.hostname.endsWith('workers.dev') ||
      url.hostname.includes('google-analytics') ||
      url.hostname.includes('googletagmanager') ||
      url.hostname.includes('styrkelyft.se')) {
    return; // låt webbläsaren sköta det
  }

  // Google Fonts: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fresh = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // Navigering (själva appen): network first, cache som offline-fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => {
            c.put('./index.html', copy);
            c.put('./', res.clone());
          });
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((r) => r || caches.match('./'))
        )
    );
    return;
  }

  // Övriga same-origin-resurser (ikoner, manifest): cache first + uppdatera i bakgrunden
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fresh = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
