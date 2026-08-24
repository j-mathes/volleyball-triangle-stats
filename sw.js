"use strict";

// Bump CACHE_VERSION (and APP_VERSION in app.js) whenever any precached file changes
const CACHE_VERSION = 1;
const CACHE_NAME = "triangle-stats-v" + CACHE_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

// Precache all core assets; fail fast if any resource is unavailable
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// Remove caches from any previous version of this SW
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Cache-first with background refresh (stale-while-revalidate).
// Same-origin GET requests only.
self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var networkFetch = fetch(request).then(function (response) {
          // Only cache valid, opaque-free responses
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(function () { /* network unavailable — cached copy already returned */ });

        // Serve cached copy immediately; network fetch updates cache silently
        return cached || networkFetch;
      });
    })
  );
});

// Allow the page to force the waiting SW to activate immediately
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
