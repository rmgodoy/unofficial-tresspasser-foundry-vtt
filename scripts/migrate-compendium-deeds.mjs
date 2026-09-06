/**
 * scripts/migrate-compendium-deeds.mjs
 * Standalone Node.js script to migrate all legacy deeds in json-packs/trespasser-content/
 * to the behavior-driven graph data model and update effect references across deeds and
 * all other items to use the canonical effect image instead of default effect.webp.
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

const { TRESPASSER_STATUS_EFFECTS } = await import("../module/config/status-effects.mjs");
const { convertOldDeedSystem, updateEffectReferencesInSystem } = await import("../module/helpers/migration-deed.mjs");
const { migrateToGraph } = await import("../module/helpers/migration-graph.mjs");

/**
 * Checks if a node layout has overlapping cards and adjusts positions.
 * @param {Array<object>} nodes
 * @returns {boolean} Whether any nodes were shifted
 */
function fixNodeOverlap(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return false;
  let fixed = false;

  const startNode = nodes.find(n => n.type === "start");
  if (startNode) {
    // If a node immediately after start was placed at x: 260 instead of 380, shift it
    for (const node of nodes) {
      if (node.id !== startNode.id && node.y === 180 && node.x >= 240 && node.x < 360) {
        node.x = 380;
        fixed = true;
      }
    }
  }

  return fixed;
}

async function run() {
  console.log(`Scanning compendium items in: ${PACKS_DIR}`);
  let files;
  try {
    files = await fs.readdir(PACKS_DIR);
  } catch (err) {
    console.error("Failed to read packs directory:", err);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PASS 1: Build canonical Effect image lookup map
  // ─────────────────────────────────────────────────────────────────────────────
  const effectMap = new Map();

  // Populate from known system status effects as baseline
  for (const entry of (TRESPASSER_STATUS_EFFECTS || [])) {
    if (entry.compendiumId && entry.img) {
      effectMap.set(entry.compendiumId, entry.img);
      effectMap.set(`Item.${entry.compendiumId}`, entry.img);
      effectMap.set(`Compendium.trespasser.trespasser-content.Item.${entry.compendiumId}`, entry.img);
    }
    if (entry.id && entry.img) {
      effectMap.set(entry.id.trim().toLowerCase(), entry.img);
    }
  }

  // Read all effect files in PACKS_DIR
  const parsedFiles = new Map();
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

    parsedFiles.set(file, json);

    if (json.type === "effect" && json.img) {
      const isCustomImg = !json.img.endsWith("effect.webp") && !json.img.endsWith("effects.webp");
      if (isCustomImg) {
        if (json._id) {
          effectMap.set(json._id, json.img);
          effectMap.set(`Item.${json._id}`, json.img);
          effectMap.set(`Compendium.trespasser.trespasser-content.Item.${json._id}`, json.img);
        }
        if (json.name) {
          effectMap.set(json.name.trim().toLowerCase(), json.img);
        }
      }
    }
  }

  console.log(`Discovered ${effectMap.size} effect reference mappings with custom images.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // PASS 2 & 3: Migrate Deeds & Update effect references across all items
  // ─────────────────────────────────────────────────────────────────────────────
  let totalDeeds = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  let deedEffectRefsUpdatedCount = 0;
  let otherItemsUpdatedCount = 0;

  for (const [file, json] of parsedFiles.entries()) {
    const filePath = path.join(PACKS_DIR, file);
    let fileModified = false;

    if (json.type === "deed") {
      totalDeeds++;

      const isAlreadyMigrated = (json.system?.graphVersion && json.system.graphVersion >= 1) ||
        (json.system?.graph?.nodes && json.system.graph.nodes.length > 0);

      if (!isAlreadyMigrated) {
        const rawSystem = json.system || {};
        const updatedSystem = migrateToGraph(convertOldDeedSystem(rawSystem, { effectMap }));
        updateEffectReferencesInSystem(updatedSystem, effectMap);
        json.system = updatedSystem;
        migratedCount++;
        fileModified = true;
        console.log(`Migrated Deed to Graph: ${json.name} (${file})`);
      } else {
        skippedCount++;
        // If already migrated, fix potential node overlap and update effect references
        const overlapFixed = fixNodeOverlap(json.system?.graph?.nodes);
        const effectRefsUpdated = updateEffectReferencesInSystem(json.system, effectMap);
        if (overlapFixed || effectRefsUpdated) {
          deedEffectRefsUpdatedCount++;
          fileModified = true;
          console.log(`Updated existing Deed (effects/layout): ${json.name} (${file})`);
        }
      }
    } else {
      // Non-deed items (weapons, equipment items, effect counterStates, injuries, etc.)
      const effectRefsUpdated = updateEffectReferencesInSystem(json.system, effectMap);
      if (effectRefsUpdated) {
        otherItemsUpdatedCount++;
        fileModified = true;
        console.log(`Updated effect references in ${json.type} "${json.name}" (${file})`);
      }
    }

    if (fileModified) {
      await fs.writeFile(filePath, JSON.stringify(json, null, 2) + "\n", "utf-8");
    }
  }

  console.log("\n=========================================");
  console.log(`Total Compendium files:    ${parsedFiles.size}`);
  console.log(`Total Deeds scanned:       ${totalDeeds}`);
  console.log(`Deeds migrated to Graph:   ${migratedCount}`);
  console.log(`Deeds already on Graph:    ${skippedCount}`);
  console.log(`Deeds updated (refs/pos):  ${deedEffectRefsUpdatedCount}`);
  console.log(`Other items updated:       ${otherItemsUpdatedCount}`);
  console.log("=========================================\n");
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
