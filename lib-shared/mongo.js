const { MongoClient } = require("mongodb");

// "localhost" intermittently hangs the driver on this machine (IPv6 ::1
// resolves but doesn't answer, and server selection stalls waiting on it
// before falling back) - 127.0.0.1 connects immediately.
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "scorm_verification";

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

async function getDb() {
  const client = await getClient();
  return client.db(DB_NAME);
}

async function getPackagesCollection() {
  const db = await getDb();
  return db.collection("packages");
}

module.exports = { getClient, getDb, getPackagesCollection };
