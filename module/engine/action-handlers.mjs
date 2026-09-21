/**
 * TCA Engine Action Handlers.
 * One handler per action type, executing within a standardized context.
 */

import { evaluateModifier } from "../effects/effects-evaluator.mjs";
import { updateFocus, updateActionPoints, updateCombatPhase } from "../effects/effects-trigger.mjs";
import { ForcedMovementHelper } from "../helpers/forced-movement-helper.mjs";
import { canTakeReaction } from "../reactions/reactions-tracking.mjs";
import { TARGET_ATTRIBUTES } from "../effects/effects-constants.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Resolves the effective target actor for a block execution.
 * @param {object} context
 * @param {string} [actionTarget="self"]
 * @returns {Actor|null}
 */
function resolveActionTarget(context, actionTarget = "self") {
  if (context.actionTargetActor) {
    return context.actionTargetActor;
  }
  if (actionTarget === "target") {
    return context.target || context.actor;
  }
  return context.actor;
}

/**
 * Replaces placeholders in message templates.
 * @param {string} text
 * @param {object} context
 * @returns {string}
 */
function formatMessagePlaceholders(text, context) {
  if (!text) return "";
  const actorName = context.actor?.name || "Actor";
  const targetName = context.target?.name || context.actor?.name || "Target";
  const effectName = context.effectItem?.name || "Effect";
  const intensity = String(context.intensity ?? context.effectItem?.system?.intensity ?? 0);
  const amount = String(context.event?.amount ?? 0);

  return text
    .replace(/{actorName}/g, actorName)
    .replace(/{targetName}/g, targetName)
    .replace(/{effectName}/g, effectName)
    .replace(/{intensity}/g, intensity)
    .replace(/{amount}/g, amount);
}

/**
 * 1. Modify Attribute Handler
 */
export async function handleModifyAttribute(params = {}, context = {}) {
  const targetActor = resolveActionTarget(context, context.block?.actionTarget);
  if (!targetActor) return { executed: false, result: null, chatContent: "" };

  const attribute = params.attribute || "health";
  const modifierStr = params.modifier || "0";
  const applyMode = params.applyMode || "delta";
  const intensity = context.intensity ?? context.effectItem?.system?.intensity ?? 0;

  const rollResult = await evaluateModifier(modifierStr, intensity, {
    actor: targetActor,
    toMessage: false,
    returnRoll: true
  });
  const modValue = typeof rollResult === "number" ? rollResult : (rollResult?.total ?? 0);

  let chatContent = "";

  // Middleware attribute adjustment for event amounts
  if (["damage_received", "damage_dealt", "heal_given", "heal_received"].includes(attribute) && context.event) {
    const currentAmount = Number(context.event.amount) || 0;
    const newAmount = applyMode === "set" ? modValue : Math.max(0, currentAmount + modValue);
    context.event.amount = newAmount;
    context.event.modifiers = context.event.modifiers || [];
    context.event.modifiers.push({
      name: context.effectItem?.name || "TCA Modifier",
      value: modValue,
      source: context.actor?.name || "Self"
    });
    chatContent = `<p>${game.i18n.format("TRESPASSER.Chat.Trigger.ModifierGenerated", {
      value: modValue > 0 ? `+${modValue}` : modValue,
      target: game.i18n.localize(TARGET_ATTRIBUTES[attribute]) || attribute
    })}</p>`;
    return { executed: true, result: { modValue, newAmount }, chatContent };
  }

  // Health
  if (attribute === "health") {
    if (applyMode === "set") {
      const maxHp = targetActor.system?.max_health ?? targetActor.system?.hp?.max ?? 100;
      const clampedHp = Math.clamp(modValue, 0, maxHp);
      await targetActor.update({ "system.health": clampedHp });
      chatContent = `<p>${targetActor.name}: Health set to ${clampedHp}</p>`;
    } else {
      if (modValue < 0) {
        if (typeof targetActor.applyDamage === "function") {
          const res = await targetActor.applyDamage(Math.abs(modValue), { sourceItem: context.effectItem });
          if (res?.isImmune) {
            chatContent = `<p class="miss-text"><strong>${targetActor.name}</strong>: ${game.i18n.format("TRESPASSER.Notification.Combat.ImmuneToDamage", { name: targetActor.name })}</p>`;
          } else {
            chatContent = `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthLost", { value: Math.abs(modValue) })}</p>`;
          }
        } else {
          const isImmune = Boolean(
            targetActor.getFlag?.(SYSTEM_ID, "immuneToDamage") ||
            targetActor.getFlag?.("trespasser", "immuneToDamage") ||
            targetActor.flags?.[SYSTEM_ID]?.immuneToDamage ||
            targetActor.flags?.trespasser?.immuneToDamage
          );
          if (!isImmune) {
            const currentHp = targetActor.system?.health ?? 0;
            await targetActor.update({ "system.health": Math.max(0, currentHp + modValue) });
            chatContent = `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthLost", { value: Math.abs(modValue) })}</p>`;
          } else {
            chatContent = `<p class="miss-text"><strong>${targetActor.name}</strong>: ${game.i18n.format("TRESPASSER.Notification.Combat.ImmuneToDamage", { name: targetActor.name })}</p>`;
          }
        }
      } else if (modValue > 0) {
        if (typeof targetActor.applyHealing === "function") {
          await targetActor.applyHealing(modValue, { sourceItem: context.effectItem });
        } else {
          const currentHp = targetActor.system?.health ?? 0;
          const maxHp = targetActor.system?.max_health ?? 100;
          await targetActor.update({ "system.health": Math.clamp(currentHp + modValue, 0, maxHp) });
        }
        chatContent = `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.HealthRecovered", { value: modValue })}</p>`;
      }
    }
  } else if (attribute === "endurance") {
    const curEnd = targetActor.system?.endurance ?? 0;
    const maxEnd = targetActor.system?.max_endurance ?? 10;
    const newEnd = applyMode === "set" ? Math.clamp(modValue, 0, maxEnd) : Math.clamp(curEnd + modValue, 0, maxEnd);
    await targetActor.update({ "system.endurance": newEnd });
    chatContent = `<p>${game.i18n.format(modValue >= 0 ? "TRESPASSER.Chat.Trigger.EnduranceRecovered" : "TRESPASSER.Chat.Trigger.EnduranceLost", { value: Math.abs(modValue) })}</p>`;
  } else if (attribute === "focus") {
    chatContent = await updateFocus(targetActor, modValue);
  } else if (attribute === "action_points") {
    chatContent = await updateActionPoints(targetActor, modValue);
  } else if (attribute === "combat_phase") {
    chatContent = await updateCombatPhase(targetActor, modValue);
  } else {
    // Combat stat (guard, resist, accuracy, etc.) continuous breakdown
    const targetLabel = game.i18n.localize(TARGET_ATTRIBUTES[attribute]) || attribute;
    chatContent = `<p>${game.i18n.format("TRESPASSER.Chat.Trigger.ModifierGenerated", { value: modValue > 0 ? `+${modValue}` : modValue, target: targetLabel })}</p>`;
  }

  if (rollResult instanceof foundry.dice.Roll) {
    chatContent += await rollResult.render();
  }

  return { executed: true, result: modValue, chatContent };
}

/**
 * 2. Confer State Handler
 */
export async function handleConferState(params = {}, context = {}) {
  const targetActor = resolveActionTarget(context, context.block?.actionTarget);
  if (!targetActor) return { executed: false, result: null, chatContent: "" };

  const { stateId, stateName, intensity = "1", removeTags = [] } = params;

  // Remove mutually exclusive states by tag if requested
  if (Array.isArray(removeTags) && removeTags.length > 0) {
    const toRemove = targetActor.items.filter(i =>
      i.type === "effect" && i.system?.tags?.some(t => removeTags.includes(t))
    );
    for (const item of toRemove) {
      await item.delete();
    }
  }

  const rawInt = await evaluateModifier(String(intensity), context.intensity ?? 1, { actor: targetActor });
  const finalIntensity = Math.max(1, Number(rawInt) || 1);

  // Search world, compendiums, or create synthetic
  let sourceItem = null;
  if (stateId) {
    sourceItem = game.items?.get(stateId) || (await fromUuid(stateId).catch(() => null));
  }
  if (!sourceItem && stateName) {
    sourceItem = game.items?.find(i => i.name.toLowerCase() === stateName.toLowerCase() && i.type === "effect");
  }

  let createdItem = null;
  if (sourceItem) {
    const itemData = sourceItem.toObject();
    itemData.system = itemData.system || {};
    itemData.system.intensity = finalIntensity;
    createdItem = await Item.create(itemData, { parent: targetActor });
  } else {
    // Create new effect item on actor
    createdItem = await Item.create({
      name: stateName || "New State",
      type: "effect",
      system: {
        intensity: finalIntensity,
        isCombat: true
      }
    }, { parent: targetActor });
  }

  const chatContent = `<p class="hit-text">${game.i18n.format("TRESPASSER.Chat.Trigger.StateConferred", {
    name: createdItem?.name || stateName,
    target: targetActor.name,
    intensity: finalIntensity
  }) || `Applied <strong>${createdItem?.name || stateName} [${finalIntensity}]</strong> to <strong>${targetActor.name}</strong>.`}</p>`;

  return { executed: true, result: createdItem, chatContent };
}

/**
 * 3. Remove State Handler
 */
export async function handleRemoveState(params = {}, context = {}) {
  const targetActor = resolveActionTarget(context, params.target || context.block?.actionTarget);
  if (!targetActor) return { executed: false, result: null, chatContent: "" };

  const { stateName, stateTag } = params;
  const toDelete = targetActor.items.filter(i => {
    if (i.type !== "effect") return false;
    if (stateName && i.name.toLowerCase() === stateName.toLowerCase()) return true;
    if (stateTag && Array.isArray(i.system?.tags) && i.system.tags.includes(stateTag)) return true;
    return false;
  });

  for (const item of toDelete) {
    await item.delete();
  }

  const removedNames = toDelete.map(i => i.name).join(", ");
  const chatContent = toDelete.length > 0
    ? `<p class="miss-text">${game.i18n.format("TRESPASSER.Chat.Trigger.StateRemoved", {
        name: removedNames,
        target: targetActor.name
      }) || `Removed <strong>${removedNames}</strong> from <strong>${targetActor.name}</strong>.`}</p>`
    : "";

  return { executed: toDelete.length > 0, result: toDelete.map(i => i.id), chatContent };
}

/**
 * 4. Modify Intensity Handler
 */
export async function handleModifyIntensity(params = {}, context = {}) {
  const effectItem = context.effectItem;
  if (!effectItem) return { executed: false, result: null, chatContent: "" };

  const valStr = String(params.value ?? "+1").trim();
  const currentInt = effectItem.system?.intensity ?? 0;
  let newInt = currentInt;

  if (valStr.startsWith("=")) {
    newInt = parseInt(valStr.slice(1), 10) || 0;
  } else if (valStr.startsWith("+") || valStr.startsWith("-")) {
    newInt = currentInt + (parseInt(valStr, 10) || 0);
  } else {
    newInt = parseInt(valStr, 10) || 0;
  }

  let chatContent = "";
  if (newInt <= 0 && effectItem.system?.isPrevailable !== false) {
    await effectItem.delete();
    chatContent = `<p class="miss-text"><strong>${effectItem.name}</strong> was removed (intensity reached 0).</p>`;
    return { executed: true, result: 0, chatContent };
  }

  await effectItem.update({ "system.intensity": newInt });
  chatContent = `<p><strong>${effectItem.name}</strong> intensity updated to <strong>${newInt}</strong>.</p>`;
  return { executed: true, result: newInt, chatContent };
}

/**
 * 5. Set Flag Handler
 */
export async function handleSetFlag(params = {}, context = {}) {
  const targetActor = resolveActionTarget(context, context.block?.actionTarget);
  if (!targetActor) return { executed: false, result: null, chatContent: "" };

  const flag = params.flag || "immuneToDamage";
  let rawVal = params.value;
  let value = true;
  if (rawVal === false || rawVal === "false" || rawVal === 0 || rawVal === "0") {
    value = false;
  } else if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
    value = rawVal === "true" ? true : rawVal;
  }

  await targetActor.setFlag(SYSTEM_ID, flag, value);

  // Synchronize status effect item and token HUD icon if applicable
  if (typeof targetActor.toggleStatusEffect === "function") {
    const boolActive = Boolean(value);
    await targetActor.toggleStatusEffect(flag, { active: boolActive });
  }

  const chatContent = `<p><strong>${targetActor.name}</strong> flag <em>${flag}</em> set to <em>${JSON.stringify(value)}</em>.</p>`;
  return { executed: true, result: value, chatContent };
}

/**
 * 6. Force Movement Handler
 */
export async function handleForceMovement(params = {}, context = {}) {
  const targetActor = resolveActionTarget(context, context.block?.actionTarget);
  if (!targetActor) return { executed: false, result: null, chatContent: "" };

  const sourceActor = context.actor;
  const sourceToken = sourceActor?.getActiveTokens?.(true, true)?.[0] || sourceActor?.token;
  const targetToken = targetActor?.getActiveTokens?.(true, true)?.[0] || targetActor?.token || sourceToken;

  const movementType = params.type || "push";
  const distRaw = await evaluateModifier(String(params.distance || "1"), context.intensity ?? 0, { actor: sourceActor });
  const distance = Math.max(0, Number(distRaw) || 0);

  if (distance > 0 && targetToken) {
    await ForcedMovementHelper.executeForcedMovement(sourceToken, [targetToken], movementType, distance);
  }

  const chatContent = `<p><strong>${targetActor.name}</strong> subjected to <strong>${movementType}</strong> (${distance} squares).</p>`;
  return { executed: true, result: { movementType, distance }, chatContent };
}

/**
 * 7. Roll Check Handler
 */
export async function handleRollCheck(params = {}, context = {}) {
  const targetActor = resolveActionTarget(context, context.block?.actionTarget);
  if (!targetActor) return { executed: false, result: null, chatContent: "" };

  const { checkType = "attribute", attribute = "mighty", dc = null } = params;
  let roll = null;

  if (checkType === "prevail" && typeof targetActor.rollPrevail === "function") {
    roll = await targetActor.rollPrevail(context.effectItem?.id, 0, { cd: dc ? Number(dc) : null });
  } else if (typeof targetActor.rollSkillCheck === "function") {
    roll = await targetActor.rollSkillCheck(attribute);
  }

  const success = roll ? (dc ? roll.total >= Number(dc) : true) : false;
  return { executed: Boolean(roll), result: { success, roll }, chatContent: "" };
}

/**
 * 8. Grant Reaction Handler
 */
export async function handleGrantReaction(params = {}, context = {}) {
  const actor = context.actor;
  if (!actor) return { executed: false, result: null, chatContent: "" };

  const reactionLabel = params.reactionLabel || context.effectItem?.name || "Reaction";
  const check = canTakeReaction(actor);

  return { executed: check.allowed, result: check, chatContent: `<p>Granted reaction: <strong>${reactionLabel}</strong>.</p>` };
}

/**
 * 9. Redirect Damage Handler
 */
export async function handleRedirectDamage(params = {}, context = {}) {
  const sourceActor = context.actor;
  const event = context.event;
  if (!sourceActor || !event) return { executed: false, result: null, chatContent: "" };

  const mode = params.mode || "redirect";
  const currentDamage = Number(event.amount) || 0;
  if (currentDamage <= 0) return { executed: false, result: null, chatContent: "" };

  const capacityRaw = await evaluateModifier(String(params.capacity || `${currentDamage}`), context.intensity ?? 0, { actor: sourceActor });
  const capacity = Math.max(0, Number(capacityRaw) || currentDamage);
  const intercepted = Math.min(currentDamage, capacity);

  if (intercepted <= 0) return { executed: false, result: null, chatContent: "" };

  event.amount = Math.max(0, currentDamage - intercepted);
  event.modifiers = event.modifiers || [];
  event.modifiers.push({
    name: context.effectItem?.name || "Damage Redirect",
    value: -intercepted,
    source: sourceActor.name
  });

  const targetName = event.actor?.name || "Target";
  if (mode === "redirect") {
    event.deferredActions = event.deferredActions || [];
    event.deferredActions.push(async () => {
      await sourceActor.applyDamage(intercepted, {
        redirectedFrom: targetName,
        sourceItem: context.effectItem
      });
    });
  }

  const chatContent = `<p class="hit-text"><strong>${sourceActor.name}</strong> intercepted <strong>${intercepted} damage</strong> for <strong>${targetName}</strong>.</p>`;
  return { executed: true, result: { intercepted, mode }, chatContent };
}

/**
 * 10. Chat Message Handler
 */
export async function handleChatMessage(params = {}, context = {}) {
  const msgTemplate = params.message || "";
  const formatted = formatMessagePlaceholders(msgTemplate, context);
  if (!formatted) return { executed: false, result: null, chatContent: "" };

  const chatContent = `<div class="trespasser-chat-card"><p>${formatted}</p></div>`;
  if (params.toChat !== false) {
    const chatData = {
      speaker: ChatMessage.getSpeaker({ actor: context.actor }),
      content: chatContent
    };
    if (params.gmOnly) {
      chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    }
    await ChatMessage.create(chatData);
  }

  return { executed: true, result: formatted, chatContent };
}

/**
 * Action Handler Registry mapping action types to handler functions.
 */
export const ACTION_HANDLERS = {
  modify_attribute: handleModifyAttribute,
  confer_state: handleConferState,
  remove_state: handleRemoveState,
  modify_intensity: handleModifyIntensity,
  set_flag: handleSetFlag,
  force_movement: handleForceMovement,
  roll_check: handleRollCheck,
  grant_reaction: handleGrantReaction,
  redirect_damage: handleRedirectDamage,
  chat_message: handleChatMessage
};
