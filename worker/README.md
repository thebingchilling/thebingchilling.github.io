# Ad-strip proxy (Cloudflare Worker)

Fetches a player embed URL server-side, strips a short list of known ad-script
tags, and injects a shim that neutralizes `window.open()` and `window.top`
redirects before the embed's own scripts run — an attempt to suppress
popup/redirect ads from a third-party `<iframe>` embed without needing the
`sandbox` attribute (which some providers detect and refuse to play under).

**This is a generic first pass, not tested against any specific embed
provider.** Providers change markup and add detection regularly; expect to
iterate on `ad-strip-proxy.js` once you see how your actual source behaves
through it. In particular, if a provider validates more than Referer/Origin
(signed tokens, IP checks, timing checks), this won't get past that.

## Deploy

1. Install wrangler if you don't have it: `npm install -g wrangler`
2. `wrangler login`
3. From this `worker/` folder: `wrangler deploy`
4. Wrangler prints your worker's URL, e.g. `https://ad-strip-proxy.<you>.workers.dev`

## Lock it down (recommended before real use)

By default `ALLOWED_HOSTS` in `ad-strip-proxy.js` is empty, which makes this
an **open proxy** — anyone who finds the worker URL can use it to fetch any
HTTPS site through your Cloudflare account. Once you know which embed
provider(s) you're pointing this at, add their hostname(s) to
`ALLOWED_HOSTS` and redeploy:

```js
const ALLOWED_HOSTS = ["your-embed-provider.com"];
```

## Wire it into the site

In the app's Settings, paste the deployed worker URL into the "Ad-strip
proxy URL" field. When set, the player routes embed URLs through
`<proxy>/?url=<encoded embed url>` instead of loading them directly.

## What it does / doesn't do

- Spoofs `Referer`/`Origin` to the target's own origin — defeats providers
  that only check "did this request come from our own site".
- Removes `<script src>` tags matching a short built-in list of known ad
  networks (`AD_SCRIPT_HOSTS`) — won't catch first-party ad code served from
  the provider's own domain.
- Injects a shim making `window.open()` return a harmless stub instead of
  `null`/actually opening a window, and makes `window.top`/`window.parent`
  resolve to the iframe itself — so a script that tries to bust out to the
  real top-level page redirects the iframe instead of your tab. This relies
  on being able to redefine `window.top`, which not every browser allows
  from every context; treat it as best-effort, not a guarantee.
- Only rewrites the top-level HTML document. Subsequent requests the page
  makes on its own (XHR/fetch, dynamically injected scripts, the actual
  video manifest) go straight to the original site via the injected
  `<base>` tag — they are not filtered.
