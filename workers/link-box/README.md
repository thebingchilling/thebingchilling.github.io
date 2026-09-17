# link-box

A standalone Cloudflare Worker, completely separate from how the rest of
this site is deployed (GitHub Pages). It's a personal scratchpad: a box
per media title or live channel, each with an editable source URL and a
Copy button. You maintain links here, then paste them into the main
site's own importer (the Settings sheet in `live.html`, or wherever
`index.html` wants a source) by hand — this app never talks to the main
site or vice versa.

No login/password — anyone with the URL can read and edit it, so don't
put anything you wouldn't want public in a box, and don't publicize the
URL beyond yourself.

## Deploy with wrangler (CLI)

Requires a Cloudflare account and `wrangler` (`npm install -g wrangler`,
or `npx wrangler`).

```sh
cd workers/link-box
wrangler kv namespace create LINKS
# copy the printed `id` into wrangler.toml's [[kv_namespaces]] section
wrangler deploy
```

That serves `public/index.html` as the app and `src/worker.js` as the
`/api/items` CRUD backend, both from one Worker/one URL
(`bingqilin-links.<your-subdomain>.workers.dev` by default — rename in
`wrangler.toml` first if you want a different name).

## Deploy by hand from the Cloudflare dashboard (no CLI)

The dashboard's built-in code editor only accepts a single JS file, so use
`dashboard-worker.js` — the same app with `public/index.html` inlined as a
string — instead of `src/worker.js` + `public/index.html`.

1. **Create the KV namespace.** Dashboard → **Storage & Databases** →
   **KV** → **Create instance** → name it e.g. `LINKS` → **Add**.
2. **Create the Worker.** Dashboard → **Compute (Workers)** → **Workers &
   Pages** → **Create** → **Workers** → **Create Worker** → give it a
   name (e.g. `bingqilin-links`) → **Deploy** (this deploys Cloudflare's
   placeholder "Hello World" script — that's fine, you're about to
   replace it).
3. **Replace the code.** On the Worker's page, click **Edit code** (opens
   the online editor). Delete everything in the editor and paste in the
   full contents of `dashboard-worker.js` from this folder. Click
   **Deploy** (top right).
4. **Bind the KV namespace.** Go back to the Worker's overview →
   **Settings** → **Variables and Bindings** → **Add binding** → **KV
   namespace**. Set *Variable name* to exactly `LINKS` (the code reads
   `env.LINKS`) and pick the namespace you created in step 1. Save — this
   redeploys the Worker with the binding attached.
5. Open the Worker's `*.workers.dev` URL (shown on its overview page).
   The app should load with empty Media/Live tabs, ready to add boxes.

To push a later edit to the page or API logic the same way: edit
`dashboard-worker.js` (and its `public/index.html`/`src/worker.js`
counterpart, to keep them in sync), then repeat step 3 — paste the new
file into **Edit code** and **Deploy** again.

## Data model

Everything lives under a single KV key (`boxes`), holding a JSON array of
`{ id, kind: "media" | "live", title, url }`. Fine at personal-scale;
there's no pagination or search because there's no need for it yet.
