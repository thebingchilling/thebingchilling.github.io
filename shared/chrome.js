/* ═══════════════════════════════════════════════════════════════════════
   Bingqilin shared chrome — ripple feedback + theme toggle logic used by
   every page. Pairs with /shared/chrome.css (the visual half) and
   /shared/theme-init.js (the pre-paint flash-avoidance snippet in <head>).

   Kept deliberately small and dependency-free (a single global, BQChrome)
   since these pages ship no build step — every page just does:
     <script src="/shared/chrome.js"></script>
   then calls what it needs.
   ═══════════════════════════════════════════════════════════════════════ */
window.BQChrome = (function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ── Ripple: Material state-layer touch feedback — see chrome.css for
     the full rationale. `selector` is page-specific (different pages
     ripple different elements), the spawn mechanism itself is not. ── */
  function initRipple(selector) {
    function spawnRipple(el, x, y) {
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.8;
      const span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (x - rect.left - size / 2) + "px";
      span.style.top  = (y - rect.top  - size / 2) + "px";
      el.appendChild(span);
      span.addEventListener("animationend", () => span.remove(), { once: true });
    }
    document.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest(selector);
      if (!el || el.disabled) return;
      spawnRipple(el, e.clientX, e.clientY);
    }, { passive: true });
  }

  /* ── Theme: System → Light → Dark → System, one button. "System" (no
     saved choice) does nothing beyond removing the attribute — the
     @media (prefers-color-scheme) CSS in each page's own <style> handles
     that case with zero JS. ── */
  const THEME_KEY    = "bq_theme";
  const THEME_ORDER  = ["system", "light", "dark"];
  const THEME_ICONS  = { system: "brightness_auto", light: "light_mode", dark: "dark_mode" };
  const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };
  // Both the top bar and bottom nav are themed to --md-surface-container
  // (see shared/chrome.css), so this single theme-color value reads as a
  // continuation of both — the OS status bar matches the top bar above it,
  // and (via edge-to-edge safe-area-inset layout, since there's no
  // separate web API to tint the OS gesture/nav bar independently) the
  // system nav bar reads as a continuation of the app's bottom nav below.
  const SURFACE_LIGHT = "#f7ebdd", SURFACE_DARK = "#241e18";
  const systemDarkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function syncThemeColorMeta() {
    const meta = $("themeColorMeta");
    if (!meta) return;
    const attr = document.documentElement.getAttribute("data-theme");
    const isDark = attr === "dark" || (attr !== "light" && !!(systemDarkMQ && systemDarkMQ.matches));
    meta.setAttribute("content", isDark ? SURFACE_DARK : SURFACE_LIGHT);
  }
  if (systemDarkMQ && systemDarkMQ.addEventListener) {
    systemDarkMQ.addEventListener("change", () => {
      if (!document.documentElement.hasAttribute("data-theme")) syncThemeColorMeta();
    });
  }
  function applyTheme(pref) {
    if (pref === "light" || pref === "dark") document.documentElement.setAttribute("data-theme", pref);
    else document.documentElement.removeAttribute("data-theme");
    syncThemeColorMeta();
  }
  function updateThemeToggleUI(pref) {
    const icon = $("themeToggleIcon");
    if (icon) icon.textContent = THEME_ICONS[pref] || THEME_ICONS.system;
    const btn = $("themeToggleBtn");
    if (btn) btn.setAttribute("aria-label", "Theme: " + (THEME_LABELS[pref] || "System") + " (tap to change)");
  }

  /* initTheme(options)
     - options.resolvePref(): optional, sync or async, returns the initial
       preference. Defaults to a plain localStorage read. Pages that also
       check an external store (e.g. the Claude artifact key/value store)
       pass their own resolver here instead of duplicating this whole file.
     - options.onChange(pref): optional, called after every theme change
       (initial load included) once the icon/meta are already in sync, for
       any extra page-specific UI a page needs to keep in sync (e.g. a
       Settings-sheet segmented control) — most pages don't need this. */
  function initTheme(options) {
    const opts = options || {};
    function setThemePref(pref) {
      applyTheme(pref);
      updateThemeToggleUI(pref);
      try { localStorage.setItem(THEME_KEY, pref); } catch (e) {}
      if (opts.onChange) opts.onChange(pref);
    }
    const defaultResolvePref = () => {
      try { return localStorage.getItem(THEME_KEY) || "system"; } catch (e) { return "system"; }
    };
    Promise.resolve((opts.resolvePref || defaultResolvePref)()).then((pref) => {
      pref = pref || "system";
      applyTheme(pref);
      updateThemeToggleUI(pref);
      if (opts.onChange) opts.onChange(pref);
    });
    const btn = $("themeToggleBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "system";
        const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
        setThemePref(next);
      });
    }
    return { setThemePref };
  }

  /* ── Update toast: sw.js calls skipWaiting()+clients.claim() on every
     new deploy, so a new service worker silently takes over in the
     background — but the already-loaded page keeps running on whatever
     shell it started with until reloaded. Without this, "why isn't it
     updating" is the only outcome a manual hard-reload can fix. A
     `controllerchange` after this page's own load already had a
     controller is exactly that "new build took over" signal; the very
     first-ever install (no prior controller) also fires it once but
     isn't a real update, so it's ignored. ── */
  function watchForUpdate() {
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let shown = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || shown) return;
      shown = true;
      showUpdateToast();
    });
  }
  function showUpdateToast() {
    if ($("bqUpdateToast")) return;
    const toast = document.createElement("div");
    toast.id = "bqUpdateToast";
    toast.className = "update-toast";
    toast.hidden = true; // starts in the [hidden] transition-in state, see chrome.css
    toast.setAttribute("role", "status");
    toast.innerHTML =
      '<span class="update-toast__text">Update available</span>' +
      '<button type="button" class="update-toast__btn">Reload</button>';
    toast.querySelector(".update-toast__btn").addEventListener("click", () => location.reload());
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => { toast.hidden = false; }));
  }

  return { initRipple, initTheme, syncThemeColorMeta, watchForUpdate };
})();
