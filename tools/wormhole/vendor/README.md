# Vendored: PeerJS

`peerjs.min.js` is the official PeerJS client, vendored (not fetched from a
CDN) so `/tools/wormhole` stays offline-tolerant like the rest of this site.
It exposes a `Peer` global (UMD build) with no other files needed.

- Source package: [`peerjs`](https://www.npmjs.com/package/peerjs) v1.5.5 (npm), MIT licensed
- Upstream project: [peerjs.com](https://peerjs.com/) / [github.com/peers/peerjs](https://github.com/peers/peerjs)

PeerJS wraps WebRTC: it handles the signaling handshake (exchanging SDP/ICE
candidates) via a small broker service so two browsers can find each other,
then hands off to a direct (or TURN-relayed, when a direct path isn't
possible) `RTCDataChannel` for the actual data. `/tools/wormhole` uses
PeerJS's default free public broker (`0.peerjs.com`, via the built-in
`"peerjs"` API key) and its default ICE server list, which already bundles
Google's public STUN server plus PeerJS's own TURN servers
(`turn.peerjs.com`) — no server of ours is involved anywhere in this path,
and the broker only ever sees a one-way hash derived from the wormhole
code, never the code itself (see the `deriveIds()` comment in
`index.html`).

To update: `npm pack peerjs@<version>`, then copy `dist/peerjs.min.js` from
the tarball into this folder.

---

The word list embedded in `index.html` (used to generate and autocomplete
wormhole codes, e.g. `swift-otter-cabin`) is filtered from the
[`random-words`](https://www.npmjs.com/package/random-words) npm package
(MIT licensed, © Apostrophe Technologies), keeping only lowercase
alphabetic entries of 3–8 letters.
