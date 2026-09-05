import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { applyLinkedItems, removeLinkedItems } from "./actor-linked-items.mjs";

export { applyLinkedItems, removeLinkedItems };

/**
 * Helper to get total occupancy of unequipped inventory items.
 * @param {Actor} actor
 * @returns {number}
 */
export function getUsedInventorySlots(actor) {
  const unequippedItems = actor.items.filter(i => {
    const isSpecial = ["deed", "feature", "talent", "incantation", "effect", "injury"].includes(i.type);
    return !isSpecial && !i.system.equipped;
  });
  return unequippedItems.reduce((acc, i) => {
    const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
}

/**
 * Equip an item from the actor's inventory.
 * @param {Actor} actor
 * @param {string} itemId
 */
export async function equipItem(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item || item.system.equipped) return;

  if (item.system?.isThrown) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Inventory.WeaponIsThrown") || "This weapon was thrown and must be recovered before equipping.");
    return;
  }

  // Determine target slots
  let placement = item.system.placement;
  if (!placement && item.type === "weapon") placement = "hand";
  if (!placement && item.type === "item" && item.system.equippable) placement = "hand";

  const equipment = actor.system.equipment || {};
  let handKeys = [];

  // 1. Placement Check (Hands vs discrete slots)
  if (placement === "hand") {
    const is2H = item.type === "weapon" ? !!item.system.properties?.twoHanded : (item.system.slotOccupancy >= 2);
    
    if (is2H) {
      // Must have both hands free
      if (equipment.main_hand || equipment.off_hand || equipment.shield) {
        ui.notifications.error(game.i18n.localize("TRESPASSER.Notification.Inventory.TwoHandedEquip") || "Both hands must be free to equip a two-handed weapon.");
        return;
      }
      handKeys = ["main_hand", "off_hand"];
    } else {
      // One-handed: Prefer Main Hand
      if (!equipment.main_hand) {
        handKeys = ["main_hand"];
      } else if (!equipment.off_hand && !equipment.shield) {
        handKeys = ["off_hand"];
      } else {
        ui.notifications.error(game.i18n.localize("TRESPASSER.Notification.Inventory.HandsFull") || "Both hands are full!");
        return;
      }
    }
  } else {
    // Discrete slot Check
    const occupantId = equipment[placement];
    if (occupantId) {
      const occupant = actor.items.get(occupantId);
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Inventory.SlotOccupied", { 
        placement: placement, 
        name: occupant ? occupant.name : "another item" 
      }));
      return;
    }
  }

  // 2. Heavy Items Limit check
  if (item.system.weight === "H") {
    const equippedHeavy = actor.items.filter(i => i.id !== item.id && i.system.equipped && i.system.weight === "H");
    const totalHeavy = equippedHeavy.length + 1;
    
    let limit = 1;
    if (actor.type === "character") {
      const baseMighty = actor.system.attributes?.mighty ?? 0;
      const mightyBonus = TrespasserEffectsHelper.getAttributeBonus(actor, "mighty");
      limit = Math.max(1, baseMighty + mightyBonus);
    }

    if (totalHeavy > limit) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Inventory.HeavyEquipWarning", {
        name: item.name,
        limit: limit
      }));
    }
  }

  // 3. Update Item state
  await item.update({ "system.equipped": true });

  // 4. Update Actor and Snapshots
  const actorUpdates = {};
  if (placement === "hand") {
    for (const key of handKeys) {
      actorUpdates[`system.equipment.${key}`] = (key === handKeys[0]) ? item.id : "";
    }
  } else {
    actorUpdates[`system.equipment.${placement}`] = item.id;
  }

  // Snapshots
  if (item.type === "armor") {
    if (actor.system.combat?.equipment_snapshot?.[placement]) {
      actorUpdates[`system.combat.equipment_snapshot.${placement}`] = {
        die: item.system.armorDie,
        effect: item.system.effects?.length > 0 ? item.system.effects.map(e => e.name).join(", ") : "",
        used: item.system.broken
      };
    }
  } else if (item.type === "weapon") {
    const effectsStr = [...(item.system.effects || []), ...(item.system.enhancementEffects || [])].map(e => e.name).join(", ");
    if (handKeys.includes("main_hand") && actor.system.combat?.equipment_snapshot?.weapon) {
      actorUpdates[`system.combat.equipment_snapshot.weapon`] = { die: item.system.weaponDie, effect: effectsStr, used: false };
    }
    if (handKeys.includes("off_hand") && actor.system.combat?.equipment_snapshot?.off_hand) {
      actorUpdates[`system.combat.equipment_snapshot.off_hand`] = { die: item.system.weaponDie, effect: effectsStr, used: false };
    }
  }

  await actor.update(actorUpdates);

  if (item.system.subType === "light_source" || (item.type === "weapon" && item.system.isLightSource)) await syncTokenLight(actor);

  // Apply continuous and Trigger effects for non-weapon items (armor, accessory, item)
  if (item.type !== "weapon" && item.system.effects?.length > 0) {
    await applyLinkedItems(actor, item.system.effects, { 
      continuousOnly: true,
      sourceType: item.type
    });
  }

  if (item.type === "weapon") {
    if (item.system.enhancementEffects?.length > 0) await applyLinkedItems(actor, item.system.enhancementEffects, { continuousOnly: true });
    if (item.system.extraDeeds?.length > 0) await applyLinkedItems(actor, item.system.extraDeeds);
  }

  if (item.type === "accessory" || item.type === "item") {
    if (item.system.talents?.length > 0) await applyLinkedItems(actor, item.system.talents);
    if (item.system.features?.length > 0) await applyLinkedItems(actor, item.system.features);
    if (item.system.deeds?.length > 0) await applyLinkedItems(actor, item.system.deeds);
    if (item.system.incantations?.length > 0) await applyLinkedItems(actor, item.system.incantations);
  }
}

/**
 * Unequip an item.
 * @param {Actor} actor
 * @param {string} itemId
 */
export async function unequipItem(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item || !item.system.equipped) return;

  // 0. Check inventory space
  const unequippedItems = actor.items.filter(i => {
    const isSpecial = ["deed", "feature", "talent", "incantation", "effect", "state"].includes(i.type);
    return !isSpecial && !i.system.equipped;
  });
  
  const usedSlots = unequippedItems.reduce((acc, i) => {
    const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const itemWeight = item.system.slotOccupancy !== undefined ? parseFloat(item.system.slotOccupancy) : 1;
  const maxSlots = actor.system.inventory_max ?? 5;

  if ((usedSlots + itemWeight) > maxSlots) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Inventory.InventoryFullWarning", {
      name: item.name,
      used: (usedSlots + itemWeight).toFixed(1),
      max: maxSlots
    }));
  }

  const placement = item.system.placement;

  // 1. Update Item
  await item.update({ "system.equipped": false });

  // Remove or reduce linked effects for non-weapon items
  if (item.type !== "weapon" && item.system.effects?.length > 0) {
    await removeLinkedItems(actor, item.system.effects, item.id);
  }

  if (item.type === "armor") {
    const updates = {
      [`system.equipment.${placement}`]: ""
    };
    if (actor.system.combat?.equipment_snapshot?.[placement]) {
      updates[`system.combat.equipment_snapshot.${placement}`] = {
        die: "",
        effect: "",
        used: false
      };
    }
    await actor.update(updates);
  } else if (item.type === "weapon") {
    if (item.system.enhancementEffects && item.system.enhancementEffects.length > 0) {
      await removeLinkedItems(actor, item.system.enhancementEffects, item.id);
    }
    if (item.system.oilEffects && item.system.oilEffects.length > 0) {
      await item.update({ "system.oilEffects": [] });
    }
    if (item.system.extraDeeds && item.system.extraDeeds.length > 0) {
      await removeLinkedItems(actor, item.system.extraDeeds, item.id);
    }

    const updates = {};
    const mainHandId = actor.system.equipment?.main_hand;
    const offHandId = actor.system.equipment?.off_hand;

    if (mainHandId === itemId) {
      updates[`system.equipment.main_hand`] = "";
      if (actor.system.combat?.equipment_snapshot?.weapon) {
        updates[`system.combat.equipment_snapshot.weapon`] = { die: "", effect: "", used: false };
      }
    }
    if (offHandId === itemId) {
      updates[`system.equipment.off_hand`] = "";
      if (actor.system.combat?.equipment_snapshot?.off_hand) {
        updates[`system.combat.equipment_snapshot.off_hand`] = { die: "", effect: "", used: false };
      }
    }

    await actor.update(updates);
  } else if (item.type === "item" && item.system.equippable) {
    const updates = {};
    const equipment = actor.system.equipment || {};
    for (const [slot, id] of Object.entries(equipment)) {
      if (id === itemId) {
        updates[`system.equipment.${slot}`] = "";
        break;
      }
    }

    await item.update({ "system.equipped": false });
    if (Object.keys(updates).length > 0) await actor.update(updates);

    if (item.system.talents?.length > 0) await removeLinkedItems(actor, item.system.talents, item.id);
    if (item.system.features?.length > 0) await removeLinkedItems(actor, item.system.features, item.id);
    if (item.system.deeds?.length > 0) await removeLinkedItems(actor, item.system.deeds, item.id);
    if (item.system.incantations?.length > 0) await removeLinkedItems(actor, item.system.incantations, item.id);
    if (item.system.effects?.length > 0) await removeLinkedItems(actor, item.system.effects, item.id);

    if (item.system.subType === "light_source") await syncTokenLight(actor);
  } else if (item.type === "accessory") {
    const placementAcc = item.system.placement;

    await item.update({ "system.equipped": false });

    if (item.system.talents?.length > 0) await removeLinkedItems(actor, item.system.talents, item.id);
    if (item.system.features?.length > 0) await removeLinkedItems(actor, item.system.features, item.id);
    if (item.system.deeds?.length > 0) await removeLinkedItems(actor, item.system.deeds, item.id);
    if (item.system.effects?.length > 0) await removeLinkedItems(actor, item.system.effects, item.id);

    await actor.update({ [`system.equipment.${placementAcc}`]: "" });
  }
}

/**
 * Update token light configuration based on equipped and active light sources.
 * @param {Actor} actor
 */
export async function syncTokenLight(actor) {
  const lightSource = actor.items.find(i => {
    const isEquipped = i.system.equipped;
    const isActive = i.system.active;
    
    if (i.type === "item" && i.system.subType === "light_source") {
      return isEquipped && isActive;
    }
    
    if (i.type === "weapon" && i.system.isLightSource) {
      return isEquipped && isActive;
    }
    
    return false;
  });

  const tokens = actor.getActiveTokens();
  
  let dimVal = 0;
  let brightVal = 0;
  let hasAnimation = false;

  if (lightSource) {
    const radius = parseFloat(lightSource.system.radius) || 0;
    brightVal = radius / 2;
    dimVal = radius;
    hasAnimation = true;
  }

  for (const t of tokens) {
    await t.document.update({
      light: {
        dim: dimVal,
        bright: brightVal,
        alpha: 0.5,
        color: lightSource ? "#ff8c00" : null,
        animation: hasAnimation ? { type: "torch", speed: 2, intensity: 2 } : { type: "none" }
      }
    });
  }
}
