const router = require("express").Router();
const { getSpeechToken } = require("../controllers/speech.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");

router.get("/speech-token", authenticate, getSpeechToken);

module.exports = router;
