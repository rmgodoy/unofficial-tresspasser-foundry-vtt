import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { askDistributionDialog } from "../../dialogs/distribution-dialog.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";

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
    const distribute = Boolean(params.distribute);

    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    const refId = params.rollBehaviorId?.trim();
    let refRoll = refId ? context.evaluatedRolls?.get(refId) : null;

    if (!rawExpr && !refRoll) return true;

    const { roll: baseRoll, total: healTotal, rollLabel } = await DeedBehaviorUtils.evaluateRollExpression({
      expression: rawExpr,
      refRoll,
      actor
    });

    if (!baseRoll) return true;

    if (!context.evaluatedRolls) context.evaluatedRolls = new Map();
    context.evaluatedRolls.set(behavior.id, baseRoll);

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    const distributedLabel = distribute ? ` (${game.i18n.localize("TRESPASSER.Sheet.Deed.Params.Distributed") || "Distributed"})` : "";
    const rollHtml = await baseRoll.render();

    // Interactive Distribution Dialog prompt if distribute option is enabled and targets > 1
    let distributedHealingMap = null;
    let rollEntryIndex = -1;

    if (distribute && validTargets.length > 1) {
      const pendingText = game.i18n.localize("TRESPASSER.Chat.Combat.PendingHealing") || "Awaiting healing distribution choices...";
      rollEntryIndex = context.currentPhaseOutputs.rollEntries.length;
      context.currentPhaseOutputs.rolls.push(baseRoll);
      context.currentPhaseOutputs.rollEntries.push(`
        <div class="healing-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ${game.i18n.localize("TRESPASSER.Sheet.Common.Healing") || "Healing"}: ${rollLabel}${distributedLabel}
          </h4>
          ${rollHtml}
          <div class="target-healing-results" style="margin-top: 6px; font-style: italic; color: var(--trp-text-dim, #a09070); font-size: var(--fs-11);">
            ⌛ ${pendingText}
          </div>
        </div>
      `);

      // Post preliminary roll immediately to chat so all players can see what was rolled
      if (context.executor) {
        await context.executor._postPhaseCard(phaseKey, context.executor.phases?.[phaseKey], true);
      }

      distributedHealingMap = await askDistributionDialog({
        totalAmount: healTotal,
        targets: validTargets,
        type: "healing"
      });

      if (distributedHealingMap === null) {
        // User cancelled distribution: revert pending roll entry and update chat card
        context.currentPhaseOutputs.rollEntries.splice(rollEntryIndex, 1);
        const rollIdx = context.currentPhaseOutputs.rolls.indexOf(baseRoll);
        if (rollIdx >= 0) context.currentPhaseOutputs.rolls.splice(rollIdx, 1);

        if (context.executor) {
          await context.executor._postPhaseCard(phaseKey, context.executor.phases?.[phaseKey], true);
        }
        return false; // Execution cancelled by user
      }
    }

    // 2. Apply healing to all valid targets & build chat output lines
    const healGivenBonus = actor ? await TrespasserEffectsHelper.evaluateDamageBonus(actor, "heal_given", "d4", { toMessage: false }) : 0;
    const targetHealingLines = [];
    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
      const baseTargetHeal = distributedHealingMap ? (distributedHealingMap.get(targetToken.id) ?? healTotal) : healTotal;
      const healReceivedBonus = await TrespasserEffectsHelper.evaluateDamageBonus(targetActor, "heal_received", "d4", { toMessage: false });
      const totalBonus = healGivenBonus + healReceivedBonus;
      const targetHeal = Math.max(0, baseTargetHeal + totalBonus);

      if (targetActor.isOwner) {
        await targetActor.applyHealing(targetHeal, { sourceActor: actor });
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("applyHealing", {
          actorId: targetActor.id,
          tokenId: targetToken.id,
          healing: targetHeal,
          sourceActorId: actor?.id
        });
      }

      const bonusLabel = totalBonus !== 0 ? ` <span style="font-size: var(--fs-10); color:#2ecc71;">(${totalBonus > 0 ? `+${totalBonus}` : totalBonus})</span>` : "";
      targetHealingLines.push(`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12); margin-top:4px; padding-top:3px; border-top:1px dotted var(--trp-border-light, #5c4f3a);">
          <span><strong>${tokenName}</strong>${bonusLabel}</span>
          <span style="color:#2ecc71; font-weight:bold;">💚 ${targetHeal} ${game.i18n.localize("TRESPASSER.Sheet.Common.Healing") || "Cura"}</span>
        </div>
      `);
    }

    const finalRollEntryHtml = `
      <div class="healing-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Healing") || "Healing"}: ${rollLabel}${distributedLabel}
        </h4>
        ${rollHtml}
        <div class="target-healing-results" style="margin-top: 6px;">
          ${targetHealingLines.join("")}
        </div>
      </div>
    `;

    if (distribute && validTargets.length > 1 && rollEntryIndex >= 0) {
      context.currentPhaseOutputs.rollEntries[rollEntryIndex] = finalRollEntryHtml;
    } else {
      context.currentPhaseOutputs.rolls.push(baseRoll);
      context.currentPhaseOutputs.rollEntries.push(finalRollEntryHtml);
    }

    return true;
  }
}
