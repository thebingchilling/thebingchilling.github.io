/* ═══════════════════════════════════════════════════════════════════════
   Confine the decoy to the player.

   The decoy has to be in place before the embed's own scripts run, and at
   that moment this frame has no idea what tab it is in — it is
   cross-origin to whatever is above it, so it cannot look. It therefore
   goes in first and asks afterwards.

   This asks. The worker can see the tab's own URL, so it is the only side
   that can answer, and it undoes the decoy itself if the answer is no.
   That keeps a source domain embedded on somebody else's site working
   exactly as it would without this extension installed.

   Isolated world: it needs chrome.runtime, and it must not be something
   the page can call.
   ═══════════════════════════════════════════════════════════════════════ */

(() => {
  try {
    /* No reply is expected. The worker either leaves this frame alone or
       reaches back into it to restore window.open. */
    chrome.runtime.sendMessage({ type: "gate" }, () => {
      /* Reading lastError stops "no receiving end" being logged when the
         worker has gone away mid-question. */
      void chrome.runtime.lastError;
    });
  } catch { /* extension unloading */ }
})();
