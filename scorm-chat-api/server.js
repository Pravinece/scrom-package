const fs = require("fs");
const path = require("path");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./docs/swagger.js");
const { initConfig, getConfig } = require("./config/index.js");
const { UPLOADS_DIR } = require("./lib/process-package.js");
const { errorHandler } = require("./middleware/error.middleware.js");

const authRoutes = require("./routes/auth.routes.js");
const packageRoutes = require("./routes/package.routes.js");
const chatRoutes = require("./routes/chat.routes.js");
const speechRoutes = require("./routes/speech.routes.js");

async function main() {
  await initConfig();

  fs.mkdirSync(path.join(UPLOADS_DIR, "_incoming"), { recursive: true });

  const app = express();

  // ---- global middleware ----
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ---- health ----
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // ---- swagger docs ----
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

  // ---- routes ----
  app.use("/auth", authRoutes);
  app.use("/packages", packageRoutes);
  app.use("/", chatRoutes);
  app.use("/", speechRoutes);

  // ---- global error handler ----
  app.use(errorHandler);

  const { port } = getConfig();
  app.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("[api] failed to start:", err.message || err);
  process.exit(1);
});
