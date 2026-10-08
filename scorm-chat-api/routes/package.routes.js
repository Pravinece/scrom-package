const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { UPLOADS_DIR } = require("../lib/process-package.js");
const { upload, listPackages, getPackage, transcribe, getCourseContent, removePackage } = require("../controllers/package.controller.js");
const { authenticate, authorize } = require("../middleware/auth.middleware.js");

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const multerUpload = multer({
  dest: path.join(UPLOADS_DIR, "_incoming"),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

router.post("/", authenticate, authorize("admin", "uploader"), multerUpload.single("file"), upload);

router.get("/", authenticate, listPackages);

router.get("/:id", authenticate, getPackage);

router.post("/:id/transcribe", authenticate, authorize("admin"), transcribe);

router.get("/:id/course-content", authenticate, getCourseContent);

router.delete("/:id", authenticate, authorize("admin"), removePackage);

module.exports = router;
