import { SYSTEM_ID, getSystemId, getSystemFlags } from "../system-id.mjs";

/**
 * Normalizes a compendium UUID or identifier by adapting its package scope
 * to match the currently running system when applicable.
 * @param {string} uuid
 * @returns {string}
 */
export function normalizeCompendiumUuid(uuid) {
  if (!uuid || typeof uuid !== "string") return uuid;
  if (!uuid.startsWith("Compendium.")) return uuid;

  const systemId = getSystemId();
  return uuid.replace(/^Compendium\.(?:trespasser|trespasser-beta)\.trespasser-content\./, `Compendium.${systemId}.trespasser-content.`);
}

/**
 * Helper to get the primary system compendium pack across different system IDs.
 * @returns {CompendiumCollection|null}
 */
export function getSystemPack() {
  const activeId = getSystemId();
  return game.packs?.get(`${activeId}.trespasser-content`)
    || game.packs?.get("trespasser.trespasser-content")
    || game.packs?.find(p => p.metadata.name === "trespasser-content" || p.collection.endsWith(".trespasser-content"))
    || null;
}

/**
 * Item Resolver Helper
 * Resolves Item documents using permanent document IDs / UUIDs:
 * 1. World items sidebar (game.items) by ID or compendium source
 * 2. fromUuid if UUID provided (with compendium scope normalization)
 * 3. Fallback to compendium packs by document ID
 * 4. Fallback search by exact name in system pack
 * 5. Error notification if not found
 */

/**
 * Resolves an Item document by UUID or ID, looking first in the world items sidebar,
 * falling back to compendium packs, and notifying the user with an error if not found.
 * 
 * @param {object|string|null} query - Either an object with { uuid, name, type } or a UUID/ID string.
 * @param {object} [options={}]
 * @param {string} [options.uuid] - Fallback UUID if query is an object without uuid
 * @param {string} [options.name] - Item name used for error display
 * @param {string} [options.type] - Expected item type filter (e.g. "talent", "deed", "feature", "craft", "terrain", "effect")
 * @param {boolean} [options.notify=true] - Whether to show an error notification if item is not found
 * @returns {Promise<Item|null>} The resolved Item document, or null if not found
 */
export async function resolveItem(query, options = {}) {
  if (query instanceof Item) return query;
  if (!query && !options.uuid) return null;

  let uuid = typeof query === "string" ? query : (query?.uuid ?? options.uuid);
  const name = typeof query === "object" && query !== null ? (query.name ?? options.name) : (options.name ?? "");

  // Foundry drag data sets type: "Item" (documentName), ignore it so it doesn't conflict with item sub-types
  let queryType = typeof query === "object" && query !== null ? query.type : undefined;
  if (queryType === "Item") queryType = undefined;
  const type = options.type ?? queryType;
  const notify = options.notify ?? true;

  if (!uuid && typeof query === "object" && query?._id) {
    uuid = query._id;
  }

  // Extract the raw ID from UUID (e.g. "Compendium.trespasser.trespasser-content.Item.D5imK2jiYV4olBn0" -> "D5imK2jiYV4olBn0")
  const id = uuid ? uuid.split(".").pop() : null;

  // 1. Search in Items sidebar (world items) first by ID
  if (id) {
    const sidebarById = game.items.get(id);
    if (sidebarById && (!type || sidebarById.type === type)) return sidebarById;

    // Check if any world item was imported from this compendium source ID
    const sidebarBySource = game.items.find(i => 
      (!type || i.type === type) && (
        i._stats?.compendiumSource?.endsWith(id) || 
        i.flags?.core?.sourceId?.endsWith(id)
      )
    );
    if (sidebarBySource) return sidebarBySource;
  }

  // 2. Try direct resolution via fromUuid (with scope normalization)
  if (uuid) {
    try {
      const doc = await fromUuid(uuid);
      if (doc && (!type || doc.type === type)) return doc;
    } catch (_err) {}

    const normalized = normalizeCompendiumUuid(uuid);
    if (normalized && normalized !== uuid) {
      try {
        const doc = await fromUuid(normalized);
        if (doc && (!type || doc.type === type)) return doc;
      } catch (_err) {}
    }

    if (uuid.startsWith("Compendium.")) {
      const match = uuid.match(/^Compendium\.([^.]+)\.([^.]+)\.(?:Item\.)?([^.]+)$/);
      if (match) {
        const [, scope, packName, docId] = match;
        const pack = game.packs.get(`${scope}.${packName}`)
          || game.packs.get(`${getSystemId()}.${packName}`)
          || game.packs.find(p => p.metadata.name === packName);
        if (pack) {
          try {
            const doc = await pack.getDocument(docId);
            if (doc && (!type || doc.type === type)) return doc;
          } catch (_err) {}
        }
      }
    }
  }

  // 3. Fallback: Search across compendium packs by document ID
  if (id) {
    const systemPack = getSystemPack();
    if (systemPack) {
      try {
        const doc = await systemPack.getDocument(id);
        if (doc && (!type || doc.type === type)) return doc;
      } catch (_err) {}
    }

    const packs = game.packs.filter(p => p.documentName === "Item" && p !== systemPack);
    for (const pack of packs) {
      try {
        const doc = await pack.getDocument(id);
        if (doc && (!type || doc.type === type)) return doc;
      } catch (_err) {}
    }
  }

  // 4. Fallback by exact name in system compendium
  if (name) {
    const systemPack = getSystemPack();
    if (systemPack) {
      const entry = systemPack.index.find(e => (!type || e.type === type) && e.name.toLowerCase() === name.trim().toLowerCase());
      if (entry) {
        try {
          const doc = await systemPack.getDocument(entry._id);
          if (doc) return doc;
        } catch (_err) {}
      }
    }
  }

  // 5. Not found anywhere
  if (notify) {
    const displayName = name || id || uuid || game.i18n.localize("TRESPASSER.Terms.Unknown");
    ui.notifications.error(
      game.i18n.format("TRESPASSER.Notification.Apply.CouldNotCreateItem", { name: displayName })
    );
  }

  return null;
}

/**
 * Synchronous resolver for Item documents already loaded in memory (world items, cached compendiums).
 * @param {object|string|null} query
 * @param {object} [options={}]
 * @returns {Item|null}
 */
export function resolveItemSync(query, options = {}) {
  if (query instanceof Item) return query;
  if (!query && !options.uuid) return null;

  let uuid = typeof query === "string" ? query : (query?.uuid ?? options.uuid);
  let queryType = typeof query === "object" && query !== null ? query.type : undefined;
  if (queryType === "Item") queryType = undefined;
  const type = options.type ?? queryType;

  if (!uuid && typeof query === "object" && query?._id) {
    uuid = query._id;
  }

  const id = uuid ? uuid.split(".").pop() : null;

  if (id) {
    const sidebarById = game.items?.get(id);
    if (sidebarById && (!type || sidebarById.type === type)) return sidebarById;
  }

  if (uuid) {
    try {
      const doc = fromUuidSync(uuid);
      if (doc && (!type || doc.type === type)) return doc;
    } catch {}

    const normalized = normalizeCompendiumUuid(uuid);
    if (normalized && normalized !== uuid) {
      try {
        const doc = fromUuidSync(normalized);
        if (doc && (!type || doc.type === type)) return doc;
      } catch {}
    }
  }

  const systemPack = getSystemPack();
  if (systemPack && id) {
    const cached = systemPack.get?.(id);
    if (cached && (!type || cached.type === type)) return cached;
  }

  return null;
}

/**
 * Checks whether an actor item matches a template entry strictly by document ID / UUID.
 * 
 * @param {Item} item - An Item document on the actor
 * @param {object} entry - A template entry (e.g. { uuid: "Item.xxx", ... })
 * @returns {boolean} True if the item originates from or matches the entry
 */
export function isLinkedItemMatch(item, entry) {
  if (!item || !entry) return false;
  const entryId = entry.uuid ? entry.uuid.split(".").pop() : (entry._id || null);
  if (!entryId) return false;

  const flags = getSystemFlags(item);
  const linkedUuid = flags.linkedSourceUuid || flags.sourceEffectUuid;
  if (linkedUuid && linkedUuid.split(".").pop() === entryId) return true;

  const linkedId = flags.linkedSourceId || flags.sourceEffectId;
  if (linkedId && linkedId === entryId) return true;

  const linkedSource = flags.linkedSource;
  if (linkedSource && linkedSource.split(".").pop() === entryId) return true;

  const compSource = item._stats?.compendiumSource;
  if (compSource && compSource.split(".").pop() === entryId) return true;

  const coreSource = item.flags?.core?.sourceId;
  if (coreSource && coreSource.split(".").pop() === entryId) return true;

  return item.id === entryId;
}

