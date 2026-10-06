/**
 * Local beta deployment.
 *
 * Builds a beta copy of this system next to it inside Foundry's `systems/` folder
 * (e.g. `systems/trespasser` -> `systems/trespasser-beta`), mirroring the GitHub release workflow:
 *   1. Copies the distributable files into the target folder.
 *   2. Runs `.github/scripts/prepare-release.mjs` with IS_BETA=true inside the copy
 *      (rewrites system id, paths, flag scopes, compendium refs, ...).
 *   3. Compiles `json-packs` into LevelDB `packs/` with the Foundry CLI and drops the JSON sources.
 *
 * The source tree is never modified.
 *
 * Usage:
 *   npm run deploy:beta
 *   node scripts/deploy-beta.mjs [--dest <folder>] [--skip-packs] [--keep-update-urls]
 *
 * Close any Foundry world using the beta system before redeploying (LevelDB packs would be locked).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREPARE_SCRIPT = path.join(ROOT, ".github", "scripts", "prepare-release.mjs");
const FVTT_CLI = path.join(ROOT, "node_modules", "@foundryvtt", "foundryvtt-cli", "fvtt.mjs");
const PACK_NAME = "trespasser-content";

const ROOT_FILES = ["system.json", "trespasser.mjs", "README.md", "CHANGELOG.md", "glossary.json"];
const DIRECTORIES = ["module", "styles", "templates", "lang", "assets", "babele", "json-packs"];

/**
 * Parse command line flags.
 * @param {string[]} argv
 * @returns {{ dest: string|null, skipPacks: boolean, keepUpdateUrls: boolean }}
 */
function parseArgs(argv) {
  const options = { dest: null, skipPacks: false, keepUpdateUrls: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dest") options.dest = argv[++i];
    else if (arg === "--skip-packs") options.skipPacks = true;
    else if (arg === "--keep-update-urls") options.keepUpdateUrls = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * Abort the deployment with an error message.
 * @param {string} message
 */
function fail(message) {
  console.error(`\n[deploy-beta] ERROR: ${message}`);
  process.exit(1);
}

/**
 * Run a child process synchronously and abort on failure.
 * @param {string} label
 * @param {string[]} args - Arguments passed to node.
 * @param {string} cwd
 * @param {object} [env]
 */
function runNode(label, args, cwd, env = {}) {
  console.log(`[deploy-beta] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
  if (result.status !== 0) fail(`${label} failed (exit code ${result.status}).`);
}

/**
 * Copy the distributable files into the destination folder.
 * @param {string} dest
 */
function copySources(dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const file of ROOT_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, file));
  }

  for (const dir of DIRECTORIES) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) {
      console.warn(`[deploy-beta] Skipping missing directory: ${dir}`);
      continue;
    }
    fs.cpSync(src, path.join(dest, dir), { recursive: true });
  }
}

/**
 * Compile the (already rewritten) json-packs into LevelDB packs inside the destination.
 * @param {string} dest
 */
function buildPacks(dest) {
  const source = path.join(dest, "json-packs", PACK_NAME);
  if (!fs.existsSync(source)) {
    console.warn("[deploy-beta] No json-packs found, skipping pack compilation.");
    return;
  }
  if (!fs.existsSync(FVTT_CLI)) fail("Foundry CLI not found. Run `npm install` first.");

  const out = path.join(dest, "packs");
  fs.mkdirSync(out, { recursive: true });
  runNode("Compiling compendium packs", [FVTT_CLI, "package", "pack", PACK_NAME, "--in", source, "--out", out, "--leveldb", "--clean"], ROOT);
}

/**
 * Remove release-only artifacts and (optionally) the GitHub update URLs from the deployed copy.
 * @param {string} dest
 * @param {boolean} keepUpdateUrls
 */
function finalize(dest, keepUpdateUrls) {
  fs.rmSync(path.join(dest, "release_notes.md"), { force: true });
  fs.rmSync(path.join(dest, "json-packs"), { recursive: true, force: true });

  if (keepUpdateUrls) return;
  // Without these, Foundry will not offer to overwrite the local build with the published beta.
  const systemPath = path.join(dest, "system.json");
  const system = JSON.parse(fs.readFileSync(systemPath, "utf8"));
  delete system.manifest;
  delete system.download;
  fs.writeFileSync(systemPath, JSON.stringify(system, null, 2) + "\n");
}

/** Entry point. */
function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(PREPARE_SCRIPT)) fail(`Missing ${PREPARE_SCRIPT}`);

  const system = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
  const baseId = system.id.replace(/-beta$/, "");
  const betaId = `${baseId}-beta`;

  const dest = path.resolve(options.dest ?? path.join(path.dirname(ROOT), betaId));
  if (dest === ROOT || ROOT.startsWith(dest + path.sep)) fail(`Destination must differ from the source folder: ${dest}`);

  console.log(`[deploy-beta] ${system.id} v${system.version} -> ${dest}`);

  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch (err) {
    fail(`Could not clean ${dest}. Close Foundry (or the world using the beta system) and try again.\n${err.message}`);
  }

  copySources(dest);
  runNode("Applying beta transformation", [PREPARE_SCRIPT], dest, { IS_BETA: "true" });
  if (!options.skipPacks) buildPacks(dest);
  finalize(dest, options.keepUpdateUrls);

  console.log(`\n[deploy-beta] Done. Restart Foundry and pick "${system.title} (Beta)" as the world system.`);
}

main();
