/**
 * @file world-db.mjs
 * LevelDB database operations, safety checks, and backup management.
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Dynamically resolve classic-level relative to the system's package.json
const systemRequire = createRequire(import.meta.url);
let ClassicLevel;
try {
  ClassicLevel = systemRequire("classic-level").ClassicLevel;
} catch {
  // Fallback to parent node_modules lookup
  const rootRequire = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../package.json"));
  ClassicLevel = rootRequire("classic-level").ClassicLevel;
}

/**
 * Checks whether Foundry VTT is currently running on the host machine.
 * @returns {boolean}
 */
export function isFoundryRunning() {
  try {
    const cmd = process.platform === "win32"
      ? 'tasklist /FI "IMAGENAME eq Foundry Virtual Tabletop.exe" /NH'
      : "pgrep -f foundryvtt";
    const output = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return output.toLowerCase().includes("foundry");
  } catch {
    return false;
  }
}

/**
 * Removes leftover LevelDB LOCK files from copied worlds if Foundry is not running.
 * @param {string} dataDir Path to the world's `data` directory
 * @returns {string[]} List of removed lock file paths
 */
export function cleanStaleLocks(dataDir) {
  const removed = [];
  if (!fs.existsSync(dataDir)) return removed;

  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const lockPath = path.join(dataDir, entry.name, "LOCK");
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
        removed.push(lockPath);
      } catch (err) {
        console.warn(`[world-db] Could not remove lock file: ${lockPath} (${err.message})`);
      }
    }
  }
  return removed;
}

/**
 * Creates a backup copy of the world directory.
 * @param {string} worldDir Source world directory
 * @param {string} [customDest] Optional custom destination directory
 * @returns {string} Path to the created backup directory
 */
export function createBackup(worldDir, customDest = null) {
  const worldName = path.basename(worldDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = customDest || path.join(path.dirname(worldDir), `${worldName}-backup-${timestamp}`);

  fs.cpSync(worldDir, dest, { recursive: true });
  return dest;
}

/**
 * Clones a world to a new directory and adjusts its world ID.
 * @param {string} sourceDir
 * @param {string} cloneDir
 * @param {string} newId
 */
export function cloneWorld(sourceDir, cloneDir, newId) {
  fs.cpSync(sourceDir, cloneDir, { recursive: true });
  const worldJsonPath = path.join(cloneDir, "world.json");
  if (fs.existsSync(worldJsonPath)) {
    const data = JSON.parse(fs.readFileSync(worldJsonPath, "utf8"));
    data.id = newId;
    data.title = `${data.title || newId} [Dev]`;
    fs.writeFileSync(worldJsonPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
}

/**
 * Processes a single LevelDB collection.
 * @param {string} collectionPath Path to LevelDB folder
 * @param {string} collectionName Name of the collection (e.g. "actors")
 * @param {Function} transformRecordFn Function taking (doc, collectionName) -> { modified, doc }
 * @param {boolean} dryRun If true, changes are not written
 * @returns {Promise<{ scanned: number, modified: number }>}
 */
export async function processCollection(collectionPath, collectionName, transformRecordFn, dryRun = false) {
  let db;
  let scanned = 0;
  let modified = 0;

  try {
    db = new ClassicLevel(collectionPath, { valueEncoding: "json" });
    await db.open();
  } catch (err) {
    throw new Error(`Failed to open LevelDB at ${collectionPath}: ${err.message}`);
  }

  const batchOps = [];

  try {
    for await (const [key, value] of db.iterator()) {
      scanned++;
      const result = transformRecordFn(value, collectionName);
      if (result.modified) {
        modified++;
        if (!dryRun) {
          batchOps.push({ type: "put", key, value: result.doc });
        }
      }
    }

    if (batchOps.length > 0 && !dryRun) {
      await db.batch(batchOps);
    }
  } finally {
    await db.close();
  }

  return { scanned, modified };
}

/**
 * Clears in-flight combat encounters from the combats LevelDB.
 * @param {string} combatsPath Path to `data/combats`
 * @param {boolean} dryRun
 * @returns {Promise<number>} Number of combats cleared
 */
export async function clearCombatEncounters(combatsPath, dryRun = false) {
  if (!fs.existsSync(combatsPath)) return 0;
  let db;
  let count = 0;
  try {
    db = new ClassicLevel(combatsPath, { valueEncoding: "json" });
    await db.open();
    const deleteOps = [];
    for await (const [key] of db.iterator({ keys: true, values: false })) {
      count++;
      if (!dryRun) deleteOps.push({ type: "del", key });
    }
    if (deleteOps.length > 0 && !dryRun) {
      await db.batch(deleteOps);
    }
  } finally {
    if (db) await db.close();
  }
  return count;
}

