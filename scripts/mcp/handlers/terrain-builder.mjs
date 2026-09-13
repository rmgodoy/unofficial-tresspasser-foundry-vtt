/**
 * scripts/mcp/handlers/terrain-builder.mjs
 * Builder handler creating valid Trespasser Terrain items for Foundry V14.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFoundryId, sanitizeFileName } from "./effect-builder.mjs";
import { registerRecentItem, invalidateCompendiumCache } from "./compendium-search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.resolve(__dirname, "../../../json-packs/trespasser-content");

export const VALID_TERRAIN_CATEGORIES = [
  "difficult_terrain", "obstacle", "wall", "field", "light_cloud", "heavy_cloud"
];

export const VALID_TERRAIN_TRIGGERS = [
  "onEnter", "onExit", "onMove", "onStartTurn", "onCreation", "whileInside"
];

export const VALID_TERRAIN_ACTIONS = [
  "applyEffect", "forcedMovement", "damage", "script"
];

/**
 * Normalizes terrain behaviors array ensuring proper schema structure.
 * @param {Array<object>} behaviors
 * @returns {Array<object>}
 */
function normalizeBehaviors(behaviors) {
  if (!Array.isArray(behaviors)) return [];

  return behaviors.map(b => ({
    trigger: VALID_TERRAIN_TRIGGERS.includes(b.trigger) ? b.trigger : "onEnter",
    action: VALID_TERRAIN_ACTIONS.includes(b.action) ? b.action : "applyEffect",
    effects: Array.isArray(b.effects) ? b.effects.map(e => ({
      uuid: e.uuid || "",
      name: e.name || "",
      img: e.img || "",
      intensity: String(e.intensity ?? "1")
    })) : [],
    effectUuid: b.effectUuid || b.effects?.[0]?.uuid || "",
    effectName: b.effectName || b.effects?.[0]?.name || "",
    effectImg: b.effectImg || b.effects?.[0]?.img || "",
    effectIntensity: String(b.effectIntensity ?? b.effects?.[0]?.intensity ?? "1"),
    forcedMovementType: b.forcedMovementType || "",
    forcedMovementDistance: String(b.forcedMovementDistance ?? "0"),
    forcedMovementDirection: b.forcedMovementDirection || "away_from_origin",
    damageFormula: b.damageFormula || "",
    script: b.script || "",
    onlyOnFirstEntry: b.onlyOnFirstEntry !== false
  }));
}

/**
 * Normalizes linked effects array ensuring schema compatibility.
 * @param {Array<object>} linkedEffects
 * @returns {Array<object>}
 */
function normalizeLinkedEffects(linkedEffects) {
  if (!Array.isArray(linkedEffects)) return [];
  return linkedEffects.map(le => ({
    uuid: le.uuid || "",
    name: le.name || "",
    img: le.img || "",
    intensity: String(le.intensity ?? "1")
  }));
}

/**
 * Create a valid Trespasser Terrain item document.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function handleCreateTerrain(params = {}) {
  if (!params.name || !params.name.trim()) {
    throw new Error("Missing required field 'name' for Terrain creation.");
  }

  const id = generateFoundryId();
  const name = params.name.trim();

  let category = (params.category || "difficult_terrain").toLowerCase();
  if (!VALID_TERRAIN_CATEGORIES.includes(category)) {
    category = "difficult_terrain";
  }

  const behaviors = normalizeBehaviors(params.behaviors);
  const linkedEffects = normalizeLinkedEffects(params.linkedEffects);

  const now = Date.now();
  const terrainDoc = {
    name,
    type: "terrain",
    img: params.img || "systems/trespasser/assets/icons/terrain.webp",
    system: {
      category,
      width: Math.max(1, Number(params.width || 1)),
      height: Math.max(1, Number(params.height || 1)),
      terrainDamage: Math.max(0, Number(params.terrainDamage || 0)),
      extraMovementCost: Math.max(0, Number(params.extraMovementCost || 0)),
      slippery: Boolean(params.slippery),
      destructible: params.destructible !== false,
      centerMode: params.centerMode === "actor" ? "actor" : "fixed",
      centerActorId: params.centerActorId || "",
      terrainImage: params.terrainImage || "",
      behaviors,
      interactable: Boolean(params.interactable),
      interactAction: {
        label: params.interactAction?.label || "",
        actionCost: Number(params.interactAction?.actionCost ?? 1),
        actionType: params.interactAction?.actionType || "",
        moveDistance: Number(params.interactAction?.moveDistance ?? 0),
        moveEffect: params.interactAction?.moveEffect || ""
      },
      linkedEffects,
      linkedEffect: {
        uuid: linkedEffects[0]?.uuid || params.linkedEffect?.uuid || "",
        name: linkedEffects[0]?.name || params.linkedEffect?.name || "",
        img: linkedEffects[0]?.img || params.linkedEffect?.img || ""
      },
      linkedEffectKey: params.linkedEffectKey || "",
      regionColor: params.regionColor || ""
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

  registerRecentItem(terrainDoc);

  let savedFile = null;
  if (params.saveToPack) {
    const fileName = `${sanitizeFileName(name)}_${id}.json`;
    const filePath = path.join(PACKS_DIR, fileName);
    await fs.writeFile(filePath, JSON.stringify(terrainDoc, null, 2), "utf-8");
    savedFile = filePath;
    invalidateCompendiumCache();
  }

  return {
    id,
    uuid: `Compendium.trespasser.trespasser-content.Item.${id}`,
    localUuid: `Item.${id}`,
    name,
    type: "terrain",
    img: terrainDoc.img,
    savedFile,
    item: terrainDoc
  };
}
