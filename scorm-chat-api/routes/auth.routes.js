const router = require("express").Router();
const { register, login, me, seed, createUser } = require("../controllers/auth.controller.js");
const { authenticate, authorize } = require("../middleware/auth.middleware.js");

router.post("/seed", seed);

router.post("/login", login);

router.get("/me", authenticate, me);

router.post("/users", authenticate, authorize("admin"), createUser);

module.exports = router;
