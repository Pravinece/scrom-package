const { askQuestion } = require("../services/chat.service.js");
const { validateAskBody } = require("../schemas/package.schema.js");

async function ask(req, res, next) {
  try {
    const errors = validateAskBody(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const { question, history, packageId } = req.body;
    const result = await askQuestion({ question, history, packageId });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { ask };
