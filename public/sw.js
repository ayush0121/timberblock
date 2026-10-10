/**
 * Service worker: makes Timberblock installable and playable offline.
 *
 * Strategy:
 *   - navigations      -> network first, fall back to the cached shell
 *   - same-origin GETs -> stale-while-revalidate
 *   - /api/*           -> straight to the network, never cached (leaderboards
 *                         and leagues must be live, not one load behind)
 *   - everything else  -> straight to the network, never cached
 *
 * Bump CACHE on every deploy (the build writes the version in for you if you
 * wire it up; otherwise change it by hand) so old assets are dropped.
 */
const CACHE = "timberblock-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // fonts, ads: never cache
  if (url.pathname.startsWith("/api/")) return;       // live data: never cache

  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  e.respondWith(
    caches.match(request).then((hit) => {
      const net = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
