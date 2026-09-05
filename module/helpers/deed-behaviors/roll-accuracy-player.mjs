import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";
import { askSparkDialog } from "../../dialogs/spark-dialog.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";

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

  const isEngaged = sourceToken ? TargetingHelper.isEngaged(sourceToken) : false;
  const deedType = abilityType || item.system.abilityType || item.system.type;
  const isMissileOrSpell = ["missile", "spell"].includes(deedType) || ["missile", "spell"].includes(item.system.type);
  const actualTargetTokens = actualTargets.filter(t => t && t.center);
  const isExempt = TargetingHelper.isExemptFromEngagement(item.system, actualTargetTokens, sourceToken);
  const hasEngagementPenalty = isEngaged && isMissileOrSpell && !isExempt;
  const engagementMod = hasEngagementPenalty ? -2 : 0;

  const isAdv = actor ? TrespasserEffectsHelper.hasAdvantage(actor, "accuracy") : false;
  const effectBonus = actor ? TrespasserEffectsHelper.getAttributeBonus(actor, "accuracy", "use") : 0;
  const totalAccuracy = actor?.system?.combat?.accuracy ?? 0;
  const baseAccuracy = totalAccuracy - effectBonus;
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const rollDialogData = {
    dice: diceFormula,
    bonuses: [
      { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Accuracy") || "Accuracy", value: baseAccuracy },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus", value: effectBonus }
    ]
  };

  if (hasEngagementPenalty) {
    rollDialogData.bonuses.push({
      label: game.i18n.localize("TRESPASSER.Chat.Combat.EngagementPenalty") || "Engaged",
      value: -2
    });
  }

  if (apBonus > 0) {
    rollDialogData.bonuses.push({
      label: game.i18n.localize("TRESPASSER.Chat.Check.AccuracyFromAP") || "Accuracy from Extra Effort",
      value: apBonus
    });
  }

  // Prompt user with Trespasser Roll Dialog
  const dialogResult = await TrespasserRollDialog.wait({
    ...rollDialogData,
    showCD: false
  }, { title: `${item.name} Roll` });

  if (!dialogResult) return false; // User cancelled roll dialog

  const userModifier = dialogResult.modifier || 0;
  const totalBonuses = `${baseAccuracy} + ${effectBonus} + ${engagementMod} + ${apBonus} + ${userModifier}`;
  const formula = isAdv ? `2d20kh + ${totalBonuses}` : `1d20 + ${totalBonuses}`;

  const rollData = actor?.getRollData() || {};
  const accRoll = new foundry.dice.Roll(formula, rollData);
  await accRoll.evaluate();

  const rollTotal = accRoll.total;
  const diceResult = accRoll.dice[0]?.results?.find(r => r.active)?.result ?? accRoll.dice[0]?.results[0]?.result ?? 10;

  let anyHit = false;
  let maxSparks = 0;
  const results = [];

  for (const targetToken of actualTargets) {
    const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
    const tokenName = targetToken ? DeedBehaviorUtils.getTokenDisplayName(targetToken) : null;
    let dc = 10;

    // Support deeds automatically have DC 10
    if (!isAttack || versus === "10" || !versus) {
      dc = 10;
    } else if (targetActor) {
      const statKey = versus.toLowerCase(); // "guard" or "resist"
      const totalDef = targetActor.system?.combat?.[statKey] ?? 10;
      const effBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
      const targetCD = totalDef + effBonus;
      dc = targetActor.type === "character" ? targetCD + 10 : targetCD;
    }

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
      dc
    });
  }

  context.rollResult = accRoll;
  context.isHit = anyHit;
  context.maxSparks = maxSparks;
  context.accuracyResults = results;

  const rollHtml = await accRoll.render();

  let versusLabel;
  if (versus === "Guard" || versus === "Resist") {
    versusLabel = game.i18n.localize(`TRESPASSER.Sheet.Combat.${versus}`) || versus;
  } else {
    versusLabel = game.i18n.localize("TRESPASSER.Terms.DC") || "CD";
  }

  let resultsHtml = "";
  for (const res of results) {
    const headerText = res.tokenName
      ? `<strong>${res.tokenName} <span style="font-size: var(--fs-10);color:var(--trp-text-dim, #a09070);">(Roll: ${res.rollTotal} vs ${versusLabel}: ${res.dc})</span></strong>`
      : `<span style="font-size: var(--fs-11);color:var(--trp-text-dim, #a09070); font-weight: bold;">(Roll: ${res.rollTotal} vs ${versusLabel}: ${res.dc})</span>`;

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
  if (context.executor) {
    await context.executor._postPhaseCard(phaseKey, context.executor.system?.phases?.[phaseKey], true);
  }

  // Spark selection dialog prompt when sparks are generated
  let sparkChoices = null;
  if (maxSparks > 0 && anyHit) {
    sparkChoices = await askSparkDialog(results);
  }

  const applySparkPhase = maxSparks > 0 && (!sparkChoices || sparkChoices.applyDeedSpark !== false);

  context.isSpark = applySparkPhase;
  context.sparkChoices = sparkChoices;

  if (sparkChoices) {
    const { DeedPotencyHelper } = await import("./potency-helper.mjs");
    await DeedPotencyHelper.onSparksSelected(context, actor, item, phaseKey);
  }

  const onHitResult = branchingMode === "hitOrSpark" ? (anyHit && !applySparkPhase) : anyHit;
  return {
    conditions: {
      onHit: onHitResult,
      onMiss: !anyHit,
      onSpark: applySparkPhase,
      always: true
    }
  };
}
