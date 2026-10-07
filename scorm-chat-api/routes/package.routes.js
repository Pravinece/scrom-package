const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { UPLOADS_DIR } = require("../lib/process-package.js");
const { upload, listPackages, getPackage, transcribe, getCourseContent } = require("../controllers/package.controller.js");
const { authenticate, authorize } = require("../middleware/auth.middleware.js");

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const multerUpload = multer({
  dest: path.join(UPLOADS_DIR, "_incoming"),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/**
 * @swagger
 * /packages:
 *   post:
 *     summary: Upload a SCORM .zip package
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: SCORM .zip file (max 2GB)
 *     responses:
 *       202:
 *         description: Package queued for processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 packageId: { type: string, example: "1da1fbedec45" }
 *                 status: { type: string, example: "queued" }
 *       400:
 *         description: No file or not a .zip
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — requires admin or uploader role
 *       413:
 *         description: File exceeds 2GB limit
 */
router.post("/", authenticate, authorize("admin", "uploader"), multerUpload.single("file"), upload);

/**
 * @swagger
 * /packages:
 *   get:
 *     summary: List all packages
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all packages sorted by newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 packages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Package'
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, listPackages);

/**
 * @swagger
 * /packages/{id}:
 *   get:
 *     summary: Get a single package by ID
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package ID (hex string)
 *     responses:
 *       200:
 *         description: Package document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Package'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Package not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:id", authenticate, getPackage);

/**
 * @swagger
 * /packages/{id}/transcribe:
 *   post:
 *     summary: Trigger narration transcription for a ready package
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       202:
 *         description: Transcription started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 packageId: { type: string }
 *                 status: { type: string, example: "transcribing" }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — requires admin role
 *       404:
 *         description: Package not found
 *       409:
 *         description: Package not in ready status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/:id/transcribe", authenticate, authorize("admin"), transcribe);

/**
 * @swagger
 * /packages/{id}/course-content:
 *   get:
 *     summary: Get the extracted course-content.json for a package
 *     tags: [Packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Raw course-content.json file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: course-content.json not found for this package
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:id/course-content", authenticate, getCourseContent);

module.exports = router;
