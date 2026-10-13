const { MongoClient } = require("mongodb");

// "localhost" intermittently hangs the driver on this machine (IPv6 ::1
// resolves but doesn't answer, and server selection stalls waiting on it
// before falling back) - 127.0.0.1 connects immediately.
let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

async function getDb() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB);
}

async function getPackagesCollection() {
  const db = await getDb();
  return db.collection("packages");
}

module.exports = { getClient, getDb, getPackagesCollection };
