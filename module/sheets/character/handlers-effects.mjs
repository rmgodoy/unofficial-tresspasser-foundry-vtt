/**
 * Character Sheet — Effect handlers
 * onPrevailRoll, onIntensityChange, onEffectRemove
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { askAPDialog }             from "../../dialogs/ap-dialog.mjs";
import { TrespasserCombat }        from "../../documents/combat.mjs";

export async function onPrevailRoll(event, sheet) {
  event.preventDefault();
  const li         = event.currentTarget.closest(".effect-row");
  const effectItem = sheet.actor.items.get(li.dataset.itemId);
  if (!effectItem) return;

  let extraAP = 0;
  const combatant = TrespasserCombat.getPhaseCombatant(sheet.actor);
  
  if (combatant && sheet.actor.type === "character") {
    const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    if (availableAP < 1) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
      return;
    }

    let apSpent = 1;
    if (availableAP > 1) {
      apSpent = await askAPDialog(availableAP);
      if (apSpent === null) return;
    }
    
    extraAP = apSpent - 1;
    await combatant.setFlag("trespasser", "actionPoints", availableAP - apSpent);
  }

  await sheet.actor.rollPrevail(effectItem.id, extraAP);
  await TrespasserCombat.recordHUDAction(sheet.actor, "prevail");
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

    if (effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }
}
