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

## Why there's no format conversion

Every tab keeps the output in the same file type as the input — there's no
"convert to X" picker. That's also why there's a `capability(file)` check per
tab in `/tools/compress/index.html`: if the dropped file's format isn't one
this tool can re-encode back into itself (canvas only reliably *encodes*
JPEG/PNG/WebP; the audio/video encoders here only cover MP3/Ogg Vorbis/WAV
and MP4·M4V·MOV·MKV/WebM respectively), it's reported as unsupported rather
than silently switched to some other format.

## Why there's only a Target size control

Earlier versions of this tool also had a Quality slider and a "Just compress"
auto mode alongside Target size. Both were removed — not for scope reasons,
but because they actively made the tool confusing or slow for no real
benefit:

- The Quality slider is a genuine no-op for PNG (canvas's PNG encoder is
  always lossless) and for WAV under the old bit-depth/rate mapping, which
  read as the control being broken rather than "not applicable here."
- "Just compress" needed a real binary search (multiple full re-encodes) to
  back up its own promise of "smaller, at the best quality" — cheap for
  images, tolerable for audio, but for video each attempt is a full FFmpeg
  pass, so it either had to fake it with a single fixed-quality preset (which
  could — and once did, in testing — produce a file *larger* than the
  original on an already-compressed source) or accept a slow multi-pass
  search. Target size sidesteps the whole problem: the user states the
  outcome they want directly, and every format has a well-defined way to hit
  it (quality search for JPEG/WebP/MP3/Ogg Vorbis, resizing for PNG,
  resampling for WAV, bitrate for video).

## A real video bug this surfaced: odd pixel dimensions

`libx264` (used for MP4/M4V/MOV/MKV output) refuses to encode video whose
width or height isn't divisible by 2 — a source with an odd dimension in
either axis (common from screen recordings, certain crop/edit tools, and
other non-camera capture paths) previously made every re-encode of that file
fail outright with `width not divisible by 2 (WxH)`. Two compounding
problems made this worse than a normal error:

1. `ffmpeg.exec()` resolves with a nonzero exit code rather than rejecting,
   and FFmpeg can still leave an empty file behind on a failed encode — so
   without checking both the exit code *and* the output size, a failed
   compress looked like a success with a 0-byte, unopenable "video" handed
   back to the user.
2. VP8 (used for WebM output) doesn't have this restriction, so the bug was
   invisible in WebM-only testing and only showed up for MP4/MOV/MKV/M4V
   sources with odd dimensions.

Both are fixed in `MODES.video.run()`: every encode now applies
`-vf scale=trunc(iw/2)*2:trunc(ih/2)*2` unconditionally (crops at most one
pixel off either axis — imperceptible — regardless of the source's actual
dimensions), and the exit code plus a minimum output-size check both have to
pass before a result is treated as successful.
