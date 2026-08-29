/**
 * Helper functions for item transfers and inventory management.
 */

/**
 * Add item data to an actor, stacking if possible.
 * @param {Actor} actor
 * @param {Object} itemData
 * @param {number} [quantity] - Optional quantity to add. If not provided, uses itemData.system.quantity.
 * @returns {Promise<boolean>} Success status
 */
export async function addItemToActor(actor, itemData, quantity) {
  if (!actor || !itemData) return false;

  const qty = quantity !== undefined ? quantity : (itemData.system?.quantity || 1);
  const isHaven = actor.type === "haven";

  console.log(`Trespasser | addItemToActor: Adding ${qty} of ${itemData.name} to ${actor.name} (${actor.type})`);

  // Only stack if it's a Haven (embedded items like Hirelings)
  const canStack = isHaven && itemData.type === "item";
  
  if (canStack) {
    const isMatch = (i1, i2) => {
      if (i1.name !== i2.name || i1.type !== i2.type) return false;
      const s1 = i1.system || {};
      const s2 = i2.system || {};
      // Match on subType and tier if they exist
      if (s1.subType !== s2.subType) return false;
      if (s1.tier !== s2.tier) return false;
      return true;
    };

    const existing = actor.items.find(i => isMatch(i, itemData));
    if (existing) {
      const currentQty = existing.system.quantity || 0;
      await existing.update({ "system.quantity": currentQty + qty });
      return true;
    }
  }

  // Handle character inventory: NO STACKING. Split into separate documents.
  if (actor.type === "character") {
    const inventoryTypes = ["weapon", "armor", "accessory", "rations", "item"];
    if (inventoryTypes.includes(itemData.type)) {
      const maxSlots = actor.system.inventory_max ?? 5;
      // Count unequipped inventory items
      const currentItemsCount = actor.items.filter(i => inventoryTypes.includes(i.type) && !i.system.equipped).length;
      
      if (currentItemsCount + qty > maxSlots) {
        ui.notifications.error(game.i18n.localize("TRESPASSER.Notification.Inventory.InventoryCapReached"));
        return false;
      }
      
      // Create separate items, each with quantity 1 and equipped false
      const itemsToCreate = [];
      for (let i = 0; i < qty; i++) {
        const data = foundry.utils.duplicate(itemData);
        delete data._id;
        if (data.system) {
          if ("quantity" in data.system) data.system.quantity = 1;
          data.system.equipped = false;
        }
        itemsToCreate.push(data);
      }
      
      const created = await actor.createEmbeddedDocuments("Item", itemsToCreate);
      console.log(`Trespasser | addItemToActor (Character): Created ${created.length} separate items.`);
      return !!(created && created.length > 0);
    }
  }

  // Handle companion inventory: NO STACKING. Split into separate documents.
  if (actor.type === "companion") {
    const specialTypes = ["deed", "feature", "effect"];
    if (!specialTypes.includes(itemData.type)) {
      const maxSlots = actor.system.inventory_max ?? 3;
      const currentItems = actor.items.filter(i => !specialTypes.includes(i.type));
      const currentOccupancy = currentItems.reduce((acc, i) => {
        const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
        return acc + (isNaN(val) ? 1 : val);
      }, 0);

      const itemOccupancy = itemData.system?.slotOccupancy !== undefined ? parseFloat(itemData.system.slotOccupancy) : 1;
      const addedOccupancy = (isNaN(itemOccupancy) ? 1 : itemOccupancy) * qty;

      if (currentOccupancy + addedOccupancy > maxSlots) {
        ui.notifications.error(game.i18n.localize("TRESPASSER.Notification.Inventory.InventoryCapReached"));
        return false;
      }

      // Create separate items, each with quantity 1 and equipped false
      const itemsToCreate = [];
      for (let i = 0; i < qty; i++) {
        const data = foundry.utils.duplicate(itemData);
        delete data._id;
        if (data.system) {
          if ("quantity" in data.system) data.system.quantity = 1;
          data.system.equipped = false;
        }
        itemsToCreate.push(data);
      }

      const created = await actor.createEmbeddedDocuments("Item", itemsToCreate);
      console.log(`Trespasser | addItemToActor (Companion): Created ${created.length} separate items.`);
      return !!(created && created.length > 0);
    }
  }

  // Default: create one document (for non-inventory items, or if it's not a character/companion)
  const data = foundry.utils.duplicate(itemData);
  delete data._id;
  if (data.system) {
    if ("quantity" in data.system) data.system.quantity = qty;
    data.system.equipped = false;
  }
  
  const created = await actor.createEmbeddedDocuments("Item", [data]);
  return !!(created && created.length > 0);
}
