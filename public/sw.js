// Service Worker for CBRL Website
//
// Scope is deliberately narrow: content-hashed build assets and images, both of
// which are safe to serve cache-first forever because their URLs change when
// their bytes do. HTML documents and RSC payloads are never cached — see the
// fetch handler for why.

const STATIC_CACHE = 'cbrl-static-v2';
const IMAGE_CACHE = 'cbrl-images-v2';
const CURRENT_CACHES = [STATIC_CACHE, IMAGE_CACHE];

// No precache list. Everything this worker serves is either content-hashed or
// already covered by the long-lived Cache-Control headers set in
// next.config.js, so the caches fill from real traffic instead. The previous
// list also could not work: cache.addAll() rejects atomically, and it named
// routes and stylesheet paths that do not exist in the build.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !CURRENT_CACHES.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      // Claiming immediately matters on this activation in particular: it
      // evicts the previous worker, which was serving cached HTML.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Only these two cases are intercepted. Everything else — documents, RSC
  // payloads, /public data files — falls through to the network untouched.
  //
  // Caching documents is what made the old worker harmful: a returning visitor
  // was served the previous deploy's HTML, so new publications never appeared,
  // and that HTML referenced content-hashed chunks the server no longer had.
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);

  if (response.ok && response.type === 'basic') {
    // Write in the background so the response is not held up by storage.
    cache.put(request, response.clone()).catch(() => {
      /* Quota errors are not worth failing the request over. */
    });
  }

  return response;
}
