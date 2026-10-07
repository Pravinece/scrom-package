const router = require("express").Router();
const { getSpeechToken } = require("../controllers/speech.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");

/**
 * @swagger
 * /speech-token:
 *   get:
 *     summary: Get a short-lived Azure Speech token for browser STT/TTS
 *     tags: [Speech]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Speech token issued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 region: { type: string, example: "eastus" }
 *                 voice: { type: string, example: "en-US-AvaMultilingualNeural" }
 *       401:
 *         description: Unauthorized
 *       501:
 *         description: Azure Speech not configured on server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Failed to get token from Azure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/speech-token", authenticate, getSpeechToken);

module.exports = router;
