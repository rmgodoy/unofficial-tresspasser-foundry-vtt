/**
 * Character Sheet — Effect handlers
 * onPrevailRoll, onIntensityChange, onEffectRemove
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { askAPDialog }             from "../../dialogs/ap-dialog.mjs";
import { TrespasserCombat }        from "../../documents/combat.mjs";
import { showItemInfoDialog }      from "../../dialogs/item-info-dialog.mjs";
import { TrespasserRollDialog }    from "../../dialogs/roll-dialog.mjs";
import { SYSTEM_ID, getSystemFlag, setSystemFlag } from "../../system-id.mjs";

export async function onPrevailRoll(event, sheet) {
  event.preventDefault();
  const li         = event.currentTarget.closest(".effect-row");
  const effectItem = sheet.actor.items.get(li.dataset.itemId);
  if (!effectItem) return;

  let extraAP = 0;
  const combatant = TrespasserCombat.getPhaseCombatant(sheet.actor);
  
  if (combatant && (sheet.actor.type === "character" || sheet.actor.type === "commoner" || sheet.actor.type === "creature")) {
    const restrictAPF = game.settings.get(SYSTEM_ID, "restrictAPFocusUsage");
    const availableAP = getSystemFlag(combatant, "actionPoints") ?? 0;
    if (restrictAPF && availableAP < 1) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
      return;
    }

    let apSpent = 1;
    if (availableAP > 1) {
      apSpent = await askAPDialog(availableAP);
      if (apSpent === null) return;
    }
    
    extraAP = apSpent - 1;
    await setSystemFlag(combatant, "actionPoints", Math.max(0, availableAP - apSpent));
  }

  let intensity = effectItem.system.intensity || 0;
  if (!effectItem.system.isLasting) {
    const matchingLasting = sheet.actor.items.find(i => 
      i.type === "effect" && 
      i.system.isLasting && 
      i.name.toLowerCase() === effectItem.name.toLowerCase()
    );
    if (matchingLasting) {
      intensity += (matchingLasting.system.intensity || 0);
    }
  }
  const defaultCD = Math.min(20, 10 + intensity);
  const effectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(sheet.actor, "prevail", "use");
  const prevailStat = (sheet.actor.system.combat?.prevail || 0) - (effectBonusEntry.value || 0);
  const apBonus = extraAP * 2;

  const isAdv = TrespasserEffectsHelper.hasAdvantage(sheet.actor, "prevail");
  
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: defaultCD,
    bonuses: [
      { key: "basePrevail", label: game.i18n.localize("TRESPASSER.Sheet.Combat.Prevail"), value: prevailStat, toggleable: true },
      { key: "apBonus", label: game.i18n.localize("TRESPASSER.Sheet.HUD.ExtraAP"), value: apBonus, toggleable: true },
      effectBonusEntry
    ]
  }, { title: game.i18n.format("TRESPASSER.Chat.Check.PrevailCheck", { name: effectItem.name }) });

  if (!result) return;

  await sheet.actor.rollPrevail(effectItem.id, extraAP, {
    totalBonus: result.totalBonus,
    modifier: result.modifier,
    cd: result.cd
  });
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
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const li = event.currentTarget.closest(".effect-row, [data-item-id]");
  const itemId = li?.dataset?.itemId;
  if (!itemId) return;
  const actor = sheet.actor || sheet.document;
  const item = actor?.items?.get(itemId);
  if (item) await item.delete();
}

export async function onDurationChange(event, sheet) {
  const li     = event.currentTarget.closest(".effect-row, [data-item-id]");
  const val    = parseInt(event.currentTarget.value);
  if (isNaN(val) || !li?.dataset?.itemId) return;
  const actor = sheet.actor || sheet.document;
  const item = actor?.items?.get(li.dataset.itemId);
  if (item) await item.update({ "system.durationValue": val });
}

export async function onEffectInfo(event, sheet) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const li = event.currentTarget.closest(".effect-row, [data-item-id]");
  if (!li?.dataset?.itemId) return;
  const actor = sheet.actor || sheet.document;
  const item = actor?.items?.get(li.dataset.itemId);
  if (item) showItemInfoDialog(item.uuid);
}

export async function onEffectEdit(event, sheet) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const li = event.currentTarget.closest(".effect-row, [data-item-id]") || event.target?.closest?.(".effect-row, [data-item-id]");
  const actor = sheet.actor || sheet.document;
  if (!actor) return;
  const itemId = li?.dataset?.itemId || event.currentTarget.dataset?.itemId;
  if (!itemId) return;

  // 1. Direct item on actor (standalone Effect, State, Plight, etc.)
  const directItem = actor.items.get(itemId);
  if (directItem) {
    return directItem.sheet.render(true);
  }

  // 2. Synthetic / Internal effect on an equipped item or feature
  const allEffects = TrespasserEffectsHelper.getActorEffects(actor);
  const found = [...(allEffects.combat || []), ...(allEffects.nonCombat || [])].find(e => e.id === itemId);

  if (found) {
    if (found.uuid) {
      const opened = await TrespasserEffectsHelper.openEffectSheet(found.uuid);
      if (opened) return;
    }
    if (found.property && found.index !== undefined) {
      const parentItem = actor.items.get(found.itemId);
      if (parentItem) {
        const effectData = foundry.utils.deepClone(parentItem.system[found.property]?.[found.index] || {});
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

        tempItem.update = async (updateData) => {
          const currentArray = [...(parentItem.system[found.property] || [])];
          const newSystemData = foundry.utils.mergeObject(currentArray[found.index] || {}, updateData.system || updateData);
          currentArray[found.index] = newSystemData;
          await parentItem.update({ [`system.${found.property}`]: currentArray });
          return tempItem;
        };

        return tempItem.sheet.render(true);
      }
    }
  }

  // 3. Fallback: Parse synthetic ID format "${parentItemId}-${property}-${index}"
  const match = itemId.match(/^(.+)-(effects|enhancementEffects)-(\d+)$/);
  if (match) {
    const [, parentId, prop, idxStr] = match;
    const parentItem = actor.items.get(parentId);
    const idx = parseInt(idxStr, 10);
    if (parentItem && parentItem.system[prop]?.[idx]) {
      const effectData = foundry.utils.deepClone(parentItem.system[prop][idx]);
      const docType = effectData.type || "effect";
      delete effectData.type;
      delete effectData.uuid;
      delete effectData.name;
      delete effectData.img;

      const tempItem = new Item.implementation({
        name: effectData.name || "Effect",
        type: docType,
        img: effectData.img,
        system: effectData
      }, { parent: actor });

      tempItem.update = async (updateData) => {
        const currentArray = [...(parentItem.system[prop] || [])];
        currentArray[idx] = foundry.utils.mergeObject(currentArray[idx] || {}, updateData.system || updateData);
        await parentItem.update({ [`system.${prop}`]: currentArray });
        return tempItem;
      };

      return tempItem.sheet.render(true);
    }
  }
}
