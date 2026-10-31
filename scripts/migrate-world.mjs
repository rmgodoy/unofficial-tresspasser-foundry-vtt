#!/usr/bin/env node
/**
 * @file migrate-world.mjs
 * CLI tool to migrate a Foundry VTT world from `trespasser-beta` to local development `trespasser`.
 *
 * Usage:
 *   node scripts/migrate-world.mjs --world <world-folder-name> [options]
 *
 * Options:
 *   --world, -w <name>     Name of the world folder inside Data/worlds/ (Required)
 *   --clone-to, -c <name>  Clone to a new world directory before migrating
 *   --dry-run              Inspect and report transformations without modifying files
 *   --clear-combat         Clear in-flight combat encounters
 *   --no-backup            Skip creating an automatic backup copy
 *   --data-dir <path>      Custom path to Foundry VTT Data directory
 *   --help, -h             Show help message
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { transformRecord, transformWorldJson, SOURCE_SYSTEM_ID, TARGET_SYSTEM_ID } from "./lib/world-transformer.mjs";
import {
  isFoundryRunning,
  cleanStaleLocks,
  createBackup,
  cloneWorld,
  processCollection,
  clearCombatEncounters
} from "./lib/world-db.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DATA_DIR = path.resolve(SYSTEM_ROOT, "../..");

/**
 * Parses CLI command line arguments.
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = {
    world: null,
    cloneTo: null,
    dryRun: false,
    clearCombat: false,
    backup: true,
    dataDir: DEFAULT_DATA_DIR,
    help: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--world" || arg === "-w") args.world = argv[++i];
    else if (arg === "--clone-to" || arg === "-c") args.cloneTo = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--clear-combat") args.clearCombat = true;
    else if (arg === "--no-backup") args.backup = false;
    else if (arg === "--data-dir") args.dataDir = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`[migrate-world] Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  return args;
}

/**
 * Displays script usage help.
 */
function printUsage() {
  console.log(`
Trespasser World Migration Tool (Beta -> Dev)
Migrates a Foundry VTT world from '${SOURCE_SYSTEM_ID}' to '${TARGET_SYSTEM_ID}'.

Usage:
  node scripts/migrate-world.mjs --world <folder-name> [options]

Options:
  --world, -w <name>     Name of the world folder inside Data/worlds/ (Required)
  --clone-to, -c <name>  Clone to a new world directory before migrating
  --dry-run              Inspect and report transformations without modifying files
  --clear-combat         Clear in-flight combat encounters
  --no-backup            Skip creating an automatic backup copy
  --data-dir <path>      Custom path to Foundry VTT Data directory
  --help, -h             Show this help message
`);
}

/**
 * Main execution routine.
 */
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // 1. Validate Data and Worlds directories
  const worldsDir = path.join(args.dataDir, "worlds");
  if (!fs.existsSync(worldsDir)) {
    console.error(`[migrate-world] Error: Worlds directory not found at: ${worldsDir}`);
    process.exit(1);
  }

  // 2. Validate requested world
  if (!args.world) {
    console.error("[migrate-world] Error: Missing required '--world <name>' argument.\n");
    const available = fs.readdirSync(worldsDir).filter(name => fs.statSync(path.join(worldsDir, name)).isDirectory());
    console.log("Available worlds in Data/worlds/:");
    for (const w of available) console.log(`  - ${w}`);
    console.log();
    process.exit(1);
  }

  const sourceWorldDir = path.join(worldsDir, args.world);
  if (!fs.existsSync(sourceWorldDir)) {
    console.error(`[migrate-world] Error: World folder does not exist: ${sourceWorldDir}`);
    process.exit(1);
  }

  const sourceWorldJsonPath = path.join(sourceWorldDir, "world.json");
  if (!fs.existsSync(sourceWorldJsonPath)) {
    console.error(`[migrate-world] Error: Missing world.json in ${sourceWorldDir}`);
    process.exit(1);
  }

  const worldData = JSON.parse(fs.readFileSync(sourceWorldJsonPath, "utf8"));
  console.log(`\n=== Trespasser World Migrator: ${worldData.title} (${args.world}) ===`);
  console.log(`Current system: ${worldData.system} | Version: ${worldData.systemVersion || "unknown"}`);

  // 3. Check if Foundry is running
  if (isFoundryRunning()) {
    console.error("\n[migrate-world] ERROR: Foundry VTT is currently running!");
    console.error("Please shut down Foundry VTT before running this migration to avoid database lock collisions.\n");
    process.exit(1);
  }

  // 4. Target directory determination (Clone vs In-place)
  let targetWorldDir = sourceWorldDir;
  if (args.cloneTo) {
    targetWorldDir = path.join(worldsDir, args.cloneTo);
    if (fs.existsSync(targetWorldDir)) {
      console.error(`[migrate-world] Error: Target clone directory already exists: ${targetWorldDir}`);
      process.exit(1);
    }
  }

  // 5. Read local system version
  let localSystemVersion = null;
  const localSystemJsonPath = path.join(SYSTEM_ROOT, "system.json");
  if (fs.existsSync(localSystemJsonPath)) {
    try {
      const localSystem = JSON.parse(fs.readFileSync(localSystemJsonPath, "utf8"));
      localSystemVersion = localSystem.version;
    } catch {}
  }

  // 6. Pre-flight lock cleanup on source
  const cleanedSourceLocks = cleanStaleLocks(path.join(sourceWorldDir, "data"));
  if (cleanedSourceLocks.length > 0) {
    console.log(`[migrate-world] Cleaned ${cleanedSourceLocks.length} stale LOCK file(s) from source world.`);
  }

  // 7. Backup / Clone step
  if (args.cloneTo) {
    if (args.dryRun) {
      console.log(`[migrate-world] [DRY RUN] Would clone ${args.world} -> ${args.cloneTo}`);
    } else {
      console.log(`[migrate-world] Cloning ${args.world} -> ${args.cloneTo}...`);
      cloneWorld(sourceWorldDir, targetWorldDir, args.cloneTo);
      cleanStaleLocks(path.join(targetWorldDir, "data"));
    }
  } else if (!args.dryRun && args.backup) {
    const backupPath = createBackup(sourceWorldDir);
    console.log(`[migrate-world] Created safety backup at: ${backupPath}`);
  }

  // 8. Update world.json
  const targetWorldJsonPath = path.join(targetWorldDir, "world.json");
  if (args.dryRun) {
    console.log(`[migrate-world] [DRY RUN] Would update world.json (system: ${SOURCE_SYSTEM_ID} -> ${TARGET_SYSTEM_ID})`);
  } else {
    const updatedWorldJson = transformWorldJson(worldData, localSystemVersion);
    fs.writeFileSync(targetWorldJsonPath, JSON.stringify(updatedWorldJson, null, 2) + "\n", "utf8");
    console.log(`[migrate-world] Updated world.json (system: ${TARGET_SYSTEM_ID}, version: ${localSystemVersion || "unchanged"})`);
  }

  // 9. Process LevelDB collections
  const dataDir = path.join(targetWorldDir, "data");
  if (!fs.existsSync(dataDir)) {
    console.log("[migrate-world] Notice: No 'data' directory found. Nothing to transform.");
    process.exit(0);
  }

  const collections = fs.readdirSync(dataDir).filter(name => {
    return fs.statSync(path.join(dataDir, name)).isDirectory();
  });

  console.log(`\nScanning ${collections.length} LevelDB collections...`);
  let totalScanned = 0;
  let totalModified = 0;

  for (const collection of collections) {
    const colPath = path.join(dataDir, collection);
    try {
      const { scanned, modified } = await processCollection(colPath, collection, transformRecord, args.dryRun);
      totalScanned += scanned;
      totalModified += modified;

      if (modified > 0 || args.dryRun) {
        const mode = args.dryRun ? "[DRY RUN]" : "[DONE]";
        console.log(`  - ${collection.padEnd(12)}: ${scanned} records scanned, ${modified} modified ${mode}`);
      }
    } catch (err) {
      console.error(`  - ${collection.padEnd(12)}: ERROR: ${err.message}`);
    }
  }

  // 10. Optional clear combat
  if (args.clearCombat) {
    const combatsPath = path.join(dataDir, "combats");
    const cleared = await clearCombatEncounters(combatsPath, args.dryRun);
    console.log(`[migrate-world] ${args.dryRun ? "[DRY RUN] Would clear" : "Cleared"} ${cleared} in-flight combat encounter(s).`);
  }

  console.log("\n==========================================");
  console.log(`Total scanned:  ${totalScanned}`);
  console.log(`Total modified: ${totalModified} ${args.dryRun ? "(simulated)" : ""}`);
  console.log(`Target world:   ${path.basename(targetWorldDir)}`);
  console.log("==========================================");

  if (args.dryRun) {
    console.log("\nDry run completed successfully. No files were written.");
  } else {
    console.log("\nMigration completed successfully! You can now start Foundry VTT and open the world.");
  }
}

main().catch(err => {
  console.error(`\n[migrate-world] Fatal error: ${err.stack || err.message}`);
  process.exit(1);
});

