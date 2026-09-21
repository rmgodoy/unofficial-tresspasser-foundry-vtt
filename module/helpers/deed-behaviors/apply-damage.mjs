import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { askDistributionDialog } from "../../dialogs/distribution-dialog.mjs";
import { buildTenacityButtonHtml } from "../tenacity-helper.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { isSunken } from "../elevation-helper.mjs";
import { DeedPowerHelper } from "./power-helper.mjs";
import { actorEventBus } from "../../actor/actor-event-bus.mjs";

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

    let distributedDamageMap = null;
    let rollEntryIndex = -1;

    // Register executed damage record for potential retroactive Power spark bonus dice
    const damageRecord = {
      nodeId: behavior.id,
      behavior,
      baseRoll: combinedRoll,
      validTargets,
      phaseKey,
      appliedPowerDice: maxPowerDice,
      distribute,
      distributedDamageMap,
      rollLabel
    };
    DeedPowerHelper.registerExecutedDamage(context, damageRecord);

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    const distributedLabel = distribute ? ` (${game.i18n.localize("TRESPASSER.Sheet.Deed.Params.Distributed") || "Distributed"})` : "";
    const rollHtml = await combinedRoll.render();

    // Interactive Distribution Dialog prompt if distribute option is enabled and targets > 1
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
      if (context.executor?.chat) {
        await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
      } else if (context.executor) {
        await context.executor._postPhaseCard(phaseKey);
      }

      distributedDamageMap = await askDistributionDialog({
        totalAmount: combinedRoll.total,
        targets: validTargets,
        type: "damage"
      });
      damageRecord.distributedDamageMap = distributedDamageMap;

      if (!distributedDamageMap || !(distributedDamageMap instanceof Map)) {
        // User cancelled distribution: revert pending roll entry and update chat card
        context.currentPhaseOutputs.rollEntries.splice(rollEntryIndex, 1);
        const rollIdx = context.currentPhaseOutputs.rolls.indexOf(combinedRoll);
        if (rollIdx >= 0) context.currentPhaseOutputs.rolls.splice(rollIdx, 1);

        if (context.executor?.chat) {
          await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
        } else if (context.executor) {
          await context.executor._postPhaseCard(phaseKey);
        }
        return false; // Execution cancelled by user
      }
    }

    // 4. Pre-calculate incoming damage per target & build preliminary chat card so players see rolled damage immediately
    const attackerWeaponDie = DeedBehaviorUtils.getActorWeaponDie(actor);
    const damageDealtBonus = actor ? await TrespasserEffectsHelper.evaluateDamageBonus(actor, "damage_dealt", attackerWeaponDie, { toMessage: false }) : 0;
    const preliminaryTargetLines = [];
    const targetCalcData = new Map();

    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetPowerCount = refAlreadyHasPower ? 0 : Math.min(maxPowerDice, targetChoices?.power || 0);
      const targetPowerDmg = powerDiceRolls[targetPowerCount] || 0;

      const baseTargetDmg = (distributedDamageMap instanceof Map) ? (distributedDamageMap.get(targetToken.id) ?? combinedRoll.total) : baseTotal;
      const rolledTargetDmg = distributedDamageMap ? baseTargetDmg : (baseTargetDmg + targetPowerDmg);

      const targetWeaponDie = DeedBehaviorUtils.getActorWeaponDie(targetActor);
      const damageReceivedBonus = await TrespasserEffectsHelper.evaluateDamageBonus(targetActor, "damage_received", targetWeaponDie, { toMessage: false });
      const totalBonus = damageDealtBonus + damageReceivedBonus;
      let targetDmg = Math.max(0, rolledTargetDmg + totalBonus);

      const isTargetSunken = isSunken(targetActor);
      if (isTargetSunken) {
        targetDmg = Math.floor(targetDmg / 2);
      }

      const hpBefore = targetActor.system.health ?? 0;
      const rawHP = hpBefore - targetDmg;

      targetCalcData.set(targetToken.id, {
        targetActor,
        tokenName,
        targetPowerCount,
        targetPowerDmg,
        totalBonus,
        isTargetSunken,
        targetDmg,
        hpBefore,
        rawHP
      });

      const powerBonusLabel = targetPowerCount > 0 ? ` <span style="font-size: var(--fs-10); color:#e8c96b;">(+${targetPowerDmg} Power)</span>` : "";
      const modBonusLabel = totalBonus !== 0
        ? ` <span style="font-size: var(--fs-10); color:${totalBonus > 0 ? '#ff7979' : '#55efc4'};">(${totalBonus > 0 ? `+${totalBonus}` : totalBonus} ${game.i18n.localize("TRESPASSER.Sheet.Common.Mod") || "Mod"})</span>`
        : "";
      const sunkenLabel = isTargetSunken
        ? ` <span style="font-size: var(--fs-10); color:#74b9ff; font-weight:bold;">(${game.i18n.localize("TRESPASSER.States.Sunken") || "Sunken"}: ½)</span>`
        : "";

      preliminaryTargetLines.push(`
        <div class="target-damage-row" style="border-top:1px dotted var(--trp-border-light, #5c4f3a); margin-top:4px; padding-top:3px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12);">
            <span><strong>${tokenName}</strong>${powerBonusLabel}${modBonusLabel}${sunkenLabel}</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:#ff5252; font-weight:bold;">⚡ ${targetDmg} ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Dano"}</span>
            </div>
          </div>
        </div>
      `);
    }

    const preliminaryRollEntryHtml = `
      <div class="damage-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Damage"}: ${rollLabel}${maxPowerDice > 0 ? " (Power Spark)" : ""}${distributedLabel}
        </h4>
        ${rollHtml}
        <div class="target-damage-results" style="margin-top: 6px;">
          ${preliminaryTargetLines.join("")}
        </div>
      </div>
    `;

    if (distribute && validTargets.length > 1 && rollEntryIndex >= 0) {
      context.currentPhaseOutputs.rollEntries[rollEntryIndex] = preliminaryRollEntryHtml;
    } else {
      rollEntryIndex = context.currentPhaseOutputs.rollEntries.length;
      context.currentPhaseOutputs.rolls.push(combinedRoll);
      context.currentPhaseOutputs.rollEntries.push(preliminaryRollEntryHtml);
    }

    // Post preliminary roll card immediately so all players see the rolled damage before reactions/interceptions
    if (context.executor?.chat) {
      await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
    } else if (context.executor) {
      await context.executor._postPhaseCard(phaseKey);
    }

    // 5. Apply damage & prompt reactive interceptors
    const targetDamageLines = [];

    if (validTargets.length > 1) {
      await actorEventBus.startBatch("damage-received", validTargets.map(t => ({
        actor: t.actor || (t instanceof Actor ? t : null),
        token: t,
        amount: targetCalcData.get(t.id)?.targetDmg ?? baseTotal
      })), { deed: item, attacker: actor });
    }

    try {
      for (const targetToken of validTargets) {
        const calc = targetCalcData.get(targetToken.id);
        if (!calc) continue;

        const { targetActor, tokenName, targetPowerCount, targetPowerDmg, totalBonus, isTargetSunken, targetDmg, hpBefore, rawHP } = calc;

        const canBlock = targetDmg > 0 && targetActor.items.some(i =>
          i.type === "armor" && i.system.equipped && !i.system.broken
        );

        let appliedDmg = targetDmg;
        let resultingRawHP = rawHP;
        let isImmune = false;

        if (targetActor.isOwner) {
          const res = await targetActor.applyDamage(targetDmg, { skipBelowZeroChat: true, sourceActor: actor, isPreHalved: true });
          if (res && typeof res === "object") {
            if (res.appliedDamage !== undefined) appliedDmg = res.appliedDamage;
            if (res.rawHP !== undefined) resultingRawHP = res.rawHP;
            if (res.isImmune) isImmune = true;
          }
        } else {
          const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
          const res = await emitDeedActionAndWait("applyDamage", { 
            actorId: targetActor.id, 
            tokenId: targetToken.id, 
            damage: targetDmg,
            options: { skipBelowZeroChat: true, sourceActorId: actor?.id, isPreHalved: true }
          });
          if (res && typeof res === "object") {
            if (res.appliedDamage !== undefined) appliedDmg = res.appliedDamage;
            if (res.rawHP !== undefined) resultingRawHP = res.rawHP;
            if (res.isImmune) isImmune = true;
          }
        }

        const powerBonusLabel = targetPowerCount > 0 ? ` <span style="font-size: var(--fs-10); color:#e8c96b;">(+${targetPowerDmg} Power)</span>` : "";
        const modBonusLabel = totalBonus !== 0
          ? ` <span style="font-size: var(--fs-10); color:${totalBonus > 0 ? '#ff7979' : '#55efc4'};">(${totalBonus > 0 ? `+${totalBonus}` : totalBonus} ${game.i18n.localize("TRESPASSER.Sheet.Common.Mod") || "Mod"})</span>`
          : "";
        const sunkenLabel = isTargetSunken
          ? ` <span style="font-size: var(--fs-10); color:#74b9ff; font-weight:bold;">(${game.i18n.localize("TRESPASSER.States.Sunken") || "Sunken"}: ½)</span>`
          : "";

        const blockBtnHtml = canBlock && appliedDmg > 0 ? `<button type="button" class="trespasser-reaction-btn block-reaction-btn" data-action="block-reaction" data-target-id="${targetActor.id}" data-token-id="${targetToken.id}" data-damage="${appliedDmg}" data-hp-before="${hpBefore}" title="${game.i18n.localize("TRESPASSER.Chat.Combat.BlockReaction")}">🛡️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Block")}</button>` : "";

        let belowZeroHtml = "";
        if (targetActor.type === "character" && resultingRawHP < 0 && appliedDmg > 0) {
          const belowZeroMsg = hpBefore === 0
            ? game.i18n.format("TRESPASSER.Chat.Combat.DamageWhileTenacious", {
                name: tokenName,
                damage: appliedDmg
              })
            : game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", {
                name: tokenName,
                hp: resultingRawHP
              });
          const tenacityBtn = buildTenacityButtonHtml(targetActor, resultingRawHP);
          belowZeroHtml = `
            <div class="target-below-zero" style="margin-top: 3px;">
              <div class="miss-text" style="font-size: var(--fs-11); font-weight: bold;">${belowZeroMsg}</div>
              ${tenacityBtn}
            </div>`;
        }

        targetDamageLines.push(`
          <div class="target-damage-row" style="border-top:1px dotted var(--trp-border-light, #5c4f3a); margin-top:4px; padding-top:3px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12);">
              <span><strong>${tokenName}</strong>${powerBonusLabel}${modBonusLabel}${sunkenLabel}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                ${isImmune
                  ? `<span style="color:#55efc4; font-weight:bold;">🛡️ ${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Flag.ImmuneToDamage") || "Immune to Damage"}</span>`
                  : `<span style="color:#ff5252; font-weight:bold;">⚡ ${appliedDmg} ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Dano"}</span>`
                }
                ${blockBtnHtml}
              </div>
            </div>
            ${belowZeroHtml}
          </div>
        `);
      }
    } finally {
      if (validTargets.length > 1) {
        actorEventBus.endBatch();
      }
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

    context.currentPhaseOutputs.rollEntries[rollEntryIndex] = finalRollEntryHtml;

    // Refresh chat card in-place with final results (applied damage, block buttons, tenacity prompts)
    if (context.executor?.chat) {
      await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
    } else if (context.executor) {
      await context.executor._postPhaseCard(phaseKey);
    }

    return true;
  }
}
