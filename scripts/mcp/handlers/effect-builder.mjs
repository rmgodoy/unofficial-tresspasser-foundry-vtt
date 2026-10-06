/**
 * scripts/mcp/handlers/effect-builder.mjs
 * Builder handler creating valid Trespasser Effect items for Foundry V14.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { registerRecentItem, invalidateCompendiumCache } from "./compendium-search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.resolve(__dirname, "../../../json-packs/trespasser-content");

export const VALID_TARGET_ATTRIBUTES = [
  "health", "max_health", "endurance", "max_endurance",
  "guard", "resist", "prevail", "tenacity",
  "speed", "speed_bonus", "accuracy", "initiative",
  "focus", "action_points", "combat_phase", "armor",
  "damage_dealt", "damage_received", "heal_given", "heal_received",
  "elevation", "mighty", "agility", "intellect", "spirit",
  "inventory_max", "slot_capacity"
];

export const VALID_TRIGGERS = [
  "immediate", "continuous", "start-of-combat", "start-of-round",
  "start-of-turn", "end-of-turn", "end-of-round", "end-of-combat",
  "on-first-move", "on-move", "use", "targeted",
  "damage-dealt", "damage-received", "heal-given", "heal-received",
  "on-prevail", "on-use-deed", "on-targeted-deed",
  "on-deed-hit-received", "on-deed-miss-received",
  "on-deed-hit", "on-deed-miss"
];

/**
 * Generate a 16-character alphanumeric ID similar to Foundry VTT.
 * @returns {string}
 */
export function generateFoundryId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Sanitize item name for file storage.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "_");
}

/**
 * Create a valid Trespasser Effect item document.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function handleCreateEffect(params = {}) {
  if (!params.name || !params.name.trim()) {
    throw new Error("Missing required field 'name' for Effect creation.");
  }

  const id = params.id?.trim() || generateFoundryId();
  const name = params.name.trim();

  // Validate or fallback target attribute
  let targetAttr = (params.targetAttribute || "health").toLowerCase();
  if (!VALID_TARGET_ATTRIBUTES.includes(targetAttr)) {
    targetAttr = "health";
  }

  // Validate or fallback trigger
  let triggerWhen = (params.when || "continuous").toLowerCase();
  if (!VALID_TRIGGERS.includes(triggerWhen)) {
    triggerWhen = "continuous";
  }

  // Detect whether effect has automated mechanical stat modification
  const modStr = String(params.modifier ?? "0").trim();
  const hasAutomation = Boolean(
    (modStr !== "0" && modStr !== "") ||
    (params.conferredState && String(params.conferredState).trim() !== "")
  );

  const now = Date.now();
  const effectDoc = {
    name,
    type: "effect",
    img: params.img || params.statusIcon || "systems/trespasser/assets/icons/effect.webp",
    system: {
      description: params.description || "",
      type: ["on-trigger", "continuous", "movement"].includes(params.type) ? params.type : "continuous",
      movementType: ["walk", "teleport", "jump"].includes(params.movementType) ? params.movementType : "walk",
      isCombat: params.isCombat !== false,
      isOnlyReminder: params.isOnlyReminder !== undefined ? Boolean(params.isOnlyReminder) : !hasAutomation,
      gmOnly: Boolean(params.gmOnly),
      intensity: Number(params.intensity ?? 0),
      targetAttribute: targetAttr,
      modifier: String(params.modifier ?? "0"),
      conferredState: params.conferredState || "",
      when: triggerWhen,
      duration: ["indefinite", "combat", "round", "trigger"].includes(params.duration) ? params.duration : "indefinite",
      durationValue: Number(params.durationValue ?? 0),
      durationOperator: params.durationOperator === "AND" ? "AND" : "OR",
      durationConditions: Array.isArray(params.durationConditions) ? params.durationConditions : [],
      intensityIncrement: Number(params.intensityIncrement ?? 0),
      counterStates: Array.isArray(params.counterStates) ? params.counterStates : [],
      isPrevailable: params.isPrevailable !== false,
      isLasting: Boolean(params.isLasting),
      showTokenIcon: params.showTokenIcon !== false,
      statusIcon: params.statusIcon || "",
      syncStatusIcon: params.syncStatusIcon !== false
    },
    _id: id,
    effects: [],
    folder: null,
    flags: {},
    _stats: {
      compendiumSource: null,
      duplicateSource: null,
      exportSource: null,
      coreVersion: "14",
      systemId: "trespasser",
      systemVersion: "0.2.0-12",
      createdTime: now,
      modifiedTime: now,
      lastModifiedBy: "mcp-generator"
    },
    ownership: {
      default: 0
    },
    sort: 0,
    _key: `!items!${id}`
  };

  registerRecentItem(effectDoc);

  let savedFile = null;
  if (params.saveToPack) {
    const fileName = `${sanitizeFileName(name)}_${id}.json`;
    const filePath = path.join(PACKS_DIR, fileName);
    await fs.writeFile(filePath, JSON.stringify(effectDoc, null, 2), "utf-8");
    savedFile = filePath;
    invalidateCompendiumCache();
  }

  return {
    id,
    uuid: `Compendium.trespasser.trespasser-content.Item.${id}`,
    localUuid: `Item.${id}`,
    name,
    type: "effect",
    img: effectDoc.img,
    savedFile,
    item: effectDoc
  };
}
