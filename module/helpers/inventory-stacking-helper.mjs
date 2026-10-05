/**
 * Helper functions for inventory stacking and slot capacity display.
 */

/**
 * Group unequipped inventory items into stacked visual representations.
 * Preserves the original individual documents while decorating representative items.
 *
 * @param {Item[]} items - Array of unequipped Item documents
 * @param {boolean} [enabled=true] - Whether stacking is enabled
 * @returns {Item[]} Array of items/stack representations for the inventory grid
 */
export function groupInventoryItems(items, enabled = true) {
  if (!Array.isArray(items)) return [];

  if (!enabled) {
    return items.map(item => {
      item.stackCount = 1;
      item.isStacked = false;
      item.stackedItems = [item];
      item.stackedItemIds = [item.id];
      return item;
    });
  }

  const groups = new Map();
  const unstacked = [];

  for (const item of items) {
    // Only unbroken, unthrown items with stackable === true can be stacked
    if (!item.system?.stackable || item.system?.broken || item.system?.isThrown) {
      item.stackCount = 1;
      item.isStacked = false;
      item.stackedItems = [item];
      item.stackedItemIds = [item.id];
      unstacked.push(item);
      continue;
    }

    const tags = Array.isArray(item.system.tags) ? item.system.tags : [];
    let groupKey;

    if (tags.length > 0) {
      // Group by the primary tag
      groupKey = `tag:${tags[0].toLowerCase().trim()}`;
    } else {
      // Group by item type and normalized name
      groupKey = `name:${item.type}:${(item.name || "").toLowerCase().trim()}`;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(item);
  }

  const result = [...unstacked];

  for (const stack of groups.values()) {
    const primary = stack[0];
    primary.stackCount = stack.length;
    primary.isStacked = stack.length > 1;
    primary.stackedItems = stack;
    primary.stackedItemIds = stack.map(i => i.id);
    result.push(primary);
  }

  return result;
}

/**
 * Build array of empty slot indicators based on remaining capacity.
 *
 * @param {number} maxCapacity - Total inventory slot limit
 * @param {number} usedSlots - Currently occupied inventory slots
 * @returns {Array<{index: number}>} Array representing empty slots to render
 */
export function buildEmptySlots(maxCapacity, usedSlots) {
  const max = Number(maxCapacity) || 0;
  const used = Number(usedSlots) || 0;
  const remaining = Math.max(0, Math.floor(max - used));
  return Array.from({ length: remaining }, (_, i) => ({ index: i + 1 }));
}
