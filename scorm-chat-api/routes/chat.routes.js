const router = require("express").Router();
const { ask } = require("../controllers/chat.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");

/**
 * @swagger
 * /ask:
 *   post:
 *     summary: Ask a question about a SCORM package (RAG chat)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AskRequest'
 *     responses:
 *       200:
 *         description: AI-generated answer with citations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AskResponse'
 *       400:
 *         description: Missing question or packageId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal error (Azure OpenAI or Search failure)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/ask", authenticate, ask);

module.exports = router;
