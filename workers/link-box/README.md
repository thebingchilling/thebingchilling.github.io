# link-box

A standalone Cloudflare Worker, completely separate from how the rest of
this site is deployed (GitHub Pages). It's a personal scratchpad: a box
per media or live source, each holding an editable link (or a whole
multi-line config block) with a Copy button. You maintain sources here,
then paste them into the main site's own importer (the Settings sheet in
`live.html`, or wherever `index.html` wants a source) by hand — this app
never talks to the main site or vice versa.

Everything lives in `worker.js`: the page is inlined in the script rather
than served as a static asset, so the same single file can be pasted into
the Cloudflare dashboard's editor *or* deployed with `wrangler deploy`.

## Deploy from the Cloudflare dashboard (no CLI)

1. **Create the KV namespace.** Dashboard → **Storage & Databases** →
   **KV** → **Create instance** → name it e.g. `LINKS`.
2. **Create the Worker.** **Compute (Workers)** → **Workers & Pages** →
   **Create** → **Workers** → **Create Worker** → name it (e.g.
   `bingqilin-links`) → **Deploy** (ships Cloudflare's placeholder
   script, which you're about to replace).
3. **Replace the code.** On the Worker's page click **Edit code**, select
   all, paste in the whole of `worker.js`, then **Deploy**.
4. **Bind the KV namespace.** Worker → **Settings** → the **Bindings**
   tab (newer dashboards split resource bindings out from *Variables and
   Secrets*) → **Add binding** → **KV Namespace**. Variable name must be
   exactly `LINKS`; pick the namespace from step 1 and save.
5. Open the Worker's `*.workers.dev` URL. Until step 4 is done the page
   shows "No KV namespace bound" rather than failing silently.

To ship a later edit, repeat step 3.

## Deploy with wrangler (CLI)

```sh
cd workers/link-box
wrangler kv namespace create LINKS
# copy the printed `id` into wrangler.toml
wrangler deploy
```

## Known limits

Deliberate trade-offs, not bugs to be surprised by later:

- **No authentication.** Anyone who has the URL can read, edit and delete
  every box. Don't store anything here you'd mind leaking, and don't post
  the URL anywhere public. The page sends `noindex` so it shouldn't get
  crawled, but that's obscurity, not security.
- **Concurrent edits clobber each other.** All boxes live under one KV
  key, and a save is read-modify-write of the whole array. Saving in two
  tabs (or on two devices) at once means the last save wins and the other
  edit vanishes. Fine for one person editing in one place at a time.
- **KV is eventually consistent.** A save can take up to ~60s to show up
  in another region, so an edit on your phone may not appear on your
  laptop immediately. Reload before assuming something didn't save.
- **Styling is loaded cross-origin** from `thebingchilling.github.io`
  (`shared/tokens.css`, `chrome.css`, `ui.css`, `chrome.js`). If those
  files are moved or renamed, this app loses its styling — the boxes,
  saving and copying all keep working, since `chrome.js` is treated as
  optional polish.
- **Free-plan KV** allows 1,000 writes and 100,000 reads per day. Each
  Save is one write.

## Data model

One KV key (`boxes`) holding a JSON array of
`{ id, kind: "media" | "live", url }`. No pagination or search, because
at this scale neither earns its keep.
