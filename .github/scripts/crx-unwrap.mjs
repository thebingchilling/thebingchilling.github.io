#!/usr/bin/env node
/* Write out the zip a CRX wraps, so it can be diffed against the source
   it claims to be. The header is length-prefixed, so the payload is
   everything past it — no parsing needed. */

import { readFileSync, writeFileSync } from "node:fs";

const [crxPath, outPath] = process.argv.slice(2);
if (!crxPath || !outPath) {
  console.error("usage: crx-unwrap.mjs <in.crx> <out.zip>");
  process.exit(2);
}

const crx = readFileSync(crxPath);
if (crx.subarray(0, 4).toString() !== "Cr24") throw new Error("not a CRX");
if (crx.readUInt32LE(4) !== 3) throw new Error("not CRX3");

writeFileSync(outPath, crx.subarray(12 + crx.readUInt32LE(8)));
