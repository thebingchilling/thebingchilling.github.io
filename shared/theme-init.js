// Runs before first paint so a saved manual Light/Dark choice applies
// immediately instead of flashing the system-default theme first.
// "System" (no saved choice) intentionally does nothing here — the
// @media (prefers-color-scheme) CSS in each page's own <style> handles
// that case with zero JS. Loaded as a blocking <script src> in <head>,
// same effect as an inline script since the parser still waits for it.
try {
  var t = localStorage.getItem("bq_theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
