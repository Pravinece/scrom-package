const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const AdmZip = require("adm-zip");
const { updateStatus: updatePackageStatus } = require("../models/package.model.js");
const { loadAzureConfig, makeAzureOpenAIClient, makeSearchIndexClient, makeSearchClient } = require("../../lib-shared/azure-config.js");
const { buildChunksFromDir } = require("../../scorm-index/chunk.js");
const { embedAndIndexChunks, deletePackageChunks } = require("../../scorm-index/embed-and-index.js");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const EXTRACT_ROOT = path.join(__dirname, "..", "..", "scorm-extract", "out");
const EXTRACT_SCRIPT = path.join(__dirname, "..", "..", "scorm-extract", "extract.js");

async function updateStatus(packageId, patch) {
  await updatePackageStatus(packageId, patch);
}

function runExtract(scormRoot, outDir, { transcribe = false } = {}) {
  const args = [EXTRACT_SCRIPT, scormRoot, "--out", outDir];
  if (transcribe) args.push("--transcribe");
  return new Promise((resolve, reject) => {
    // execFile with an args array (no shell) handles paths containing
    // spaces correctly without manual quoting.
    execFile("node", args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || "").slice(-4000)));
      resolve(stdout);
    });
  });
}

/** Locate the SCORM root inside an unzipped folder: the directory that
 * directly contains imsmanifest.xml, which may not be the zip's top level
 * if the author zipped a wrapping folder. */
function findScormRoot(extractedDir) {
  if (fs.existsSync(path.join(extractedDir, "imsmanifest.xml"))) return extractedDir;
  const entries = fs.readdirSync(extractedDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    const candidate = path.join(extractedDir, entry.name);
    if (fs.existsSync(path.join(candidate, "imsmanifest.xml"))) return candidate;
  }
  throw new Error("imsmanifest.xml not found in the uploaded zip (checked top level and one level down)");
}

async function indexPackage(packageId, extractOutDir) {
  const { chunks, courseChunks, refChunks, skipped } = buildChunksFromDir(extractOutDir);
  const config = loadAzureConfig();
  const indexClient = makeSearchIndexClient(config);
  const searchClient = makeSearchClient(config);
  const openaiClient = makeAzureOpenAIClient(config);
  const result = await embedAndIndexChunks({ config, indexClient, searchClient, openaiClient, chunks, packageId });
  return { result, courseChunks, refChunks, skipped };
}

async function processPackage({ packageId, zipPath, originalFilename }) {
  try {
    await updateStatus(packageId, { status: "unzipping" });
    const extractedDir = path.join(UPLOADS_DIR, packageId, "package");
    fs.mkdirSync(extractedDir, { recursive: true });
    new AdmZip(zipPath).extractAllTo(extractedDir, true);
    const scormRoot = findScormRoot(extractedDir);

    await updateStatus(packageId, { status: "extracting" });
    const extractOutDir = path.join(EXTRACT_ROOT, packageId);
    await runExtract(scormRoot, extractOutDir);

    const courseContent = JSON.parse(fs.readFileSync(path.join(extractOutDir, "course-content.json"), "utf-8"));
    const verificationReport = JSON.parse(fs.readFileSync(path.join(extractOutDir, "verification-report.json"), "utf-8"));
    await updateStatus(packageId, { status: "indexing", title: courseContent.meta.title });

    const { result, courseChunks, refChunks, skipped } = await indexPackage(packageId, extractOutDir);

    await updateStatus(packageId, {
      status: "ready",
      title: courseContent.meta.title,
      chunkCount: result.count,
      transcribed: false,
      stats: {
        slideCount: verificationReport.slides.slidesInCourseStructure,
        mcqResolved: verificationReport.answerKey.resolvedAgainstOnScreenText,
        mcqTotal: verificationReport.answerKey.totalMultipleChoiceInteractions,
        referenceDocuments: verificationReport.referenceDocuments,
        narration: verificationReport.narration,
        courseChunks: courseChunks.length,
        referenceChunks: refChunks.length,
        skippedReferenceDocs: skipped,
      },
    });
  } catch (err) {
    console.error(`[process-package] ${packageId} failed:`, err.message);
    await updateStatus(packageId, { status: "failed", error: err.message });
  } finally {
    fs.rm(zipPath, { force: true }, () => {});
  }
}

/** Re-run with --transcribe on an already-processed package's SCORM root
 * (cached: already-transcribed clips are skipped, see lib/transcribe.js),
 * then re-chunk/re-index so the narration text becomes searchable. */
async function transcribePackage(packageId) {
  const extractedDir = path.join(UPLOADS_DIR, packageId, "package");
  const scormRoot = findScormRoot(extractedDir);
  const extractOutDir = path.join(EXTRACT_ROOT, packageId);

  await updateStatus(packageId, { status: "transcribing" });
  await runExtract(scormRoot, extractOutDir, { transcribe: true });

  await updateStatus(packageId, { status: "indexing" });
  const { result } = await indexPackage(packageId, extractOutDir);
  await updateStatus(packageId, { status: "ready", transcribed: true, chunkCount: result.count });
}

module.exports = { processPackage, transcribePackage, findScormRoot, UPLOADS_DIR };
