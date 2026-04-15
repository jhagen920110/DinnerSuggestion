const CACHE_NAME = "dinner-v1";
const STATIC_ASSETS = [
  "/index.html",
  "/style.css",
  "/config.js",
  "/app.js",
  "/images/jjigae-favicon.ico",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first — always try fresh, fall back to cache when offline
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API calls and cross-origin requests
  if (url.pathname.startsWith("/api") || url.hostname !== location.hostname) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh version
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
