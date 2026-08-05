import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { ForcedMovementHelper } from "../forced-movement-helper.mjs";

export class ForceMoveTargetsBehavior {
  /**
   * 7. forceMoveTargets: Apply forced movement to validTargets.
   * Groups targets by their exact layered Impact bonus distance (baseDistance + targetImpactBonus).
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const type = params.type || "push";
    const baseDistance = parseInt(params.distance) || 1;
    const sourceToken = DeedBehaviorUtils.findToken(actor);

    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    // Group target tokens by their total calculated forced movement distance
    const distanceGroups = new Map();

    for (const targetToken of validTargets) {
      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetImpactBonus = (targetChoices?.impact || 0) * 2;
      const dist = baseDistance + targetImpactBonus;

      if (!distanceGroups.has(dist)) distanceGroups.set(dist, []);
      distanceGroups.get(dist).push(targetToken);
    }

    for (const [dist, groupTargets] of distanceGroups.entries()) {
      await ForcedMovementHelper.executeForcedMovement(sourceToken, groupTargets, type, dist);
    }

    if (context.currentPhaseOutputs?.notes) {
      const summaries = [];
      for (const [dist, groupTargets] of distanceGroups.entries()) {
        summaries.push(`${groupTargets.length} target(s) moved ${dist} sq`);
      }
      context.currentPhaseOutputs.notes.push(
        `Forced movement (${type}): ${summaries.join("; ")}`
      );
    }
    return true;
  }
}
