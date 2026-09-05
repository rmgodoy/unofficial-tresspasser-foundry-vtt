import { resolveItem } from "../helpers/item-resolver.mjs";

/**
 * Production and Stronghold benefits logic for Haven actors.
 */

/**
 * Check if two items match based on name and type.
 * @param {object} item1
 * @param {object} item2
 * @returns {boolean}
 */
export function isItemMatch(item1, item2) {
  if (item1.name !== item2.name || item1.type !== item2.type) return false;
  const s1 = item1.system || {};
  const s2 = item2.system || {};
  if (s1.subType !== s2.subType) return false;
  if (s1.tier !== s2.tier) return false;
  return true;
}

/**
 * Helper to consume and produce items for a single hireling.
 * @param {TrespasserHavenData} havenData
 * @param {Item} hireling
 * @param {Array} inventory - Current list of {item, quantity}
 * @returns {Promise<{ result: string, newInventory: Array }>}
 */
export async function processHirelingProduction(havenData, hireling, inventory) {
  const system = hireling.system;
  const results = [];
  let newInventory = [...inventory];

  let canConsume = true;
  const itemsToConsume = [];

  for (const consumeData of system.consume) {
    const needed = (consumeData.system.quantity || 1) * system.quantity;
    const index = newInventory.findIndex(entry => isItemMatch(entry.item, consumeData));
    
    if (index === -1 || newInventory[index].quantity < needed) {
      canConsume = false;
      results.push(`<p class="failure">${game.i18n.format("TRESPASSER.Notification.Haven.MissingIngredients", { name: hireling.name, item: consumeData.name })}</p>`);
      break;
    }
    itemsToConsume.push({ index, amount: needed });
  }

  if (canConsume) {
    for (const entry of itemsToConsume) {
      newInventory[entry.index].quantity -= entry.amount;
    }
    newInventory = newInventory.filter(e => e.quantity > 0);

    for (const produceData of system.produce) {
      const qty = (produceData.system.quantity || 1) * system.quantity;
      const index = newInventory.findIndex(entry => isItemMatch(entry.item, produceData));
      
      if (index !== -1) {
        newInventory[index].quantity += qty;
      } else {
        newInventory.push({
          item: foundry.utils.duplicate(produceData),
          quantity: qty
        });
      }
      results.push(`<p class="success">${game.i18n.format("TRESPASSER.Chat.Haven.Produced", { name: hireling.name, quantity: qty, item: produceData.name })}</p>`);
    }
    
    if (system.produce.length === 0 && system.consume.length > 0) {
      results.push(`<p class="success">${game.i18n.format("TRESPASSER.Chat.Haven.ConsumedOnly", { name: hireling.name })}</p>`);
    } else if (system.produce.length === 0 && system.consume.length === 0) {
      results.push(`<p>${game.i18n.format("TRESPASSER.Chat.Haven.DidNothing", { name: hireling.name })}</p>`);
    }
  }

  return { result: results.join(""), newInventory };
}

/**
 * Syncs stronghold features to its owner.
 * @param {TrespasserHavenData} havenData
 * @param {Item} stronghold - The stronghold item document.
 * @param {Object} [delta] - The update delta, if called from a hook.
 */
export async function syncStrongholdBenefit(havenData, stronghold, delta = {}) {
  if (stronghold.type !== "stronghold") return;
  
  const strongholdUuid = stronghold.uuid;
  const isCompleted = stronghold.system.isCompleted;
  const ownerId = stronghold.system.ownerId;
  
  const allCharacters = game.actors.filter(a => a.type === "character");
  
  // 1. Cleanup old assignments
  for (const char of allCharacters) {
    const existing = char.items.filter(i => i.getFlag("trespasser", "strongholdSource") === strongholdUuid);
    if (existing.length > 0) {
      await char.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
    }
  }

  // 2. Addition
  if (!delta.deleted && isCompleted && ownerId) {
    const owner = game.actors.get(ownerId);
    if (owner) {
      const features = stronghold.system.features || [];
      
      for (const feat of features) {
        const sourceItem = await resolveItem(feat);
        if (!sourceItem) continue;

        const itemData = sourceItem.toObject();
        delete itemData._id;
        
        itemData.flags = itemData.flags || {};
        itemData.flags.trespasser = itemData.flags.trespasser || {};
        itemData.flags.trespasser.strongholdSource = strongholdUuid;
        
        try {
          await owner.createEmbeddedDocuments("Item", [itemData]);
        } catch (err) {
          console.error(`Trespasser | ERROR creating stronghold feature on ${owner.name}:`, err);
        }
      }
      ui.notifications.info(`Stronghold ${stronghold.name} features updated for ${owner.name}.`);
    }
  }
}
