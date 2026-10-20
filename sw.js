/* Bump VERSION on every deploy that changes app files (HTML/CSS/JS/icons/GPX). */
const VERSION = 'v2';
const CACHE = `troodos-${VERSION}`;

const STATIC_ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(STATIC_ASSETS);
    // trip.json + every GPX it references, so routes work offline from the first visit.
    try {
      const res = await fetch('trip.json', { cache: 'no-store' });
      if (res.ok) {
        await cache.put('trip.json', res.clone());
        const trip = await res.json();
        const gpx = (trip.routes || []).map((r) => r.gpx).filter(Boolean);
        await Promise.all(gpx.map((url) => cache.add(url).catch(() => {})));
      }
    } catch { /* offline during install – will be cached on first use */ }
  })());
  // No skipWaiting() here: an updated worker waits until the user taps the update banner.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('troodos-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'CACHE_URLS' && Array.isArray(msg.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(msg.urls.map(async (url) => {
        if (!(await cache.match(url))) await cache.add(url).catch(() => {});
      }));
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Open-Meteo etc. – the app handles offline itself

  if (url.pathname.endsWith('/trip.json')) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) await cache.put('trip.json', res.clone());
    return res;
  } catch {
    const cached = await cache.match('trip.json');
    return cached || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
    return res;
  } catch {
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
