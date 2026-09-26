/* ═══════════════════════════════════════════════════════════════════════
   Managed sources — shared by index.html and live.html.

   Once a device is managed, both pages take their sources from here
   instead of from what was added by hand, and follow it exactly: each
   page load refreshes it, and a refusal clears it, putting the device
   back on its own sources.

   Stored under one key: { origin, key, data }. The data is cached so a
   page still has its sources when the network doesn't answer.
   ═══════════════════════════════════════════════════════════════════════ */
window.BQFeed = (function () {
  "use strict";

  const ORIGIN_SHA256 = "d93369814adc6331a8a2d2ddf579e9678752078d5a8afe537e7c373aacbeb338";
  const STORE_KEY = "bq_managed";
  const TIMEOUT_MS = 6000;

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY));
      return v && typeof v.origin === "string" && typeof v.key === "string" ? v : null;
    } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function fetchWithTimeout(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try { return await fetch(url, { ...options, signal: ctrl.signal, cache: "no-store", credentials: "omit" }); }
    finally { clearTimeout(timer); }
  }

  // Everything that comes back is treated as untrusted: strings only, and
  // only http(s) URLs, the same bar a hand-added source has to clear.
  const isHttp = (s) => typeof s === "string" && /^https?:\/\//i.test(s.trim());
  function normalise(raw) {
    const media = (raw && Array.isArray(raw.media) ? raw.media : [])
      .filter((s) => s && typeof s.name === "string" && s.name.trim() && isHttp(s.movie_url))
      .map((s) => ({ name: s.name.trim(), movie_url: s.movie_url.trim(), tv_url: isHttp(s.tv_url) ? s.tv_url.trim() : null }));
    const l = raw && raw.live ? raw.live : {};
    const urls = (a) => (Array.isArray(a) ? a.filter(isHttp).map((s) => s.trim()) : []);
    return { media, live: { tv: urls(l.tv), radio: urls(l.radio), epg: isHttp(l.epg) ? l.epg.trim() : "" } };
  }

  async function load(origin, key) {
    const res = await fetchWithTimeout(origin + "/api/feed", { headers: { authorization: "Bearer " + key } });
    if (res.status === 401 || res.status === 403) return { refused: true };
    if (!res.ok) throw new Error(String(res.status));
    return { data: normalise(await res.json()) };
  }

  /* Resolves true if `value` made this device managed. Anything else —
     an ordinary URL, a wrong passphrase, no network — resolves false, and
     the caller carries on exactly as it would have. */
  async function claim(value) {
    let u;
    try { u = new URL(String(value || "").trim()); } catch (e) { return false; }
    if (u.hash.length < 2 || !window.crypto || !crypto.subtle) return false;
    if ((await sha256Hex(u.origin)) !== ORIGIN_SHA256) return false;
    let pass = u.hash.slice(1);
    try { pass = decodeURIComponent(pass); } catch (e) { /* keep it as typed */ }
    try {
      const res = await fetchWithTimeout(u.origin + "/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      if (!res.ok) return false;
      const out = await res.json();
      if (!out || typeof out.key !== "string") return false;
      const got = await load(u.origin, out.key);
      if (!got.data) return false;
      write({ origin: u.origin, key: out.key, data: got.data });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* The current managed data, fresh if the network answers, cached if it
     doesn't, or null if this device isn't managed (or no longer is). */
  async function refresh() {
    const v = read();
    if (!v) return null;
    try {
      const got = await load(v.origin, v.key);
      if (got.refused) { clear(); return null; }
      write({ ...v, data: got.data });
      return got.data;
    } catch (e) {
      return v.data ? normalise(v.data) : null;
    }
  }

  /* Claims on paste, so the link doesn't wait on Save. Only for the
     add-source fields each page passes in — nowhere else. The paste goes
     through as normal either way: these fields do nothing with a value
     until Save, so there is nothing to hold it back from, and a link that
     turns out not to be one is just what was pasted. */
  function watch(input, onClaimed) {
    let pending = false;
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData ? e.clipboardData.getData("text") : "";
      if (pending || !text.includes("#")) return;
      pending = true;
      claim(text).then((ok) => { if (ok) onClaimed(); }).finally(() => { pending = false; });
    });
  }

  function active() { return !!read(); }
  function cached() { const v = read(); return v && v.data ? normalise(v.data) : null; }

  return { claim, watch, refresh, active, cached, clear };
})();
