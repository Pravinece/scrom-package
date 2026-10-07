const path = require("path");
const fs = require("fs");

const ATTACHMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]);

/**
 * Generic detection of bundled reference/attachment documents: any file the
 * manifest declares whose extension looks like a document, not hardcoded to
 * specific filenames. Common Storyline pattern: "click to download the
 * reference document" triggers pointing at story_content/external_files/.
 */
function findAttachments(scormRoot, declaredFiles) {
  const found = [];
  for (const rel of declaredFiles) {
    const ext = path.extname(rel).toLowerCase();
    if (!ATTACHMENT_EXTENSIONS.has(ext)) continue;
    const abs = path.join(scormRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    found.push({ relPath: rel, absPath: abs, ext, sizeBytes: stat.size });
  }
  return found;
}

module.exports = { findAttachments, ATTACHMENT_EXTENSIONS };
