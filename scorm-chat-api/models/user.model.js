const { getDb } = require("../../lib-shared/mongo.js");
const { ObjectId } = require("mongodb");

// Document shape stored in MongoDB `users` collection:
// {
//   _id: ObjectId,
//   name: string,
//   empId: string,        (unique)
//   passwordHash: string,
//   role: "admin" | "user",
//   createdAt: Date,
// }

async function getCollection() {
  const db = await getDb();
  return db.collection("users");
}

async function createUser({ name, empId, passwordHash, role = "user" }) {
  const col = await getCollection();
  const result = await col.insertOne({ name, empId, passwordHash, role, createdAt: new Date() });
  return { _id: result.insertedId, name, empId, role };
}

async function findByEmpId(empId) {
  const col = await getCollection();
  return col.findOne({ empId });
}

async function findById(id) {
  const col = await getCollection();
  return col.findOne({ _id: new ObjectId(id) }, { projection: { passwordHash: 0 } });
}

async function updateRole(id, role) {
  const col = await getCollection();
  return col.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
}

module.exports = { createUser, findByEmpId, findById, updateRole };
