import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { isSunken } from "../elevation-helper.mjs";

/**
 * DeedPowerHelper — Coordinates Power spark bonus damage resolution for Deed rolls and retroactive pre-accuracy damage.
 */
export class DeedPowerHelper {
  /**
   * Register an executed damage record so it can receive retroactive Power spark bonus dice if Power is chosen later.
   * @param {object} context - Executor runtime context
   * @param {object} record  - Damage execution details { nodeId, behavior, baseRoll, validTargets, phaseKey, appliedPowerDice, distribute, distributedDamageMap }
   */
  static registerExecutedDamage(context, record) {
    if (!context.executedDamageRecords) context.executedDamageRecords = [];
    context.executedDamageRecords.push(record);
  }

  /**
   * Triggered immediately after sparks are selected in rollAccuracy.
   * Evaluates Power spark bonus dice for any damage behaviors executed prior to rollAccuracy.
   * @param {object} context
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} [phaseKey=""]
   */
  static async onSparksSelected(context, actor, item, phaseKey = "") {
    if (!context.sparkChoices || !context.executedDamageRecords?.length) return;

    for (const record of context.executedDamageRecords) {
      // 1. Calculate max power dice applicable to this damage record's targets
      let maxPowerDice = 0;
      if (context.sparkChoices.perTarget && context.sparkChoices.perTarget.size > 0) {
        for (const targetToken of record.validTargets) {
          const tokenId = targetToken?.id || targetToken;
          const tChoice = context.sparkChoices.perTarget.get(tokenId);
          if (tChoice?.power && tChoice.power > maxPowerDice) {
            maxPowerDice = tChoice.power;
          }
        }
      }
      if (maxPowerDice === 0 && context.sparkChoices.powerBonusDice) {
        maxPowerDice = context.sparkChoices.powerBonusDice || 0;
      }

      const alreadyApplied = record.appliedPowerDice || 0;
      if (maxPowerDice <= alreadyApplied) continue;

      const newPowerDice = maxPowerDice - alreadyApplied;
      const skillDie = actor?.system?.skill_die || "d6";
      const powerFormula = `${newPowerDice}${skillDie}`;
      const rollData = actor?.getRollData() || {};
      const powerRoll = new foundry.dice.Roll(powerFormula, rollData);
      await powerRoll.evaluate();

      const dieResults = powerRoll.dice[0]?.results?.map(r => r.result) || [];
      const targetPowerLines = [];

      // 2. Apply additional power damage to each valid target
      for (const targetToken of record.validTargets) {
        const targetActor = targetToken?.actor || (targetToken instanceof Actor ? targetToken : null);
        if (!targetActor) continue;

        const tokenId = targetToken.id || targetToken.document?.id || targetToken;
        const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
        const targetChoices = context.sparkChoices?.perTarget?.get(tokenId);
        const targetPowerCount = Math.min(maxPowerDice, targetChoices?.power ?? maxPowerDice);
        const targetExtraPower = Math.max(0, targetPowerCount - alreadyApplied);

        if (targetExtraPower <= 0) continue;

        const rawPowerDmg = dieResults.slice(0, targetExtraPower).reduce((a, b) => a + b, 0);
        const targetIsSunken = isSunken(targetActor);
        const targetExtraDmg = targetIsSunken ? Math.floor(rawPowerDmg / 2) : rawPowerDmg;

        if (targetExtraDmg > 0) {
          if (targetActor.isOwner) {
            await targetActor.applyDamage(targetExtraDmg, { skipBelowZeroChat: true, sourceActor: actor, isPreHalved: true });
          } else {
            const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
            await emitDeedActionAndWait("applyDamage", {
              actorId: targetActor.id,
              tokenId: targetToken.id,
              damage: targetExtraDmg,
              options: { skipBelowZeroChat: true, sourceActorId: actor?.id, isPreHalved: true }
            });
          }
        }

        const sunkenLabel = targetIsSunken
          ? ` <span style="font-size: var(--fs-10); color:#74b9ff; font-weight:bold;">(${game.i18n.localize("TRESPASSER.States.Sunken") || "Sunken"}: ½)</span>`
          : "";

        targetPowerLines.push(`
          <div class="target-damage-row" style="border-top:1px dotted var(--trp-border-light, #5c4f3a); margin-top:4px; padding-top:3px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12);">
              <span><strong>${tokenName}</strong> <span style="font-size: var(--fs-10); color:#e8c96b;">(+${rawPowerDmg} Power)</span>${sunkenLabel}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="color:#ff5252; font-weight:bold;">⚡ ${targetExtraDmg} ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Dano"}</span>
              </div>
            </div>
          </div>
        `);
      }

      // 3. Combine base roll terms and power roll terms and update context.evaluatedRolls
      let combinedRoll = powerRoll;
      if (record.baseRoll?.terms?.length) {
        combinedRoll = foundry.dice.Roll.fromTerms([
          ...record.baseRoll.terms,
          new foundry.dice.terms.OperatorTerm({ operator: "+" }),
          ...powerRoll.terms
        ]);
        combinedRoll._evaluated = true;
        combinedRoll._total = record.baseRoll.total + powerRoll.total;
      }
      combinedRoll.hasPowerSparks = true;
      combinedRoll.powerSparkCount = maxPowerDice;

      if (!context.evaluatedRolls) context.evaluatedRolls = new Map();
      context.evaluatedRolls.set(record.nodeId, combinedRoll);
      record.baseRoll = combinedRoll;
      record.appliedPowerDice = maxPowerDice;

      // 4. Output dedicated Power Spark section to chat
      const powerRollHtml = await powerRoll.render();
      const powerHeader = `${game.i18n.localize("TRESPASSER.Dialog.Spark.Power") || "Power"}: +${newPowerDice}${skillDie}`;

      const powerSectionHtml = `
        <div class="damage-section power-spark-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ⚡ ${powerHeader}
          </h4>
          ${powerRollHtml}
          <div class="target-damage-results" style="margin-top: 6px;">
            ${targetPowerLines.join("")}
          </div>
        </div>
      `;

      if (!context.currentPhaseOutputs) {
        context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
      }
      context.currentPhaseOutputs.rolls.push(powerRoll);
      context.currentPhaseOutputs.rollEntries.push(powerSectionHtml);

      if (context.executor?.chat) {
        await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
      } else if (context.executor) {
        await context.executor._postPhaseCard(phaseKey);
      }
    }
  }
}
