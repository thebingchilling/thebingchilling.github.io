#!/usr/bin/env bash
# Packages each of the site's three projects (Media, Live, Tools) into its
# own standalone zip under dist/, bundling the shared shell (shared/, icons/,
# manifest.webmanifest, sw.js) each project needs to run self-hosted.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/dist"
rm -rf "$out"
mkdir -p "$out"

stage() {
  local name="$1"; shift
  local dir
  dir="$(mktemp -d)"
  for item in "$@"; do
    cp -r "$root/$item" "$dir/"
  done
  ( cd "$dir" && zip -rq "$out/$name.zip" . )
  rm -rf "$dir"
  echo "Built $out/$name.zip"
}

stage media index.html shared icons manifest.webmanifest sw.js
stage live  live.html  shared icons manifest.webmanifest sw.js
stage tools tools      shared icons manifest.webmanifest sw.js

echo "Done. Zips in $out/"
