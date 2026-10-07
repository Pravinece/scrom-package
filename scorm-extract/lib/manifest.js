const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

/**
 * Parse a SCORM package's imsmanifest.xml: course title and the full list of
 * files the package declares as resources. That declared list is the
 * authoritative inventory later stages reconcile extraction against.
 */
function parseManifest(scormRoot) {
  const manifestPath = path.join(scormRoot, "imsmanifest.xml");
  const xml = fs.readFileSync(manifestPath, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const manifest = doc.manifest;

  const org = manifest.organizations?.organization;
  const title = org?.title || manifest.metadata?.title || null;

  const resource = manifest.resources?.resource;
  const resources = Array.isArray(resource) ? resource : [resource].filter(Boolean);

  const declaredFiles = new Set();
  for (const res of resources) {
    if (res["@_href"]) declaredFiles.add(res["@_href"]);
    const files = res.file;
    const fileList = Array.isArray(files) ? files : [files].filter(Boolean);
    for (const f of fileList) {
      if (f && f["@_href"]) declaredFiles.add(f["@_href"]);
    }
  }

  return {
    title,
    identifier: manifest["@_identifier"] || null,
    declaredFiles: [...declaredFiles],
  };
}

module.exports = { parseManifest };
