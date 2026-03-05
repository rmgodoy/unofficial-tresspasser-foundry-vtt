/**
 * Character Sheet — Combat helpers
 * onEquipRoll, getActiveWeapons, getAccuracyFromTarget
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

export async function onEquipRoll(event, sheet) {
  event.preventDefault();
  const slot   = event.currentTarget.dataset.slot;
  const itemId = sheet.actor.system.equipment[slot];
  const item   = sheet.actor.items.get(itemId);

  if (!item || item.system.broken) return;

  const die  = item.system.armorDie || "d6";
  const roll = new foundry.dice.Roll(`1${die}`);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
    flavor:  game.i18n.format("TRESPASSER.Chat.BlockUsage", {
      name: sheet.actor.name,
      slot: game.i18n.localize("TRESPASSER.Sheet.Equipments." + slot.charAt(0).toUpperCase() + slot.slice(1)),
      item: item.name
    })
  });

  // ── Triggered effects (when: "use") ──────────────────────────────────────
  if (Array.isArray(item.system.effects)) {
    // Armor type: show choice in chat for manual application
    if (item.type === "armor") {
      await TrespasserEffectsHelper.applyEffectChat(item.system.effects, sheet.actor, { title: item.name });
      return; 
    }

    // Other items: auto-apply logic for "use" effects
    for (const eff of item.system.effects) {
      if (eff.when !== "use") continue;

      const modValue = await TrespasserEffectsHelper.evaluateModifier(eff.modifier, eff.intensity || 0, {
        actor: sheet.actor, toMessage: true
      });

      if (eff.target === "health") {
        const newHP = Math.clamp(sheet.actor.system.health + modValue, 0, sheet.actor.system.max_health);
        await sheet.actor.update({ "system.health": newHP });
        await foundry.documents.BaseChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
          content: game.i18n.format("TRESPASSER.Chat.EffectTriggeredHP", { name: item.name, value: (modValue > 0 ? "+" : "") + modValue })
        });
      } else {
        const itemName = `${item.name}: ${eff.target}`;
        const existing = sheet.actor.items.find(i => i.type === "effect" && i.name === itemName);
        if (!existing) {
          await foundry.documents.BaseItem.create({
            name: itemName, type: "effect",
            system: { targetAttribute: eff.target, modifier: modValue.toString(), intensity: eff.intensity || 0, isCombat: true, type: "active" }
          }, { parent: sheet.actor });
          await foundry.documents.BaseChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
            content: game.i18n.format("TRESPASSER.Chat.EffectTriggeredAdded", { name: item.name, target: eff.target })
          });
        }
      }
    }
  }

  await item.update({ "system.broken": true });
  await sheet.actor.update({ [`system.combat.equipment_snapshot.${slot}.used`]: true });
}

export function getActiveWeapons(sheet) {
  const actor     = sheet.actor;
  const mode      = actor.system.combat?.weaponMode || "main";
  const mainHandId = actor.system.equipment?.main_hand;
  const offHandId  = actor.system.equipment?.off_hand;

  const active = [];
  if (mode === "dual") {
    const main = mainHandId ? actor.items.get(mainHandId) : null;
    const off  = offHandId  ? actor.items.get(offHandId)  : null;
    if (main?.type === "weapon") active.push(main);
    if (off?.type === "weapon" && off.id !== main?.id) active.push(off);
  } else if (mode === "off") {
    const off = offHandId ? actor.items.get(offHandId) : null;
    if (off?.type === "weapon") active.push(off);
  } else {
    const main = mainHandId ? actor.items.get(mainHandId) : null;
    if (main?.type === "weapon") active.push(main);
  }
  return active;
}

export function getAccuracyFromTarget() {
  const targets = Array.from(game.user.targets);
  if (targets.length > 0) {
    const targetActor = targets[0].actor;
    if (targetActor) return targetActor.system.combat?.accuracy ?? targetActor.system.accuracy ?? 10;
  }
  return null;
}
