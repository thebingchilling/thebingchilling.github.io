# Bingqilin Popup Blocker

A Chrome extension that closes the popups the player's video embeds open.
It has no options, no toolbar button and no settings — it is either
installed or it is not.

## What it covers

Two layers, both only when the tab is on the player.

**The embed is sandboxed, so the popup is never created.** The player
builds each embed as an `<iframe>`, and an iframe's `sandbox` attribute
decides what the document inside may do. Withhold `allow-popups` and
`window.open` returns `null`; withhold `allow-top-navigation` and the
tab-under cannot fire. Nothing opens, so there is nothing to close and
nothing to see. `content/prevent-popups.js` applies it by patching
`document.createElement`, because the attribute has to be on the element
*before* it enters the DOM — insertion is what starts the navigation.

**Anything that still gets through is closed.** `background.js` is the net
underneath, for a frame the content script never saw:

| Trick | How it is caught |
| --- | --- |
| `window.open()` / `target="_blank"` from inside the embed | `webNavigation.onCreatedNavigationTarget` fires as the target tab is created, and it is closed |
| `window.open()` with no URL, filled in afterwards with `document.write()` | `tabs.onCreated`, matching blank targets on the opener |
| Tab-under — the embed sends *your* tab to the ad and leaves the video in a popup behind it | `webNavigation.onCommitted`, which sends the tab back to the page it was just on |

This second layer is visibly late by nature: the tab is created, takes
focus, paints, and is then removed. That flash is why the sandbox exists.

### What the embed keeps

`allow-scripts`, `allow-same-origin`, `allow-forms`, `allow-presentation`,
`allow-orientation-lock`, `allow-pointer-lock`. Fullscreen is not a sandbox
token — it rides on the `allowfullscreen` attribute and the `allow=` policy
the page already sets, so it is untouched.

`allow-scripts` with `allow-same-origin` together normally deserve a second
look, since they let a document clear its own sandbox — but only one that is
same-origin with the page applying it. The embed is cross-origin by
definition and cannot reach the attribute.

**If a source breaks under this,** the sandbox is the first thing to
suspect: remove the extension, reload, and see. There is no toggle, by
design — the whole thing is install-or-not.

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
- `content/prevent-popups.js` — the sandbox, applied before the embed loads
- `background.js` — the three catch-up rules
- `lib/scope.js` — the path allow-list that defines "the player"
- `../.github/workflows/package-extension.yml` — build and release
- `../.github/scripts/pack-crx.mjs` — the CRX3 writer
