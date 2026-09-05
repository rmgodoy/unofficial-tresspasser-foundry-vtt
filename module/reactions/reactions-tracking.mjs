import { TrespasserCombat } from "../documents/combat.mjs";

/**
 * Get the reaction count for an actor in the current combat round.
 * @param {Actor} actor
 * @param {Combat} [combat=game.combat]
 * @returns {number}
 */
export function getReactionCount(actor, combat = game.combat) {
  if (!actor) return 0;
  if (combat && combat.combatants) {
    const combatant = TrespasserCombat.getPhaseCombatant(actor, combat);
    if (combatant) {
      return combatant.getFlag("trespasser", "reactionCount") || 0;
    }
  }
  return 0;
}

/**
 * Determine if an actor can take a reaction (checking focus if count > 0).
 * 1st reaction of round: free (cost = 0).
 * 2nd+ reaction of round: costs 1 focus.
 * @param {Actor} actor
 * @param {Combat} [combat=game.combat]
 * @returns {{ allowed: boolean, cost: number, currentFocus: number }}
 */
export function canTakeReaction(actor, combat = game.combat) {
  if (!actor) return { allowed: false, cost: 0, currentFocus: 0 };

  const hasFocus = actor.type !== "creature" && actor.system?.combat?.focus !== undefined;
  if (!hasFocus) {
    return { allowed: true, cost: 0, currentFocus: 0 };
  }

  const count = getReactionCount(actor, combat);
  const cost = count > 0 ? 1 : 0;
  const currentFocus = actor.system?.combat?.focus ?? 0;

  if (cost > 0 && currentFocus < cost) {
    return { allowed: false, cost, currentFocus };
  }
  return { allowed: true, cost, currentFocus };
}

/**
 * Consume reaction count and focus for an actor taking a reaction.
 * @param {Actor} actor
 * @param {Combat} [combat=game.combat]
 * @returns {Promise<boolean>}
 */
export async function consumeReaction(actor, combat = game.combat) {
  const check = canTakeReaction(actor, combat);
  if (!check.allowed) return false;

  if (check.cost > 0 && actor.type !== "creature" && actor.system?.combat?.focus !== undefined) {
    const newFocus = Math.max(0, check.currentFocus - check.cost);
    await actor.update({ "system.combat.focus": newFocus });
  }

  if (combat && combat.combatants) {
    const combatant = TrespasserCombat.getPhaseCombatant(actor, combat);
    if (combatant) {
      const currentCount = combatant.getFlag("trespasser", "reactionCount") || 0;
      await combatant.setFlag("trespasser", "reactionCount", currentCount + 1);
    }
  }

  return true;
}
