const { getConfig } = require("../config/index.js");

async function getSpeechToken(req, res, next) {
  try {
    const config = getConfig();
    if (!config.speech) {
      return res.status(501).json({ error: "Azure Speech isn't configured (set AZURE_SPEECH_KEY / AZURE_SPEECH_REGION in .env)" });
    }
    const tokenRes = await fetch(
      `https://${config.speech.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: "POST", headers: { "Ocp-Apim-Subscription-Key": config.speech.key, "Content-Length": "0" } }
    );
    if (!tokenRes.ok) throw new Error(`token issuance failed: HTTP ${tokenRes.status}`);
    const token = await tokenRes.text();
    res.json({ token, region: config.speech.region, voice: config.speech.voice });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSpeechToken };
