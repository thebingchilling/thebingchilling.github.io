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

## Deploy

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

## Data model

Everything lives under a single KV key (`boxes`), holding a JSON array of
`{ id, kind: "media" | "live", title, url }`. Fine at personal-scale;
there's no pagination or search because there's no need for it yet.
