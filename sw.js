// ============================================================
// Packit Service Worker v1.1
// Strategy: Cache-First for app shell, Network-First for CDNs
// ============================================================

const CACHE_NAME   = 'packit-v9';
const SHELL_CACHE  = 'packit-shell-v6';
const CDN_CACHE    = 'packit-cdn-v6';

// App shell – always cached locally
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
];

// CDN resources – cached on first fetch, served from cache when offline
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap',
];

// ---- INSTALL ------------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS)),
      caches.open(CDN_CACHE).then(cache =>
        Promise.allSettled(CDN_ASSETS.map(url =>
          fetch(url, { mode: 'cors' })
            .then(r => r.ok ? cache.put(url, r) : null)
            .catch(() => null) // offline during install – no problem
        ))
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE -----------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH --------------------------------------------------
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // App shell → Cache First
  if (SHELL_ASSETS.some(a => url.endsWith(a.replace('./', '')) || url === location.origin + '/' )) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  // CDN assets → Stale-While-Revalidate
  if (CDN_ASSETS.some(a => url.startsWith(a.split('?')[0])) ||
      url.includes('fonts.gstatic.com') ||
      url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(staleWhileRevalidate(event.request, CDN_CACHE));
    return;
  }

  // Everything else → Network, fall back to cache
  event.respondWith(networkFirst(event.request));
});

// ---- STRATEGIES ---------------------------------------------
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline – Packit läuft trotzdem!', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
    .catch(() => null);

  return cached || await networkPromise || new Response('', { status: 503 });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// ---- UPDATE NOTIFICATION ------------------------------------
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
