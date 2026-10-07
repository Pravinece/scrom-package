const router = require("express").Router();
const { register, login, me, seed, createUser } = require("../controllers/auth.controller.js");
const { authenticate, authorize } = require("../middleware/auth.middleware.js");

/**
 * @swagger
 * /auth/seed:
 *   post:
 *     summary: Seed the first admin user (one-time, uses SEED_ADMIN_* from .env)
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       201:
 *         description: Admin seeded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Admin seeded successfully" }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     empId: { type: string }
 *                     role: { type: string, example: "admin" }
 *       400:
 *         description: SEED_ADMIN_EMP_ID or SEED_ADMIN_PASSWORD not set in .env
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Admin already seeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/seed", seed);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation errors
 *       401:
 *         description: Invalid empId or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current logged-in user info
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user payload from JWT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     empId: { type: string }
 *                     role: { type: string }
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authenticate, me);

/**
 * @swagger
 * /auth/users:
 *   post:
 *     summary: Admin creates a new user (any role including admin)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User created by admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     empId: { type: string }
 *                     role: { type: string }
 *       400:
 *         description: Validation errors
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       409:
 *         description: empId already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/users", authenticate, authorize("admin"), createUser);

module.exports = router;
