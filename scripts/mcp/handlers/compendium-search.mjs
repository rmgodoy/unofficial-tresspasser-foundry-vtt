/**
 * scripts/mcp/handlers/compendium-search.mjs
 * Compendium search and inspection handler for the Trespasser MCP server.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRESPASSER_STATUS_EFFECTS } from "../../../module/config/status-effects.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.resolve(__dirname, "../../../json-packs/trespasser-content");

// In-memory cache of parsed compendium items for fast queries
let cachedItems = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000;
const recentItems = new Map();

/**
 * Register a newly created item into the in-memory registry.
 * @param {object} itemDoc
 */
export function registerRecentItem(itemDoc) {
  if (!itemDoc || !itemDoc._id) return;
  recentItems.set(itemDoc._id, itemDoc);
  if (itemDoc.name) {
    recentItems.set(itemDoc.name.toLowerCase(), itemDoc);
  }
}

/**
 * Invalidate the cached compendium items so newly saved files are re-read immediately.
 */
export function invalidateCompendiumCache() {
  cachedItems = null;
  cacheTimestamp = 0;
}

/**
 * Load and cache all items from the official json-packs/trespasser-content compendium directory.
 * @returns {Promise<Array<object>>}
 */
async function loadCompendiumItems() {
  const now = Date.now();
  if (cachedItems && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedItems;
  }

  const items = [];

  try {
    const files = await fs.readdir(PACKS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(PACKS_DIR, file);
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const json = JSON.parse(raw);
        items.push({
          file,
          data: json
        });
      } catch {
        // Skip unparseable files
      }
    }
  } catch {
    // Ignore directory read errors if directory does not exist
  }

  cachedItems = items;
  cacheTimestamp = now;
  return items;
}

/**
 * Format a human-readable summary of an item based on its type.
 * @param {object} item
 * @returns {string}
 */
function buildItemSummary(item) {
  const sys = item.system || {};
  if (item.type === "effect") {
    const parts = [
      `Type: ${sys.type || "continuous"}`,
      `Attr: ${sys.targetAttribute || "none"}`,
      `Mod: ${sys.modifier || "0"}`,
      `When: ${sys.when || "continuous"}`
    ];
    if (sys.duration) parts.push(`Dur: ${sys.duration}`);
    return parts.join(", ");
  }

  if (item.type === "terrain") {
    const parts = [
      `Cat: ${sys.category || "difficult_terrain"}`,
      `Size: ${sys.width || 1}x${sys.height || 1}`,
      `Dmg: ${sys.terrainDamage || 0}`
    ];
    if (sys.behaviors?.length) parts.push(`Behaviors: ${sys.behaviors.length}`);
    return parts.join(", ");
  }

  if (item.type === "deed") {
    const parts = [
      `Tier: ${sys.tier || "light"}`,
      `Action: ${sys.actionType || "attack"}`,
      `Ability: ${sys.abilityType || "versatile"}`,
      `Versus: ${sys.versus || "Guard"}`
    ];
    if (sys.focusCost) parts.push(`Focus: ${sys.focusCost}`);
    return parts.join(", ");
  }

  return item.type;
}

/**
 * Search compendium items with optional type filtering and text query.
 * @param {object} params
 * @param {string} [params.query] - Search term (matches name, description, or id)
 * @param {string} [params.type]  - Item type filter ("effect", "terrain", "deed", "weapon", etc.)
 * @param {number} [params.limit=15] - Maximum number of results
 * @returns {Promise<object>}
 */
export async function handleSearchCompendium(params = {}) {
  const items = await loadCompendiumItems();
  const query = (params.query || "").trim().toLowerCase();
  const typeFilter = (params.type || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number(params.limit || 15), 50));

  const results = [];

  for (const { file, data } of items) {
    if (typeFilter && data.type !== typeFilter) continue;

    if (query) {
      const name = (data.name || "").toLowerCase();
      const id = (data._id || "").toLowerCase();
      const desc = (data.system?.description || "").toLowerCase();
      const matches = name.includes(query) || id.includes(query) || desc.includes(query);
      if (!matches) continue;
    }

    results.push({
      id: data._id,
      uuid: `Compendium.trespasser.trespasser-content.Item.${data._id}`,
      name: data.name,
      type: data.type,
      img: data.img || "",
      summary: buildItemSummary(data),
      file
    });

    if (results.length >= limit) break;
  }

  return {
    count: results.length,
    totalIndexed: items.length,
    results
  };
}

/**
 * Retrieve full item data by ID, UUID, or exact Name.
 * @param {object} params
 * @param {string} [params.id]   - Item _id
 * @param {string} [params.uuid] - Full UUID (e.g. Compendium.trespasser.trespasser-content.Item.xxx or Item.xxx)
 * @param {string} [params.name] - Exact item name
 * @returns {Promise<object>}
 */
export async function handleGetItemDetails(params = {}) {
  let targetId = (params.id || "").trim();

  if (!targetId && params.uuid) {
    const cleanUuid = params.uuid.trim();
    const parts = cleanUuid.split(".");
    targetId = parts[parts.length - 1];
  }

  const targetName = (params.name || "").trim().toLowerCase();

  // 1. Check in-memory recent items
  for (const item of recentItems.values()) {
    if (targetId && item._id === targetId) {
      return { found: true, file: "in-memory", item };
    }
    if (targetName && (item.name || "").toLowerCase() === targetName) {
      return { found: true, file: "in-memory", item };
    }
  }

  // 2. Check compendium files
  const items = await loadCompendiumItems();
  for (const { file, data } of items) {
    if (targetId && data._id === targetId) {
      return { found: true, file, item: data };
    }
    if (targetName && (data.name || "").toLowerCase() === targetName) {
      return { found: true, file, item: data };
    }
  }

  return {
    found: false,
    message: `Item not found matching ${targetId ? `id "${targetId}"` : `name "${params.name}"`}`
  };
}

/**
 * Resolve full item reference information (ID, UUID, Name, and Image).
 * Checks recentItems, built-in status effects, then compendium packs.
 * @param {string} [idOrUuid]
 * @param {string} [name]
 * @param {string} [fallbackType="effect"]
 * @returns {Promise<{ id: string, uuid: string, name: string, img: string }>}
 */
export async function resolveItemInfo(idOrUuid = "", name = "", fallbackType = "effect") {
  const cleanId = String(idOrUuid || "").split(".").pop().trim();
  const cleanName = String(name || "").trim().toLowerCase();

  const defaultImg = fallbackType === "terrain"
    ? "systems/trespasser/assets/icons/terrain.webp"
    : fallbackType === "deed"
      ? "systems/trespasser/assets/icons/deed.webp"
      : "systems/trespasser/assets/icons/effect.webp";

  // 1. Check in-memory recently created items
  for (const item of recentItems.values()) {
    if (fallbackType && item.type && item.type !== fallbackType) continue;
    if ((cleanId && item._id === cleanId) ||
        (cleanName && (item.name || "").toLowerCase() === cleanName)) {
      return {
        id: item._id,
        uuid: `Compendium.trespasser.trespasser-content.Item.${item._id}`,
        name: item.name,
        img: item.img || defaultImg
      };
    }
  }

  // 2. Check built-in status effects
  if (fallbackType === "effect" && Array.isArray(TRESPASSER_STATUS_EFFECTS)) {
    for (const st of TRESPASSER_STATUS_EFFECTS) {
      if ((cleanId && st.compendiumId === cleanId) ||
          (cleanName && st.id?.toLowerCase() === cleanName) ||
          (cleanName && st.name?.toLowerCase().includes(cleanName))) {
        return {
          id: st.compendiumId,
          uuid: `Compendium.trespasser.trespasser-content.Item.${st.compendiumId}`,
          name: st.name,
          img: st.img || defaultImg
        };
      }
    }
  }

  // 3. Check compendium files
  const items = await loadCompendiumItems();
  for (const { data } of items) {
    if (fallbackType && data.type && data.type !== fallbackType) continue;
    if ((cleanId && data._id === cleanId) ||
        (cleanName && (data.name || "").toLowerCase() === cleanName)) {
      return {
        id: data._id,
        uuid: `Compendium.trespasser.trespasser-content.Item.${data._id}`,
        name: data.name,
        img: data.img || defaultImg
      };
    }
  }

  // 4. Default fallback with preserved or reconstructed UUID
  const finalUuid = cleanId
    ? (idOrUuid.includes(".") ? idOrUuid : `Compendium.trespasser.trespasser-content.Item.${cleanId}`)
    : "";

  return {
    id: cleanId,
    uuid: finalUuid,
    name: name || "",
    img: defaultImg
  };
}

/**
 * Resolve an item's canonical artwork path by its UUID/ID or name.
 * @param {string} [idOrUuid]
 * @param {string} [name]
 * @param {string} [fallbackType="effect"]
 * @returns {Promise<string>}
 */
export async function resolveItemImage(idOrUuid = "", name = "", fallbackType = "effect") {
  const info = await resolveItemInfo(idOrUuid, name, fallbackType);
  return info.img;
}

