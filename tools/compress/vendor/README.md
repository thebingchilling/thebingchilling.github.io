# Vendored engines for /tools/compress

Everything here is vendored (not fetched from a CDN at runtime) so the
compress tool works fully offline and never depends on a third-party host,
matching `/tools/pdf/vendor`.

## `ffmpeg/` — video &amp; audio transcoding

The single-threaded build of [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm),
used for the Video tab (and as a fallback audio path). Single-threaded is used
deliberately: the multi-threaded core needs `SharedArrayBuffer`, which needs
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` response headers —
not something GitHub Pages lets a static site set.

- `ffmpeg/esm/*.js` — [`@ffmpeg/ffmpeg`](https://www.npmjs.com/package/@ffmpeg/ffmpeg) v0.12.15,
  `dist/esm/*`. MIT.
- `ffmpeg/util/*.js` — [`@ffmpeg/util`](https://www.npmjs.com/package/@ffmpeg/util) v0.12.2,
  `dist/esm/*`. MIT.
- `ffmpeg/core/ffmpeg-core.js` + `ffmpeg-core.wasm` — [`@ffmpeg/core`](https://www.npmjs.com/package/@ffmpeg/core)
  v0.12.10 (single-thread), `dist/esm/*`. The actual FFmpeg build, GPL-2.0-or-later
  (includes libx264). Source: https://github.com/ffmpegwasm/ffmpeg.wasm.

To update: `npm pack @ffmpeg/ffmpeg@<version> @ffmpeg/util@<version> @ffmpeg/core@<version>`,
then copy the `dist/esm/*` files from each tarball into the matching folder
here. Keep the three versions in lockstep with what the ffmpeg.wasm project
tests together (check their release notes) — mismatched versions can fail to
load silently.

## `audio/` — MP3 &amp; Ogg Vorbis encoding

[`wasm-media-encoders`](https://www.npmjs.com/package/wasm-media-encoders) v0.7.0. MIT.
Used for the Audio tab.

- `audio/WasmMediaEncoder.min.js` — `dist/umd/WasmMediaEncoder.min.js`, loaded
  as a classic `<script>` (not `import()`): the package's ESM build
  (`dist/es/index.mjs`) uses bare `@swc/helpers/...` specifiers meant for a
  bundler to resolve, which a browser's native `import()` can't do on its
  own — the UMD build is the only variant that works standalone.
- `audio/mp3.wasm`, `audio/ogg.wasm` — `wasm/mp3.wasm` and `wasm/ogg.wasm`
  from the same package. The UMD build's own `createMp3Encoder()`/
  `createOggEncoder()` helpers default to fetching these from unpkg.com, so
  the tool calls `WasmMediaEncoder.createEncoder(mimeType, localWasmPath)`
  directly instead, pointing at these vendored copies.

To update: `npm pack wasm-media-encoders@<version>`, then copy
`dist/umd/WasmMediaEncoder.min.js` and `wasm/{mp3,ogg}.wasm` from the
tarball over these files.

## Why there's no format conversion, and no separate lossless mode

Every tab keeps the output in the same file type as the input — there's no
"convert to X" picker. That's also why there's a `capability(file)` check per
tab in `/tools/compress/index.html`: if the dropped file's format isn't one
this tool can re-encode back into itself (canvas only reliably *encodes*
JPEG/PNG/WebP; the audio/video encoders here only cover MP3/Ogg Vorbis/WAV
and MP4·M4V·MOV·MKV/WebM respectively), it's reported as unsupported rather
than silently switched to some other format.

There's also no dedicated "Lossless" toggle. PNG's own re-encode through
`<canvas>` is still genuinely lossless (identical pixels, just a fresh,
metadata-free stream) and WAV is uncompressed PCM either way — but every tab
uses the same single quality-slider/target-size UI, since a separate
lossless mode isn't meaningful for JPEG/WebP/MP3/Ogg Vorbis/video (their
"lossless" case is just the quality slider turned all the way up), and for
PNG/WAV the quality slider simply doesn't do anything to it — a fact the
in-page hint says outright rather than hiding a no-op control behind a
misleading "Lossless" label.
