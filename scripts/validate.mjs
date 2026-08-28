import fs from "node:fs";
import path from "node:path";

const manifest = JSON.parse(fs.readFileSync(path.resolve("manifest.json"), "utf8"));
const list = Array.isArray(manifest.scrapers)
  ? manifest.scrapers
  : Array.isArray(manifest.providers)
    ? manifest.providers
    : [];

if (!list.length) {
  throw new Error("manifest.json contains no scrapers/providers");
}

const seen = new Set();

for (const item of list) {
  if (!item.id || !item.filename) {
    throw new Error("Every provider needs id and filename");
  }

  if (item.id.toLowerCase() === "anichin") {
    throw new Error("Anichin must not exist in VUEO-Providers");
  }

  if (seen.has(item.id)) {
    throw new Error(`Duplicate provider id: ${item.id}`);
  }
  seen.add(item.id);

  const file = path.resolve(item.filename);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing provider file: ${item.filename}`);
  }

  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("getStreams")) {
    throw new Error(`${item.filename} does not expose getStreams`);
  }
}

console.log(`Validated ${list.length} VUEO provider entries.`);
