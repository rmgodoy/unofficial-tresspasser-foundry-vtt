/**
 * Central TCA (Trigger -> Condition -> Action) Engine.
 * Coordinates effect behavior evaluation, gating, cooldowns, confirmation dialogs, and action execution.
 */

import { evaluateCondition } from "./expression-evaluator.mjs";
import { canUseBlock, recordBlockUse, getRemainingUses } from "./cooldown-tracker.mjs";
import { ACTION_HANDLERS } from "./action-handlers.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";
import { actorEventBus } from "../actor/actor-event-bus.mjs";

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
 * Resolves prompt confirmation for a single TCA block.
 * @param {Actor} actor
 * @param {Item} effectItem
 * @param {object} block
 * @param {object} context
 * @returns {Promise<boolean>}
 */
async function promptBlockConfirmation(actor, effectItem, block, context) {
  if (typeof foundry?.applications?.api?.DialogV2?.confirm !== "function") return true;

  const defaultPrompt = `${effectItem.name}: ${game.i18n.localize("TRESPASSER.Global.Action.Accept")} ${block.label || block.action}?`;
  let promptText = block.promptText || defaultPrompt;
  if (promptText) {
    promptText = promptText
      .replace(/{actorName}/g, actor.name)
      .replace(/{effectName}/g, effectItem.name)
      .replace(/{intensity}/g, String(context.intensity ?? 0));
  }

  const content = `<div class="trespasser-dialog"><p style="font-size: var(--fs-13); margin: 0;">${promptText}</p></div>`;

  try {
    return await foundry.applications.api.DialogV2.confirm({
      window: { title: effectItem.name },
      content,
      yes: { label: game.i18n.localize("TRESPASSER.Global.Action.Accept") || "Accept", icon: "fas fa-check" },
      no: { label: game.i18n.localize("TRESPASSER.Global.Action.Decline") || "Decline", icon: "fas fa-times" },
      defaultYes: true
    });
  } catch (_) {
    return false;
  }
}

/**
 * Resolves choice group selection dialog for mutually exclusive blocks.
 * @param {Actor} actor
 * @param {Item} effectItem
 * @param {string} groupName
 * @param {object[]} blocks
 * @param {object} context
 * @returns {Promise<object|null>} The chosen block, or null if cancelled
 */
async function promptChoiceGroup(actor, effectItem, groupName, blocks, context) {
  if (typeof foundry?.applications?.api?.DialogV2?.wait !== "function" || blocks.length <= 1) {
    return blocks[0] || null;
  }

  const optionsHtml = blocks.map((b, idx) => {
    const label = b.choiceLabel || b.label || `${b.action} (${b.id})`;
    return `
      <label class="choice-option-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; padding:6px; border:1px solid var(--trp-border-light, #5c4f3a); border-radius:4px; background:rgba(0,0,0,0.2);">
        <input type="radio" name="blockChoice" value="${b.id}" ${idx === 0 ? "checked" : ""} style="cursor:pointer;" />
        <span style="font-size: var(--fs-12);">${label}</span>
      </label>
    `;
  }).join("");

  const content = `
    <div class="trespasser-dialog choice-group-dialog" style="padding:4px;">
      <p style="font-size:var(--fs-12); margin-bottom:8px;">${game.i18n.format("TRESPASSER.Dialog.ChoiceGroup.Prompt", { effect: effectItem.name, group: groupName }) || `Choose an action for ${effectItem.name}:`}</p>
      <div class="choice-group-list">
        ${optionsHtml}
      </div>
    </div>
  `;

  try {
    const selectedId = await foundry.applications.api.DialogV2.wait({
      window: { title: `${effectItem.name} — ${groupName}` },
      classes: ["trespasser", "dialog"],
      position: { width: 340 },
      content,
      buttons: [
        {
          action: "select",
          icon: "fas fa-check",
          label: game.i18n.localize("TRESPASSER.Global.Action.Accept") || "Confirm",
          default: true,
          callback: (_event, _button, dialog) => {
            const checked = dialog.element.querySelector('input[name="blockChoice"]:checked');
            return checked ? checked.value : null;
          }
        },
        {
          action: "cancel",
          icon: "fas fa-times",
          label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") || "Cancel",
          callback: () => null
        }
      ]
    });

    if (!selectedId) return null;
    return blocks.find(b => b.id === selectedId) || null;
  } catch (_) {
    return null;
  }
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

  if (!actorEventBus.isActorInScope(blockScope, sourceActor, targetActor || sourceActor, sourceToken, targetToken)) {
    return false;
  }

  // Range evaluation
  const rangeType = block.rangeType || effectItem.system?.rangeType || "custom";
  const rangeVal = block.range ?? effectItem.system?.rangeRequirement ?? 0;
  if (rangeType !== "custom" && rangeType !== "none" && rangeVal > 0) {
    const maxRange = RangeHelper.getActorRange(sourceActor, rangeType, rangeVal, sourceToken);
    if (maxRange !== null && maxRange > 0 && sourceToken && targetToken && canvas?.grid) {
      const dist = RangeHelper.measureDistanceSquares(sourceToken, targetToken);
      if (dist > maxRange) return false;
    }
  }

  // Condition evaluation
  if (block.condition && !evaluateCondition(block.condition, baseContext)) {
    return false;
  }

  // Cooldown evaluation
  if (!canUseBlock(sourceActor.id, effectItem.id, block.id, block.cooldown)) {
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
    console.warn(`TCAEngine | No action handler registered for action "${block.action}"`);
    return { executed: false, result: null, chatContent: "" };
  }

  const result = await handler(block.params || {}, context);
  if (result?.executed) {
    recordBlockUse(context.actor.id, context.effectItem.id, block.id, block.cooldown);
  }
  return result || { executed: false, result: null, chatContent: "" };
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

  // 1. Collect all local TCA effects
  const localEffects = getTCAEffects(actor);

  // 2. Also collect cross-actor TCA effects in scene/world if actor is the target
  const crossActorEffects = [];
  if (game.actors && targetActor && targetActor.id !== actor.id) {
    for (const otherActor of game.actors) {
      if (otherActor.id === actor.id) continue;
      const otherEffects = getTCAEffects(otherActor);
      for (const eff of otherEffects) {
        const hasCrossBlock = (eff.system?.behaviors || []).some(b => {
          const s = b.scope || eff.system?.scope || "self";
          return s !== "self" && b.trigger === eventName;
        });
        if (hasCrossBlock) {
          crossActorEffects.push({ sourceActor: otherActor, effectItem: eff });
        }
      }
    }
  }

  // Build full processing list
  const effectEntries = [
    ...localEffects.map(e => ({ sourceActor: actor, effectItem: e })),
    ...crossActorEffects
  ];

  if (effectEntries.length === 0) return;

  // Sort effects by priority
  effectEntries.sort((a, b) => getEffectPriority(a.effectItem) - getEffectPriority(b.effectItem));

  for (const { sourceActor, effectItem } of effectEntries) {
    const behaviors = effectItem.system?.behaviors || [];
    const matchingBlocks = behaviors.filter(b => b.trigger === eventName || (b.trigger === "continuous" && eventName === "use"));
    if (matchingBlocks.length === 0) continue;

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
      if (block.gatedBy && !executedBlockIds.has(block.gatedBy)) continue;

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
        if (!confirmed) continue;
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
