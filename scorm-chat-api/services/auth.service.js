const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createUser, findByEmpId, findById } = require("../models/user.model.js");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

async function registerUser({ name, empId, password, role = "user" }) {
  const existing = await findByEmpId(empId);
  if (existing) throw Object.assign(new Error("empId already registered"), { status: 409 });
  const passwordHash = await bcrypt.hash(password, 10);
  return createUser({ name, empId, passwordHash, role });
}

async function loginUser({ empId, password }) {
  const user = await findByEmpId(empId);
  if (!user) throw Object.assign(new Error("Invalid empId or password"), { status: 401 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw Object.assign(new Error("Invalid empId or password"), { status: 401 });
  const token = jwt.sign(
    { id: user._id.toString(), empId: user.empId, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  return { token, user: { id: user._id, name: user.name, empId: user.empId, role: user.role } };
}

async function createUserByAdmin({ name, empId, password, role = "user" }) {
  const existing = await findByEmpId(empId);
  if (existing) throw Object.assign(new Error("empId already registered"), { status: 409 });
  const passwordHash = await bcrypt.hash(password, 10);
  return createUser({ name, empId, passwordHash, role });
}

async function seedAdmin() {
  const empId = process.env.SEED_ADMIN_EMP_ID;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Super Admin";
  if (!empId || !password) {
    throw Object.assign(
      new Error("SEED_ADMIN_EMP_ID and SEED_ADMIN_PASSWORD must be set in .env"),
      { status: 400 }
    );
  }
  const existing = await findByEmpId(empId);
  if (existing) throw Object.assign(new Error("Admin already seeded"), { status: 409 });
  const passwordHash = await bcrypt.hash(password, 10);
  return createUser({ name, empId, passwordHash, role: "admin" });
}

async function getUserById(id) {
  return findById(id);
}

module.exports = { registerUser, loginUser, createUserByAdmin, seedAdmin, getUserById, JWT_SECRET };
