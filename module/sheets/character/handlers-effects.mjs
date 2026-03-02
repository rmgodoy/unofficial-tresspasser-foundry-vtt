/**
 * Character Sheet — Effect handlers
 * onPrevailRoll, onIntensityChange, onEffectRemove
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

export async function onPrevailRoll(event, sheet) {
  event.preventDefault();
  const li         = event.currentTarget.closest(".effect-row");
  const effectItem = sheet.actor.items.get(li.dataset.itemId);
  if (!effectItem) return;

  const { dc, groupIds, groupNames } = TrespasserEffectsHelper.getPrevailGroup(sheet.actor, effectItem);
  const prevailBonus = sheet.actor.system.combat.prevail || 0;
  const roll         = new foundry.dice.Roll(`1d20 + ${prevailBonus}`);
  await roll.evaluate();

  const success    = roll.total >= dc;
  const groupLabel = groupIds.length > 1 ? `<b>${groupNames}</b>` : `<b>${effectItem.name}</b>`;
  const flavor     = success
    ? `Prevails against ${groupLabel} (Roll: ${roll.total} vs DC ${dc}) — <b>Success!</b>`
    : `Failed to prevail against ${groupLabel} (Roll: ${roll.total} vs DC ${dc}) — <b>Failed</b>`;

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });

  if (success) {
    for (const id of groupIds) {
      const item = sheet.actor.items.get(id);
      if (item) await item.delete();
    }
  }
}

export async function onIntensityChange(event, sheet) {
  const li     = event.currentTarget.closest(".effect-row");
  const val    = parseInt(event.currentTarget.value);
  if (isNaN(val)) return;
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (item) await item.update({ "system.intensity": val });
}

export async function onEffectRemove(event, sheet) {
  const li   = event.currentTarget.closest(".effect-row");
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (item) await item.delete();
}

export async function onDurationChange(event, sheet) {
  const li     = event.currentTarget.closest(".effect-row");
  const val    = parseInt(event.currentTarget.value);
  if (isNaN(val)) return;
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (item) await item.update({ "system.durationValue": val });
}

import { showItemInfoDialog } from "../../dialogs/item-info-dialog.mjs";

export async function onEffectInfo(event, sheet) {
  const li = event.currentTarget.closest("[data-item-id]");
  if (!li) return;
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (item) showItemInfoDialog(item.uuid);
}

export async function onEffectEdit(event, sheet) {
  const li     = event.currentTarget.closest(".effect-row");
  const actor  = sheet.actor;
  const itemId = li.dataset.itemId;

  // 1. Identify what we're editing
  const allEffects = TrespasserEffectsHelper.getActorEffects(actor);
  const found = [...allEffects.combat, ...allEffects.nonCombat].find(e => e.id === itemId);

  if (!found) return;

  if (found.property && found.index !== undefined) {
    // Internal effect of an item
    const parentItem = actor.items.get(found.itemId);
    if (!parentItem) return;
    
    // Create a virtual Item document for the sheet to work on
    const effectData = foundry.utils.deepClone(parentItem.system[found.property][found.index]);
    
    // Rename/Remove conflicting fields before passing to Item.implementation
    const docType = effectData.type || "effect";
    delete effectData.type;
    delete effectData.uuid;
    delete effectData.name;
    delete effectData.img;

    const tempItem = new Item.implementation({
      name: found.name || "Effect",
      type: docType,
      img: found.img,
      system: effectData
    }, { parent: actor });

    // Force the ID to be the synthetic one to avoid confusion if needed, 
    // but usually not necessary for the sheet.
    
    // Override update to sync back to the parent item
    tempItem.update = async (updateData) => {
      const currentArray = [...parentItem.system[found.property]];
      const newSystemData = foundry.utils.mergeObject(currentArray[found.index], updateData.system || updateData);
      currentArray[found.index] = newSystemData;
      await parentItem.update({ [`system.${found.property}`]: currentArray });
      return tempItem;
    };

    // Render the sheet for the virtual item
    tempItem.sheet.render(true);
  } else {
    // Standalone Effect/State item
    const effectItem = actor.items.get(found.id);
    if (effectItem) effectItem.sheet.render(true);
  }
}
