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

Two public relays are used (see `relay_hints()` in `wasm-src/src/lib.rs`):
the official rendezvous server (`ws://relay.magic-wormhole.io:4000/v1`,
already WebSocket-native and used by every standard client) for the code
exchange, and Least Authority's public dual-protocol relay
(`relay.mw.leastauthority.com`, reachable over both raw TCP and WebSocket)
for the actual file bytes — a browser tab cannot open raw TCP sockets, so a
relay that also speaks WebSocket is required, and advertising it makes an
unmodified `wormhole send`/`wormhole receive` CLI peer try it too.

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
