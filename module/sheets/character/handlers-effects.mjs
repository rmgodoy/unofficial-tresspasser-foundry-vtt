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
