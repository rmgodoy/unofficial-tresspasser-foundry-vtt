/**
 * scripts/migrate-compendium-deeds.mjs
 * Standalone Node.js script to migrate all legacy deeds in json-packs/trespasser-content/
 * to the behavior-driven graph data model.
 *
 * Usage: node scripts/migrate-compendium-deeds.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.resolve(__dirname, "../json-packs/trespasser-content");

// Shim global foundry.utils for headless Node execution
globalThis.foundry = {
  utils: {
    randomID: (len = 16) => crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len),
    deepClone: (obj) => structuredClone(obj)
  }
};

const { convertOldDeedSystem } = await import("../module/helpers/migration-deed.mjs");
const { migrateToGraph } = await import("../module/helpers/migration-graph.mjs");

async function run() {
  console.log(`Scanning deed JSON files in: ${PACKS_DIR}`);
  let files;
  try {
    files = await fs.readdir(PACKS_DIR);
  } catch (err) {
    console.error("Failed to read packs directory:", err);
    process.exit(1);
  }

  let totalDeeds = 0;
  let migratedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(PACKS_DIR, file);

    let content;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      console.warn(`Could not read file ${file}:`, err);
      continue;
    }

    let json;
    try {
      json = JSON.parse(content);
    } catch (err) {
      console.warn(`Could not parse JSON in ${file}:`, err);
      continue;
    }

    if (json.type !== "deed") continue;
    totalDeeds++;

    // Check if deed already has graphVersion or graph nodes
    const isAlreadyMigrated = (json.system?.graphVersion && json.system.graphVersion >= 1) ||
      (json.system?.graph?.nodes && json.system.graph.nodes.length > 0);

    if (isAlreadyMigrated) {
      skippedCount++;
      continue;
    }

    const rawSystem = json.system || {};
    const updatedSystem = migrateToGraph(convertOldDeedSystem(rawSystem));

    json.system = updatedSystem;

    await fs.writeFile(filePath, JSON.stringify(json, null, 2) + "\n", "utf-8");
    migratedCount++;
    console.log(`Migrated: ${json.name} (${file})`);
  }

  console.log("\n=========================================");
  console.log(`Total Deeds scanned: ${totalDeeds}`);
  console.log(`Migrated:            ${migratedCount}`);
  console.log(`Skipped (current):   ${skippedCount}`);
  console.log("=========================================");
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
