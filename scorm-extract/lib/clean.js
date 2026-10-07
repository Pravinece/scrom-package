// Generalized de-duplication: no per-course hardcoded blocklists (beyond a
// small set of universal Storyline player-chrome strings, stable across any
// Storyline export). Everything else is auto-detected from repetition.

const UNIVERSAL_CHROME = new Set([
  "notes", "menu", "help", "exit", "continue", "submit", "hint", "pdf",
  "revisit", "yes", "no", "try again", "name :",
]);

function isPaginationNoise(s) {
  if (/^\d{1,3}$/.test(s)) return true; // "01"
  if (/^\/\d{1,3}$/.test(s)) return true; // "/07"
  if (/^\d{1,3}\^%\^$/.test(s)) return true; // "09^%^" (timer)
  if (/^\d+(\.\d+)?$/.test(s)) return true; // raw table numbers
  if (/^\d{1,2}:\d{2}(\s*h)?$/i.test(s)) return true; // raw timestamps
  return false;
}

function norm(t) {
  return t.replace(/\r|\n/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @param {Array<{id:string, texts:string[]}>} slides
 * @param {number} boilerplateThreshold fraction of slides a line must appear on to be auto-stripped (default 0.5)
 * @returns {{ cleanedSlides: Array<{id:string, text:string}>, report: object }}
 */
function cleanCorpus(slides, boilerplateThreshold = 0.5) {
  const normalizedPerSlide = slides.map((s) => {
    const seen = new Set();
    const uniq = [];
    for (const raw of s.texts) {
      const t = norm(raw);
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(t);
    }
    return { id: s.id, texts: uniq };
  });

  const freq = new Map();
  for (const s of normalizedPerSlide) {
    for (const t of s.texts) {
      const key = t.toLowerCase();
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
  const n = normalizedPerSlide.length;
  const autoBoilerplate = new Set(
    [...freq.entries()]
      .filter(([, count]) => count / n >= boilerplateThreshold)
      .map(([key]) => key)
  );

  const strippedExamples = new Map(); // key -> {text, count}
  const cleanedSlides = normalizedPerSlide.map((s) => {
    const kept = [];
    for (const t of s.texts) {
      const key = t.toLowerCase();
      if (UNIVERSAL_CHROME.has(key) || isPaginationNoise(t) || autoBoilerplate.has(key)) {
        if (autoBoilerplate.has(key) && !UNIVERSAL_CHROME.has(key)) {
          strippedExamples.set(key, { text: t, count: freq.get(key) });
        }
        continue;
      }
      kept.push(t);
    }
    return { id: s.id, text: kept.join(" | ") };
  });

  return {
    cleanedSlides,
    report: {
      totalSlides: n,
      boilerplateThreshold,
      autoDetectedBoilerplateLines: [...strippedExamples.values()].sort((a, b) => b.count - a.count),
    },
  };
}

module.exports = { cleanCorpus };
