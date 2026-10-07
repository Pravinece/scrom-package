const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SCORM Chat API",
      version: "1.0.0",
      description: "RBAC-protected API for SCORM package extraction, indexing, and AI-powered chat",
    },
    servers: [{ url: "http://localhost:8787", description: "Local dev server" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        // ---- Auth ----
        RegisterRequest: {
          type: "object",
          required: ["name", "empId", "password"],
          properties: {
            name: { type: "string", example: "John Doe" },
            empId: { type: "string", example: "EMP001" },
            password: { type: "string", minLength: 6, example: "secret123" },
            role: { type: "string", enum: ["admin", "uploader", "viewer"], default: "viewer" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["empId", "password"],
          properties: {
            empId: { type: "string", example: "EMP001" },
            password: { type: "string", example: "secret123" },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            token: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                empId: { type: "string" },
                role: { type: "string", enum: ["admin", "uploader", "viewer"] },
              },
            },
          },
        },
        // ---- Package ----
        Package: {
          type: "object",
          properties: {
            _id: { type: "string", example: "1da1fbedec45" },
            title: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["queued", "unzipping", "extracting", "indexing", "transcribing", "ready", "failed"],
            },
            sourceZipName: { type: "string" },
            transcribed: { type: "boolean" },
            chunkCount: { type: "number", nullable: true },
            stats: {
              type: "object",
              nullable: true,
              properties: {
                slideCount: { type: "number" },
                mcqResolved: { type: "number" },
                mcqTotal: { type: "number" },
                courseChunks: { type: "number" },
                referenceChunks: { type: "number" },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        // ---- Chat ----
        AskRequest: {
          type: "object",
          required: ["question", "packageId"],
          properties: {
            question: { type: "string", example: "What is the correct pipe order?" },
            packageId: { type: "string", example: "1da1fbedec45" },
            history: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["user", "assistant"] },
                  content: { type: "string" },
                },
              },
            },
          },
        },
        AskResponse: {
          type: "object",
          properties: {
            answer: { type: "string" },
            citations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sourceType: { type: "string", enum: ["course", "reference"] },
                  docName: { type: "string" },
                  locator: { type: "string" },
                  score: { type: "number" },
                },
              },
            },
          },
        },
        // ---- Error ----
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./scorm-chat-api/routes/*.js"],
};

module.exports = swaggerJsdoc(options);
