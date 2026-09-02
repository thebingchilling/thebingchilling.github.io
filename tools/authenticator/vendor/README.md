# Vendored: jsQR

`jsQR.js` is vendored (not fetched from a CDN at runtime) so `/tools/authenticator`
works fully offline and never depends on a third-party host.

- Source package: [`jsqr`](https://github.com/cozmo/jsQR) v1.4.0 (npm), Apache-2.0
- Used only to decode a QR code out of a locally-chosen image file (`otpauth://`
  URIs) — the image never leaves the browser.

To update: `npm pack jsqr@<version>`, then copy `dist/jsQR.js` from the
tarball into this folder.
