import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { askGrantRecoveryCasterDialog } from "../../dialogs/grant-recovery-dialog.mjs";
import { requestGrantRecoveryTargetChoice } from "../socket/grant-recovery-handler.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";

export class GrantRecoveryBehavior {
  /**
   * grantRecovery: Prompts caster and targets to allocate and roll recovery dice, then applies healing.
   *
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor (caster)
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   * @returns {Promise<boolean>}
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const intensity = Math.max(1, parseInt(params.intensity) || 1);

    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    // 1. Prompt Caster to allocate their own recovery dice per target
    const casterAllocations = await askGrantRecoveryCasterDialog({
      actor,
      intensity,
      targets: validTargets,
      item
    });

    if (casterAllocations === null) {
      // User cancelled dialog
      return false;
    }

    const casterSkillDie = actor?.system?.skill_die ?? "d6";

    // 2. Prompt Character targets for their own recovery dice contribution
    const resolutionList = [];
    let totalCasterRDSpent = 0;

    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      const targetId = targetToken.id || targetToken.document?.id;
      const alloc = casterAllocations.get(targetId) || { casterDice: 0, target: targetToken, targetActor };
      const casterDice = Math.max(0, parseInt(alloc.casterDice) || 0);
      totalCasterRDSpent += casterDice;

      let targetDice = 0;
      const isCharacter = targetActor?.type === "character";
      const remainingCapacity = Math.max(0, intensity - casterDice);

      if (isCharacter && remainingCapacity > 0 && (targetActor?.system?.recovery_dice ?? 0) > 0) {
        const maxSpendable = Math.min(remainingCapacity, targetActor.system.recovery_dice || 0);
        targetDice = await requestGrantRecoveryTargetChoice({
          targetActor,
          casterActor: actor,
          intensity,
          casterDice,
          maxSpendable
        });
        targetDice = Math.max(0, Math.min(maxSpendable, parseInt(targetDice) || 0));
      }

      resolutionList.push({
        targetToken,
        targetActor,
        casterDice,
        targetDice
      });
    }

    // 3. Deduct Recovery Dice from Caster
    if (actor && totalCasterRDSpent > 0 && actor.system.recovery_dice !== undefined) {
      const newCasterRD = Math.max(0, actor.system.recovery_dice - totalCasterRDSpent);
      await actor.update({ "system.recovery_dice": newCasterRD });
    }

    // 4. Deduct Recovery Dice from Targets & Roll Healing
    const healGivenBonus = actor ? await TrespasserEffectsHelper.evaluateDamageBonus(actor, "heal_given", "d4", { toMessage: false }) : 0;
    const targetResultsHtml = [];

    for (const res of resolutionList) {
      const { targetToken, targetActor, casterDice, targetDice } = res;
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
      const targetSkillDie = targetActor.system?.skill_die ?? "d6";

      // Deduct target recovery dice
      if (targetDice > 0 && targetActor.system.recovery_dice !== undefined) {
        if (targetActor.isOwner) {
          const newTargetRD = Math.max(0, targetActor.system.recovery_dice - targetDice);
          await targetActor.update({ "system.recovery_dice": newTargetRD });
        } else {
          const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
          await emitDeedActionAndWait("spendRecoveryDice", {
            actorId: targetActor.id,
            tokenId: targetToken.id,
            amount: targetDice
          });
        }
      }

      // Build and evaluate roll formula
      const parts = [];
      if (casterDice > 0) parts.push(`${casterDice}${casterSkillDie}`);
      if (targetDice > 0) parts.push(`${targetDice}${targetSkillDie}`);

      if (parts.length > 0) {
        const formula = parts.join(" + ");
        const roll = new foundry.dice.Roll(formula);
        await roll.evaluate();

        context.currentPhaseOutputs.rolls.push(roll);
        const rollHtml = await roll.render();

        const healReceivedBonus = await TrespasserEffectsHelper.evaluateDamageBonus(targetActor, "heal_received", "d4", { toMessage: false });
        const totalBonus = healGivenBonus + healReceivedBonus;
        const targetHeal = Math.max(0, roll.total + totalBonus);

        // Apply healing
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

        const bonusLabel = totalBonus !== 0
          ? ` <span style="font-size: var(--fs-10); color:#2ecc71;">(${totalBonus > 0 ? `+${totalBonus}` : totalBonus})</span>`
          : "";

        const breakdownParts = [];
        if (casterDice > 0) {
          breakdownParts.push(`${game.i18n.localize("TRESPASSER.Sheet.Common.Caster") || "Caster"}: ${casterDice}${casterSkillDie}`);
        }
        if (targetDice > 0) {
          breakdownParts.push(`${game.i18n.localize("TRESPASSER.Sheet.Common.Target") || "Target"}: ${targetDice}${targetSkillDie}`);
        }

        targetResultsHtml.push(`
          <div class="target-recovery-entry" style="margin-top:6px; padding:6px; background:rgba(0,0,0,0.25); border:1px solid var(--trp-border-light, #5c4f3a); border-radius:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12);">
              <span><strong>${tokenName}</strong>${bonusLabel}</span>
              <span style="color:#2ecc71; font-weight:bold;">💚 ${targetHeal} ${game.i18n.localize("TRESPASSER.Sheet.Common.Healing") || "Healing"}</span>
            </div>
            <div style="font-size: var(--fs-10); color: var(--trp-text-dim, #a09070); margin-top:2px;">
              ${breakdownParts.join(" | ")}
            </div>
            <div style="margin-top:4px;">
              ${rollHtml}
            </div>
          </div>
        `);
      } else {
        targetResultsHtml.push(`
          <div style="font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); font-style:italic; margin-top:4px;">
            ${game.i18n.format("TRESPASSER.Chat.GrantRecovery.NoDiceSpent", { name: tokenName }) || `No recovery dice spent for ${tokenName}.`}
          </div>
        `);
      }
    }

    const headerTitle = `${game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.grantRecovery") || "Grant Recovery"} ${intensity}`;

    context.currentPhaseOutputs.rollEntries.push(`
      <div class="grant-recovery-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          <i class="fas fa-heart"></i> ${headerTitle}
        </h4>
        <div class="target-recovery-results" style="margin-top: 4px;">
          ${targetResultsHtml.join("")}
        </div>
      </div>
    `);

    return true;
  }
}
