/* ═══════════════════════════════════════════════════════════════════════
   The player page's line to the worker. Two jobs.

   1. Hold a port open. A service worker is evicted after ~30s idle, so
      left alone a popup is what wakes it — Chrome has to start the worker
      before anything can close anything, and the popup is on screen for
      all of it. An open port keeps it resident while a player tab is.

   2. Report which origins the configured sources point at, so the worker
      can stub window.open inside them. The list is read from the page's
      own storage every time, never hardcoded: sources get renewed, and a
      list baked into the extension would be wrong by the next rotation.
      Reported again whenever it changes, so adding a source in Settings
      is picked up without reinstalling anything.

   Nothing here touches the page. Isolated world, no DOM, no globals — it
   reads a storage key, opens a port, and goes quiet.
   ═══════════════════════════════════════════════════════════════════════ */

(() => {
  const PLAYER_PATHS = new Set(["/", "/index", "/index.html", "/live", "/live.html"]);
  if (!PLAYER_PATHS.has(location.pathname)) return;

  /* Where the player keeps them. A device set up from the managed link
     plays from bq_managed ({ origin, key, data: { media: [...] } }, see
     /shared/feed.js) and ignores bq_sources entirely, so that one wins
     whenever it is there; bq_sources is the hand-added list. Both are
     plain localStorage on the real site. */
  const SOURCES_KEY = "bq_sources";
  const MANAGED_KEY = "bq_managed";

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  /* The list the player is actually using, by the same rule it uses. */
  function currentSources() {
    const managed = readJson(MANAGED_KEY);
    if (managed && typeof managed.origin === "string" && typeof managed.key === "string") {
      return Array.isArray(managed.data?.media) ? managed.data.media : [];
    }
    const own = readJson(SOURCES_KEY);
    return Array.isArray(own) ? own : [];
  }

  /* A source URL is a template ("https://host/embed/movie/{tmdb}"), and
     the braces sit in the path, so it parses as a URL like any other.
     Only the origin is wanted; the path is none of the extension's
     business and is not sent anywhere. */
  function readSourceOrigins() {
    const origins = new Set();
    for (const src of currentSources()) {
      for (const field of ["movie_url", "tv_url"]) {
        const value = src?.[field];
        if (typeof value !== "string" || !value) continue;
        try {
          const { protocol, origin } = new URL(value);
          // Only schemes an extension can be granted in the first place.
          if (protocol === "https:" || protocol === "http:") origins.add(origin);
        } catch { /* not a URL yet — half-typed in Settings */ }
      }
    }
    return [...origins];
  }

  let port = null;
  let lastSent = "";

  function send() {
    const origins = readSourceOrigins();
    const key = origins.slice().sort().join(" ");
    if (key === lastSent) return;      // nothing changed; stay quiet
    try {
      port?.postMessage({ type: "sources", origins });
      lastSent = key;
    } catch { /* reconnecting */ }
  }

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "player-tab" });
      lastSent = "";                   // a new worker knows nothing yet
      send();
      /* The worker is replaced on every extension update or reload, which
         drops the port. Reconnect rather than leaving the tab unprotected
         for as long as it stays open. */
      port.onDisconnect.addListener(() => {
        port = null;
        setTimeout(connect, 1000);
      });
    } catch {
      /* Extension unloading. Nothing to keep alive for. */
    }
  }

  connect();

  /* Sources edited in another tab. */
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key === SOURCES_KEY || e.key === MANAGED_KEY) send();
  });

  /* Traffic on the port resets the idle timer, and the same tick catches
     an edit made in this tab, which fires no storage event. 20s against a
     30s timeout leaves room for a slow wake without ever letting it lapse. */
  setInterval(() => {
    try { port?.postMessage({ type: "ping" }); } catch { /* reconnecting */ }
    send();
  }, 20000);
})();
