const fs = require("fs");
const path = require("path");

const EXTRACT_OUT = path.join(__dirname, "..", "scorm-extract", "out");
const OUT_DIR = path.join(__dirname, "out");

/** One retrieval chunk per slide: on-screen text + narration transcript +
 * the resolved question/answer for any interaction, serialized into the
 * text so vector search can actually find it (the index only searches
 * `text` - anything not in there is invisible to retrieval). */
function chunkCourseContent(courseContent) {
  const chunks = [];
  for (const scene of courseContent.scenes) {
    const sectionLabel = scene.inferredLabel || scene.id;
    for (const slide of scene.slides) {
      const parts = [`${sectionLabel} — ${slide.title}`, slide.text];
      if (slide.narrationTranscript) {
        parts.push(`Narration (auto-transcribed, may contain errors): ${slide.narrationTranscript}`);
      }
      for (const interaction of slide.interactions) {
        if (!interaction.resolvedOptionTexts) continue;
        parts.push(
          `Question options: ${interaction.resolvedOptionTexts.join(" / ")}. ` +
            `Correct answer (resolved from course data, ${interaction.answerResolution}): ${interaction.correctOptionText}.`
        );
      }
      chunks.push({
        id: `course_${slide.id}`,
        sourceType: "course",
        docName: courseContent.meta.title,
        locator: `${sectionLabel} · ${slide.title} (${slide.id})`,
        section: sectionLabel,
        text: parts.filter(Boolean).join("\n"),
      });
    }
  }
  return chunks;
}

/** One chunk per PDF page; documents flagged likelyScanned are skipped (no
 * usable text) but still reported, not silently dropped. */
function chunkReferenceDocs(referenceDocsFile) {
  const chunks = [];
  const skipped = [];
  for (const doc of referenceDocsFile.documents) {
    if (doc.unsupportedFormat) {
      skipped.push({ relPath: doc.relPath, reason: `unsupported format ${doc.unsupportedFormat}` });
      continue;
    }
    if (doc.likelyScanned) {
      skipped.push({ relPath: doc.relPath, reason: `looks scanned (avg ${doc.avgCharsPerPage} chars/page) — needs OCR` });
      continue;
    }
    const docName = path.basename(doc.relPath, path.extname(doc.relPath));
    for (const page of doc.pages) {
      if (!page.text || !page.text.trim()) continue;
      chunks.push({
        id: `ref_${slug(docName)}_p${page.num}`,
        sourceType: "reference",
        docName,
        locator: `${docName}, p.${page.num}`,
        section: docName,
        text: `${docName} — page ${page.num}\n${page.text}`,
      });
    }
  }
  return { chunks, skipped };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Read a single extraction's output dir and build its chunk list. Used both
 * by the CLI (single fixed dir) and the per-package upload pipeline (a
 * dir per packageId). */
function buildChunksFromDir(extractOutDir) {
  const courseContent = JSON.parse(fs.readFileSync(path.join(extractOutDir, "course-content.json"), "utf-8"));
  const referenceDocsFile = JSON.parse(fs.readFileSync(path.join(extractOutDir, "reference-docs.json"), "utf-8"));

  const courseChunks = chunkCourseContent(courseContent);
  const { chunks: refChunks, skipped } = chunkReferenceDocs(referenceDocsFile);
  return { chunks: [...courseChunks, ...refChunks], courseChunks, refChunks, skipped, courseContent };
}

function main() {
  const { chunks, courseChunks, refChunks, skipped } = buildChunksFromDir(EXTRACT_OUT);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "chunks.json"), JSON.stringify(chunks, null, 2));

  console.log(`[chunk] ${courseChunks.length} course chunks, ${refChunks.length} reference-doc chunks (${skipped.length} doc(s) skipped)`);
  for (const s of skipped) console.log(`[chunk]   skipped ${s.relPath}: ${s.reason}`);
  console.log(`[chunk] wrote ${chunks.length} chunks to ${path.join(OUT_DIR, "chunks.json")}`);
}

if (require.main === module) main();
module.exports = { chunkCourseContent, chunkReferenceDocs, buildChunksFromDir };
