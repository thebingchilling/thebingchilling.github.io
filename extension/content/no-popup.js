/* ═══════════════════════════════════════════════════════════════════════
   Hand the embed a window that isn't one.

   Registered at runtime against the origins of whatever sources are
   configured — never a hardcoded list, and never a site the user has not
   granted. It runs in the MAIN world of those frames, because the thing
   it replaces is the page's own window.open.

   Why a decoy rather than a refusal: a source that will not play under a
   sandbox is detecting that window.open *failed*. Returning null, throwing,
   or being sandboxed all look identical to it. So this returns something
   truthy and well-behaved, and simply never opens anything. Nothing is
   created, so there is no tab to close and no flash to see.

   The shape below is what popup scripts actually touch. Most do:

       var w = window.open(url, "_blank");
       if (!w || w.closed) { ...fall back to redirecting your tab... }
       w.focus();

   so `closed` staying false matters as much as the object existing — a
   decoy that reports itself closed just pushes them to the tab-under.
   ═══════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* Only inside a frame. A top-level visit to one of these domains is the
     user going there deliberately, and their popups are their business. */
  if (window === window.top) return;

  const noop = function () {};

  const makeWindow = () => {
    let closed = false;

    /* document.write() is how a blank popup gets its ad. Accepting and
       discarding it is the whole point. */
    const doc = {
      write: noop, writeln: noop, open: noop, close: noop,
      body: null, documentElement: null, cookie: "",
      createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
      getElementById: () => null, querySelector: () => null,
      addEventListener: noop, removeEventListener: noop,
    };

    const location = {
      href: "about:blank", protocol: "about:", host: "", hostname: "",
      pathname: "blank", search: "", hash: "",
      replace: noop, assign: noop, reload: noop,
      toString: () => "about:blank",
    };

    const win = {
      closed: false, opener: null, name: "", document: doc, location,
      focus: noop, blur: noop, print: noop, stop: noop,
      postMessage: noop, addEventListener: noop, removeEventListener: noop,
      close: () => { closed = true; },
      /* Some scripts test w.self === w or w.window === w to decide it is a
         real window before using it. Cheap to satisfy. */
      get self() { return proxy; },
      get window() { return proxy; },
      get top() { return proxy; },
      get parent() { return proxy; },
    };

    /* A plain object throws on anything unanticipated, and a throw inside
       the opener's code can take the player down with it. The proxy makes
       every unknown property a no-op function instead, and swallows every
       assignment (w.location = "...", w.opener = null, w.onload = fn). */
    const proxy = new Proxy(win, {
      get(target, key) {
        if (key === "closed") return closed;
        if (key in target) return target[key];
        return noop;
      },
      set() { return true; },
      has() { return true; },
    });

    return proxy;
  };

  try {
    const open = window.open;

    /* Kept so the worker can undo this. The decoy goes in immediately —
       waiting to find out whether this frame is inside a player tab would
       be a race the embed could win — and is taken out again a moment
       later if it turns out not to be. content/no-popup-gate.js asks; the
       worker answers by running restore below in this frame.

       Undoing is done from the extension rather than by listening for an
       event, because an event the page can see is an event the page can
       fire. */
    Object.defineProperty(window, "__bqRestoreOpen", {
      configurable: true,
      enumerable: false,
      value: function () {
        try {
          Object.defineProperty(window, "open", {
            configurable: true, writable: true, value: open,
          });
        } catch { /* already gone */ }
      },
    });

    Object.defineProperty(window, "open", {
      configurable: true,
      writable: true,
      value: function () { return makeWindow(); },
    });
    /* Keep it looking native: a script that prints window.open should not
       see a giveaway body. */
    try {
      window.open.toString = () => open.toString();
    } catch { /* non-fatal */ }
  } catch { /* locked down; leave the page as it is */ }
})();
