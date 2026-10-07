const { getPackagesCollection } = require("../../lib-shared/mongo.js");

// Document shape stored in MongoDB `packages` collection:
// {
//   _id: string,              (hex packageId e.g. "1da1fbedec45")
//   title: string | null,
//   status: "queued" | "unzipping" | "extracting" | "indexing" | "transcribing" | "ready" | "failed",
//   sourceZipName: string,
//   error: string | null,     (set on failure)
//   transcribed: boolean,
//   chunkCount: number,
//   stats: {
//     slideCount: number,
//     mcqResolved: number,
//     mcqTotal: number,
//     referenceDocuments: object[],
//     narration: object,
//     courseChunks: number,
//     referenceChunks: number,
//     skippedReferenceDocs: object[],
//   },
//   createdAt: Date,
//   updatedAt: Date,
// }

async function createPackage({ packageId, sourceZipName }) {
  const col = await getPackagesCollection();
  await col.insertOne({
    _id: packageId,
    title: null,
    status: "queued",
    sourceZipName,
    error: null,
    transcribed: false,
    chunkCount: null,
    stats: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { packageId, status: "queued" };
}

async function findAll() {
  const col = await getPackagesCollection();
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

async function findById(id) {
  const col = await getPackagesCollection();
  return col.findOne({ _id: id });
}

async function updateStatus(id, patch) {
  const col = await getPackagesCollection();
  return col.updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
}

module.exports = { createPackage, findAll, findById, updateStatus };
