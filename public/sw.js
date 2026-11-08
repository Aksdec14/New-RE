/*
 * Service worker: app shell + static assets only.
 *
 * It deliberately does NOT cache authenticated HTML or API responses. A POS is
 * often a shared device, and a cached bill or menu from user A must never be
 * served to user B. Offline writes are handled by the IndexedDB queue, not by
 * replaying stale HTML.
 */

const CACHE = "resto-shell-v1";
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigations: network first, offline shell as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Hashed static assets are immutable, so cache-first is safe.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
