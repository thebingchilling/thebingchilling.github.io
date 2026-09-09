# Vendored engines for /tools/compress

Everything here is vendored (not fetched from a CDN at runtime) so the
compress tool works fully offline and never depends on a third-party host,
matching `/tools/pdf/vendor`.

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

## `webp/` — lossless WebP encoding

An encode-only trim of [`@jsquash/webp`](https://www.npmjs.com/package/@jsquash/webp)
v1.5.0 (Apache-2.0), which repackages Google's libwebp compiled to
WebAssembly (from the Squoosh app). Used for the Image tab's PNG→WebP
convert-format suggestion.

- `webp/encode.js`, `webp/meta.js`, `webp/utils.js` — the package's encode
  path, copied as-is except `encode.js` had its SIMD-variant branch (which
  depends on the separate `wasm-feature-detect` package) removed so it
  always loads the plain, dependency-free encoder below. There's no decode
  path here — this tool only ever *encodes* to WebP; decoding a source PNG
  already goes through the browser's own `<canvas>`/`createImageBitmap`.
- `webp/enc/webp_enc.js` + `webp_enc.wasm` — the non-SIMD Emscripten build
  of libwebp's encoder, `codec/enc/webp_enc.{js,wasm}` from the same
  tarball.

`encode(imageData, { lossless: 1, exact: 1 })` is what makes this
genuinely lossless (bit-for-bit pixels), not just high-quality lossy.
Verified by round-tripping a test image with a semi-transparent region
through this encoder and Chrome's own WebP decoder: every visible
(alpha > 0) pixel came back byte-for-byte identical. The `exact` flag is
meant to also preserve RGB values hidden under fully-transparent pixels,
but that didn't hold up in this build/decoder combination — those bytes
came back zeroed. That's invisible by definition (it has zero effect on
how the image looks or any other quality measure), and is exactly why
libwebp's own `exact` flag defaults to off for most uses, so it isn't
treated as a blocker here — but it's worth knowing if some future use of
this encoder needs bit-exact roundtrips including invisible pixel data.

To update: `npm pack @jsquash/webp@<version>`, copy `encode.js`, `meta.js`,
`utils.js`, and `codec/enc/webp_enc.{js,wasm}` over these files, and
re-remove the SIMD branch in `encode.js` (diff against the previous
version to find it — it's the `wasm-feature-detect` import and the `simd()`
branch in the exported `init()`).

## `flac/` — lossless FLAC encoding

[`libflacjs`](https://www.npmjs.com/package/libflacjs) v5.6.0 (MIT), the
official FLAC reference encoder compiled to WebAssembly via Emscripten.
Used for the Audio tab's WAV→FLAC convert-format suggestion.

- `flac/libflac.min.wasm.js` + `libflac.min.wasm.wasm` — `dist/libflac.min.wasm.js`
  and `dist/libflac.min.wasm.wasm` from the package (the minified WASM
  build; there's also an asm.js variant and unminified/dev variants in the
  package we don't need). Loaded as a classic `<script>` (its only browser
  option — there's no ESM build), with `window.FLAC_SCRIPT_LOCATION` set to
  this directory *before* the script tag so its loader finds the `.wasm`
  file next to it rather than guessing a path.
- The library exposes a low-level, C-style API (`create_libflac_encoder`,
  `init_encoder_stream`, `FLAC__stream_encoder_process_interleaved`, ...)
  rather than a simple `encode()` call — `encodeFlac()` in
  `/tools/compress/index.html` wraps it into something that takes a decoded
  `AudioBuffer` and returns a `Blob`, chunking the samples so a long
  recording doesn't block the main thread for one huge synchronous call.

Verified with a round-trip test: encoded a synthetic stereo signal to FLAC,
decoded it back with the browser's own native FLAC decoder
(`decodeAudioData`), and compared samples — the only difference was
16-bit quantization rounding (~0.00003), i.e. genuinely lossless, not an
approximation. On real WAV files this typically runs 40-60% smaller than
the original.

To update: `npm pack libflacjs@<version>`, copy `dist/libflac.min.wasm.js`
and `dist/libflac.min.wasm.wasm` over these files.

## Why the only format switch is the opt-in "convert" suggestion

Every tab still keeps the output in the same file type as the input by
default — there's no format-conversion dropdown, and nothing converts
automatically. The one exception is a small, dismissible suggestion shown
next to Target size when converting would be a strictly lossless win (PNG
→ WebP, WAV → FLAC): same pixels/samples, smaller file, and the user has to
click "Convert to X" to accept it. It's never offered for a format pair
that would trade away quality — that's what the Target size slider and its
existing per-format quality search are for.

The `capability(file)` check per tab in `/tools/compress/index.html` is
still what happens to everything else: if the dropped file's format isn't
one this tool can re-encode back into itself (canvas only reliably
*encodes* JPEG/PNG/WebP; the audio encoder here only covers MP3/Ogg
Vorbis/WAV), it's reported as unsupported rather than silently switched to
some other format.

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
  images, tolerable for audio. Target size sidesteps the whole problem: the
  user states the outcome they want directly, and every format has a
  well-defined way to hit it (quality search for JPEG/WebP/MP3/Ogg Vorbis,
  resizing for PNG, resampling for WAV).

## Why there's no video tab

An earlier version of this tool had a Video tab backed by a vendored build
of [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm). It was removed
entirely. In-browser, single-threaded, no-hardware-acceleration video
encoding turned out to be a poor fit for a tool meant to feel instant:
even a realistic 108 MB/60-second 1080p clip took over a minute to
re-encode at the fastest usable settings, the ~31 MB engine download was
itself a failure point on a flaky connection, and getting it fully correct
(even dimensions for libx264, exit-code/output-size validation, avoiding
this build's crash-prone VP9 encoder) kept surfacing more edge cases than
the feature was worth for a static site with no server-side encoding to
fall back on.
