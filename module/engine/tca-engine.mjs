/**
 * Central TCA (Trigger -> Condition -> Action) Engine.
 * Coordinates effect behavior evaluation, gating, cooldowns, confirmation dialogs, and action execution.
 */

import { evaluateCondition } from "./expression-evaluator.mjs";
import { canUseBlock, recordBlockUse, getRemainingUses } from "./cooldown-tracker.mjs";
import { ACTION_HANDLERS } from "./action-handlers.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";
import { actorEventBus } from "../actor/actor-event-bus.mjs";
import { resolveActionTargets } from "./tca-target-resolver.mjs";
import { promptBlockConfirmation, promptChoiceGroup } from "./tca-dialogs.mjs";
import { getSystemFlag } from "../system-id.mjs";

export const ACTION_PRIORITIES = {
  modify_intensity: 15,
  modify_attribute: 20,
  confer_state: 40,
  remove_state: 40,
  grant_reaction: 50,
  redirect_damage: 60,
  force_movement: 70,
  roll_check: 70,
  set_flag: 80,
  chat_message: 90
};

/**
 * Checks whether an actor currently has the Tenacious state active.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isActorTenacious(actor) {
  if (!actor) return false;
  if (actor.system?.passiveStates?.tenacious) return true;
  if (actor.items?.some(i => i.type === "effect" && (
    getSystemFlag(i, "isTenaciousState") ||
    i.name?.toLowerCase() === "tenacious" ||
    getSystemFlag(i, "statusEffectId") === "tenacious"
  ))) {
    return true;
  }
  if (actor.type === "character" && (actor.system?.health ?? 0) <= 0) {
    const isDefeated = actor.system?.passiveStates?.defeated ||
      actor.items?.some(i => i.type === "effect" && (
        getSystemFlag(i, "isDefeatedState") ||
        getSystemFlag(i, "statusEffectId") === "defeated" ||
        i.name?.toLowerCase() === "defeated"
      ));
    if (!isDefeated) return true;
  }
  return false;
}

/**
 * Determines whether an effect item is a damage-dealing state/effect.
 * @param {Item} effectItem
 * @returns {boolean}
 */
export function isDamageDealingEffect(effectItem) {
  if (!effectItem || effectItem.type !== "effect") return false;

  const behaviors = effectItem.system?.behaviors || [];
  for (const b of behaviors) {
    if (b.action === "modify_attribute") {
      const attr = b.params?.attribute || effectItem.system?.targetAttribute;
      const mod = String(b.params?.modifier ?? effectItem.system?.modifier ?? "0").trim();
      if (attr === "health" || attr === "hp") {
        if (mod.startsWith("-") || mod.includes("-")) return true;
        const num = parseFloat(mod);
        if (!isNaN(num) && num < 0) return true;
      }
    }
  }

  // Check legacy flat fields as fallback
  const targetAttr = effectItem.system?.targetAttribute;
  if (targetAttr === "health" || targetAttr === "hp") {
    const mod = String(effectItem.system?.modifier || "0").trim();
    if (mod.startsWith("-") || mod.includes("-")) return true;
    const num = parseFloat(mod);
    if (!isNaN(num) && num < 0) return true;
  }

  return false;
}

/**
 * Retrieves all effect items bearing TCA behaviors on an actor.
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function getTCAEffects(actor) {
  if (!actor || !actor.items) return [];
  return actor.items.filter(i => i.type === "effect" && Array.isArray(i.system?.behaviors) && i.system.behaviors.length > 0);
}

/**
 * Calculates effective priority for an effect item.
 * @param {Item} effectItem
 * @returns {number}
 */
function getEffectPriority(effectItem) {
  if (typeof effectItem.system?.effectPriority === "number" && !isNaN(effectItem.system.effectPriority)) {
    return effectItem.system.effectPriority;
  }
  const behaviors = effectItem.system?.behaviors || [];
  if (behaviors.length === 0) return 100;

  let minPriority = 100;
  for (const b of behaviors) {
    const p = ACTION_PRIORITIES[b.action] ?? 100;
    if (p < minPriority) minPriority = p;
  }
  return minPriority;
}



/**
 * Evaluates whether a TCA block can execute in the given event context.
 * @param {object} block
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {object} event
 * @param {Actor|null} targetActor
 * @param {object} baseContext
 * @returns {boolean}
 */
function isBlockEligible(block, sourceActor, effectItem, event, targetActor, baseContext) {
  // Scope evaluation
  const blockScope = block.scope || effectItem.system?.scope || "self";
  const sourceToken = sourceActor?.getActiveTokens?.(true, true)?.[0] || sourceActor?.token;
  const targetToken = event?.token || targetActor?.getActiveTokens?.(true, true)?.[0] || targetActor?.token;

  const eventActor = event?.actor || sourceActor;
  if (!actorEventBus.isActorInScope(blockScope, sourceActor, eventActor, sourceToken, targetToken)) {
    console.log(`%c[TCA Engine | Ineligible]%c Block "${block.id}" (${block.action}) on "${effectItem.name}" skipped: Scope "${blockScope}" not satisfied.`, "color: #e06c75;", "color: inherit;");
    return false;
  }

  // Range evaluation
  const rangeType = block.rangeType || effectItem.system?.rangeType || "custom";
  const rangeVal = block.range ?? effectItem.system?.rangeRequirement ?? 0;
  if (rangeType !== "custom" && rangeType !== "none" && rangeVal > 0) {
    const maxRange = RangeHelper.getActorRange(sourceActor, rangeType, rangeVal, sourceToken);
    if (maxRange !== null && maxRange > 0 && sourceToken && targetToken && canvas?.grid) {
      const dist = RangeHelper.measureDistanceSquares(sourceToken, targetToken);
      if (dist > maxRange) {
        console.log(`%c[TCA Engine | Ineligible]%c Block "${block.id}" (${block.action}) on "${effectItem.name}" skipped: Out of range (${dist} > ${maxRange}).`, "color: #e06c75;", "color: inherit;");
        return false;
      }
    }
  }

  // Condition evaluation
  if (block.condition && !evaluateCondition(block.condition, baseContext)) {
    console.log(`%c[TCA Engine | Ineligible]%c Block "${block.id}" (${block.action}) on "${effectItem.name}" skipped: Condition "${block.condition}" evaluated to false.`, "color: #e06c75;", "color: inherit;");
    return false;
  }

  // Cooldown evaluation
  if (!canUseBlock(sourceActor.id, effectItem.id, block.id, block.cooldown)) {
    console.log(`%c[TCA Engine | Ineligible]%c Block "${block.id}" (${block.action}) on "${effectItem.name}" skipped: Cooldown active.`, "color: #e06c75;", "color: inherit;");
    return false;
  }

  // Paused while Tenacious if damage-dealing
  if (isActorTenacious(sourceActor) && isDamageDealingEffect(effectItem)) {
    console.log(`%c[TCA Engine | Ineligible]%c Block "${block.id}" on "${effectItem.name}" skipped: Paused while Tenacious.`, "color: #e5c07b;", "color: inherit;");
    return false;
  }

  return true;
}

/**
 * Execute a single TCA behavior block.
 * @param {object} block
 * @param {object} context
 * @returns {Promise<{ executed: boolean, result: any, chatContent: string }>}
 */
async function executeBlock(block, context) {
  const handler = ACTION_HANDLERS[block.action];
  if (typeof handler !== "function") {
    console.warn(`%c[TCA Engine]%c No action handler registered for action "${block.action}"`, "color: #e06c75; font-weight: bold;", "color: inherit;");
    return { executed: false, result: null, chatContent: "" };
  }

  const targetActors = resolveActionTargets(context, block.actionTarget || "self");
  if (targetActors.length === 0) {
    console.log(`%c[TCA Engine | Ineligible]%c "${block.id}" (${block.action}) skipped: No eligible targets in range.`, "color: #d19a66;", "color: inherit;");
    return { executed: false, result: null, chatContent: "" };
  }

  const chatContents = [];
  const results = [];
  let anyExecuted = false;

  for (const targetActor of targetActors) {
    const targetContext = { ...context, target: targetActor, actionTargetActor: targetActor };
    const res = await handler(block.params || {}, targetContext);
    if (res?.executed) {
      anyExecuted = true;
      results.push(res.result);
      if (res.chatContent) chatContents.push(res.chatContent);
    }
  }

  if (anyExecuted) {
    recordBlockUse(context.actor.id, context.effectItem.id, block.id, block.cooldown);
    console.log(`%c[TCA Engine | Executed]%c "${block.id}" (${block.action}) Result:`, "color: #98c379;", "color: inherit;", results);
  }

  return { executed: anyExecuted, result: results.length === 1 ? results[0] : results, chatContent: chatContents.join("") };
}

/**
 * Process all TCA-enabled effects for an actor in response to an event.
 * @param {string} eventName
 * @param {object} event
 * @param {Actor} actor
 */
export async function processTCAEvent(eventName, event, actor) {
  if (!eventName || !actor) return;

  const targetActor = (event.actor?.id === actor.id)
    ? (event.sourceActor || (event.source?.actor ? event.source.actor : (event.source instanceof Actor ? event.source : null)))
    : event.actor;

  // 1. Collect local TCA effects for this actor (cross-actor routing is handled by ActorEventBus middleware)
  const localEffects = getTCAEffects(actor);
  if (localEffects.length === 0) return;

  const effectEntries = localEffects.map(e => ({ sourceActor: actor, effectItem: e }));

  console.log(`%c[TCA Engine | Event: ${eventName}]%c Actor "${actor.name}" (${actor.id}) - processing ${localEffects.length} local effects`, "color: #e5c07b; font-weight: bold;", "color: inherit;", {
    localEffects: localEffects.map(e => ({ id: e.id, name: e.name, intensity: e.system?.intensity, behaviors: e.system?.behaviors }))
  });

  // Sort effects by priority
  effectEntries.sort((a, b) => getEffectPriority(a.effectItem) - getEffectPriority(b.effectItem));

  for (const { sourceActor, effectItem } of effectEntries) {
    if (isActorTenacious(sourceActor) && isDamageDealingEffect(effectItem)) {
      console.log(`%c[TCA Engine | Effect Paused]%c Damage-dealing effect "${effectItem.name}" is paused because "${sourceActor.name}" is Tenacious.`, "color: #e5c07b; font-weight: bold;", "color: inherit;");
      continue;
    }

    const behaviors = effectItem.system?.behaviors || [];
    const matchingBlocks = behaviors.filter(b => b.trigger === eventName && b.trigger !== "continuous" && b.trigger !== "immediate");
    if (matchingBlocks.length === 0) continue;

    console.log(`%c[TCA Engine | Matching Effect: ${effectItem.name}]%c Trigger "${eventName}": ${matchingBlocks.length}/${behaviors.length} blocks matched`, "color: #61afef; font-weight: bold;", "color: inherit;", matchingBlocks);

    const executedBlockIds = new Set();
    const effectChatLines = [];

    // Group blocks by choiceGroup if present
    const standardBlocks = [];
    const choiceGroups = new Map();

    for (const b of matchingBlocks) {
      if (b.choiceGroup && typeof b.choiceGroup === "string" && b.choiceGroup.trim() !== "") {
        const grp = b.choiceGroup.trim();
        if (!choiceGroups.has(grp)) choiceGroups.set(grp, []);
        choiceGroups.get(grp).push(b);
      } else {
        standardBlocks.push(b);
      }
    }

    // Process sequential standard blocks
    for (const block of standardBlocks) {
      if (block.gatedBy && !executedBlockIds.has(block.gatedBy)) {
        console.log(`%c[TCA Engine | Gated Block Skipped]%c Block "${block.id}" waiting on gate "${block.gatedBy}"`, "color: #d19a66;", "color: inherit;");
        continue;
      }

      const blockContext = {
        actor: sourceActor,
        target: targetActor,
        event,
        effectItem,
        block,
        intensity: effectItem.system?.intensity ?? 0,
        round: game.combat?.round ?? 0,
        turn: game.combat?.turn ?? 0,
        usesRemaining: getRemainingUses(sourceActor.id, effectItem.id, block.id, block.cooldown),
        engine: tcaEngine
      };

      if (!isBlockEligible(block, sourceActor, effectItem, event, targetActor, blockContext)) {
        continue;
      }

      if (block.requiresConfirmation) {
        const confirmed = await promptBlockConfirmation(sourceActor, effectItem, block, blockContext);
        if (!confirmed) {
          console.log(`%c[TCA Engine | Block Declined]%c Prompt declined for "${block.id}" on "${effectItem.name}"`, "color: #d19a66;", "color: inherit;");
          continue;
        }
      }

      const outcome = await executeBlock(block, blockContext);
      if (outcome.executed) {
        executedBlockIds.add(block.id);
        if (outcome.chatContent && block.action !== "chat_message") {
          effectChatLines.push(outcome.chatContent);
        }
      }
    }

    // Process choice groups
    for (const [groupName, groupBlocks] of choiceGroups.entries()) {
      const eligibleInGroup = groupBlocks.filter(b => {
        if (b.gatedBy && !executedBlockIds.has(b.gatedBy)) return false;
        const bCtx = {
          actor: sourceActor,
          target: targetActor,
          event,
          effectItem,
          block: b,
          intensity: effectItem.system?.intensity ?? 0,
          round: game.combat?.round ?? 0,
          turn: game.combat?.turn ?? 0,
          usesRemaining: getRemainingUses(sourceActor.id, effectItem.id, b.id, b.cooldown),
          engine: tcaEngine
        };
        return isBlockEligible(b, sourceActor, effectItem, event, targetActor, bCtx);
      });

      if (eligibleInGroup.length === 0) continue;

      const chosenBlock = await promptChoiceGroup(sourceActor, effectItem, groupName, eligibleInGroup, {
        intensity: effectItem.system?.intensity ?? 0
      });

      if (chosenBlock) {
        const bCtx = {
          actor: sourceActor,
          target: targetActor,
          event,
          effectItem,
          block: chosenBlock,
          intensity: effectItem.system?.intensity ?? 0,
          round: game.combat?.round ?? 0,
          turn: game.combat?.turn ?? 0,
          usesRemaining: getRemainingUses(sourceActor.id, effectItem.id, chosenBlock.id, chosenBlock.cooldown),
          engine: tcaEngine
        };
        const outcome = await executeBlock(chosenBlock, bCtx);
        if (outcome.executed) {
          executedBlockIds.add(chosenBlock.id);
          if (outcome.chatContent && chosenBlock.action !== "chat_message") {
            effectChatLines.push(outcome.chatContent);
          }
        }
      }
    }

    // Post consolidated chat card per effect if content was produced
    if (effectChatLines.length > 0) {
      const title = `${effectItem.name} [${effectItem.system?.intensity ?? 0}]`;
      const content = `
        <div class="trespasser-chat-card">
          <h3>${title}</h3>
          ${effectChatLines.join("")}
        </div>
      `;
      const chatData = {
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
        content
      };
      if (effectItem.system?.gmOnly) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
      }
      await ChatMessage.create(chatData);
    }
  }
}

/**
 * TCAEngine singleton.
 */
export const tcaEngine = {
  processTCAEvent,
  getTCAEffects,
  ACTION_HANDLERS,
  ACTION_PRIORITIES
};
