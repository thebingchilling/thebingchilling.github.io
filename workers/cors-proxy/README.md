# Bingqilin CORS proxy

A small Cloudflare Worker that fetches a URL server-side and hands the
response back with CORS headers, for the APIs this toolbox needs
(SauceNAO, Reddit's `.json` endpoints, and whatever indexer URLs the
torrent search tool is pointed at) that don't send CORS headers of their
own — GitHub Pages can't run a server to do this itself.

It's deliberately generic: no per-site logic beyond sending a proper
`User-Agent` (some APIs, Reddit especially, reject or rate-limit requests
without one).

## Deploy it (one-time, ~2 minutes)

Requires a free Cloudflare account.

```sh
cd workers/cors-proxy
npx wrangler login      # opens a browser to authorize
npx wrangler deploy
```

Wrangler prints the Worker's URL when it finishes, something like:

```
https://bingqilin-cors-proxy.<your-subdomain>.workers.dev
```

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
- To redeploy after editing `worker.js`, just run `npx wrangler deploy`
  again from this directory — the URL stays the same.
