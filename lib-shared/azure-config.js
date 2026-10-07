// Explicit path, not CWD-relative dotenv default - otherwise this silently
// finds nothing if a script is ever launched from outside app/.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const REQUIRED = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_EMBEDDING_DEPLOYMENT",
  "AZURE_OPENAI_CHAT_DEPLOYMENT",
  "AZURE_SEARCH_ENDPOINT",
  "AZURE_SEARCH_API_KEY",
  "AZURE_SEARCH_INDEX_NAME",
];

function loadAzureConfig() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `Copy .env.example to .env at the project root and fill these in.`
    );
  }
  return {
    openai: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      embeddingDimensions: Number(process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS || 1536),
      chatDeployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
    },
    search: {
      endpoint: process.env.AZURE_SEARCH_ENDPOINT,
      apiKey: process.env.AZURE_SEARCH_API_KEY,
      indexName: process.env.AZURE_SEARCH_INDEX_NAME,
    },
    // Optional - not in REQUIRED, so the rest of the app (text chat,
    // extraction, indexing) keeps working before/without a Speech resource.
    // null signals "not configured" to the /speech-token route.
    speech:
      process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION
        ? {
            key: process.env.AZURE_SPEECH_KEY,
            region: process.env.AZURE_SPEECH_REGION,
            voice: process.env.AZURE_SPEECH_VOICE || "en-US-AvaMultilingualNeural",
          }
        : null,
    port: Number(process.env.PORT || 8787),
  };
}

function makeAzureOpenAIClient(config) {
  const { AzureOpenAI } = require("openai");
  return new AzureOpenAI({
    endpoint: config.openai.endpoint,
    apiKey: config.openai.apiKey,
    apiVersion: config.openai.apiVersion,
  });
}

function makeSearchIndexClient(config) {
  const { SearchIndexClient, AzureKeyCredential } = require("@azure/search-documents");
  return new SearchIndexClient(config.search.endpoint, new AzureKeyCredential(config.search.apiKey));
}

function makeSearchClient(config) {
  const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
  return new SearchClient(config.search.endpoint, config.search.indexName, new AzureKeyCredential(config.search.apiKey));
}

module.exports = { loadAzureConfig, makeAzureOpenAIClient, makeSearchIndexClient, makeSearchClient };
