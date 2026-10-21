const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createPackage, getAllPackages, getPackageById, deletePackage } = require("../services/package.service.js");
const { processPackage, transcribePackage, UPLOADS_DIR } = require("../lib/process-package.js");
const { loadAzureConfig, makeSearchClient } = require("../../lib-shared/azure-config.js");
const { deletePackageChunks } = require("../../scorm-index/embed-and-index.js");

const EXTRACT_ROOT = path.join(__dirname, "..", "..", "scorm-extract", "out");

async function upload(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: "upload a .zip as multipart field `file`" });
    if (!req.file.originalname.toLowerCase().endsWith(".zip")) {
      fs.rm(req.file.path, { force: true }, () => {});
      return res.status(400).json({ error: "only .zip uploads are accepted" });
    }
    const packageId = crypto.randomBytes(6).toString("hex");
    await createPackage({ packageId, sourceZipName: req.file.originalname });
    processPackage({ packageId, zipPath: req.file.path, originalFilename: req.file.originalname });
    res.status(202).json({ packageId, status: "queued" });
  } catch (err) {
    next(err);
  }
}

async function listPackages(req, res, next) {
  try {
    const packages = await getAllPackages();
    res.json({ packages });
  } catch (err) {
    next(err);
  }
}

async function getPackage(req, res, next) {
  try {
    const pkg = await getPackageById(req.params.id);
    res.json(pkg);
  } catch (err) {
    next(err);
  }
}

async function transcribe(req, res, next) {
  try {
    const pkg = await getPackageById(req.params.id);
    if (pkg.status !== "ready") {
      return res.status(409).json({ error: `package status is "${pkg.status}", must be "ready" first` });
    }
    res.status(202).json({ packageId: req.params.id, status: "transcribing" });
    transcribePackage(req.params.id).catch((err) =>
      console.error(`[transcribe] ${req.params.id} failed:`, err.message)
    );
  } catch (err) {
    next(err);
  }
}

function getCourseContent(req, res, next) {
  try {
    const p = path.join(EXTRACT_ROOT, req.params.id, "course-content.json");
    if (!fs.existsSync(p)) return res.status(404).json({ error: "course-content.json not found for this package" });
    res.sendFile(p);
  } catch (err) {
    next(err);
  }
}

async function removePackage(req, res, next) {
  try {
    const pkg = await getPackageById(req.params.id);

    // 1. Delete Azure Search chunks
    const config = loadAzureConfig();
    const searchClient = makeSearchClient(config);
    await deletePackageChunks(searchClient, pkg._id);

    // 2. Delete uploaded/unzipped files
    const uploadsDir = path.join(UPLOADS_DIR, pkg._id);
    fs.rm(uploadsDir, { recursive: true, force: true }, () => {});

    // 3. Delete extracted output
    const extractDir = path.join(EXTRACT_ROOT, pkg._id);
    fs.rm(extractDir, { recursive: true, force: true }, () => {});

    // 4. Delete from MongoDB
    await deletePackage(pkg._id);

    res.json({ packageId: pkg._id, deleted: true });
  } catch (err) {
    next(err);
  }
}

function getScormRoot(packageId) {
  // Real location after unzip
  const dir = path.join(UPLOADS_DIR, packageId, "package");

  if (fs.existsSync(path.join(dir, "imsmanifest.xml"))) {
    return dir;
  }

  // Fallback (just in case some packages are different)
  const fallbacks = [
    path.join(UPLOADS_DIR, packageId),
    path.join(UPLOADS_DIR, packageId, "unzipped"),
    path.join(UPLOADS_DIR, packageId, "extracted"),
  ];

  for (const fallback of fallbacks) {
    if (fs.existsSync(path.join(fallback, "imsmanifest.xml"))) {
      return fallback;
    }
  }

  return null;
}


// Keep your existing getCourseContent (AI summary JSON)
function getCourseContent(req, res, next) {
  try {
    const p = path.join(EXTRACT_ROOT, req.params.id, "course-content.json");
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: "course-content.json not found for this package" });
    }
    res.sendFile(p);
  } catch (err) {
    next(err);
  }
}

// ────────────────────────────────────────────────
// NEW: return imsmanifest.xml
// ────────────────────────────────────────────────
async function getManifest(req, res, next) {
  try {
    const packageId = req.params.id;

    // Optional: check package exists & is ready
    const pkg = await getPackageById(packageId);
    if (pkg.status !== "ready") {
      return res.status(409).json({ error: `package status is "${pkg.status}", must be "ready"` });
    }

    const scormRoot = getScormRoot(packageId);
    if (!scormRoot) {
      return res.status(404).json({ error: "imsmanifest.xml not found for this package" });
    }

    const manifestPath = path.join(scormRoot, "imsmanifest.xml");
    res.type("application/xml");
    res.sendFile(manifestPath);
  } catch (err) {
    next(err);
  }
}

// ────────────────────────────────────────────────
// NEW: serve any file inside the SCORM package
// GET /:id/content/story.html
// GET /:id/content/story_content/slides/slide1.js
// etc.
// ────────────────────────────────────────────────
async function serveScormContent(req, res, next) {
  try {
    const packageId = req.params.id;
    const relativePath = req.params.path;   // ← changed from req.params[0]
    
    if (!relativePath || relativePath.includes("..")) {
      return res.status(400).json({ error: "invalid path" });
    }

    const scormRoot = getScormRoot(packageId);
    if (!scormRoot) {
      return res.status(404).json({ error: "SCORM package files not found" });
    }

    const absolutePath = path.resolve(scormRoot, relativePath);

    // Security: make sure the resolved path is still inside scormRoot
    if (!absolutePath.startsWith(path.resolve(scormRoot))) {
      return res.status(403).json({ error: "access denied" });
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return res.status(404).json({ error: "file not found" });
    }

    // Let Express set the correct Content-Type
    res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  upload,
  listPackages,
  getPackage,
  transcribe,
  getCourseContent,
  removePackage,
  getManifest,          // ← new
  serveScormContent,    // ← new
};