import { MovementHelper } from "./movement-helper.mjs";
import { DeedBehaviorUtils } from "./deed-behaviors/deed-behavior-utils.mjs";
import { RollAccuracyBehavior } from "./deed-behaviors/roll-accuracy.mjs";
import { SelectTargetBehavior } from "./deed-behaviors/select-target.mjs";
import { SelectAreaBehavior } from "./deed-behaviors/select-area.mjs";
import { RollBehavior } from "./deed-behaviors/roll.mjs";
import { ApplyDamageBehavior } from "./deed-behaviors/apply-damage.mjs";
import { HealTargetBehavior } from "./deed-behaviors/heal-target.mjs";
import { GrantRecoveryBehavior } from "./deed-behaviors/grant-recovery.mjs";
import { ApplyEffectsBehavior } from "./deed-behaviors/apply-effects.mjs";
import { SpawnTerrainBehavior } from "./deed-behaviors/spawn-terrain.mjs";
import { MoveTerrainBehavior } from "./deed-behaviors/move-terrain.mjs";
import { MoveSourceBehavior } from "./deed-behaviors/move-source.mjs";
import { ForceMoveTargetsBehavior } from "./deed-behaviors/force-move-targets.mjs";
import { ClearTargetsBehavior } from "./deed-behaviors/clear-targets.mjs";
import { ExecuteDeedBehavior } from "./deed-behaviors/execute-deed.mjs";

/**
 * DeedBehaviorHandler — Dispatcher executing actual game logic for all deed behavior types.
 *
 * Fully compliant with Trespasser TTRPG Sparks & Multiple Targets Layered Resolution Rules:
 *   - Layer 1 Choice applies to all targets with sparks >= 1
 *   - Layer 2 Choice applies only to targets with sparks >= 2
 *   - Layer k Choice applies only to targets with sparks >= k
 */
export class DeedBehaviorHandler {

  /**
   * Dispatch a single behavior.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key ("start", "before", "base", "hit", "spark", "after", "end")
   */
  static async dispatch(behavior, context, actor, item, phaseKey = "") {
    return MovementHelper.withFreeMovement(async () => {
      switch (behavior.type) {
        case "rollAccuracy":     return RollAccuracyBehavior.execute(behavior, context, actor, item, phaseKey);
        case "selectTarget":     return SelectTargetBehavior.execute(behavior, context, actor, item);
        case "selectArea":       return SelectAreaBehavior.execute(behavior, context, actor, item);
        case "roll":             return RollBehavior.execute(behavior, context, actor, item, phaseKey);
        case "applyDamage":      return ApplyDamageBehavior.execute(behavior, context, actor, item, phaseKey);
        case "healTarget":
        case "applyHealing":     return HealTargetBehavior.execute(behavior, context, actor, item, phaseKey);
        case "grantRecovery":
        case "grantRecoveryToTarget": return GrantRecoveryBehavior.execute(behavior, context, actor, item, phaseKey);
        case "applyEffects":     return ApplyEffectsBehavior.execute(behavior, context, actor, item, phaseKey);
        case "spawnTerrain":     return SpawnTerrainBehavior.execute(behavior, context, actor, item, phaseKey);
        case "moveTerrain":      return MoveTerrainBehavior.execute(behavior, context, item);
        case "moveSource":       return MoveSourceBehavior.execute(behavior, context, actor);
        case "forceMoveTargets": return ForceMoveTargetsBehavior.execute(behavior, context, actor, item, phaseKey);
        case "clearTargets":     return ClearTargetsBehavior.execute(context);
        case "executeDeed":      return ExecuteDeedBehavior.execute(behavior, context, actor);
      }
    });
  }

  // --- Shared Utility Forwards for Backward Compatibility & Direct Callers ---

  static _resolveArea(context, params) {
    return DeedBehaviorUtils.resolveArea(context, params);
  }

  static renderAreaHighlight(context) {
    return DeedBehaviorUtils.renderAreaHighlight(context);
  }

  static clearAreaHighlight(context) {
    return DeedBehaviorUtils.clearAreaHighlight(context);
  }

  static _findToken(actor) {
    return DeedBehaviorUtils.findToken(actor);
  }

  static getTokenDisplayName(target) {
    return DeedBehaviorUtils.getTokenDisplayName(target);
  }

  static getValidTargets(context, phaseKey) {
    return DeedBehaviorUtils.getValidTargets(context, phaseKey);
  }

  static resolveFormulaPlaceholders(expr, actor) {
    return DeedBehaviorUtils.resolveFormulaPlaceholders(expr, actor);
  }
}
