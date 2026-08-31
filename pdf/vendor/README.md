# Vendored: qpdf compiled to WebAssembly

`qpdf.js` + `qpdf.wasm` are vendored (not fetched from a CDN at runtime) so the
`/pdf` tool works fully offline and never depends on a third-party host.

- Source package: [`@neslinesli93/qpdf-wasm`](https://github.com/neslinesli93/qpdf-wasm) v0.3.0 (npm)
- Underlying engine: [QPDF](https://github.com/qpdf/qpdf), licensed Apache-2.0
- Wrapper package license: ISC

To update: `npm pack @neslinesli93/qpdf-wasm@<version>`, then copy
`dist/qpdf.js` and `dist/qpdf.wasm` from the tarball into this folder.
