/* Bingqilin Link Box — single-file build for deploying by hand through the
   Cloudflare dashboard (no wrangler, no static-assets upload). Paste this
   whole file into the dashboard's Worker code editor as-is; it inlines
   public/index.html as a string instead of serving it as a static asset.

   If you ever switch to deploying with `wrangler deploy` from this
   directory, use src/worker.js + public/index.html instead — this file
   is a manual-deploy convenience copy, not the source of truth; keep
   both in sync if you edit the page. */

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Bingqilin Links</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<!-- Reuses the main site's shared design system directly (same look, no
     copy to keep in sync) — this app is otherwise fully standalone. -->
<script src="https://thebingchilling.github.io/shared/theme-init.js"></script>
<link rel="stylesheet" href="https://thebingchilling.github.io/shared/tokens.css" />
<link rel="stylesheet" href="https://thebingchilling.github.io/shared/chrome.css" />
<link rel="stylesheet" href="https://thebingchilling.github.io/shared/ui.css" />
<style>
  body { background: var(--surface-dim); }
  .app-main { max-width: 960px; margin: 0 auto; padding: 1rem 1rem 3rem; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0.75rem 0; }
  .grid--links { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }
  .link-card { display: flex; flex-direction: column; gap: 0.5rem; }
  .link-card__row { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .link-card__kind {
    font: var(--type-label-medium); letter-spacing: var(--track-label-medium);
    color: var(--md-on-secondary-container); background: var(--md-secondary-container);
    border-radius: var(--shape-full); padding: 0.15rem 0.6rem;
  }
  .link-card__title-input {
    width: 100%; box-sizing: border-box; padding: 0.5rem 0.7rem;
    border-radius: var(--shape-s); border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font: var(--type-body-medium);
  }
  .link-card__title-input:focus { outline: none; border-color: var(--md-primary); box-shadow: var(--el2), inset 0 0 0 1px var(--md-primary); }
  .link-card .textarea { width: 100%; box-sizing: border-box; }
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
      <button class="segmented__item segmented__item--active" type="button" role="tab" aria-selected="true" data-kind="media">
        <span class="material-icons" aria-hidden="true">movie</span>Media
      </button>
      <button class="segmented__item" type="button" role="tab" aria-selected="false" data-kind="live">
        <span class="material-icons" aria-hidden="true">live_tv</span>Live
      </button>
    </div>

    <div class="toolbar">
      <span id="countLabel" class="field-hint"></span>
      <button id="addBtn" class="btn btn--primary btn--sm" type="button">
        <span class="material-icons" aria-hidden="true">add</span>Add box
      </button>
    </div>

    <div id="grid" class="grid--links"></div>

    <div id="emptyState" class="empty-state hidden">
      <span class="material-icons empty-state__icon" aria-hidden="true">link_off</span>
      <div class="empty-state__title">No links yet</div>
      <div class="empty-state__sub">Add a box and paste a source URL into it.</div>
    </div>
  </main>
</div>

<script src="https://thebingchilling.github.io/shared/chrome.js"></script>
<script>
"use strict";
const $ = (id) => document.getElementById(id);

BQChrome.initRipple(".icon-btn, .btn, .link-card, .segmented__item");
BQChrome.initTheme({});

let activeKind = "media";
let boxes = []; // [{id, kind, title, url}] — id is null for a not-yet-saved new box

BQChrome.initTabs($("kindTabs"), (tab) => {
  activeKind = tab.dataset.kind;
  render();
});

async function api(path, options) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options && options.headers) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

async function loadBoxes() {
  boxes = await api("/items");
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
  const delBtn = document.createElement("button");
  delBtn.className = "icon-btn icon-btn--sm";
  delBtn.type = "button";
  delBtn.setAttribute("aria-label", "Delete");
  delBtn.innerHTML = '<span class="material-icons" aria-hidden="true">delete</span>';
  row.append(kindChip, delBtn);

  const titleInput = document.createElement("input");
  titleInput.className = "link-card__title-input";
  titleInput.type = "text";
  titleInput.placeholder = "Title";
  titleInput.value = box.title || "";

  const urlInput = document.createElement("textarea");
  urlInput.className = "textarea";
  urlInput.placeholder = "Source URL";
  urlInput.rows = 2;
  urlInput.value = box.url || "";

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

  card.append(row, titleInput, urlInput, actions);

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(urlInput.value);
      BQChrome.snackbar("Copied to clipboard");
    } catch (e) {
      BQChrome.snackbar("Copy failed — select and copy manually");
    }
  });

  saveBtn.addEventListener("click", async () => {
    const payload = { title: titleInput.value.trim(), url: urlInput.value.trim(), kind: box.kind };
    try {
      if (box.id) {
        await api("/items/" + box.id, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        const created = await api("/items", { method: "POST", body: JSON.stringify(payload) });
        box.id = created.id;
      }
      box.title = payload.title;
      box.url = payload.url;
      BQChrome.snackbar("Saved");
    } catch (e) {
      BQChrome.snackbar("Save failed: " + e.message);
    }
  });

  delBtn.addEventListener("click", async () => {
    const ok = await BQChrome.confirm({ title: "Delete this box?", body: box.title || "Untitled", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    if (box.id) {
      try { await api("/items/" + box.id, { method: "DELETE" }); }
      catch (e) { BQChrome.snackbar("Delete failed: " + e.message); return; }
    }
    boxes = boxes.filter((b) => b !== box);
    render();
  });

  return card;
}

$("addBtn").addEventListener("click", () => {
  boxes.push({ id: null, kind: activeKind, title: "", url: "" });
  render();
});

loadBoxes().catch((e) => BQChrome.snackbar("Failed to load: " + e.message));
<\/script>
</body>
</html>`;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

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
      return new Response(PAGE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
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
      const title = String(body.title || "").slice(0, 200);
      const link = String(body.url || "").slice(0, 4000);
      if (!title && !link) return json({ error: "title or url required" }, { status: 400 });
      const box = { id: crypto.randomUUID(), kind: sanitizeKind(body.kind), title, url: link };
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
      if (body.title !== undefined) box.title = String(body.title).slice(0, 200);
      if (body.url !== undefined) box.url = String(body.url).slice(0, 4000);
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
