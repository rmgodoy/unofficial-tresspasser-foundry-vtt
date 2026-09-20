import { actorEventBus } from "../actor/actor-event-bus.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * Registry mapping trigger event names to supported interception modes.
 * @type {Record<string, string[]>}
 */
export const TRIGGER_INTERCEPTION_MODES = {
  "damage-received": ["none", "redirect_damage", "reduce_damage", "cancel_action", "modify_amount", "custom"],
  "damage-dealt": ["none", "modify_amount", "cancel_action", "custom"],
  "heal-received": ["none", "modify_amount", "cancel_action", "custom"],
  "heal-given": ["none", "modify_amount", "cancel_action", "custom"],
  "use": ["none", "modify_amount", "grant_advantage", "grant_disadvantage", "cancel_action", "custom"],
  "on-prevail": ["none", "modify_amount", "grant_advantage", "grant_disadvantage", "cancel_action", "custom"],
  "on-move": ["none", "cancel_action", "modify_amount", "custom"],
  "on-first-move": ["none", "cancel_action", "modify_amount", "custom"],
  "targeted": ["none", "cancel_action", "custom"],
  "on-targeted-deed": ["none", "cancel_action", "custom"],
  "on-use-deed": ["none", "cancel_action", "custom"],
  "on-deed-hit": ["none", "modify_amount", "grant_advantage", "grant_disadvantage", "cancel_action", "custom"],
  "on-deed-miss": ["none", "modify_amount", "grant_advantage", "grant_disadvantage", "cancel_action", "custom"],
  "on-deed-hit-received": ["none", "modify_amount", "cancel_action", "custom"],
  "on-deed-miss-received": ["none", "modify_amount", "cancel_action", "custom"],
  "start-of-combat": ["none", "custom"],
  "start-of-round": ["none", "custom"],
  "start-of-turn": ["none", "custom"],
  "end-of-turn": ["none", "custom"],
  "end-of-round": ["none", "custom"],
  "end-of-combat": ["none", "custom"],
  "immediate": ["none", "custom"],
  "continuous": ["none", "custom"]
};

/**
 * Get available interception mode keys for a given trigger.
 * @param {string} trigger
 * @returns {string[]}
 */
export function getInterceptionModesForTrigger(trigger) {
  if (!trigger) return ["none", "custom"];
  if (TRIGGER_INTERCEPTION_MODES[trigger]) {
    return TRIGGER_INTERCEPTION_MODES[trigger];
  }
  if (trigger.includes("damage")) {
    return TRIGGER_INTERCEPTION_MODES["damage-received"];
  }
  if (trigger.includes("heal")) {
    return TRIGGER_INTERCEPTION_MODES["heal-received"];
  }
  if (trigger.includes("move")) {
    return TRIGGER_INTERCEPTION_MODES["on-move"];
  }
  if (trigger.includes("prevail") || trigger.includes("roll") || trigger === "use") {
    return TRIGGER_INTERCEPTION_MODES["on-prevail"];
  }
  if (trigger.includes("deed") || trigger.includes("target")) {
    return TRIGGER_INTERCEPTION_MODES["on-use-deed"];
  }
  return ["none", "custom"];
}

/**
 * Evaluate numeric capacity or modifier value from an effect item.
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {number} [fallbackValue=0]
 * @returns {Promise<number>}
 */
async function evaluateCapacity(sourceActor, effectItem, fallbackValue = 0) {
  const intensity = effectItem.system?.intensity || 0;
  const rawMod = effectItem.system?.modifier || "";

  if (rawMod && rawMod !== "0") {
    try {
      const evalResult = await TrespasserEffectsHelper.evaluateModifier(rawMod, intensity, {
        actor: sourceActor,
        toMessage: false
      });
      const numVal = typeof evalResult === "number" ? evalResult : (evalResult?.total ?? 0);
      return Math.abs(numVal);
    } catch (_) {
      return intensity > 0 ? intensity : fallbackValue;
    }
  }
  return intensity > 0 ? intensity : fallbackValue;
}

import { 
  promptBatchInterception, 
  promptSingleInterception, 
  getInterceptionTargetUser 
} from "./interception-prompts.mjs";

export { promptBatchInterception, promptSingleInterception, getInterceptionTargetUser };

/**
 * Handle reactive damage interception (redirect, reduce, cancel).
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {object} event
 */
export async function handleDamageInterception(sourceActor, effectItem, event) {
  if (!sourceActor || !effectItem || !event) return;

  const mode = effectItem.system?.interceptionMode;
  if (!mode || mode === "none") return;

  const currentDamage = Number(event.amount) || 0;
  if (currentDamage <= 0 && mode !== "cancel_action") return;

  const activeBatch = actorEventBus.getActiveBatch();
  const hasBatch = Boolean(activeBatch && activeBatch.preApproved.has(effectItem.id));

  if (hasBatch) {
    const approvedSet = activeBatch.preApproved.get(effectItem.id);
    if (!approvedSet || !approvedSet.has(event.actor.id)) {
      return; // Target was not selected in the batch dialog
    }
  }

  const capacity = await evaluateCapacity(sourceActor, effectItem, currentDamage);
  const targetName = event.actor?.name || game.i18n.localize("TRESPASSER.Sheet.Item.Effect.ScopeChoices.Ally");

  if (mode === "redirect_damage") {
    const intercepted = Math.min(currentDamage, capacity);
    if (intercepted <= 0) return;

    if (!hasBatch) {
      const confirmed = await promptSingleInterception(sourceActor, effectItem, targetName, intercepted, "redirect_damage");
      if (!confirmed) return;
    }

    event.amount = Math.max(0, currentDamage - intercepted);
    event.modifiers = event.modifiers || [];
    event.modifiers.push({
      name: effectItem.name,
      value: -intercepted,
      source: sourceActor.name
    });

    event.deferredActions = event.deferredActions || [];
    event.deferredActions.push(async () => {
      await sourceActor.applyDamage(intercepted, {
        redirectedFrom: targetName,
        sourceItem: effectItem
      });

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
        content: `
          <div class="trespasser-chat-card reaction-card">
            <h3><i class="fas fa-shield-halved"></i> ${effectItem.name}</h3>
            <p class="hit-text">
              <strong>${sourceActor.name}</strong> ${game.i18n.format("TRESPASSER.Chat.Combat.InterceptedDamage", {
                count: intercepted,
                target: targetName,
                effect: effectItem.name
              })}
            </p>
          </div>
        `
      });
    });
  } else if (mode === "reduce_damage") {
    const reduced = Math.min(currentDamage, capacity);
    if (reduced <= 0) return;

    if (!hasBatch) {
      const confirmed = await promptSingleInterception(sourceActor, effectItem, targetName, reduced, "reduce_damage");
      if (!confirmed) return;
    }

    event.amount = Math.max(0, currentDamage - reduced);
    event.modifiers = event.modifiers || [];
    event.modifiers.push({
      name: effectItem.name,
      value: -reduced,
      source: sourceActor.name
    });
  } else if (mode === "cancel_action") {
    event.preventDefault = true;
    event.amount = 0;
  } else if (mode === "modify_amount") {
    event.amount = Math.max(0, currentDamage + capacity);
  }
}

/**
 * Handle reactive healing interception (boost, reduce, cancel).
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {object} event
 */
export async function handleHealInterception(sourceActor, effectItem, event) {
  if (!sourceActor || !effectItem || !event) return;

  const mode = effectItem.system?.interceptionMode;
  if (!mode || mode === "none") return;

  if (mode === "cancel_action") {
    event.preventDefault = true;
    event.amount = 0;
    return;
  }

  const capacity = await evaluateCapacity(sourceActor, effectItem, 0);
  if (mode === "modify_amount") {
    event.amount = Math.max(0, (Number(event.amount) || 0) + capacity);
  }
}

/**
 * Handle reactive roll / check interception (bonus, advantage, cancel).
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {object} event
 */
export async function handleRollInterception(sourceActor, effectItem, event) {
  if (!sourceActor || !effectItem || !event) return;

  const mode = effectItem.system?.interceptionMode;
  if (!mode || mode === "none") return;

  if (mode === "cancel_action") {
    event.preventDefault = true;
    return;
  }

  if (mode === "grant_advantage") {
    event.hasAdvantage = true;
    event.advantage = true;
    return;
  }

  if (mode === "grant_disadvantage") {
    event.hasDisadvantage = true;
    event.disadvantage = true;
    return;
  }

  if (mode === "modify_amount") {
    const modValue = await evaluateCapacity(sourceActor, effectItem, 0);
    event.modifiers = event.modifiers || [];
    event.modifiers.push({
      name: effectItem.name,
      value: modValue,
      source: sourceActor.name
    });
    if (typeof event.total === "number") {
      event.total += modValue;
    }
  }
}

/**
 * Handle reactive movement interception (anchor, modify distance).
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {object} event
 */
export async function handleMovementInterception(sourceActor, effectItem, event) {
  if (!sourceActor || !effectItem || !event) return;

  const mode = effectItem.system?.interceptionMode;
  if (!mode || mode === "none") return;

  if (mode === "cancel_action") {
    event.preventDefault = true;
    event.amount = 0;
    return;
  }

  if (mode === "modify_amount") {
    const modValue = await evaluateCapacity(sourceActor, effectItem, 0);
    event.amount = Math.max(0, (Number(event.amount) || 0) + modValue);
  }
}

/**
 * Dispatch interception based on the triggering event category.
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {object} event
 */
export async function dispatchInterception(sourceActor, effectItem, event) {
  const when = effectItem.system?.when || "";

  if (when.includes("damage") || event.type === "damage") {
    await handleDamageInterception(sourceActor, effectItem, event);
  } else if (when.includes("heal") || event.type === "healing") {
    await handleHealInterception(sourceActor, effectItem, event);
  } else if (when.includes("move") || event.type === "movement") {
    await handleMovementInterception(sourceActor, effectItem, event);
  } else if (when.includes("roll") || when.includes("prevail") || when === "use" || event.type === "skill-check") {
    await handleRollInterception(sourceActor, effectItem, event);
  } else {
    // Generic fallback: check interceptionMode
    const mode = effectItem.system?.interceptionMode;
    if (mode === "cancel_action") {
      event.preventDefault = true;
    } else if (mode === "grant_advantage") {
      event.hasAdvantage = true;
    } else if (mode === "grant_disadvantage") {
      event.hasDisadvantage = true;
    } else if (mode === "redirect_damage" || mode === "reduce_damage") {
      await handleDamageInterception(sourceActor, effectItem, event);
    }
  }
}

/**
 * Register middleware for an effect item if it specifies cross-actor scope or reactive interception.
 * @param {Actor} actor
 * @param {Item} effectItem
 */
export function registerEffectMiddleware(actor, effectItem) {
  if (!actor || !effectItem || effectItem.type !== "effect") return;

  // Skip effects with TCA behaviors — TCA registration handles them
  if (effectItem.system?.behaviors?.length > 0) return;

  const scope = effectItem.system?.scope || "self";
  const rangeType = effectItem.system?.rangeType || "custom";
  const rangeReq = effectItem.system?.rangeRequirement ?? 0;
  const interceptionMode = effectItem.system?.interceptionMode || "none";
  const when = effectItem.system?.when || "damage-received";

  // Only register middleware if cross-actor or interception is configured
  const isCrossActor = scope !== "self" || interceptionMode !== "none";
  if (!isCrossActor) return;

  actorEventBus.middleware(when, async (event) => {
    await dispatchInterception(actor, effectItem, event);
  }, {
    id: effectItem.id,
    sourceActorId: actor.id,
    effectItemId: effectItem.id,
    scope: scope,
    rangeType: rangeType,
    range: rangeReq,
    rangeRequirement: rangeReq,
    priority: 50
  });
}

/**
 * Synchronize all active effect middleware for an actor.
 * @param {Actor} actor
 */
export function syncActorInterceptions(actor) {
  if (!actor) return;
  actorEventBus.removeMiddlewareByActor(actor.id);
  for (const item of actor.items || []) {
    if (item.type === "effect") {
      registerEffectMiddleware(actor, item);
    }
  }
}

/**
 * Initialize cross-actor interception listeners across all active world actors.
 */
export function initMiddlewareInterception() {
  if (!game.actors) return;
  for (const actor of game.actors) {
    syncActorInterceptions(actor);
  }
}

