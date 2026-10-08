const router = require("express").Router();
const { ask } = require("../controllers/chat.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");

router.post("/ask", authenticate, ask);

module.exports = router;
