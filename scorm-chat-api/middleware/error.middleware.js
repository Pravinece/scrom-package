const multer = require("multer");

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function errorHandler(err, _req, res, _next) {
  console.error("[api] error:", err.message || err);
  if (res.headersSent) return;
  const status = err.status || (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  const message =
    status === 413
      ? `File exceeds the ${(MAX_UPLOAD_BYTES / 1024 / 1024 / 1024).toFixed(1)}GB upload limit`
      : err.message || "internal error";
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
