import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";

export class HealTargetBehavior {
  /**
   * healTarget: Evaluates expression as a roll formula and applies healing to target actors.
   * Note: As per system rules, healing does NOT scale with Power spark bonus dice.
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

    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    let expr = DeedBehaviorUtils.resolveFormulaPlaceholders(rawExpr, actor);
    const rollData = actor?.getRollData() || {};

    // 1. Evaluate base healing roll
    const baseRoll = new Roll(expr, rollData);
    await baseRoll.evaluate();
    const healTotal = Math.max(0, baseRoll.total);

    // 2. Apply healing to all valid targets & build chat output lines
    const targetHealingLines = [];
    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);

      if (targetActor.isOwner) {
        await targetActor.applyHealing(healTotal);
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("applyHealing", {
          actorId: targetActor.id,
          tokenId: targetToken.id,
          healing: healTotal
        });
      }

      targetHealingLines.push(`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12); margin-top:4px; padding-top:3px; border-top:1px dotted var(--trp-border-light, #5c4f3a);">
          <span><strong>${tokenName}</strong></span>
          <span style="color:#2ecc71; font-weight:bold;">💚 ${healTotal} ${game.i18n.localize("TRESPASSER.Sheet.Common.Healing") || "Cura"}</span>
        </div>
      `);
    }

    const rollHtml = await baseRoll.render();

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    context.currentPhaseOutputs.rolls.push(baseRoll);
    context.currentPhaseOutputs.rollEntries.push(`
      <div class="healing-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Healing") || "Healing"}: ${expr}
        </h4>
        ${rollHtml}
        <div class="target-healing-results" style="margin-top: 6px;">
          ${targetHealingLines.join("")}
        </div>
      </div>
    `);

    return true;
  }
}
