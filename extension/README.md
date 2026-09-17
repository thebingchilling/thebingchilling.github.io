# Bingqilin Popup Blocker

A Chrome extension that closes the popups the player's video embeds open.
It has no options, no toolbar button and no settings — it is either
installed or it is not.

## What it covers

Three things, all of them only when the tab is on the player:

| Trick | How it is caught |
| --- | --- |
| `window.open()` / `target="_blank"` from inside the embed | `webNavigation.onCreatedNavigationTarget` fires as the target tab is created, before it paints, and it is closed |
| `window.open()` with no URL, filled in afterwards with `document.write()` | `tabs.onCreated`, matching blank targets on the opener |
| Tab-under — the embed sends *your* tab to the ad and leaves the video in a popup behind it | `webNavigation.onCommitted`, which sends the tab back to the page it was just on |

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

Note that Chrome on Windows and macOS refuses `.crx` files dragged in by
hand — off-store installs there need enterprise policy (`ExtensionInstall`
`Forcelist`/`Allowlist`). On Linux it installs, and **Load unpacked**
works everywhere, which is why that is still listed first above.

## Files

- `manifest.json` — MV3; `webNavigation` + `storage`, one host permission
- `background.js` — the three rules
- `lib/scope.js` — the path allow-list that defines "the player"
- `../.github/workflows/package-extension.yml` — build and release
- `../.github/scripts/pack-crx.mjs` — the CRX3 writer
