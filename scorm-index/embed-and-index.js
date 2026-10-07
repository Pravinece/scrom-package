const fs = require("fs");
const path = require("path");
const { loadAzureConfig, makeAzureOpenAIClient, makeSearchIndexClient, makeSearchClient } = require("../lib-shared/azure-config.js");

const CHUNKS_PATH = path.join(__dirname, "out", "chunks.json");
const EMBED_BATCH_SIZE = 16;
const UPLOAD_BATCH_SIZE = 100;

function buildIndexDefinition(config) {
  return {
    name: config.search.indexName,
    fields: [
      // Globally unique across every package: `${packageId}__${chunkId}` -
      // Azure Search keys allow only letters/digits/_/-/= , so ":" can't be
      // the separator.
      // Storyline's own short ids aren't guaranteed unique across
      // independently-authored projects, so the package-scoped chunkId
      // alone can't safely be the key once more than one package shares
      // an index.
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "chunkId", type: "Edm.String", filterable: true },
      { name: "packageId", type: "Edm.String", filterable: true, facetable: true },
      { name: "text", type: "Edm.String", searchable: true },
      { name: "sourceType", type: "Edm.String", filterable: true, facetable: true },
      { name: "docName", type: "Edm.String", filterable: true, facetable: true },
      { name: "section", type: "Edm.String", filterable: true, facetable: true },
      { name: "locator", type: "Edm.String" },
      {
        name: "contentVector",
        type: "Collection(Edm.Single)",
        vectorSearchDimensions: config.openai.embeddingDimensions,
        vectorSearchProfileName: "default-profile",
        searchable: true,
      },
    ],
    vectorSearch: {
      algorithms: [{ name: "hnsw-config", kind: "hnsw" }],
      profiles: [{ name: "default-profile", algorithmConfigurationName: "hnsw-config" }],
    },
  };
}

async function ensureIndex(indexClient, config) {
  const definition = buildIndexDefinition(config);
  console.log(`[index] creating/updating index "${config.search.indexName}"...`);
  await indexClient.createOrUpdateIndex(definition);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function embedAll(openaiClient, config, chunks, onProgress) {
  const batches = chunkArray(chunks, EMBED_BATCH_SIZE);
  const vectors = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const res = await openaiClient.embeddings.create({
      model: config.openai.embeddingDeployment,
      input: batch.map((c) => c.text),
    });
    for (const item of res.data) vectors.push(item.embedding);
    if (onProgress) onProgress(vectors.length, chunks.length);
  }
  return vectors;
}

/** Embed and upload one package's chunks into the shared index, tagged with
 * packageId so /ask can filter to just this package. Callable both from the
 * CLI (below) and directly from the upload-processing pipeline. */
async function embedAndIndexChunks({ config, indexClient, searchClient, openaiClient, chunks, packageId, onProgress }) {
  await ensureIndex(indexClient, config);

  const vectors = await embedAll(openaiClient, config, chunks, onProgress);
  const documents = chunks.map((c, i) => ({
    id: `${packageId}__${c.id}`,
    chunkId: c.id,
    packageId,
    text: c.text,
    sourceType: c.sourceType,
    docName: c.docName,
    section: c.section,
    locator: c.locator,
    contentVector: vectors[i],
  }));

  const batches = chunkArray(documents, UPLOAD_BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const result = await searchClient.mergeOrUploadDocuments(batches[i]);
    const failed = result.results.filter((r) => !r.succeeded);
    if (failed.length) {
      throw new Error(`${failed.length} document(s) failed to index: ${JSON.stringify(failed.slice(0, 3))}`);
    }
  }
  return { count: documents.length };
}

/** Remove all indexed chunks for one package (re-processing a package
 * should not leave its old chunk set behind under stale ids). */
async function deletePackageChunks(searchClient, packageId) {
  let deleted = 0;
  while (true) {
    const results = await searchClient.search("", { filter: `packageId eq '${packageId}'`, select: ["id"], top: 1000 });
    const ids = [];
    for await (const r of results.results) ids.push(r.document.id);
    if (!ids.length) break;
    await searchClient.deleteDocuments(ids.map((id) => ({ id })));
    deleted += ids.length;
  }
  return deleted;
}

async function main() {
  const args = process.argv.slice(2);
  const packageIdArg = args.find((a) => a.startsWith("--package-id="));
  const packageId = packageIdArg ? packageIdArg.split("=")[1] : "default";
  if (!packageIdArg) console.log(`[index] no --package-id= given, using "default" (fine for single-package CLI use)`);

  const config = loadAzureConfig();
  const chunks = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf-8"));
  console.log(`[index] ${chunks.length} chunks to embed + index for package "${packageId}"`);

  const indexClient = makeSearchIndexClient(config);
  const searchClient = makeSearchClient(config);
  const openaiClient = makeAzureOpenAIClient(config);

  const result = await embedAndIndexChunks({
    config, indexClient, searchClient, openaiClient, chunks, packageId,
    onProgress: (done, total) => process.stdout.write(`\r[embed] ${done}/${total}`),
  });
  console.log(`\n[index] done — ${result.count} chunks indexed into "${config.search.indexName}" (package "${packageId}")`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[index] failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = { buildIndexDefinition, embedAll, embedAndIndexChunks, deletePackageChunks };
