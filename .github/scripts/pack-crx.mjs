#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   Wrap a built extension .zip in a signed CRX3 container.

   Depends on nothing. This repository has no package.json and no build
   step of any kind, and pulling an npm packer in to produce one file — a
   file whose whole job is to be signed with the key that decides what
   Chrome will accept as an update to an already-installed extension —
   would be the largest piece of supply chain in the repo by a wide
   margin. CRX3 is small enough to just write.

   The container is:

     "Cr24"                       magic
     uint32le 3                   format version
     uint32le len(header)
     header                       CrxFileHeader, protobuf
     zip                          the extension itself, verbatim

   and the signature inside the header covers a context string, the length
   of the signed header data, that data, and every byte of the zip — so
   the archive cannot be swapped out from under a valid signature.
   ═══════════════════════════════════════════════════════════════════════ */

import { createHash, createPrivateKey, createPublicKey, createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [zipPath, keyPath, outPath] = process.argv.slice(2);
if (!zipPath || !keyPath || !outPath) {
  console.error("usage: pack-crx.mjs <extension.zip> <key.pem> <out.crx>");
  process.exit(2);
}

/* ── Just enough protobuf ───────────────────────────────────────────────
   Only length-delimited fields are needed, so "encode a message" is
   "concatenate tag, length, bytes" and nothing else. */

function varint(value) {
  const out = [];
  let n = value;
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
}

/* Wire type 2 is length-delimited, which is every field CRX3 uses. */
const bytesField = (fieldNumber, buf) =>
  Buffer.concat([varint(fieldNumber * 8 + 2), varint(buf.length), buf]);

const zip = readFileSync(zipPath);
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });

/* The extension's identity is the first half of the SHA-256 of its public
   key. It is why the signing key must be kept and reused: a new key is a
   new ID, which to Chrome is a different extension entirely, not an
   update to this one. */
const crxId = createHash("sha256").update(publicKey).digest().subarray(0, 16);

/* SignedData { bytes crx_id = 1; } */
const signedHeaderData = bytesField(1, crxId);

/* The context string keeps a signature made for a CRX from being valid
   anywhere else. It is "CRX3 SignedData" with one trailing NUL — 16 bytes,
   not 15, and not 17. */
const SIGNATURE_CONTEXT = Buffer.from("CRX3 SignedData\0", "utf8");
const signedHeaderLength = Buffer.alloc(4);
signedHeaderLength.writeUInt32LE(signedHeaderData.length, 0);

const signer = createSign("sha256");
signer.update(SIGNATURE_CONTEXT);
signer.update(signedHeaderLength);
signer.update(signedHeaderData);
signer.update(zip);
const signature = signer.sign(privateKey);

/* AsymmetricKeyProof { bytes public_key = 1; bytes signature = 2; } */
const proof = Buffer.concat([bytesField(1, publicKey), bytesField(2, signature)]);

/* CrxFileHeader { repeated AsymmetricKeyProof sha256_with_rsa = 2;
                   bytes signed_header_data = 10000; } */
const header = Buffer.concat([bytesField(2, proof), bytesField(10000, signedHeaderData)]);

const version = Buffer.alloc(4);
version.writeUInt32LE(3, 0);
const headerLength = Buffer.alloc(4);
headerLength.writeUInt32LE(header.length, 0);

writeFileSync(
  outPath,
  Buffer.concat([Buffer.from("Cr24", "utf8"), version, headerLength, header, zip]),
);

/* Chrome writes an extension ID in base16 with the alphabet shifted off
   the digits, so "0f" reads as "ap". Printed because the ID is what you
   need to pin a policy, allow-list the extension, or check that a rebuild
   really did reuse the same key. */
const extensionId = crxId
  .toString("hex")
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

console.log(`extension id: ${extensionId}`);
console.log(`wrote ${outPath} (${zip.length} bytes zipped, ${header.length} bytes header)`);
