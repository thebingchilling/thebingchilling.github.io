// Bingqilin service worker
// Scope: makes the site installable and gives it an offline-tolerant app
// shell, like a native app. Deliberately narrow: it only ever handles
// same-origin GET requests for the shell itself (HTML/manifest/icons/
// vendored fonts under /shared/fonts/). TMDB requests, video-source
// iframes, and streaming payloads are never intercepted — those must
// always hit the network live.
const CACHE_VERSION = "bq-shell-v18";
const SHELL_URLS = [
  "/", "/index.html", "/live", "/live.html", "/tools/", "/tools/index.html",
  "/tools/authenticator/", "/tools/currency/", "/tools/pdf/",
  "/tools/saucenao/", "/tools/torrents/", "/tools/typerip/", "/tools/warp/",
  "/manifest.webmanifest",
  "/shared/tokens.css", "/shared/chrome.css", "/shared/ui.css",
  "/shared/chrome.js", "/shared/theme-init.js", "/shared/feed.js",
];

// cache.addAll() is all-or-nothing: one URL that 404s rejects the whole
// promise, and the .catch() that kept a bad deploy from breaking install
// silently threw away every other entry with it — no offline shell at
// all, and nothing anywhere to say so. Precaching each URL on its own
// means a typo costs that one file instead of the lot.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(SHELL_URLS.map((url) =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => {})
      ))
    ).catch(() => {})
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

  // Only ever cache a response that actually succeeded. A 404 or a 5xx
  // from a bad deploy is still a Response, and caching it pins the broken
  // version in place until the next CACHE_VERSION bump. Opaque responses
  // (status 0) can't be inspected, so they're not cached either.
  const cacheable = (res) => res && res.ok && res.type !== "opaque";
  const putInCache = (request, res) => {
    if (!cacheable(res)) return;
    const copy = res.clone();
    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
  };

  // Navigations: network-first so content stays fresh, falling back to the
  // cached shell when offline instead of a browser error page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { putInCache(req, res); return res; })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // Static shell assets (icons, manifest, shared chrome CSS/JS):
  // stale-while-revalidate, NOT plain cache-first.
  //
  // Cache-first here meant a shared asset, once cached, was served from
  // that cache forever — the only way to ship a change to a returning
  // visitor was to remember to bump CACHE_VERSION in this file in the same
  // commit. That is exactly what stopped happening: seven consecutive
  // commits reworked /shared/*.css while CACHE_VERSION sat at v12, so
  // every returning visitor kept seeing the pre-redesign stylesheet with
  // no way to ever get the new one.
  //
  // Serving the cached copy immediately keeps the instant, offline-capable
  // load that made cache-first attractive; revalidating in the background
  // means the next load picks the change up on its own. Correctness no
  // longer depends on remembering to bump a constant by hand.
  //
  // /tools/<tool>/vendor/* is in here for the same reason. The tools page
  // sells these as utilities that "run entirely on your device", but the
  // engines that make that true — qpdf's wasm, the QR decoder, JSZip, the
  // curve25519 and QR-code generators — were fetched from the network on
  // every single run, so the PDF and authenticator tools were exactly the
  // ones that broke with no signal. They are cached on first use rather
  // than precached in SHELL_URLS on install: qpdf.wasm alone is 1.3 MB,
  // and most visitors never open that tool.
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/shared/") ||
      url.pathname === "/manifest.webmanifest" || /^\/tools\/[^/]+\/vendor\//.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => { putInCache(req, res); return res; });
        // With a cached copy in hand a failed revalidation is a non-event
        // (we're offline, and the cached asset is what we're serving
        // anyway) — swallow it so it doesn't surface as an unhandled
        // rejection. With no cached copy, the network result is all there
        // is, so its failure has to propagate.
        if (cached) { network.catch(() => {}); return cached; }
        return network;
      })
    );
  }
});
