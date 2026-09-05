/**
 * Item Resolver Helper
 * Resolves Item documents using permanent document IDs / UUIDs:
 * 1. World items sidebar (game.items) by ID or compendium source
 * 2. fromUuid if UUID provided
 * 3. Fallback to compendium packs by document ID
 * 4. Error notification if not found
 */

/**
 * Resolves an Item document by UUID or ID, looking first in the world items sidebar,
 * falling back to compendium packs, and notifying the user with an error if not found.
 * Does not search by name as names are subject to translation or user edits.
 * 
 * @param {object|string|null} query - Either an object with { uuid, name, type } or a UUID/ID string.
 * @param {object} [options={}]
 * @param {string} [options.uuid] - Fallback UUID if query is an object without uuid
 * @param {string} [options.name] - Item name used for error display
 * @param {string} [options.type] - Expected item type filter (e.g. "talent", "deed", "feature", "craft")
 * @param {boolean} [options.notify=true] - Whether to show an error notification if item is not found
 * @returns {Promise<Item|null>} The resolved Item document, or null if not found
 */
export async function resolveItem(query, options = {}) {
  if (query instanceof Item) return query;
  if (!query && !options.uuid) return null;

  let uuid = typeof query === "string" ? query : (query?.uuid ?? options.uuid);
  const name = typeof query === "object" && query !== null ? (query.name ?? options.name) : (options.name ?? "");

  // Foundry drag data sets type: "Item" (documentName), ignore it so it doesn't conflict with item sub-types (e.g. "item", "weapon", "effect")
  let queryType = typeof query === "object" && query !== null ? query.type : undefined;
  if (queryType === "Item") queryType = undefined;
  const type = options.type ?? queryType;
  const notify = options.notify ?? true;

  if (!uuid && typeof query === "object" && query?._id) {
    uuid = query._id;
  }

  // Extract the raw ID from UUID (e.g. "Item.PJSkuQv2DCDz1wpY" -> "PJSkuQv2DCDz1wpY")
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

  // 2. Try direct resolution via fromUuid
  if (uuid) {
    try {
      const doc = await fromUuid(uuid);
      if (doc && (!type || doc.type === type)) return doc;
    } catch (_err) {
      // Continue to compendium fallback if fromUuid fails
    }
  }

  // 3. Fallback: Search across compendium packs by document ID
  if (id) {
    // Try the default system pack first
    const systemPack = game.packs.get("trespasser.trespasser-content");
    if (systemPack) {
      try {
        const doc = await systemPack.getDocument(id);
        if (doc && (!type || doc.type === type)) return doc;
      } catch (_err) {
        // Continue to check other packs
      }
    }

    // Check all other Item compendium packs
    const packs = game.packs.filter(p => p.documentName === "Item" && p.collection !== "trespasser.trespasser-content");
    for (const pack of packs) {
      try {
        const doc = await pack.getDocument(id);
        if (doc && (!type || doc.type === type)) return doc;
      } catch (_err) {
        // Continue to next pack
      }
    }
  }

  // 4. Not found anywhere
  if (notify) {
    const displayName = name || id || uuid || game.i18n.localize("TRESPASSER.Terms.Unknown");
    ui.notifications.error(
      game.i18n.format("TRESPASSER.Notification.Apply.CouldNotCreateItem", { name: displayName })
    );
  }

  return null;
}

/**
 * Checks whether an actor item matches a template entry strictly by document ID / UUID,
 * avoiding any matching by name which is subject to translation or user edits.
 * 
 * @param {Item} item - An Item document on the actor
 * @param {object} entry - A template entry (e.g. { uuid: "Item.xxx", ... })
 * @returns {boolean} True if the item originates from or matches the entry
 */
export function isLinkedItemMatch(item, entry) {
  if (!item || !entry) return false;
  const entryId = entry.uuid ? entry.uuid.split(".").pop() : (entry._id || null);
  if (!entryId) return false;

  const linkedUuid = item.flags?.trespasser?.linkedSourceUuid;
  if (linkedUuid && linkedUuid.split(".").pop() === entryId) return true;

  const linkedId = item.flags?.trespasser?.linkedSourceId;
  if (linkedId && linkedId === entryId) return true;

  const compSource = item._stats?.compendiumSource;
  if (compSource && compSource.split(".").pop() === entryId) return true;

  const coreSource = item.flags?.core?.sourceId;
  if (coreSource && coreSource.split(".").pop() === entryId) return true;

  return item.id === entryId;
}

