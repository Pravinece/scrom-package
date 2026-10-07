const path = require("path");
const { loadGlobalProvideData } = require("./storyline-data.js");

/**
 * Pull every rendered text string out of a per-slide Storyline data file, in
 * document order. Storyline nests visible text as `<object>.vartext.blocks[]
 * .spans[].text`, but plenty of other UI copy also just shows up as a bare
 * `"text"` string property elsewhere in the tree - walking the whole object
 * for any property literally named `text` with a non-empty string value
 * (deduping immediate repeats) reliably captures on-screen copy without
 * needing to special-case every object kind Storyline emits.
 */
function extractSlideTexts(slideJsPath) {
  const data = loadGlobalProvideData(slideJsPath);
  const out = [];
  walk(data, out);
  const deduped = [];
  for (const t of out) {
    if (deduped[deduped.length - 1] === t) continue;
    deduped.push(t);
  }
  return deduped;
}

function walk(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "text" && typeof value === "string" && value.trim()) {
      out.push(value);
    } else {
      walk(value, out);
    }
  }
}

/** Slide id -> path to its data file, generically (no hardcoded ids). */
function slideJsPath(html5DataJsDir, slideId) {
  return path.join(html5DataJsDir, `${slideId}.js`);
}

module.exports = { extractSlideTexts, slideJsPath };
