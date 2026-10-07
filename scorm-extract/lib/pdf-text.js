const fs = require("fs");
const { PDFParse } = require("pdf-parse");

// A text-based page with real content averages well over this; a page that
// came back near-empty is a strong signal the source is a scanned image,
// not a formatting fluke - flag the whole document rather than silently
// indexing near-nothing.
const SCANNED_PAGE_CHAR_THRESHOLD = 40;

/**
 * Extract per-page text from a bundled reference PDF.
 * @returns {{ relPath, totalPages, pages: [{num, text}], likelyScanned, avgCharsPerPage }}
 */
async function extractPdfText(attachment) {
  const buf = fs.readFileSync(attachment.absPath);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const pages = result.pages.map((p) => ({ num: p.num, text: p.text || "" }));
    const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
    const avgCharsPerPage = pages.length ? totalChars / pages.length : 0;
    return {
      relPath: attachment.relPath,
      totalPages: pages.length,
      pages,
      likelyScanned: avgCharsPerPage < SCANNED_PAGE_CHAR_THRESHOLD,
      avgCharsPerPage: Math.round(avgCharsPerPage),
    };
  } finally {
    await parser.destroy();
  }
}

module.exports = { extractPdfText, SCANNED_PAGE_CHAR_THRESHOLD };
