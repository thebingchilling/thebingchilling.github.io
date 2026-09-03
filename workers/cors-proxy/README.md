# Bingqilin CORS proxy

A small proxy that fetches a URL server-side and hands the response back
with CORS headers, for the APIs this toolbox needs (SauceNAO, and
whatever indexer URLs the torrent search tool is pointed at) that don't
send CORS headers of their own — GitHub Pages can't run a server to do
this itself. Three equivalent implementations live here — same logic,
different hosting:

- **`worker.js`** — Cloudflare Workers (the one currently deployed and
  wired in for this site).
- **`deno-deploy.js`** — the same thing on Deno Deploy.
- **`node-server/`** — a plain Node.js server, for hosting anywhere that
  runs Node (Render, Railway, a VPS, ...) instead of a serverless/edge
  platform.

Worth trying an alternative if a target blocks the Cloudflare-hosted
version specifically: Cloudflare Workers requests come from Cloudflare's
own edge IPs, which is an easy "this can't be a real visitor" tell for
any site that's itself behind Cloudflare — a request from a different
network doesn't carry that particular signal. (Sites that block based on
broader IP/hosting-range reputation rather than "this is specifically
Cloudflare" — Reddit, notably — will likely still block any of these;
that's a different, much harder problem this proxy alone can't solve.)

It's deliberately generic: no per-site logic beyond sending a proper
`User-Agent`, since some APIs reject or rate-limit requests without one.

**Already deployed and wired in for this site** — both tools default to
`https://bingqilin-cors-proxy.bingqilin.workers.dev`, so nothing below
needs doing unless you've forked this site and want your own Worker, or
want to point the tools at a different one.

## Deploy your own Cloudflare Worker (one-time, ~2 minutes, no command line needed)

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

## Deploy your own on Deno Deploy instead (also no command line needed)

Same idea, different network — try this if the Cloudflare Worker gets
blocked by a target that's specifically wary of Cloudflare-to-Cloudflare
traffic. Requires a free Deno Deploy account (sign in with GitHub or
email at [dash.deno.com](https://dash.deno.com/)).

1. Go to [dash.deno.com](https://dash.deno.com/) and sign in.
2. Click **New Project**.
3. Choose the **Playground** option (write code directly in the browser — no GitHub repo needed).
4. Delete the placeholder code it starts with, and paste in the full contents of [`deno-deploy.js`](./deno-deploy.js) from this folder.
5. It deploys automatically as you save (Playgrounds deploy live). The URL is shown at the top of the page — it looks like:

   ```
   https://your-project-name.deno.dev
   ```

   Copy it — same as the Cloudflare URL, this goes into the **CORS proxy** field in the next step.

To test it against a specific target before committing to it, visit
`https://your-project-name.deno.dev/?url=<encoded target URL>` directly
in your browser, the same way you'd test the Cloudflare Worker.

## Deploy the Node.js version on Render instead

Different approach: this runs the plain Node server in [`node-server/`](./node-server/)
directly from this GitHub repo — no pasting code anywhere, Render builds
it straight from the files already here. Requires a free Render account
(sign in with the same GitHub account this repo is under, at
[dashboard.render.com](https://dashboard.render.com/)).

1. Go to [dashboard.render.com](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New** → **Web Service**.
3. Connect this repository (`thebingchilling.github.io`) — Render will ask to install/authorize its GitHub app on it the first time.
4. In the setup form:
   - **Root Directory**: `workers/cors-proxy/node-server`
   - **Runtime**: Node
   - **Build Command**: leave as `npm install` (or blank — there's nothing to install)
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. Click **Create Web Service**. Render builds and deploys it, and shows the URL at the top of the page once it's live — it looks like:

   ```
   https://bingqilin-cors-proxy.onrender.com
   ```

   Copy it — same as the others, this goes into the **CORS proxy** field in the next step.

**Trade-off**: Render's free tier spins the service down after ~15 minutes with no traffic. The *next* request after that wakes it back up, but takes 30–60 seconds to respond while it does — after that it's fast again until it goes idle once more. Fine for occasional personal use, just expect that first-request delay.

## Wire it into the tools

Open **Settings** in the Reverse Image Search tool (`/tools/saucenao/`)
*or* the Torrent Search tool (`/tools/torrents/`) — both read the same
setting — and paste your proxy's URL (whichever one worked) into the
**CORS proxy** field, then Save. Every SauceNAO and torrent-source
request from either tool is routed through it from then on (stored in
this browser only).

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
