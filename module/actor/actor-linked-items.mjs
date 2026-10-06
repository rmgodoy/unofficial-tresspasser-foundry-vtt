import { resolveItem } from "../helpers/item-resolver.mjs";
import { SYSTEM_ID, getSystemFlag } from "../system-id.mjs";

/**
 * Trespasser Actor Linked Items Sub-module
 * Handles applying and removing linked items (effects, deeds, talents, etc.)
 */

/**
 * Helper to apply an array of UUID references as actual items on the actor.
 * @param {Actor} actor
 * @param {Array} itemsArray
 * @param {object} [options]
 * @param {boolean} [options.continuousOnly]  Only apply continuous/immediate effects
 * @param {boolean} [options.fromInjury]   Mark applied items as injury-sourced (no Prevail)
 * @param {string}  [options.injuryId]     The injury item ID to stamp on each applied item
 * @param {string}  [options.sourceType]
 */
export async function applyLinkedItems(actor, itemsArray, { continuousOnly = false, fromInjury = false, injuryId = null, sourceType = null } = {}) {
  if (!itemsArray || !Array.isArray(itemsArray)) return;
  
  for (const eff of itemsArray) {
    if (!eff) continue;
    
    const sourceItem = await resolveItem(eff);
    if (!sourceItem) continue;

    const sys = sourceItem.system;
    const isContinuous = sys.type === "continuous" || sys.type === "movement";
    const isImmediate = sys.when === "immediate" || !sys.when;

    // If continuousOnly is requested, only apply effects that are continuous or immediate
    if (continuousOnly && !isContinuous && !isImmediate) continue;
    
    const desiredIntensity = (eff.intensity !== undefined && eff.intensity !== null && eff.intensity !== "" && !isNaN(Number(eff.intensity)))
      ? Number(eff.intensity)
      : (sourceItem.system.intensity ?? 0);

    // Create the item - the preCreateItem hook will handle summing and counter states
    const itemData = sourceItem.toObject();
    delete itemData._id;

    if (sourceItem.type === "effect") {
      itemData.system.intensity = desiredIntensity;
    }

    // Mark it so we know it came from a link
    itemData.flags = itemData.flags || {};
    itemData.flags[SYSTEM_ID] = itemData.flags[SYSTEM_ID] || {};
    itemData.flags[SYSTEM_ID].linkedSource = eff.uuid;

    // Stamp injury metadata if provided
    if (fromInjury) {
      itemData.flags[SYSTEM_ID].fromInjury = true;
      if (injuryId) itemData.flags[SYSTEM_ID].injuryId = injuryId;
    }
    await foundry.documents.BaseItem.create(itemData, { parent: actor });
  }
}

/**
 * Helper to remove or reduce intensity of linked items.
 * @param {Actor} actor
 * @param {Array} itemsArray 
 * @param {string} sourceItemId - The ID of the item that provided these links (Feature or Weapon)
 */
export async function removeLinkedItems(actor, itemsArray, sourceItemId) {
  if (!itemsArray || itemsArray.length === 0) return;
  
  // Collect all other active sources for Deeds and Actions
  const otherDeedNames = new Set();
  const otherActionNames = new Set();
  for (const item of actor.items) {
    if (item.id === sourceItemId) continue;
     
    if (item.type === "feature") {
      (item.system.deeds || []).forEach(d => otherDeedNames.add(d.name));
      (item.system.actions || []).forEach(a => otherActionNames.add(a.name));
    } else if (item.type === "weapon" && item.system.equipped) {
      (item.system.extraDeeds || []).forEach(d => otherDeedNames.add(d.name));
    } else if (item.type === "armor" && item.system.equipped) {
      (item.system.effects || []).forEach(e => {
        if (e.type === "deed") otherDeedNames.add(e.name);
        if (e.type === "action") otherActionNames.add(e.name);
      });
    } else if (item.type === "accessory" && item.system.equipped) {
      (item.system.deeds || []).forEach(d => otherDeedNames.add(d.name));
      (item.system.actions || []).forEach(a => otherActionNames.add(a.name));
      (item.system.talents || []).forEach(t => { if (t.type === "deed") otherDeedNames.add(t.name); });
      (item.system.features || []).forEach(f => { if (f.type === "deed") otherDeedNames.add(f.name); });
      (item.system.effects || []).forEach(e => { if (e.type === "deed") otherDeedNames.add(e.name); });
    }
  }

  for (const eff of itemsArray) {
    const existingEffect = actor.items.find(i => i.type === eff.type && i.name === eff.name);
    if (!existingEffect) continue;

    // Protection for Deeds and Actions
    if (existingEffect.type === "deed" || existingEffect.type === "action") {
      const otherNames = existingEffect.type === "action" ? otherActionNames : otherDeedNames;
      // 1. Never delete natural Deeds / Actions (no linkedSource flag)
      if (!getSystemFlag(existingEffect, "linkedSource")) continue;

      // 2. Never delete if another source still provides it
      if (otherNames.has(existingEffect.name)) continue;

      // 3. Otherwise, delete safely
      if (actor.items.has(existingEffect.id)) {
        try {
          await existingEffect.delete();
        } catch (_) {
          // Already deleted or unlinked
        }
      }
      continue;
    }

    // Handle Effects/States (with intensity)
    const sourceIntensity = parseInt(eff.intensity) || 0;
    const newIntensity = (existingEffect.system.intensity || 0) - sourceIntensity;
    if (newIntensity <= 0) {
      if (actor.items.has(existingEffect.id)) {
        try {
          await existingEffect.delete();
        } catch (_) {
          // Already deleted or unlinked
        }
      }
    } else {
      if (actor.items.has(existingEffect.id)) {
        try {
          await existingEffect.update({ "system.intensity": newIntensity });
        } catch (_) {
          // Item updated or removed concurrently
        }
      }
    }
  }
}
