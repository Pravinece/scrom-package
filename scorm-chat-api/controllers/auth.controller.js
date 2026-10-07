const { registerUser, loginUser, createUserByAdmin, seedAdmin } = require("../services/auth.service.js");
const { validateRegister, validateLogin } = require("../schemas/auth.schema.js");

async function register(req, res, next) {
  try {
    const errors = validateRegister(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const user = await registerUser(req.body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validateLogin(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const result = await loginUser(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  res.json({ user: req.user });
}

async function seed(req, res, next) {
  try {
    const user = await seedAdmin();
    res.status(201).json({ message: "Admin seeded successfully", user });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const errors = validateRegister(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const user = await createUserByAdmin(req.body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, seed, createUser };
