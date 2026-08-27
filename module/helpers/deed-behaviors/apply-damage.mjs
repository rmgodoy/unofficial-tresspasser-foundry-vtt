import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { askDistributionDialog } from "../../dialogs/distribution-dialog.mjs";

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
    const rawExpr = params.expression?.trim();
    const distribute = Boolean(params.distribute);

    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    const refId = params.rollBehaviorId?.trim();
    let refRoll = refId ? context.evaluatedRolls?.get(refId) : null;

    if (!rawExpr && !refRoll) return true;

    const { roll: baseRoll, total: baseTotal, rollLabel } = await DeedBehaviorUtils.evaluateRollExpression({
      expression: rawExpr,
      refRoll,
      actor
    });

    if (!baseRoll) return true;

    // Check if referenced roll already included Power spark bonus dice
    const refAlreadyHasPower = Boolean(refRoll?.hasPowerSparks || baseRoll?.hasPowerSparks);

    // 2. Max power dice across all target layers (only if not already included in referenced roll)
    let maxPowerDice = 0;
    if (!refAlreadyHasPower) {
      if (context.sparkChoices?.perTarget) {
        for (const tChoice of context.sparkChoices.perTarget.values()) {
          if (tChoice.power > maxPowerDice) maxPowerDice = tChoice.power;
        }
      } else if (context.sparkChoices?.powerBonusDice) {
        maxPowerDice = context.sparkChoices.powerBonusDice || 0;
      }
    }

    // 3. Roll power bonus dice if maxPowerDice > 0 using terms to avoid double-rolling
    const powerDiceRolls = [0];
    const skillDie = actor?.system?.skill_die || "d6";
    let combinedRoll = baseRoll;

    if (maxPowerDice > 0) {
      const rollData = actor?.getRollData() || {};
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
      combinedRoll.hasPowerSparks = true;
      combinedRoll.powerSparkCount = maxPowerDice;
    } else if (refAlreadyHasPower) {
      combinedRoll.hasPowerSparks = true;
      combinedRoll.powerSparkCount = refRoll?.powerSparkCount || baseRoll?.powerSparkCount || 0;
    }

    // Store final combined roll (including Power Spark bonus dice) in evaluatedRolls map for referencing behaviors
    if (!context.evaluatedRolls) context.evaluatedRolls = new Map();
    context.evaluatedRolls.set(behavior.id, combinedRoll);

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    const distributedLabel = distribute ? ` (${game.i18n.localize("TRESPASSER.Sheet.Deed.Params.Distributed") || "Distributed"})` : "";
    const rollHtml = await combinedRoll.render();

    // Interactive Distribution Dialog prompt if distribute option is enabled and targets > 1
    let distributedDamageMap = null;
    let rollEntryIndex = -1;

    if (distribute && validTargets.length > 1) {
      const pendingText = game.i18n.localize("TRESPASSER.Chat.Combat.PendingDistribution") || "Awaiting distribution choices...";
      rollEntryIndex = context.currentPhaseOutputs.rollEntries.length;
      context.currentPhaseOutputs.rolls.push(combinedRoll);
      context.currentPhaseOutputs.rollEntries.push(`
        <div class="damage-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Damage"}: ${rollLabel}${maxPowerDice > 0 ? " (Power Spark)" : ""}${distributedLabel}
          </h4>
          ${rollHtml}
          <div class="target-damage-results" style="margin-top: 6px; font-style: italic; color: var(--trp-text-dim, #a09070); font-size: var(--fs-11);">
            ⌛ ${pendingText}
          </div>
        </div>
      `);

      // Post preliminary roll immediately to chat so all players can see what was rolled
      if (context.executor) {
        await context.executor._postPhaseCard(phaseKey, context.executor.phases?.[phaseKey], true);
      }

      distributedDamageMap = await askDistributionDialog({
        totalAmount: combinedRoll.total,
        targets: validTargets,
        type: "damage"
      });

      if (distributedDamageMap === null) {
        // User cancelled distribution: revert pending roll entry and update chat card
        context.currentPhaseOutputs.rollEntries.splice(rollEntryIndex, 1);
        const rollIdx = context.currentPhaseOutputs.rolls.indexOf(combinedRoll);
        if (rollIdx >= 0) context.currentPhaseOutputs.rolls.splice(rollIdx, 1);

        if (context.executor) {
          await context.executor._postPhaseCard(phaseKey, context.executor.phases?.[phaseKey], true);
        }
        return false; // Execution cancelled by user
      }
    }

    // 4. Apply per-target damage based on each target's layered power dice count & build chat output lines
    const targetDamageLines = [];
    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetPowerCount = refAlreadyHasPower ? 0 : Math.min(maxPowerDice, targetChoices?.power || 0);
      const targetPowerDmg = powerDiceRolls[targetPowerCount] || 0;

      const baseTargetDmg = distributedDamageMap ? (distributedDamageMap.get(targetToken.id) ?? combinedRoll.total) : baseTotal;
      const targetDmg = distributedDamageMap ? baseTargetDmg : (baseTargetDmg + targetPowerDmg);

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

    const finalRollEntryHtml = `
      <div class="damage-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Damage"}: ${rollLabel}${maxPowerDice > 0 ? " (Power Spark)" : ""}${distributedLabel}
        </h4>
        ${rollHtml}
        <div class="target-damage-results" style="margin-top: 6px;">
          ${targetDamageLines.join("")}
        </div>
      </div>
    `;

    if (distribute && validTargets.length > 1 && rollEntryIndex >= 0) {
      context.currentPhaseOutputs.rollEntries[rollEntryIndex] = finalRollEntryHtml;
    } else {
      context.currentPhaseOutputs.rolls.push(combinedRoll);
      context.currentPhaseOutputs.rollEntries.push(finalRollEntryHtml);
    }

    return true;
  }
}
