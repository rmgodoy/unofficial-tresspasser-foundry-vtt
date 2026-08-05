import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";

export class ApplyEffectsBehavior {
  /**
   * Helper to get equipped weapons from an actor based on weapon mode and equipment slots.
   * Private to ApplyEffectsBehavior.
   * @param {Actor} actor
   * @returns {Item[]}
   * @protected
   */
  static _getActorEquippedWeapons(actor) {
    const mode = actor.system.combat?.weaponMode || "main";
    const mainHandId = actor.system.equipment?.main_hand;
    const offHandId = actor.system.equipment?.off_hand;
    const weapons = [];

    if (mode === "dual") {
      const main = mainHandId ? actor.items.get(mainHandId) : null;
      const off = offHandId ? actor.items.get(offHandId) : null;
      if (main?.type === "weapon") weapons.push(main);
      if (off?.type === "weapon" && off.id !== main?.id) weapons.push(off);
    } else if (mode === "off") {
      const off = offHandId ? actor.items.get(offHandId) : null;
      if (off?.type === "weapon") weapons.push(off);
    } else {
      const main = mainHandId ? actor.items.get(mainHandId) : null;
      if (main?.type === "weapon") weapons.push(main);
    }
    return weapons;
  }

  /**
   * 3. applyEffects: Applies specified effects to context.targets (incorporating Potency spark bonus) and appends notes to current phase.
   * Potency spark bonus intensity applies ONLY to targets whose spark count reached the layer where Potency was selected.
   * Also supports appliesWeaponEffects flag to apply equipped weapon's effects to targets.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const rawEffects = params.effects || [];
    const effects = Array.isArray(rawEffects) ? rawEffects : Object.values(rawEffects);

    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    // 1. Gather all base effect items from behavior params
    const effectList = [];
    for (const eff of effects) {
      if (!eff.uuid) continue;
      const effectItem = await fromUuid(eff.uuid);
      if (!effectItem) continue;
      effectList.push({
        item: effectItem,
        uuid: eff.uuid,
        baseIntensity: eff.intensity || 1,
        source: "deed"
      });
    }

    // 2. Gather weapon effects if appliesWeaponEffects is true
    if (params.appliesWeaponEffects && actor) {
      const equippedWeapons = this._getActorEquippedWeapons(actor);
      for (const weapon of equippedWeapons) {
        const weaponEffects = weapon.system?.effects;
        if (!Array.isArray(weaponEffects) || weaponEffects.length === 0) continue;
        for (const wEff of weaponEffects) {
          if (!wEff.uuid) continue;
          const effectItem = await fromUuid(wEff.uuid);
          if (!effectItem) continue;
          effectList.push({
            item: effectItem,
            uuid: wEff.uuid,
            baseIntensity: wEff.intensity || 1,
            source: weapon.name
          });
        }
      }
    }

    if (effectList.length === 0) return true;

    const { askPotencyDialog } = await import("../../dialogs/potency-dialog.mjs");

    // 3. Process targets and prompt for Potency distribution if there are multiple effects and Potency sparks
    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetPotencyBonus = targetChoices?.potency || 0;
      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);

      let potencyAllocations = [];
      if (targetPotencyBonus > 0 && effectList.length > 1) {
        potencyAllocations = await askPotencyDialog(
          targetPotencyBonus,
          effectList.map(e => ({ name: e.item.name, intensity: e.baseIntensity })),
          tokenName
        );
        if (!potencyAllocations) {
          potencyAllocations = effectList.map((_, i) => (i === 0 ? targetPotencyBonus : 0));
        }
      } else {
        potencyAllocations = effectList.map((_, i) => (i === 0 ? targetPotencyBonus : 0));
      }

      const itemDataArray = [];

      effectList.forEach((effData, idx) => {
        const addedPotency = potencyAllocations[idx] || 0;
        const itemData = effData.item.toObject();
        itemData.system = itemData.system || {};
        itemData.system.intensity = effData.baseIntensity + addedPotency;
        itemDataArray.push({ itemData, effData });
      });

      if (targetActor.isOwner) {
        await targetActor.createEmbeddedDocuments("Item", itemDataArray.map(d => d.itemData));
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("applyEffects", { 
          actorId: targetActor.id, 
          tokenId: targetToken.id, 
          itemDataArray: itemDataArray.map(d => d.itemData) 
        });
      }

      if (context.currentPhaseOutputs?.notes) {
        for (const { itemData, effData } of itemDataArray) {
          const sourceText = effData.source !== "deed" ? ` (from ${effData.source})` : "";
          context.currentPhaseOutputs.notes.push(
            `Applied effect "${effData.item.name}"${sourceText} (Intensity ${itemData.system.intensity}) to ${tokenName}`
          );
        }
      }
    }

    return true;
  }
}
