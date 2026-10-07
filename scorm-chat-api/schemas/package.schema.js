function validateAskBody(body) {
  const errors = [];
  if (!body.question || typeof body.question !== "string") errors.push("question is required and must be a string");
  if (!body.packageId || typeof body.packageId !== "string") errors.push("packageId is required and must be a string");
  return errors;
}

module.exports = { validateAskBody };
