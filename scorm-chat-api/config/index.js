require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const { loadAzureConfig, makeAzureOpenAIClient, makeSearchClient, makeSearchIndexClient } = require("../../lib-shared/azure-config.js");
const { getClient } = require("../../lib-shared/mongo.js");

let _config = null;
let _openaiClient = null;
let _searchClient = null;
let _searchIndexClient = null;

async function initConfig() {
  _config = loadAzureConfig();
  _openaiClient = makeAzureOpenAIClient(_config);
  _searchClient = makeSearchClient(_config);
  _searchIndexClient = makeSearchIndexClient(_config);
  await getClient();
  console.log("[config] Azure + MongoDB clients initialized");
}

function getConfig() {
  if (!_config) throw new Error("Config not initialized. Call initConfig() first.");
  return _config;
}

function getOpenAIClient() {
  if (!_openaiClient) throw new Error("OpenAI client not initialized.");
  return _openaiClient;
}

function getSearchClient() {
  if (!_searchClient) throw new Error("Search client not initialized.");
  return _searchClient;
}

function getSearchIndexClient() {
  if (!_searchIndexClient) throw new Error("Search index client not initialized.");
  return _searchIndexClient;
}

module.exports = { initConfig, getConfig, getOpenAIClient, getSearchClient, getSearchIndexClient };
