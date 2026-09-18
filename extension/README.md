# Bingqilin Popup Blocker

A Chrome extension that closes the popups the player's video embeds open.
It has no options, no toolbar button and no settings — it is either
installed or it is not.

## What it covers

Three things, all of them only when the tab is on the player:

| Trick | How it is caught |
| --- | --- |
| `window.open()` / `target="_blank"` from inside the embed | `webNavigation.onCreatedNavigationTarget` fires as the target tab is created, and it is closed |
| `window.open()` with no URL, filled in afterwards with `document.write()` | `tabs.onCreated`, matching blank targets on the opener |
| Tab-under — the embed sends *your* tab to the ad and leaves the video in a popup behind it | `webNavigation.onCommitted`, which sends the tab back to the page it was just on |

The popup is closed, not prevented — so it is created, takes focus, paints
and is then removed, which you may see as a flash. Nothing driven from the
service worker can be earlier: by the time Chrome reports a tab was
created, it was created. Refusing one *before* it exists takes either an
iframe sandbox (deliberately not used here) or a content script in every
frame of every site, which would mean read-and-change access to all
websites for a blocker meant to touch one.

Closing rather than preventing is also what keeps this invisible to the
source. A source that refuses to play under a sandbox is detecting that
`window.open` failed — here it does not fail.

## The decoy

Closing is always late. The way to have nothing to close is for
`window.open` never to open anything — but return something anyway.
`content/no-popup.js` replaces it, inside the embed's own frame, with a
function handing back an object that behaves like a window and is not one:
truthy, `closed === false`, and `document.write` / `location =` / `focus()`
all accepted and discarded. Nothing is created, so there is no flash.

`closed` staying false is the load-bearing part. Popup scripts are written

    var w = window.open(url, "_blank");
    if (!w || w.closed) { /* fall back to redirecting your tab */ }

so a decoy that reports itself closed just pushes them to the tab-under.

### Where it runs, and how it keeps up

Inside the source origins — never a hardcoded list. **Sources get renewed,
and a list baked into an extension is wrong by the next rotation.** So:

1. `content/keepalive.js` reads the configured sources from the player's
   own `bq_sources` storage and reports **only their origins** over the
   port. The URL templates and everything else stay on the page.
2. Chrome will not grant a host at runtime without a user gesture, so new
   origins wait behind **one click on the toolbar icon**. The badge shows
   how many are waiting. There is no popup or options page — the click on
   the icon *is* the gesture.
3. An origin that drops out of the list needs no gesture to lose its
   grant, so it is revoked on sight and stops being injected.

Rotate your sources, reload the player, click once. Nothing to reinstall
and no domain written into the extension, the manifest or this repository.

`optional_host_permissions` is declared broadly so that any origin *can*
be requested, but nothing is granted at install and the prompt at click
time names only the sites your own sources point at.

### Keeping the flash short

Two things used to sit between the popup appearing and it being closed,
and both are gone:

- **A round trip.** The close waited on `chrome.tabs.get` just to ask
  whether the opener was a player tab. That answer is now held in memory,
  so the hot path is a `Map` lookup and a `remove` with no `await` in
  front of it.
- **A cold start.** A service worker is evicted after ~30s idle, so the
  popup was often what woke it — and Chrome had to start the worker before
  anything could close anything. `content/keepalive.js` holds a port open
  while a player tab is open, which keeps the worker resident.

That content script runs in the isolated world, adds no DOM and defines no
globals. It opens a port and goes quiet, so neither the page nor the embed
inside it can see that it is there.

## Where it runs

`https://thebingchilling.github.io/`, `/index`, `/index.html`, `/live` and
`/live.html` — the site serves the bare and the `.html` spelling of each,
and its own service worker precaches both.

Nothing else. Not `/tools/*` — the tools pages open tabs on purpose
(torrent links, SauceNAO results, a rendered PDF), and with no UI to
explain a blocked one, a tools page that silently fails to open a link is
worse than an ad. Not any other site either: the extension's only host
permission is this one origin, and `tabs.get()` hands back a URL only for
hosts an extension can access, so a tab anywhere else is invisible to it.

## What tells a wanted tab from an unwanted one

**The frame that asked for it.** The embed sits in an `<iframe>`, so
everything it opens comes from a frame below the top one. A tab the page
itself opens comes from frame 0 — today that means a middle-clicked
bottom-nav link, and it would equally cover a first-party `window.open` if
one were ever added. `onCreatedNavigationTarget` reports the source frame,
so it skips frame 0 and those keep working.

The tab-under rule works the same idea from the other side: a navigation a
script started is tagged `client_redirect`, and a link you clicked is not.

⚠ **The blank-target rule is the exception** — `tabs.onCreated` does not
report the frame, so it cannot use that test. It narrows itself to blank
targets instead, which is safe only while neither player page opens one.
Neither does today. If one ever does, that is the rule to revisit; the
cheapest fix is to have the page pass `"noopener"`, which leaves Chrome
recording no opener and so no match at all.

## Installing

1. `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → pick this `extension/` folder

## Building a .crx

`.github/workflows/package-extension.yml` zips this folder and signs it
into a CRX3 on every push to `main`, and attaches the build to a release
when you push a tag like `ext-v1.0.0` (the tag has to match the version in
`manifest.json`, or the run fails rather than shipping a mislabelled
build). The artifact lands on the run either way.

Every CRX is signed, and the key decides the extension's ID — it is the
first 16 bytes of the SHA-256 of the matching public key. The run
generates a key, signs with it, and destroys it, so **each build gets a
different ID.** That only costs you something if you wanted an installed
copy to accept a later build as an update to itself; it will not, so
remove the old copy before installing a new one. The ID of each build is
in its run summary.

To make it stable instead, put a PEM in the `CRX_PRIVATE_KEY` secret and
the workflow uses that with no other change:

```sh
openssl genrsa 4096 | gh secret set CRX_PRIVATE_KEY
```

Keep a copy somewhere outside the repo if you do — losing it puts you back
to a new ID per build.

The packer is `.github/scripts/pack-crx.mjs` — about sixty lines against
`node:crypto` and nothing else. The repo has no `package.json`, and the
one file an npm dependency would have been trusted to produce here is the
signed one, so it writes the container directly.

To build locally:

```sh
cd extension && zip -qrX ../ext.zip . -x '.*' && cd ..
node .github/scripts/pack-crx.mjs ext.zip key.pem ext.crx
```

## downloads/

`/downloads/bingqilin-popup-blocker.{zip,crx}` is what the player's
Settings sheet links to. It is committed, because the site serves it and a
GitHub release asset would be a login-walled detour for anyone just
wanting the thing.

Committed builds rot, so CI diffs both files against `extension/` on every
run and fails if they differ. **After changing anything in `extension/`,
rebuild them:**

```sh
cd extension && zip -qrX ../downloads/bingqilin-popup-blocker.zip . \
  -x '.*' -x 'README.md' && cd ..
node .github/scripts/pack-crx.mjs downloads/bingqilin-popup-blocker.zip \
  key.pem downloads/bingqilin-popup-blocker.crx
```

This file is not in the package — it describes the repo's layout and
build, which a shipped extension has no use for, and including it meant
every docs edit invalidated every built artifact.

Note that Chrome on Windows and macOS refuses `.crx` files dragged in by
hand — off-store installs there need enterprise policy (`ExtensionInstall`
`Forcelist`/`Allowlist`). On Linux it installs, and **Load unpacked**
works everywhere, which is why that is still listed first above.

## Files

- `manifest.json` — MV3; `webNavigation` + `storage`, one host permission
- `background.js` — the three rules
- `content/keepalive.js` — keeps the worker resident, reports source origins
- `content/no-popup.js` — the decoy window, injected into granted sources
- `lib/scope.js` — the path allow-list that defines "the player"
- `../.github/workflows/package-extension.yml` — build and release
- `../.github/scripts/pack-crx.mjs` — the CRX3 writer
