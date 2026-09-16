// Runs font parsing + glyph-rebuild off the main thread. Repairing a font
// with opentype.js is synchronous, CPU-heavy work (it walks every glyph's
// path); doing it on the UI thread for a handful of large font files froze
// the whole page for the duration. This worker does the fetch, parse, and
// rebuild, then hands back the finished bytes.
"use strict";
importScripts("vendor/opentype.js");

self.onmessage = async function (e) {
  const { id, url, raw, familyName, style } = e.data;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("HTTP " + res.status + " fetching font.");
    const arrayBuffer = await res.arrayBuffer();

    if (raw) {
      self.postMessage({ id, ok: true, buffer: arrayBuffer }, [arrayBuffer]);
      return;
    }

    const fontData = opentype.parse(arrayBuffer);
    const buffer = repairFont(fontData, familyName, style);
    self.postMessage({ id, ok: true, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};

// Same glyph-rebuild logic ported from the original typerip client — fixes
// encoding issues in fonts served for preview use.
function repairFont(fontData, familyName, styleName) {
  const glyphFields = ["name", "unicode", "unicodes", "path", "index", "advanceWidth", "leftSideBearing"];
  const rebuiltGlyphs = [];
  for (let i = 0; i < fontData.glyphs.length; i++) {
    const raw = fontData.glyphs.glyphs[i];
    const glyphData = {};
    glyphFields.forEach((field) => { if (raw[field] != null) glyphData[field] = raw[field]; });

    // Hotfix: a NaN/zero advance width crashes opentype's writer.
    if (glyphData.advanceWidth == null || isNaN(glyphData.advanceWidth)) {
      let newAdvanceWidth = Math.floor(raw.getBoundingBox().x2);
      if (newAdvanceWidth === 0) newAdvanceWidth = fontData.glyphs.glyphs[0].getBoundingBox().x2;
      glyphData.advanceWidth = newAdvanceWidth;
    }

    const rebuiltGlyph = new opentype.Glyph(glyphData);
    // Hotfix: the Glyph constructor silently drops fields whose value is 0.
    glyphFields.forEach((field) => { if (glyphData[field] != null && glyphData[field] === 0) rebuiltGlyph[field] = 0; });
    rebuiltGlyphs.push(rebuiltGlyph);
  }

  const newFontData = { familyName: familyName, styleName: styleName, glyphs: rebuiltGlyphs };
  ["defaultWidthX", "nominalWidthX", "unitsPerEm", "ascender", "descender"].forEach((field) => {
    if (fontData[field] != null) newFontData[field] = fontData[field];
  });
  return new opentype.Font(newFontData).toArrayBuffer();
}
