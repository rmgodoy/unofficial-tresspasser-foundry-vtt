/**
 * @file world-transformer.mjs
 * Pure data transformation functions for migrating world records
 * from `trespasser-beta` to `trespasser`.
 */

export const SOURCE_SYSTEM_ID = "trespasser-beta";
export const TARGET_SYSTEM_ID = "trespasser";

const PATH_FROM = `systems/${SOURCE_SYSTEM_ID}/`;
const PATH_TO = `systems/${TARGET_SYSTEM_ID}/`;

const COMPENDIUM_FROM = `Compendium.${SOURCE_SYSTEM_ID}.`;
const COMPENDIUM_TO = `Compendium.${TARGET_SYSTEM_ID}.`;

const BABELE_FROM = `${SOURCE_SYSTEM_ID}.trespasser-content`;
const BABELE_TO = `${TARGET_SYSTEM_ID}.trespasser-content`;

/**
 * Replace system paths and compendium references within a string.
 * @param {string} str
 * @returns {string}
 */
export function transformString(str) {
  if (typeof str !== "string" || !str.includes(SOURCE_SYSTEM_ID)) return str;
  return str
    .replaceAll(PATH_FROM, PATH_TO)
    .replaceAll(COMPENDIUM_FROM, COMPENDIUM_TO)
    .replaceAll(BABELE_FROM, BABELE_TO);
}

/**
 * Recursively transform strings in an object or array.
 * @param {*} value
 * @returns {*}
 */
export function transformStringsDeep(value) {
  if (typeof value === "string") {
    return transformString(value);
  }
  if (Array.isArray(value)) {
    return value.map(transformStringsDeep);
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      value[key] = transformStringsDeep(value[key]);
    }
  }
  return value;
}

/**
 * Migrates document flags from SOURCE_SYSTEM_ID to TARGET_SYSTEM_ID.
 * @param {object} flags
 * @returns {boolean} Whether flags were modified
 */
export function transformFlags(flags) {
  if (!flags || typeof flags !== "object") return false;
  let modified = false;

  if (flags[SOURCE_SYSTEM_ID] !== undefined) {
    const sourceFlags = flags[SOURCE_SYSTEM_ID];
    flags[TARGET_SYSTEM_ID] = {
      ...(typeof sourceFlags === "object" && sourceFlags !== null ? sourceFlags : {}),
      ...(flags[TARGET_SYSTEM_ID] || {})
    };
    delete flags[SOURCE_SYSTEM_ID];
    modified = true;
  }

  // Also check core sourceId flag if pointing to a compendium entry
  if (typeof flags.core?.sourceId === "string" && flags.core.sourceId.includes(SOURCE_SYSTEM_ID)) {
    flags.core.sourceId = transformString(flags.core.sourceId);
    modified = true;
  }

  return modified;
}

/**
 * Migrates _stats object systemId references.
 * @param {object} stats
 * @returns {boolean} Whether stats were modified
 */
export function transformStats(stats) {
  if (!stats || typeof stats !== "object") return false;
  let modified = false;

  if (stats.systemId === SOURCE_SYSTEM_ID) {
    stats.systemId = TARGET_SYSTEM_ID;
    modified = true;
  }

  if (stats.exportSource?.systemId === SOURCE_SYSTEM_ID) {
    stats.exportSource.systemId = TARGET_SYSTEM_ID;
    modified = true;
  }

  if (typeof stats.compendiumSource === "string" && stats.compendiumSource.includes(SOURCE_SYSTEM_ID)) {
    stats.compendiumSource = transformString(stats.compendiumSource);
    modified = true;
  }

  return modified;
}

/**
 * Transform an embedded Item document.
 * @param {object} item
 * @returns {boolean}
 */
export function transformEmbeddedItem(item) {
  if (!item || typeof item !== "object") return false;
  let modified = false;

  if (transformStats(item._stats)) modified = true;
  if (transformFlags(item.flags)) modified = true;

  if (typeof item.img === "string" && item.img.includes(SOURCE_SYSTEM_ID)) {
    item.img = transformString(item.img);
    modified = true;
  }

  if (Array.isArray(item.effects)) {
    for (const eff of item.effects) {
      if (transformEmbeddedEffect(eff)) modified = true;
    }
  }

  if (item.system && typeof item.system === "object") {
    // Deep transform string descriptions / UUID links in system data
    transformStringsDeep(item.system);
  }

  return modified;
}

/**
 * Transform an embedded ActiveEffect document.
 * @param {object} effect
 * @returns {boolean}
 */
export function transformEmbeddedEffect(effect) {
  if (!effect || typeof effect !== "object") return false;
  let modified = false;

  if (transformStats(effect._stats)) modified = true;
  if (transformFlags(effect.flags)) modified = true;

  if (typeof effect.icon === "string" && effect.icon.includes(SOURCE_SYSTEM_ID)) {
    effect.icon = transformString(effect.icon);
    modified = true;
  }
  if (typeof effect.img === "string" && effect.img.includes(SOURCE_SYSTEM_ID)) {
    effect.img = transformString(effect.img);
    modified = true;
  }

  if (Array.isArray(effect.changes)) {
    for (const change of effect.changes) {
      if (typeof change.value === "string" && change.value.includes(SOURCE_SYSTEM_ID)) {
        change.value = transformString(change.value);
        modified = true;
      }
    }
  }

  return modified;
}

/**
 * Transform an actor delta inside an unlinked token.
 * @param {object} delta
 * @returns {boolean}
 */
export function transformTokenDelta(delta) {
  if (!delta || typeof delta !== "object") return false;
  let modified = false;

  if (transformFlags(delta.flags)) modified = true;

  if (Array.isArray(delta.items)) {
    for (const item of delta.items) {
      if (transformEmbeddedItem(item)) modified = true;
    }
  }

  if (Array.isArray(delta.effects)) {
    for (const eff of delta.effects) {
      if (transformEmbeddedEffect(eff)) modified = true;
    }
  }

  return modified;
}

/**
 * Transform a general world document record (Actor, Item, Scene, Journal, Combat, etc.).
 * @param {object} doc
 * @param {string} collectionName
 * @returns {{ modified: boolean, doc: object }}
 */
export function transformRecord(doc, collectionName) {
  if (!doc || typeof doc !== "object") return { modified: false, doc };
  let modified = false;

  // 1. Stats and flags
  if (transformStats(doc._stats)) modified = true;
  if (transformFlags(doc.flags)) modified = true;

  // 2. Direct image / texture paths
  if (typeof doc.img === "string" && doc.img.includes(SOURCE_SYSTEM_ID)) {
    doc.img = transformString(doc.img);
    modified = true;
  }
  if (typeof doc.thumb === "string" && doc.thumb.includes(SOURCE_SYSTEM_ID)) {
    doc.thumb = transformString(doc.thumb);
    modified = true;
  }
  if (doc.texture?.src && typeof doc.texture.src === "string" && doc.texture.src.includes(SOURCE_SYSTEM_ID)) {
    doc.texture.src = transformString(doc.texture.src);
    modified = true;
  }

  // 3. Settings collection handling
  if (collectionName === "settings") {
    if (typeof doc.key === "string" && doc.key.startsWith(`${SOURCE_SYSTEM_ID}.`)) {
      doc.key = `${TARGET_SYSTEM_ID}.${doc.key.slice(`${SOURCE_SYSTEM_ID}.`.length)}`;
      modified = true;
    }
    if (typeof doc.value === "string" && doc.value.includes(SOURCE_SYSTEM_ID)) {
      doc.value = transformString(doc.value);
      modified = true;
    }
  }

  // 4. Embedded items & effects (Actors, Items)
  if (Array.isArray(doc.items)) {
    for (const item of doc.items) {
      if (transformEmbeddedItem(item)) modified = true;
    }
  }
  if (Array.isArray(doc.effects)) {
    for (const eff of doc.effects) {
      if (transformEmbeddedEffect(eff)) modified = true;
    }
  }

  // 5. Scene-specific subdocuments (Tokens, Tiles, Notes)
  if (collectionName === "scenes") {
    if (Array.isArray(doc.tokens)) {
      for (const token of doc.tokens) {
        if (typeof token.texture?.src === "string" && token.texture.src.includes(SOURCE_SYSTEM_ID)) {
          token.texture.src = transformString(token.texture.src);
          modified = true;
        }
        if (transformFlags(token.flags)) modified = true;
        if (token.delta && transformTokenDelta(token.delta)) modified = true;
      }
    }
    if (Array.isArray(doc.tiles)) {
      for (const tile of doc.tiles) {
        if (typeof tile.texture?.src === "string" && tile.texture.src.includes(SOURCE_SYSTEM_ID)) {
          tile.texture.src = transformString(tile.texture.src);
          modified = true;
        }
      }
    }
  }

  // 6. Combat / Combatants
  if (collectionName === "combats" && Array.isArray(doc.combatants)) {
    for (const c of doc.combatants) {
      if (transformStats(c._stats)) modified = true;
      if (transformFlags(c.flags)) modified = true;
      if (typeof c.img === "string" && c.img.includes(SOURCE_SYSTEM_ID)) {
        c.img = transformString(c.img);
        modified = true;
      }
    }
  }

  // 7. Journal entries / pages
  if (collectionName === "journal" && Array.isArray(doc.pages)) {
    for (const page of doc.pages) {
      if (transformStats(page._stats)) modified = true;
      if (transformFlags(page.flags)) modified = true;
      if (page.text?.content && typeof page.text.content === "string" && page.text.content.includes(SOURCE_SYSTEM_ID)) {
        page.text.content = transformString(page.text.content);
        modified = true;
      }
    }
  }

  // 8. Chat messages
  if (collectionName === "messages") {
    if (typeof doc.content === "string" && doc.content.includes(SOURCE_SYSTEM_ID)) {
      doc.content = transformString(doc.content);
      modified = true;
    }
  }

  // 9. Macro commands
  if (collectionName === "macros") {
    if (typeof doc.command === "string" && doc.command.includes(SOURCE_SYSTEM_ID)) {
      doc.command = transformString(doc.command);
      modified = true;
    }
  }

  return { modified, doc };
}

/**
 * Transforms world.json content.
 * @param {object} worldData
 * @param {string} targetSystemVersion
 * @returns {object}
 */
export function transformWorldJson(worldData, targetSystemVersion) {
  const updated = { ...worldData };
  if (updated.system === SOURCE_SYSTEM_ID) {
    updated.system = TARGET_SYSTEM_ID;
  }
  if (targetSystemVersion) {
    updated.systemVersion = targetSystemVersion;
  }
  return updated;
}

