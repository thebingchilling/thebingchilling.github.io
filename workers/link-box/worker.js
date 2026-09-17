/* Bingqilin Link Box — a standalone Worker, unrelated to the GitHub Pages
   deploy of the rest of this site. A box per media/live source: paste a
   link (or a whole multi-line config block) in, Save, hit Copy when you
   need it in the main site's own importer.

   One file on purpose: the page is inlined rather than served as a static
   asset, so the exact same file can be pasted into the Cloudflare
   dashboard's editor AND deployed with `wrangler deploy`. Splitting it
   into src/ + public/ meant two copies of the page to keep in sync.

   No auth: anyone with the URL can read and overwrite everything here. */

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Bingqilin Links</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<!-- Unauthenticated, so keep it out of search results at least. -->
<meta name="robots" content="noindex, nofollow" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>%F0%9F%8D%A6</text></svg>" />
<!-- Styling comes from the main site's shared design system. Stylesheets
     and classic scripts load cross-origin without CORS; the icon font
     does need it (GitHub Pages sends Access-Control-Allow-Origin: *). If
     that ever stops being true the buttons show their ligature names
     ("delete", "save") instead of glyphs — the app still works. -->
<script src="https://thebingchilling.github.io/shared/theme-init.js"></script>
<link rel="stylesheet" href="https://thebingchilling.github.io/shared/tokens.css" />
<link rel="stylesheet" href="https://thebingchilling.github.io/shared/chrome.css" />
<link rel="stylesheet" href="https://thebingchilling.github.io/shared/ui.css" />
<style>
  .app-main { max-width: 1100px; margin: 0 auto; padding: 1rem 1rem 3rem; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0.75rem 0; }
  .grid--links { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.75rem; }
  .link-card { display: flex; flex-direction: column; gap: 0.5rem; }
  .link-card__row { display: flex; align-items: center; gap: 0.4rem; }
  .link-card__kind {
    font: var(--type-label-medium); letter-spacing: var(--track-label-medium);
    color: var(--md-on-secondary-container); background: var(--md-secondary-container);
    border-radius: var(--shape-full); padding: 0.15rem 0.6rem;
  }
  .link-card__flag {
    margin-left: auto;
    font: var(--type-label-medium); letter-spacing: var(--track-label-medium);
    color: var(--text-faint);
  }
  /* .textarea ships at 130px; these boxes hold whole config blocks. */
  .link-card .textarea { min-height: 220px; }
  .link-card__actions { display: flex; gap: 0.35rem; justify-content: flex-end; margin-top: 0.15rem; }
</style>
</head>
<body>
<div class="app">
  <header class="top-bar">
    <div class="top-bar__brand">
      <span class="top-bar__name">🍦 Bingqilin Links</span>
    </div>
    <div class="top-bar__actions">
      <button id="themeToggleBtn" class="icon-btn" type="button" aria-label="Theme: System (tap to change)" title="Theme">
        <span class="material-icons" aria-hidden="true" id="themeToggleIcon">brightness_auto</span>
      </button>
    </div>
  </header>

  <main class="app-main">
    <div class="segmented" id="kindTabs" role="tablist" aria-label="Kind">
      <button class="segmented__item segmented__item--active" type="button" role="tab" aria-selected="true" aria-controls="grid" data-kind="media">
        <span class="material-icons" aria-hidden="true">movie</span>Media
      </button>
      <button class="segmented__item" type="button" role="tab" aria-selected="false" aria-controls="grid" data-kind="live">
        <span class="material-icons" aria-hidden="true">live_tv</span>Live
      </button>
    </div>

    <div id="errorBanner" class="error-banner hidden">
      <span class="material-icons" aria-hidden="true">error_outline</span>
      <div>
        <p class="error-banner__title">Couldn't reach the store</p>
        <p class="error-banner__body" id="errorBannerBody"></p>
        <div class="error-banner__actions">
          <button id="retryBtn" class="btn btn--sm" type="button">Retry</button>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <span id="countLabel" class="field-hint"></span>
      <button id="addBtn" class="btn btn--primary btn--sm" type="button">
        <span class="material-icons" aria-hidden="true">add</span>Add box
      </button>
    </div>

    <div id="grid" class="grid--links" role="tabpanel"></div>

    <div id="emptyState" class="empty-state hidden">
      <span class="material-icons empty-state__icon" aria-hidden="true">link_off</span>
      <div class="empty-state__title">No links yet</div>
      <div class="empty-state__sub">Add a box and paste a source into it.</div>
    </div>
  </main>
</div>

<script src="https://thebingchilling.github.io/shared/chrome.js"></script>
<script>
"use strict";
const $ = (id) => document.getElementById(id);

/* chrome.js comes from another origin, so treat it as optional polish:
   ripple, theming and snackbars degrade, but the boxes keep working. */
const BQ = window.BQChrome || null;
if (BQ) {
  BQ.initRipple(".icon-btn, .btn, .link-card, .segmented__item");
  BQ.initTheme({});
}
function toast(message) {
  if (BQ) BQ.snackbar(message);
}
function confirmDelete(text) {
  if (BQ) return BQ.confirm({ title: "Delete this box?", body: text, confirmLabel: "Delete", danger: true });
  return Promise.resolve(window.confirm("Delete this box?"));
}

let activeKind = "media";
/* Server shape is { id, kind, url }. A box may also carry an in-memory
   draft (edited, not yet saved) and a null id (never saved at all). */
let boxes = [];

const tabs = Array.from(document.querySelectorAll("#kindTabs [role=tab]"));
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.classList.toggle("segmented__item--active", on);
    });
    activeKind = tab.dataset.kind;
    render();
  });
});

function isDirty(box) {
  return box.draft !== undefined && box.draft !== box.url;
}

async function api(path, options) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options && options.headers) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.status + " " + res.statusText);
  }
  return res.json();
}

async function loadBoxes() {
  try {
    boxes = await api("/items");
    $("errorBanner").classList.add("hidden");
  } catch (e) {
    // Persistent, not a snackbar that vanishes — an unbound KV namespace
    // lands here and the page would otherwise just look empty.
    $("errorBannerBody").textContent = e.message;
    $("errorBanner").classList.remove("hidden");
  }
  render();
}

function render() {
  const grid = $("grid");
  grid.innerHTML = "";
  const visible = boxes.filter((b) => b.kind === activeKind);
  $("countLabel").textContent = visible.length + (visible.length === 1 ? " box" : " boxes");
  $("emptyState").classList.toggle("hidden", visible.length > 0);
  visible.forEach((box) => grid.appendChild(renderCard(box)));
}

function renderCard(box) {
  const card = document.createElement("div");
  card.className = "card link-card";

  const row = document.createElement("div");
  row.className = "link-card__row";
  const kindChip = document.createElement("span");
  kindChip.className = "link-card__kind";
  kindChip.textContent = box.kind === "live" ? "Live" : "Media";
  const flag = document.createElement("span");
  flag.className = "link-card__flag";
  const delBtn = document.createElement("button");
  delBtn.className = "icon-btn icon-btn--sm";
  delBtn.type = "button";
  delBtn.setAttribute("aria-label", "Delete");
  delBtn.innerHTML = '<span class="material-icons" aria-hidden="true">delete</span>';
  row.append(kindChip, flag, delBtn);

  const urlInput = document.createElement("textarea");
  urlInput.className = "textarea";
  urlInput.placeholder = "Paste a source URL, or a whole config block";
  urlInput.setAttribute("aria-label", box.kind === "live" ? "Live source" : "Media source");
  // Drafts survive re-renders, so deleting one box or switching tabs no
  // longer throws away what you were typing in another.
  urlInput.value = box.draft !== undefined ? box.draft : box.url;

  const actions = document.createElement("div");
  actions.className = "link-card__actions";
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn--ghost btn--sm";
  copyBtn.type = "button";
  copyBtn.innerHTML = '<span class="material-icons" aria-hidden="true">content_copy</span>Copy';
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn--primary btn--sm";
  saveBtn.type = "button";
  saveBtn.innerHTML = '<span class="material-icons" aria-hidden="true">save</span>Save';
  actions.append(copyBtn, saveBtn);

  card.append(row, urlInput, actions);

  function syncFlag() {
    if (box.id === null) flag.textContent = "Not saved";
    else if (isDirty(box)) flag.textContent = "Unsaved changes";
    else flag.textContent = "";
  }
  syncFlag();

  urlInput.addEventListener("input", () => {
    box.draft = urlInput.value;
    syncFlag();
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(urlInput.value);
      toast("Copied to clipboard");
    } catch (e) {
      urlInput.select();
      toast("Couldn't copy — text selected, copy manually");
    }
  });

  saveBtn.addEventListener("click", async () => {
    // Guards against a double-click on a new box POSTing twice and
    // leaving an orphaned duplicate behind.
    saveBtn.disabled = true;
    const payload = { url: urlInput.value, kind: box.kind };
    try {
      if (box.id) {
        await api("/items/" + box.id, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        const created = await api("/items", { method: "POST", body: JSON.stringify(payload) });
        box.id = created.id;
      }
      box.url = payload.url;
      delete box.draft;
      syncFlag();
      toast("Saved");
    } catch (e) {
      toast("Save failed: " + e.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  delBtn.addEventListener("click", async () => {
    const preview = urlInput.value.trim().slice(0, 80) || "This box is empty.";
    if (!(await confirmDelete(preview))) return;
    if (box.id) {
      try { await api("/items/" + box.id, { method: "DELETE" }); }
      catch (e) { toast("Delete failed: " + e.message); return; }
    }
    boxes = boxes.filter((b) => b !== box);
    render();
  });

  return card;
}

$("addBtn").addEventListener("click", () => {
  boxes.push({ id: null, kind: activeKind, url: "", draft: "" });
  render();
});

$("retryBtn").addEventListener("click", loadBoxes);

window.addEventListener("beforeunload", (e) => {
  if (boxes.some((b) => isDirty(b) || (b.id === null && b.draft))) {
    e.preventDefault();
    e.returnValue = "";
  }
});

loadBoxes();
<\/script>
</body>
</html>`;

/* Cap generous enough for a pasted playlist, but not so large that one box
   can eat the 25 MiB KV value limit. Oversize is rejected, never silently
   truncated — losing the tail of a link without saying so is worse. */
const MAX_LEN = 100000;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init && init.headers) },
  });
}

async function readBoxes(env) {
  const raw = await env.LINKS.get("boxes");
  return raw ? JSON.parse(raw) : [];
}

async function writeBoxes(env, boxes) {
  await env.LINKS.put("boxes", JSON.stringify(boxes));
}

function sanitizeKind(kind) {
  return kind === "live" ? "live" : "media";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response(PAGE_HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    }

    // Without this the binding mistake surfaces as an opaque 500.
    if (!env.LINKS) {
      return json({ error: "No KV namespace bound. Add a KV binding named exactly LINKS in the Worker's settings." }, { status: 500 });
    }

    const parts = url.pathname.split("/").filter(Boolean); // ["api", "items", ":id"?]
    if (parts[1] !== "items") return json({ error: "not found" }, { status: 404 });
    const id = parts[2];

    if (request.method === "GET" && !id) {
      return json(await readBoxes(env));
    }

    if (request.method === "POST" && !id) {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, { status: 400 }); }
      const link = String(body.url || "");
      if (link.length > MAX_LEN) return json({ error: "too long — " + link.length + " characters, limit is " + MAX_LEN }, { status: 413 });
      const box = { id: crypto.randomUUID(), kind: sanitizeKind(body.kind), url: link };
      const boxes = await readBoxes(env);
      boxes.push(box);
      await writeBoxes(env, boxes);
      return json(box, { status: 201 });
    }

    if (request.method === "PUT" && id) {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, { status: 400 }); }
      const boxes = await readBoxes(env);
      const box = boxes.find((b) => b.id === id);
      if (!box) return json({ error: "not found" }, { status: 404 });
      if (body.url !== undefined) {
        const link = String(body.url);
        if (link.length > MAX_LEN) return json({ error: "too long — " + link.length + " characters, limit is " + MAX_LEN }, { status: 413 });
        box.url = link;
      }
      if (body.kind !== undefined) box.kind = sanitizeKind(body.kind);
      await writeBoxes(env, boxes);
      return json(box);
    }

    if (request.method === "DELETE" && id) {
      const boxes = await readBoxes(env);
      const next = boxes.filter((b) => b.id !== id);
      if (next.length === boxes.length) return json({ error: "not found" }, { status: 404 });
      await writeBoxes(env, next);
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, { status: 405 });
  },
};
