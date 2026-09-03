# Vendored: `magic-wormhole` compiled to WebAssembly

`pkg/wormhole.js` + `pkg/wormhole_bg.wasm` are a `wasm-bindgen` build of a
small Rust wrapper (source in `../wasm-src/`) around the official
[`magic-wormhole`](https://crates.io/crates/magic-wormhole) Rust crate. They
implement the real Magic Wormhole protocol — PAKE code exchange over the
public rendezvous server, then an end-to-end encrypted file transfer over a
transit relay — entirely in the browser. Vendored (not fetched from a CDN)
so `/tools/wormhole` works offline-tolerant like the rest of this site.

- Wrapper source: `../wasm-src/` (this repo)
- Underlying protocol crate: [`magic-wormhole`](https://github.com/magic-wormhole/magic-wormhole.rs) v0.8.1, licensed EUPL-1.2
- Wrapper crate license: same terms as this repository

Two of Least Authority's public servers are used, both TLS-capable (see
`app_config()` and `relay_hints()` in `wasm-src/src/lib.rs`):
`wss://mailbox.mw.leastauthority.com/v1` for the code exchange, and
`relay.mw.leastauthority.com` (reachable over both raw TCP and WebSocket)
for the actual file bytes. **Not** the official servers
(`ws://relay.magic-wormhole.io:4000/v1` and
`tcp://transit.magic-wormhole.io:4001`) — those only speak plaintext, and
a page served over HTTPS cannot open a plaintext `ws://` connection at all
(mixed-content blocking), so a browser tab has no choice but to use
servers that support TLS/WSS. This does mean a plain `wormhole
send`/`wormhole receive` CLI invocation needs
`--rendezvous-server wss://mailbox.mw.leastauthority.com/v1
--relay-server tcp://relay.mw.leastauthority.com:4001` to interoperate
with this page — see the in-page copy.

To rebuild after changing `wasm-src/`:

```sh
cd ../wasm-src
rustup target add wasm32-unknown-unknown   # once
cargo build --release --target wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version <version matching Cargo.lock's wasm-bindgen>
wasm-bindgen --target web --out-dir ../vendor/pkg --out-name wormhole \
  target/wasm32-unknown-unknown/release/wormhole_wasm.wasm
# optional, shrinks the .wasm noticeably:
npx --yes wasm-opt@latest -Oz --enable-bulk-memory \
  -o ../vendor/pkg/wormhole_bg.wasm ../vendor/pkg/wormhole_bg.wasm
```

Then **bump the `?v=N` query strings** in `../index.html` (the `import`
line and the `module_or_path` passed to `init()`) — the .js and .wasm are
tightly coupled, and reusing the same URL across a content change risks a
stale cached file of one pairing with a fresh one of the other, which
breaks module loading outright (see the comment above `import` in
`../index.html`).
