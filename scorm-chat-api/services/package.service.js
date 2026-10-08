const { createPackage: create, findAll, findById, deleteById } = require("../models/package.model.js");

async function createPackage({ packageId, sourceZipName }) {
  return create({ packageId, sourceZipName });
}

async function getAllPackages() {
  return findAll();
}

async function getPackageById(id) {
  const pkg = await findById(id);
  if (!pkg) throw Object.assign(new Error("unknown packageId"), { status: 404 });
  return pkg;
}

async function deletePackage(id) {
  return deleteById(id);
}

module.exports = { createPackage, getAllPackages, getPackageById, deletePackage };
