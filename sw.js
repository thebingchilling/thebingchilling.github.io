// Bingqilin service worker
// Scope: makes the site installable and gives it an offline-tolerant app
// shell, like a native app. Deliberately narrow: it only ever handles
// same-origin GET requests for the shell itself (HTML/manifest/icons).
// TMDB requests, video-source iframes, fonts, and streaming payloads are
// never intercepted — those must always hit the network live.
const CACHE_VERSION = "bq-shell-v1";
const SHELL_URLS = ["/", "/index.html", "/live", "/live.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (TMDB, embeds, fonts, streams)

  // Navigations: network-first so content stays fresh, falling back to the
  // cached shell when offline instead of a browser error page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // Static shell assets (icons, manifest): cache-first.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
