// Validation shapes for auth request bodies.
// No Mongoose here — these are plain validators used in the controller
// before hitting the service layer.

const ROLES = ["admin", "user"];

function validateRegister(body) {
  const errors = [];
  if (!body.name || typeof body.name !== "string") errors.push("name is required");
  if (!body.empId || typeof body.empId !== "string") errors.push("empId is required");
  if (!body.password || body.password.length < 6) errors.push("password must be at least 6 characters");
  if (body.role && !ROLES.includes(body.role)) errors.push(`role must be one of: ${ROLES.join(", ")}`);
  return errors;
}

function validateLogin(body) {
  const errors = [];
  if (!body.empId || typeof body.empId !== "string") errors.push("empId is required");
  if (!body.password || typeof body.password !== "string") errors.push("password is required");
  return errors;
}

module.exports = { validateRegister, validateLogin, ROLES };
