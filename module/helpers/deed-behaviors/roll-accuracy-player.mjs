import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";
import { askSparkDialog } from "../../dialogs/spark-dialog.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { EngagementHelper } from "../engagement-helper.mjs";
import { getMissileElevationModifier, isMissileAttack } from "../elevation-helper.mjs";
import { prepareTargetDefenseData } from "./roll-accuracy-targets.mjs";

/**
 * Executes accuracy check for Character Attacking (Player Roll vs Target CD/DC).
 * @param {object} options
 * @param {object} options.behavior
 * @param {object} options.context
 * @param {Actor} options.actor
 * @param {Item} options.item
 * @param {string} options.phaseKey
 * @param {Array} options.targetList
 * @param {number} options.apBonus
 * @param {string} options.versus
 * @param {string} options.abilityType
 * @param {string} options.branchingMode
 * @param {boolean} options.isAttack
 * @returns {Promise<object|boolean>}
 */
export async function executePlayerAccuracyRoll({
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
}) {
  const actualTargets = isAttack && targetList.length > 0 ? targetList : [null];
  const sourceToken = context.sourceToken 
    || context.executor?.sourceToken 
    || actor?.getActiveTokens?.()[0] 
    || null;

  const penaltyCheck = EngagementHelper.checkDeedEngagementPenalty(item, {
    actor,
    sourceToken,
    targetTokens: isAttack && targetList.length > 0 ? targetList : []
  });
  const hasEngagementPenalty = penaltyCheck.hasPenalty;
  const engagementMod = penaltyCheck.penaltyValue;

  const isAdv = actor ? TrespasserEffectsHelper.hasAdvantage(actor, "accuracy") : false;
  const effectBonusEntry = actor ? TrespasserEffectsHelper.buildEffectBonusEntry(actor, "accuracy", "use") : { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus", value: 0 };
  const totalAccuracy = actor?.system?.combat?.accuracy ?? 0;
  const baseAccuracy = totalAccuracy - (effectBonusEntry.value || 0);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const preparedTargets = actualTargets.map(t => prepareTargetDefenseData(t, {
    actor,
    sourceToken,
    item,
    behavior,
    isAttack,
    versus,
    abilityType
  }));

  const rollDialogData = {
    dice: diceFormula,
    bonuses: [
      { key: "baseAccuracy", label: game.i18n.localize("TRESPASSER.Sheet.Combat.Accuracy") || "Accuracy", value: baseAccuracy, toggleable: false }
    ],
    targets: preparedTargets,
    showCD: true
  };

  if (hasEngagementPenalty) {
    rollDialogData.bonuses.push({
      key: "engagement",
      label: game.i18n.localize("TRESPASSER.Chat.Combat.EngagementPenalty") || "Engaged",
      value: -2,
      toggleable: true
    });
  }

  if (apBonus > 0) {
    rollDialogData.bonuses.push({
      key: "apBonus",
      label: game.i18n.localize("TRESPASSER.Chat.Check.AccuracyFromAP") || "Accuracy from Extra Effort",
      value: apBonus,
      toggleable: true
    });
  }

  // Effect Bonus accordion at the end
  rollDialogData.bonuses.push(effectBonusEntry);

  // Prompt user with Trespasser Roll Dialog
  const dialogResult = await TrespasserRollDialog.wait({
    ...rollDialogData
  }, { title: `${item.name} Roll` });

  if (!dialogResult) return false; // User cancelled roll dialog

  const userModifier = dialogResult.modifier || 0;
  const activeBonusTotal = dialogResult.activeBonusTotal ?? (baseAccuracy + (effectBonusEntry.value || 0) + engagementMod + apBonus);
  const totalBonuses = `${activeBonusTotal} + ${userModifier}`;
  const formula = isAdv ? `2d20kh + ${totalBonuses}` : `1d20 + ${totalBonuses}`;

  const rollData = actor?.getRollData() || {};
  const accRoll = new foundry.dice.Roll(formula, rollData);
  await accRoll.evaluate();

  const rollTotal = accRoll.total;
  const diceResult = accRoll.dice[0]?.results?.find(r => r.active)?.result ?? accRoll.dice[0]?.results[0]?.result ?? 10;

  let anyHit = false;
  let maxSparks = 0;
  const results = [];

  const baseVersusLabel = (versus === "Guard" || versus === "Resist")
    ? (game.i18n.localize(`TRESPASSER.Sheet.Combat.${versus}`) || versus)
    : (game.i18n.localize("TRESPASSER.Terms.DC") || "CD");

  // Align actualTargets order with dialog targets order (higher CD on top)
  if (Array.isArray(dialogResult.targets) && dialogResult.targets.length > 0) {
    actualTargets.sort((a, b) => {
      const aId = a?.id || a?.document?.id || a?.actor?.id;
      const bId = b?.id || b?.document?.id || b?.actor?.id;
      const aIdx = dialogResult.targets.findIndex(t => (aId && (t.tokenId === aId || t.id === aId)));
      const bIdx = dialogResult.targets.findIndex(t => (bId && (t.tokenId === bId || t.id === bId)));
      return (aIdx !== -1 ? aIdx : 999) - (bIdx !== -1 ? bIdx : 999);
    });
  }

  for (let i = 0; i < actualTargets.length; i++) {
    const targetToken = actualTargets[i];
    const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
    const tokenName = targetToken ? DeedBehaviorUtils.getTokenDisplayName(targetToken) : null;

    // Resolve target data configured in dialog or fallback to prepared target
    const targetTokenId = targetToken?.id || targetToken?.document?.id || null;
    const targetActorId = targetActor?.id || null;
    const targetDialogData = dialogResult.targets?.find(t => {
      if (targetTokenId && (t.tokenId || t.id)) {
        return (t.tokenId === targetTokenId) || (t.id === targetTokenId);
      }
      if (targetActorId && t.actorId) {
        return t.actorId === targetActorId;
      }
      return false;
    })
      || preparedTargets.find(t => (targetTokenId && (t.tokenId === targetTokenId || t.id === targetTokenId)))
      || preparedTargets[i];

    const dc = targetDialogData?.totalCD ?? dialogResult.cd ?? 10;
    const targetVersusLabel = targetDialogData?.versusLabel || baseVersusLabel;
    const targetElevModInfo = targetDialogData?.elevationModInfo || null;
    const isAllyOverride = targetDialogData?.isAllyOverride || false;

    let isHit = rollTotal >= dc;
    if (diceResult === 20) isHit = true;
    if (isHit) anyHit = true;

    const diff = rollTotal - dc;
    let sparks = 0;
    let shadows = 0;
    if (diff >= 0) sparks = Math.floor(diff / 5);
    else shadows = Math.floor(Math.abs(diff) / 5);

    if (diceResult === 20) sparks += 1;
    if (diceResult === 1) shadows += 1;

    // Sparks cancel Shadows
    const net = sparks - shadows;
    sparks = Math.max(0, net);
    shadows = Math.max(0, -net);

    if (sparks > maxSparks) maxSparks = sparks;

    results.push({
      tokenId: targetToken?.id ?? null,
      tokenName,
      actorId: targetActor?.id ?? null,
      isHit,
      sparks,
      shadows,
      rollTotal,
      dc,
      targetVersusLabel,
      isAllyOverride,
      elevationModInfo: targetElevModInfo
    });
  }

  context.rollResult = accRoll;
  context.isHit = anyHit;
  context.maxSparks = maxSparks;
  context.accuracyResults = results;
  context.accuracyResolved = true;

  if (actor) {
    for (const res of results) {
      const targetTokenObj = res.tokenId ? canvas.tokens?.get(res.tokenId) : null;
      const targetActorObj = res.actorId ? game.actors?.get(res.actorId) : (targetTokenObj?.actor || null);
      const targetRef = targetActorObj || targetTokenObj;
      if (targetRef) {
        if (res.isHit && typeof actor.onDeedHit === "function") {
          await actor.onDeedHit(targetRef, { item, result: res, context });
        } else if (!res.isHit && typeof actor.onDeedMiss === "function") {
          await actor.onDeedMiss(targetRef, { item, result: res, context });
        }
      }
    }
  }

  const rollHtml = await accRoll.render();

  let resultsHtml = "";
  for (const res of results) {
    const currentVersusLabel = res.targetVersusLabel || baseVersusLabel;

    let elevBadge = "";
    if (res.elevationModInfo?.applies) {
      const isPen = res.elevationModInfo.guardModifier < 0;
      const badgeLabel = isPen
        ? (game.i18n.localize("TRESPASSER.Chat.Combat.ElevationTargetPenalty") || "Elevation -2")
        : (game.i18n.localize("TRESPASSER.Chat.Combat.ElevationTargetBonus") || "Elevation +2");
      const badgeColor = isPen ? "#4fc3f7" : "#e8c96b";
      elevBadge = ` <span style="font-size: var(--fs-10); color: ${badgeColor}; font-weight: normal;">[${badgeLabel}]</span>`;
    }

    const headerText = res.tokenName
      ? `<strong>${res.tokenName}${elevBadge} <span style="font-size: var(--fs-10);color:var(--trp-text-dim, #a09070);">(Roll: ${res.rollTotal} vs ${currentVersusLabel}: ${res.dc})</span></strong>`
      : `<span style="font-size: var(--fs-11);color:var(--trp-text-dim, #a09070); font-weight: bold;">(Roll: ${res.rollTotal} vs ${currentVersusLabel}: ${res.dc})${elevBadge}</span>`;

    const hitLabel = res.isHit
      ? (game.i18n.localize("TRESPASSER.Chat.Combat.Hit") || "ACERTO!")
      : (game.i18n.localize("TRESPASSER.Chat.Combat.Miss") || "ERRO!");

    const hitColor = res.isHit ? '#4fc3f7' : '#ff5252';

    let counterBtnHtml = "";
    if (!res.isHit && res.shadows > 0 && res.tokenId && sourceToken) {
      const defenderTokenObj = canvas.tokens.get(res.tokenId);
      if (defenderTokenObj) {
        const counterCheck = TargetingHelper.checkCounterEligibility(defenderTokenObj, sourceToken);
        if (counterCheck.canCounter) {
          counterBtnHtml = `<button type="button" class="trespasser-reaction-btn counter-reaction-btn" data-action="counter-reaction" data-defender-id="${res.actorId}" data-defender-token-id="${res.tokenId}" data-attacker-id="${actor.id}" data-attacker-token-id="${sourceToken.id}" data-sparks="${res.shadows}" data-weapon-die="${counterCheck.weaponDie || 'd6'}" title="${game.i18n.localize("TRESPASSER.Chat.Combat.CounterReaction")}">⚔️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Counter")} (${res.shadows}×${counterCheck.weaponDie || 'd6'})</button>`;
        }
      }
    }

    resultsHtml += `
      <div class="target-result" style="border-top:1px solid var(--trp-border-light, #5c4f3a);padding-top:5px;margin-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          ${headerText}
          <span class="${res.isHit ? "hit-text" : "miss-text"}" style="font-weight:bold; color: ${hitColor};">${hitLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
          <div style="display:flex;gap:10px;font-size: var(--fs-11);">
            <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: res.sparks }) || `Centelhas: ${res.sparks}`}</span>
            <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: res.shadows }) || `Sombras: ${res.shadows}`}</span>
          </div>
          ${counterBtnHtml}
        </div>
      </div>`;
  }

  if (!context.currentPhaseOutputs) {
    context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
  }

  context.currentPhaseOutputs.rolls.push(accRoll);
  context.currentPhaseOutputs.accuracyHtml = `
    <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
      <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
        ${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: item.name })}${isAdv ? " (Adv)" : ""}
      </h4>
      ${rollHtml}
      ${resultsHtml}
    </div>`;

  // Post accuracy result in chat immediately before spark dialog
  context.accuracyCardPosted = true;
  if (context.executor?.chat) {
    await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
  } else if (context.executor) {
    await context.executor._postPhaseCard(phaseKey);
  }

  // Spark selection dialog prompt when sparks are generated
  let sparkChoices = null;
  if (maxSparks > 0 && anyHit) {
    sparkChoices = await askSparkDialog(results, { item, context, actor });
  }

  const applySparkPhase = maxSparks > 0 && (!sparkChoices || sparkChoices.applyDeedSpark !== false);

  context.isSpark = applySparkPhase;
  context.sparkChoices = sparkChoices;

  if (sparkChoices) {
    const { DeedPotencyHelper } = await import("./potency-helper.mjs");
    await DeedPotencyHelper.onSparksSelected(context, actor, item, phaseKey);
    const { DeedPowerHelper } = await import("./power-helper.mjs");
    await DeedPowerHelper.onSparksSelected(context, actor, item, phaseKey);
  }

  const onHitResult = branchingMode === "hitOrSpark" ? (anyHit && !applySparkPhase) : anyHit;
  const onMissResult = context.accuracyResults?.length > 0 ? context.accuracyResults.some(r => !r.isHit) : !anyHit;
  return {
    conditions: {
      onHit: onHitResult,
      onMiss: onMissResult,
      onSpark: applySparkPhase,
      out: true,
      always: true
    }
  };
}
