/* ═══════════════════════════════════════════════════════════════════════
   Hold a port open while a player tab is open.

   Two jobs, both about how fast a popup can be closed.

   A service worker is evicted after ~30 seconds idle. Left alone, the
   popup itself is what wakes it: Chrome has to start the worker, run it,
   and only then does the close happen — and the popup is on screen for
   all of it. An open port keeps the worker resident, so by the time a
   popup exists there is already something running to close it.

   It also tells the worker this tab is a player tab, which saves the
   round trip to chrome.tabs.get that the close used to wait on.

   Nothing here touches the page. It runs in the isolated world, adds no
   DOM, defines no globals, and is invisible to the page and to the embed
   inside it — it opens a port and goes quiet.
   ═══════════════════════════════════════════════════════════════════════ */

(() => {
  const PLAYER_PATHS = new Set(["/", "/index", "/index.html", "/live", "/live.html"]);
  if (!PLAYER_PATHS.has(location.pathname)) return;

  let port = null;

  const connect = () => {
    try {
      port = chrome.runtime.connect({ name: "player-tab" });
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
  };

  connect();

  /* Traffic on the port resets the idle timer. 20s against a 30s timeout
     leaves room for a slow wake without ever letting it lapse. */
  setInterval(() => {
    try { port?.postMessage({ t: Date.now() }); } catch { /* reconnecting */ }
  }, 20000);
})();
