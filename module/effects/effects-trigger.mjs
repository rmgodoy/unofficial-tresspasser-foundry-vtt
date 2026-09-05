import { DurationHelper } from "../helpers/duration-helper.mjs";
import { buildTenacityButtonHtml } from "../helpers/tenacity-helper.mjs";
import { evaluateModifier } from "./effects-evaluator.mjs";
import { getActorEffects } from "./effects-aggregate.mjs";
import { TRIGGER_LABELS, TARGET_ATTRIBUTES } from "./effects-constants.mjs";

/**
 * Updates the focus of an actor.
 * @param {Actor} actor
 * @param {number} modValue
 * @returns {Promise<string>} The flavor text to be added to the chat message.
 */
export async function updateFocus(actor, modValue) {
  const currentFocus = actor.system?.combat?.focus ?? null;
  let flavor = '';
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
  let flavor = '';
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
  let flavor = '';
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
 * Evaluates and triggers all 'use' effects for a specific attribute.
 * @param {Actor}  actor
 * @param {string} attributeKey
 * @param {Object} [options]
 * @param {boolean} [options.toMessage]
 * @returns {Promise<number>}
 */
export async function evaluateAttributeBonus(actor, attributeKey, { toMessage = true } = {}) {
  if (!actor) return 0;
  const effects = getActorEffects(actor);
  const allEffects = [...effects.combat, ...effects.nonCombat];

  let total = 0;
  for (const eff of allEffects) {
    if (eff.target !== attributeKey || eff.when !== "use") continue;
    
    const value = await evaluateModifier(
      eff.modifier,
      eff.intensity || 0,
      { actor, toMessage }
    );
    total += value;

    if (eff.item) {
      const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "trigger");
      if (shouldExpire) {
        if (eff.item.type === "effect" || eff.item.type === "state") await eff.item.delete();
      } else {
        await eff.item.update({ "system.durationConditions": updatedConditions });
      }
    }
  }
  return total;
}

/**
 * Evaluates all modifiers for a damage attribute key (damage_dealt / damage_received).
 * @param {Actor}  actor
 * @param {string} attributeKey
 * @param {string} [weaponDie]
 * @param {Object} [options]
 * @returns {Promise<number>}
 */
export async function evaluateDamageBonus(actor, attributeKey, weaponDie = "d4", { toMessage = true } = {}) {
  if (!actor) return 0;
  const effects = getActorEffects(actor);
  const allEffects = [...effects.combat, ...effects.nonCombat];

  let total = 0;
  for (const eff of allEffects) {
    if (eff.target !== attributeKey) continue;
    if (eff.type === "active" && eff.when && eff.when !== "immediate" && eff.when !== "continuous") continue;

    const value = await evaluateModifier(
      eff.modifier,
      eff.intensity || 0,
      { actor, weaponDie, toMessage }
    );
    total += value;

    const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "triggers");
    if (shouldExpire) {
      if (eff.item?.type === "effect" || eff.item?.type === "state") {
        await eff.item.delete();
      }
    } else {
      await eff.item.update({ "system.durationConditions": updatedConditions });
    }
  }
  return total;
}

/**
 * Triggers automated effects on an actor based on the timing.
 * @param {Actor} actor
 * @param {string} timing
 * @param {Object} [options]
 * @param {string|null} [options.filterTarget]
 */
export async function triggerEffects(actor, timing, { filterTarget = null } = {}) {
  if (!actor) return;
  const effects = getActorEffects(actor);
  const allEffects = [...effects.combat, ...effects.nonCombat];
  
  const triggered = allEffects.filter(e => {
    const matchTiming = e.when === timing;
    const matchTarget = !filterTarget || e.target === filterTarget;
    return matchTiming && matchTarget;
  });
  if (triggered.length === 0) return;

  for (const eff of triggered) {
    const label = TRIGGER_LABELS[timing] || timing;
    const title = `${eff.name} [${eff.intensity}]`;
    
    let flavor = `<div class="trespasser-chat-card">
      <h3>${title}</h3>
      <p style="font-style: italic;">${game.i18n.format("TRESPASSER.Chat.Trigger.TriggeredAt", { label: game.i18n.localize(label) })}</p>`;

    if (eff.isOnlyReminder) {
      if (eff.description) {
        flavor += `<div class="reminder-text">${eff.description}</div>`;
      }
    } else {
      const roll = await evaluateModifier(eff.modifier, eff.intensity || 0, { actor, toMessage: false, returnRoll: true });
      const modValue = typeof roll === "number" ? roll : roll.total;
      
      if (eff.target === "health") {
        const rawHP = actor.system.health + modValue;
        const newHP = Math.clamp(rawHP, 0, actor.system.max_health);
        await actor.update({ "system.health": newHP }, { skipBelowZeroChat: true });
        
        if (modValue > 0) {
          flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthRecovered", { value: modValue })}</p>`;
        } else if (modValue < 0) {
          flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthLost", { value: Math.abs(modValue) })}</p>`;
          if (actor.type === "character" && rawHP < 0) {
            flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", { name: actor.name, hp: rawHP })}</p>`;
            flavor += buildTenacityButtonHtml(actor, rawHP);
          }
        } else {
          flavor += `<p>${game.i18n.localize("TRESPASSER.Chat.Trigger.HealthUnaffected")}</p>`;
        }
      } else if (eff.target === "endurance") {
        const newEnd = Math.clamp(actor.system.endurance + modValue, 0, actor.system.max_endurance);
        await actor.update({ "system.endurance": newEnd });
        if (modValue > 0) {
          flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.EnduranceRecovered", { value: modValue })}</p>`;
        } else if (modValue < 0) {
          flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.EnduranceLost", { value: Math.abs(modValue) })}</p>`;
        } else {
          flavor += `<p>${game.i18n.localize("TRESPASSER.Chat.Trigger.EnduranceUnaffected")}</p>`;
        }
      } else if (eff.target === "focus") {
        flavor += await updateFocus(actor, modValue);
      } else if (eff.target === "action_points") {
        flavor += await updateActionPoints(actor, modValue);
      } else if (eff.target === "combat_phase") {
        flavor += await updateCombatPhase(actor, modValue);
      } else {
        const targetLabel = game.i18n.localize(TARGET_ATTRIBUTES[eff.target]) || eff.target;
        flavor += `<p>${game.i18n.format("TRESPASSER.Chat.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
      }

      if (roll instanceof foundry.dice.Roll) {
        flavor += await roll.render();
      }
    }
    
    flavor += `</div>`;

    const chatData = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content: flavor
    };

    if (eff.gmOnly) {
      chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    }

    const isDefend = eff.item?.getFlag?.("trespasser", "isDefend") === true;
    if (!isDefend) {
      await ChatMessage.create(chatData);
    }

    const currentIntensity = eff.intensity || 0;
    const increment = eff.intensityIncrement || 0;
    if (increment !== 0) {
      await eff.item.update({ "system.intensity": currentIntensity + increment });
    }

    const durationConditions = eff.item?.system?.durationConditions || [];
    const hasRoundDuration = durationConditions.some(c => c.mode === "round");
    const hasTriggerDuration = durationConditions.some(c => c.mode === "trigger");

    if (timing === "end-of-round" && hasRoundDuration) {
      const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "round");
      if (shouldExpire) await eff.item.delete();
      else await eff.item.update({ "system.durationConditions": updatedConditions });
    } else if (hasTriggerDuration) {
      const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "trigger");
      if (shouldExpire) await eff.item.delete();
      else await eff.item.update({ "system.durationConditions": updatedConditions });
    }
  }
}

/**
 * Triggers a single effect item immediately.
 * @param {Actor} actor 
 * @param {Item} item 
 */
export async function triggerImmediate(actor, item) {
  if (!actor || !item) return;
  
  const when = item.system.when || item.system.triggerWhen;
  if (when !== "immediate") return;

  const target = item.system.targetAttribute || item.system.target;
  const intensity = item.system.intensity || 0;
  const modifier = item.system.modifier;

  const label = TRIGGER_LABELS["immediate"] || "immediate";
  const title = `${item.name} [${intensity}]`;

  let flavor = `<div class="trespasser-chat-card">
    <h3>${title}</h3>
    <p style="font-style: italic;">${game.i18n.format("TRESPASSER.Chat.Trigger.TriggeredAt", { label: game.i18n.localize(label) })}</p>`;

  if (item.system.isOnlyReminder) {
    if (item.system.description) {
      flavor += `<div class="reminder-text">${item.system.description}</div>`;
    }
  } else {
    const roll = await evaluateModifier(modifier, intensity, { actor, toMessage: false, returnRoll: true });
    const modValue = typeof roll === "number" ? roll : roll.total;

    if (target === "health") {
      const rawHP = actor.system.health + modValue;
      const newHP = Math.clamp(rawHP, 0, actor.system.max_health);
      await actor.update({ "system.health": newHP }, { skipBelowZeroChat: true });
      if (modValue > 0) flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthRecovered", { value: modValue })}</p>`;
      else if (modValue < 0) {
        flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthLost", { value: Math.abs(modValue) })}</p>`;
        if (actor.type === "character" && rawHP < 0) {
          flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", { name: actor.name, hp: rawHP })}</p>`;
          flavor += buildTenacityButtonHtml(actor, rawHP);
        }
      }
      else flavor += `<p>${game.i18n.localize("TRESPASSER.Chat.Trigger.HealthUnaffected")}</p>`;
    } 
    else if (target === "endurance") {
      const newEnd = Math.clamp(actor.system.endurance + modValue, 0, actor.system.max_endurance);
      await actor.update({ "system.endurance": newEnd });
      if (modValue > 0) flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.EnduranceRecovered", { value: modValue })}</p>`;
      else if (modValue < 0) flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.EnduranceLost", { value: Math.abs(modValue) })}</p>`;
      else flavor += `<p>${game.i18n.localize("TRESPASSER.Chat.Trigger.EnduranceUnaffected")}</p>`;
    }
    else if (target === "focus") flavor += await updateFocus(actor, modValue);
    else if (target === "action_points") flavor += await updateActionPoints(actor, modValue);
    else if (target === "combat_phase") flavor += await updateCombatPhase(actor, modValue);
    else {
      const targetLabel = game.i18n.localize(TARGET_ATTRIBUTES[target]) || target;
      flavor += `<p>${game.i18n.format("TRESPASSER.Chat.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
    }

    if (roll instanceof foundry.dice.Roll) flavor += await roll.render();
  }

  flavor += `</div>`;

  const chatData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: flavor
  };
  if (item.system.gmOnly) chatData.whisper = ChatMessage.getWhisperRecipients("GM");

  await ChatMessage.create(chatData);

  const increment = item.system.intensityIncrement || 0;
  if (increment !== 0) {
    await item.update({ "system.intensity": intensity + increment });
  }

  await item.delete();
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
