import { DurationHelper } from "../helpers/duration-helper.mjs";
import { getAttributeEffects } from "./effects-aggregate.mjs";
import { TARGET_ATTRIBUTES } from "./effects-constants.mjs";

/**
 * Updates the focus of an actor.
 * @param {Actor} actor
 * @param {number} modValue
 * @returns {Promise<string>} The flavor text to be added to the chat message.
 */
export async function updateFocus(actor, modValue) {
  const currentFocus = actor.system?.combat?.focus ?? null;
  let flavor = "";
  if (currentFocus !== null) {
    const newFocus = Math.max(0, currentFocus + modValue);
    await actor.update({ "system.combat.focus": newFocus });

    if (modValue > 0) {
      flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.FocusRecovered", { value: modValue })}</p>`;
    } else if (modValue < 0) {
      flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.FocusLost", { value: Math.abs(modValue) })}</p>`;
    } else {
      flavor += `<p>${game.i18n.localize("TRESPASSER.Chat.Trigger.FocusUnaffected")}</p>`;
    }
  } else {
    const targetLabel = game.i18n.localize(TARGET_ATTRIBUTES["focus"]) || "focus";
    flavor += `<p>${game.i18n.format("TRESPASSER.Chat.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
  }
  return flavor;
}

/**
 * Updates the action points of an actor.
 * @param {Actor} actor
 * @param {number} modValue
 * @returns {Promise<string>} The flavor text to be added to the chat message.
 */
export async function updateActionPoints(actor, modValue) {
  let flavor = "";
  if (game.combat) {
    const combatant = game.combat.combatants.find(c => c.actorId === actor.id);
    if (combatant) {
      const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      const newAP = Math.max(0, currentAP + modValue);
      await combatant.setFlag("trespasser", "actionPoints", newAP);
      
      if (modValue > 0) {
        flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.APGained", { value: modValue })}</p>`;
      } else if (modValue < 0) {
        flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.APLost", { value: Math.abs(modValue) })}</p>`;
      }
    }
  }
  return flavor;
}

/**
 * Updates the combat phase of an actor.
 * @param {Actor} actor
 * @param {number} modValue
 * @returns {Promise<string>} The flavor text to be added to the chat message.
 */
export async function updateCombatPhase(actor, modValue) {
  let flavor = "";
  if (game.combat) {
    const combatant = game.combat.combatants.find(c => c.actorId === actor.id);
    if (combatant) {
      const phaseValues = [40, 30, 20, 10, 0];
      const closestPhase = phaseValues.reduce((prev, curr) => 
        Math.abs(curr - modValue) < Math.abs(prev - modValue) ? curr : prev
      );
      
      await combatant.update({ initiative: closestPhase });
      
      if (game.combat?.verifyPhaseAdvancement) {
        await game.combat.verifyPhaseAdvancement();
      }

      const combatClass = CONFIG.Combat.documentClass;
      let phaseLabel = closestPhase;
      if (combatClass && combatClass.PHASE_LABELS) {
        phaseLabel = game.i18n.localize(combatClass.PHASE_LABELS[closestPhase]) || closestPhase;
      }
      
      flavor += `<p>${game.i18n.format("TRESPASSER.Chat.Trigger.PhaseChanged", { phase: phaseLabel })}</p>`;
    }
  }
  return flavor;
}

/**
 * Evaluates all modifiers for a damage attribute key (damage_dealt / damage_received / heal_given / heal_received).
 * @param {Actor}  actor
 * @param {string} attributeKey
 * @param {string} [weaponDie]
 * @param {Object} [options]
 * @returns {Promise<number>}
 */
export async function evaluateDamageBonus(actor, attributeKey, weaponDie = "d4", { toMessage = true } = {}) {
  if (!actor || !attributeKey) return 0;
  const effects = getAttributeEffects(actor, attributeKey);
  return effects.reduce((sum, eff) => sum + (eff.value || 0), 0);
}

/**
 * Evaluates all modifiers for an attribute key.
 * @param {Actor}  actor
 * @param {string} attributeKey
 * @param {Object} [options]
 * @returns {Promise<number>}
 */
export async function evaluateAttributeBonus(actor, attributeKey, { toMessage = true } = {}) {
  if (!actor || !attributeKey) return 0;
  const effects = getAttributeEffects(actor, attributeKey, "use");
  return effects.reduce((sum, eff) => sum + (eff.value || 0), 0);
}

/**
 * @deprecated All effect triggering is handled by the TCA engine on ActorEventBus.
 * @param {Actor} actor
 * @param {string} timing
 * @param {Object} [options]
 */
export async function triggerEffects(actor, timing, { filterTarget = null } = {}) {
  // Deprecated: No-op. TCA engine handles all effect processing via ActorEventBus.
}

/**
 * @deprecated Immediate effects are handled by the TCA engine on creation.
 * @param {Actor} actor 
 * @param {Item} item 
 */
export async function triggerImmediate(actor, item) {
  // Deprecated: No-op. TCA engine handles immediate effects.
}

/**
 * Decrements "round" duration for all standalone effects on an actor.
 * @param {Actor} actor 
 */
export async function decrementRound(actor) {
  if (!actor) return;
  const effects = actor.items.filter(i => i.type === "effect");
  for (const item of effects) {
    const { shouldExpire, updatedConditions } = DurationHelper.processEvent(item, "round");
    if (shouldExpire) {
      await item.delete();
    } else {
      const current = DurationHelper.getConditions(item);
      const hasChanged = JSON.stringify(current) !== JSON.stringify(updatedConditions);
      if (hasChanged) {
        await item.update({ "system.durationConditions": updatedConditions });
      }
    }
  }
}
