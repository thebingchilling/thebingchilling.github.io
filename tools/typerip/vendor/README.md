# Vendored: opentype.js + JSZip

Both files are vendored (not fetched from a CDN at runtime) so `/tools/typerip`
works without depending on a third-party script host.

- `opentype.js` — parses and rebuilds font glyph data to repair encoding
  issues in fonts served for preview use. This is the exact modified build
  (v1.1.0, with a glyph-rebuild fix) shipped by
  [`beemilkz/typerip`](https://github.com/beemilkz/typerip) (`js/opentype.js`),
  itself a fork of [`opentype.js`](https://opentype.js.org/) by Frederik De
  Bleser and contributors. MIT license. Kept at this exact version because
  the glyph-rebuild logic in `index.html` depends on its specific
  `opentype.Glyph`/`opentype.Font` constructor behavior.
- `jszip.min.js` — packages downloaded fonts into a `.zip` for download.
  Source: [`Stuk/jszip`](https://github.com/Stuk/jszip) (`dist/jszip.min.js`),
  MIT license.

To update `jszip.min.js`: re-copy `dist/jszip.min.js` from the JSZip repo at
the desired version. `opentype.js` should only be updated alongside testing
the glyph-rebuild code that depends on it.
