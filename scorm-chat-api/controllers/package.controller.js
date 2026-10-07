const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createPackage, getAllPackages, getPackageById } = require("../services/package.service.js");
const { processPackage, transcribePackage } = require("../lib/process-package.js");

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

module.exports = { upload, listPackages, getPackage, transcribe, getCourseContent };
