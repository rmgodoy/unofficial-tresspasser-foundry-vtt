import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";

export class RollBehavior {
  /**
   * Dedicated Roll behavior: Evaluates expression as a roll formula, stores result in context.evaluatedRolls,
   * and renders the roll in the chat card.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    let rawExpr = params.expression?.trim();
    if (!rawExpr) return true;

    let expr = DeedBehaviorUtils.resolveFormulaPlaceholders(rawExpr, actor);
    const rollData = actor?.getRollData() || {};

    const roll = new Roll(expr, rollData);
    await roll.evaluate();

    if (!context.evaluatedRolls) {
      context.evaluatedRolls = new Map();
    }
    context.evaluatedRolls.set(behavior.id, roll);

    const rollHtml = await roll.render();

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    context.currentPhaseOutputs.rolls.push(roll);
    context.currentPhaseOutputs.rollEntries.push(`
      <div class="roll-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Roll") || "Roll"}: ${expr}
        </h4>
        ${rollHtml}
      </div>
    `);

    return true;
  }
}
