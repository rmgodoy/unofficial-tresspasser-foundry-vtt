/**
 * TCA Target Resolver.
 * Resolves target actors for TCA behavior blocks based on actionTarget settings
 * (e.g. self, target, adjacent, all_in_range, enemies_in_range, allies_in_range).
 */

import { RangeHelper } from "../helpers/range-helper.mjs";
import { actorEventBus } from "../actor/actor-event-bus.mjs";

/**
 * Resolves all target actors for a behavior block execution.
 * @param {object} context - The TCA execution context.
 * @param {string} [actionTarget="self"] - "self" | "target" | "adjacent" | "all_in_range" | "enemies_in_range" | "allies_in_range"
 * @returns {Actor[]} Array of distinct Actor documents to receive the action.
 */
export function resolveActionTargets(context, actionTarget = "self") {
  if (context.actionTargetActor) {
    return [context.actionTargetActor];
  }

  const sourceActor = context.actor;
  if (!sourceActor) return [];

  // 1. Explicit single-target modes
  if (actionTarget === "self") {
    return [sourceActor];
  }

  if (actionTarget === "target") {
    const target = context.target || sourceActor;
    return [target];
  }

  // 2. Proximity and Range queries on canvas tokens
  const sourceToken = sourceActor.getActiveTokens?.(false, false)?.[0] 
    || sourceActor.getActiveTokens?.()[0] 
    || sourceActor.token?.object 
    || sourceActor.token;
  if (!sourceToken || !canvas?.tokens?.placeables) {
    return context.target ? [context.target] : [sourceActor];
  }

  const block = context.block || {};
  const effectItem = context.effectItem || {};

  let maxRange = 1;
  let scopeFilter = block.scope || "all";

  if (actionTarget === "adjacent") {
    maxRange = 1;
    scopeFilter = block.scope || "all";
  } else if (actionTarget === "all_in_range") {
    const rangeType = block.rangeType || effectItem.system?.rangeType || "custom";
    const rangeVal = block.range ?? effectItem.system?.rangeRequirement ?? 1;
    maxRange = RangeHelper.getActorRange(sourceActor, rangeType, rangeVal, sourceToken) ?? rangeVal ?? 1;
    scopeFilter = block.scope || "all";
  } else if (actionTarget === "enemies_in_range") {
    const rangeType = block.rangeType || effectItem.system?.rangeType || "custom";
    const rangeVal = block.range ?? effectItem.system?.rangeRequirement ?? 1;
    maxRange = RangeHelper.getActorRange(sourceActor, rangeType, rangeVal, sourceToken) ?? rangeVal ?? 1;
    scopeFilter = block.scope || "enemy";
  } else if (actionTarget === "allies_in_range") {
    const rangeType = block.rangeType || effectItem.system?.rangeType || "custom";
    const rangeVal = block.range ?? effectItem.system?.rangeRequirement ?? 1;
    maxRange = RangeHelper.getActorRange(sourceActor, rangeType, rangeVal, sourceToken) ?? rangeVal ?? 1;
    scopeFilter = block.scope || "ally";
  }

  const matchedActors = [];
  const seenActorIds = new Set();
  const sourceTokenId = sourceToken.id || sourceToken.document?.id;

  for (const token of canvas.tokens.placeables) {
    if (!token || token.id === sourceTokenId || token.document?.id === sourceTokenId) continue;
    const targetActor = token.actor;
    if (!targetActor) continue;

    // Measure distance in grid squares
    const dist = RangeHelper.measureDistanceSquares(sourceToken, token);
    if (dist > maxRange) continue;

    // Check scope filter (enemy/ally/all)
    if (scopeFilter && !actorEventBus.isActorInScope(scopeFilter, sourceActor, targetActor, sourceToken, token)) {
      continue;
    }

    if (!seenActorIds.has(targetActor.id)) {
      seenActorIds.add(targetActor.id);
      matchedActors.push(targetActor);
    }
  }

  return matchedActors;
}
