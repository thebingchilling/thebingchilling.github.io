# Bingqilin CORS proxy

A small Cloudflare Worker that fetches a URL server-side and hands the
response back with CORS headers, for the APIs this toolbox needs
(SauceNAO, Reddit's `.json` endpoints, and whatever indexer URLs the
torrent search tool is pointed at) that don't send CORS headers of their
own — GitHub Pages can't run a server to do this itself.

It's deliberately generic: no per-site logic beyond sending a proper
`User-Agent` (some APIs, Reddit especially, reject or rate-limit requests
without one).

## Deploy it (one-time, ~2 minutes, no command line needed)

Requires a free Cloudflare account.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and sign up (or log in).
2. In the left sidebar, click **Workers & Pages**.
3. Click **Create** (or **Create application**), then **Create Worker**.
4. Give it a name — e.g. `bingqilin-cors-proxy` — and click **Deploy**. It deploys Cloudflare's default "Hello World" code first; that's fine, next step replaces it.
5. Click **Edit code** to open the online editor.
6. Select all the code in the editor and delete it, then paste in the full contents of [`worker.js`](./worker.js) from this folder.
7. Click **Save and deploy** (sometimes just **Deploy**).
8. Your Worker's URL is shown at the top of the editor / on the Worker's overview page — it looks like:

   ```
   https://bingqilin-cors-proxy.<your-subdomain>.workers.dev
   ```

   Copy it — that's what goes into the tools in the next step.

### Alternative: the command line (`wrangler`)

If you're comfortable with a terminal, this does the same thing:

```sh
cd workers/cors-proxy
npx wrangler login      # opens a browser to authorize
npx wrangler deploy
```

Wrangler prints the Worker's URL when it finishes. To redeploy after
editing `worker.js` this way, just run `npx wrangler deploy` again —
the URL stays the same.

## Wire it into the tools

Open **Settings** in the Reverse Image Search tool (`/tools/saucenao/`)
*or* the Torrent Search tool (`/tools/torrents/`) — both read the same
setting — and paste that URL into the **CORS proxy** field, then Save.
Every SauceNAO, Reddit, and torrent-source request from either tool is
routed through it from then on (stored in this browser only).

## Notes

- Free tier is 100,000 requests/day — far more than personal use needs.
- This is intentionally an open relay (the torrent tool lets you point it
  at arbitrary indexer URLs), so it fetches anything except obviously
  local/private addresses (`localhost`, `127.0.0.1`, RFC1918 ranges,
  etc.) — don't rely on it for anything that needs stronger access
  control than that.
- To redeploy after editing `worker.js` from the dashboard: open the
  Worker, click **Edit code**, paste in the new version, **Save and
  deploy** — the URL stays the same.
