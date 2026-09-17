/* ═══════════════════════════════════════════════════════════════════════
   Stop the popup being created, rather than closing it afterwards.

   background.js closes popups once they exist, which works but is visibly
   late: the tab is created, takes focus, paints, and is then removed. You
   see the flash. Nothing an extension does from the service worker can be
   earlier than that, because by the time Chrome tells anyone a tab was
   created, the tab was created.

   The only thing that can refuse a popup *before* it exists is the
   renderer, at the moment the embed calls window.open — and the embed is
   cross-origin, so its window is unreachable from here. What is reachable
   is the <iframe> element it lives in, and an iframe's sandbox attribute
   decides what the document inside is allowed to do. Leave allow-popups
   out and window.open returns null: no tab, no flash, nothing to close.

   The sandbox is applied by patching document.createElement, because the
   attribute has to be on the element before it enters the DOM. The player
   builds each embed with createElement, copies attributes onto it, sets
   src, and only then inserts it — and insertion is what starts the
   navigation. An attribute added any later applies to the next navigation,
   not this one, which is the same as not applying it at all.

   This runs in the MAIN world (it has to patch the page's own
   createElement) and only on the player, which is first-party code. It
   asks for no host permission beyond the one the extension already has.
   The alternative — a content script injected into every frame of every
   site to override window.open — would mean read-and-change access to all
   websites, for a blocker that is supposed to touch exactly one.
   ═══════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* Same list as lib/scope.js. Content scripts are classic scripts and
     cannot import, and matches patterns cannot express "this path but not
     that one", so the check is repeated here. */
  const PLAYER_PATHS = new Set(["/", "/index", "/index.html", "/live", "/live.html"]);
  if (!PLAYER_PATHS.has(location.pathname)) return;

  /* What the embed keeps. Everything a video player legitimately needs:
     its own scripts, its own origin (so its storage and XHR work), forms,
     remote playback, and the pointer/orientation locks a fullscreen player
     uses. Fullscreen itself is not a sandbox token — it rides on the
     allowfullscreen attribute and the allow= policy the page already sets,
     so sandboxing does not touch it.

     What it loses is the whole attack surface this extension exists for:
     allow-popups (window.open, target="_blank"), allow-top-navigation and
     -by-user-activation (the tab-under), allow-modals (alert/confirm spam)
     and allow-downloads (drive-by files).

     allow-scripts with allow-same-origin is normally worth a second look,
     since together they let a document clear its own sandbox — but only a
     document that is same-origin with the page applying it. The embed is
     cross-origin by definition, so it cannot reach this attribute. */
  const SANDBOX = [
    "allow-scripts",
    "allow-same-origin",
    "allow-forms",
    "allow-presentation",
    "allow-orientation-lock",
    "allow-pointer-lock",
  ].join(" ");

  const stamp = (el) => {
    try {
      if (el && el.tagName === "IFRAME" && !el.hasAttribute("sandbox")) {
        el.setAttribute("sandbox", SANDBOX);
      }
    } catch { /* not ours to break */ }
  };

  try {
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function (tagName, options) {
      const el = createElement.call(this, tagName, options);
      if (typeof tagName === "string" && tagName.toLowerCase() === "iframe") stamp(el);
      return el;
    };
  } catch { /* leave the page alone if it cannot be patched */ }

  /* The frame in the page's own markup is parsed, not created, so the
     patch above never sees it. It ships with src="" and so never navigates
     on its own — but the player copies its attributes onto every embed it
     builds, so stamping it keeps the two paths agreeing. */
  const stampParsed = () => {
    try { document.querySelectorAll("iframe").forEach(stamp); } catch { /* none yet */ }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", stampParsed, { once: true });
  } else {
    stampParsed();
  }
})();
