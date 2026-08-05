import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";

export class ApplyDamageBehavior {
  /**
   * 2. applyDamage: Evaluates expression as a roll formula, applies damage to hit target actors, and triggers token shake & floating damage text.
   * Layered Power spark bonus damage dice apply ONLY to targets whose spark count reached the layer where Power was selected.
   * Uses terms from evaluated rolls so rendered dice match calculated damage totals exactly.
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

    // 1. Base damage roll
    const baseRoll = new Roll(expr, rollData);
    await baseRoll.evaluate();
    const baseTotal = baseRoll.total;

    // 2. Max power dice across all target layers
    let maxPowerDice = 0;
    if (context.sparkChoices?.perTarget) {
      for (const tChoice of context.sparkChoices.perTarget.values()) {
        if (tChoice.power > maxPowerDice) maxPowerDice = tChoice.power;
      }
    }

    // 3. Roll power bonus dice if maxPowerDice > 0 using terms to avoid double-rolling
    const powerDiceRolls = [0];
    const skillDie = actor?.system?.skill_die || "d6";
    let combinedRoll = baseRoll;

    if (maxPowerDice > 0) {
      const powerFormula = `${maxPowerDice}${skillDie}`;
      const powerRoll = new Roll(powerFormula, rollData);
      await powerRoll.evaluate();

      const dieResults = powerRoll.dice[0]?.results?.map(r => r.result) || [];
      for (let k = 1; k <= maxPowerDice; k++) {
        powerDiceRolls[k] = dieResults.slice(0, k).reduce((a, b) => a + b, 0);
      }

      // Combine baseRoll and powerRoll terms into a single evaluated roll without re-evaluating dice
      combinedRoll = Roll.fromTerms([
        ...baseRoll.terms,
        new foundry.dice.terms.OperatorTerm({ operator: "+" }),
        ...powerRoll.terms
      ]);
      combinedRoll._evaluated = true;
      combinedRoll._total = baseRoll.total + powerRoll.total;
    }

    // 4. Apply per-target damage based on each target's layered power dice count & build chat output lines
    const targetDamageLines = [];
    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetPowerCount = Math.min(maxPowerDice, targetChoices?.power || 0);
      const targetPowerDmg = powerDiceRolls[targetPowerCount] || 0;
      const targetDmg = baseTotal + targetPowerDmg;

      if (targetActor.isOwner) {
        await targetActor.applyDamage(targetDmg);
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("applyDamage", { 
          actorId: targetActor.id, 
          tokenId: targetToken.id, 
          damage: targetDmg 
        });
      }

      const powerBonusLabel = targetPowerCount > 0 ? ` <span style="font-size: var(--fs-10); color:#e8c96b;">(+${targetPowerDmg} Power)</span>` : "";
      targetDamageLines.push(`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12); margin-top:4px; padding-top:3px; border-top:1px dotted var(--trp-border-light, #5c4f3a);">
          <span><strong>${tokenName}</strong>${powerBonusLabel}</span>
          <span style="color:#ff5252; font-weight:bold;">⚡ ${targetDmg} ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Dano"}</span>
        </div>
      `);
    }

    const rollHtml = await combinedRoll.render();

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    context.currentPhaseOutputs.rolls.push(combinedRoll);
    context.currentPhaseOutputs.rollEntries.push(`
      <div class="damage-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Damage"}: ${expr}${maxPowerDice > 0 ? " (Power Spark)" : ""}
        </h4>
        ${rollHtml}
        <div class="target-damage-results" style="margin-top: 6px;">
          ${targetDamageLines.join("")}
        </div>
      </div>
    `);

    return true;
  }
}
