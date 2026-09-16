# Vendored: JSZip

Vendored (not fetched from a CDN at runtime) so `/tools/typerip` works
without depending on a third-party script host.

- `jszip.min.js` — packages downloaded fonts into a `.zip` for download.
  Source: [`Stuk/jszip`](https://github.com/Stuk/jszip) (`dist/jszip.min.js`),
  MIT license.

To update: re-copy `dist/jszip.min.js` from the JSZip repo at the desired
version.

(This tool previously also vendored opentype.js to parse and rebuild font
glyph data, fixing encoding issues in fonts served for preview use. That
processing step was removed — it was synchronous, CPU-heavy work that could
freeze the page on some fonts' outline data — so fonts are now downloaded
exactly as Adobe serves them.)
