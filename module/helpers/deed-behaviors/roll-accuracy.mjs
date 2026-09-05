import { executeCreatureDefenseRoll } from "./roll-accuracy-defense.mjs";
import { executePlayerAccuracyRoll } from "./roll-accuracy-player.mjs";

/**
 * Resolves effective deed attributes (actionType, abilityType, versus),
 * defaulting to the Deed's base values, but overridden by the rollAccuracy behavior node if configured.
 * @param {object|Item} systemOrItem
 * @returns {{ actionType: string, abilityType: string, versus: string }}
 */
export function getEffectiveDeedAttributes(systemOrItem) {
  const sys = systemOrItem?.system ?? systemOrItem ?? {};
  const accNode = sys.graph?.nodes?.find(n => n.type === "rollAccuracy");
  const p = accNode?.params || {};

  const actionType = (p.actionType && p.actionType !== "") ? p.actionType : (sys.actionType || "attack");
  const abilityType = (p.abilityType && p.abilityType !== "") ? p.abilityType : (sys.abilityType || "innate");
  const versus = (p.versus && p.versus !== "") ? p.versus : (sys.versus || "Guard");

  return { actionType, abilityType, versus };
}

/**
 * RollAccuracyBehavior — Implements accuracy checks for Behavior-Driven Deeds.
 *
 * Supports both:
 * 1. Creature Attacking Characters (Player-Facing Defense Roll via Socket)
 * 2. Character Attacking (Player Roll vs Target CD/DC)
 *
 * Returns condition results for executor branching:
 *   { conditions: { onHit: boolean, onMiss: boolean, onSpark: boolean, always: true } }
 */
export class RollAccuracyBehavior {
  /**
   * Execute accuracy roll behavior.
   * @param {object} behavior - Behavior node data { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Attacking actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   * @returns {Promise<object|boolean>} Returns condition mapping or false if cancelled
   */
  static async execute(behavior, context, actor, item, phaseKey = "base") {
    const params = behavior.params || {};
    const actionType = (params.actionType && params.actionType !== "") ? params.actionType : (item.system.actionType || "attack");
    const abilityType = (params.abilityType && params.abilityType !== "") ? params.abilityType : (item.system.abilityType || "innate");
    const versus = (params.versus && params.versus !== "") ? params.versus : (item.system.versus || "Guard");
    const branchingMode = params.branchingMode || "hitThenSpark";

    const isAttack = actionType !== "support";
    const apBonus = context.apBonus || 0;

    context.actionType = actionType;
    context.abilityType = abilityType;
    context.versus = versus;
    context.branchingMode = branchingMode;

    // Check targets: context.targets or current user targets
    let targetList = (context.targets && context.targets.length > 0)
      ? context.targets
      : Array.from(game.user?.targets || []);

    if (targetList.length > 0 && (!context.targets || context.targets.length === 0)) {
      context.targets = targetList;
    }

    const isVersus10 = versus === "10" || !isAttack || !versus;

    // If no targets and versus requires a target defense, skip accuracy check (treated as miss)
    if (targetList.length === 0 && !isVersus10) {
      ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.NoTargetsSkippingAccuracy"));
      context.isHit = false;
      context.isSpark = false;
      context.maxSparks = 0;
      context.sparkChoices = null;
      context.accuracyResults = [];

      if (!context.currentPhaseOutputs) {
        context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
      }
      context.currentPhaseOutputs.accuracyHtml = `
        <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: item.name })}
          </h4>
          <div style="font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); font-style: italic; margin-top: 4px;">
            ${game.i18n.localize("TRESPASSER.Chat.Combat.NoTargetsSkipped")}
          </div>
        </div>`;

      return {
        conditions: {
          onHit: false,
          onMiss: true,
          onSpark: false,
          always: true
        }
      };
    }

    const isCreatureAttacker = actor?.type === "creature";

    // Case 1: Creature Attacking Characters (Player-Facing Defense Roll via Socket)
    if (isCreatureAttacker && isAttack && !isVersus10) {
      return executeCreatureDefenseRoll({
        behavior,
        context,
        actor,
        item,
        phaseKey,
        targetList,
        apBonus,
        versus,
        abilityType,
        branchingMode
      });
    }

    // Case 2: Character Attacking (Player Roll vs Target CD/DC)
    return executePlayerAccuracyRoll({
      behavior,
      context,
      actor,
      item,
      phaseKey,
      targetList,
      apBonus,
      versus,
      abilityType,
      branchingMode,
      isAttack
    });
  }
}
