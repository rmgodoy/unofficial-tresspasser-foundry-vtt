import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { askSparkDialog } from "../../dialogs/spark-dialog.mjs";
import { requestPlayerDefenseRoll } from "../defense-roll-helper.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";

/**
 * Executes accuracy check for Creature Attacking Characters (Player-Facing Defense Roll via Socket).
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
 * @returns {Promise<object|boolean>}
 */
export async function executeCreatureDefenseRoll({
  behavior,
  context,
  actor,
  item,
  phaseKey,
  targetList,
  apBonus,
  versus,
  abilityType,
  branchingMode
}) {
  const creatureToken = context.sourceToken || context.executor?.sourceToken || actor?.getActiveTokens?.()[0] || null;
  const isEngaged = creatureToken ? TargetingHelper.isEngaged(creatureToken) : false;
  const deedType = abilityType || item.system.abilityType || item.system.type;
  const isMissileOrSpell = ["missile", "spell"].includes(deedType) || ["missile", "spell"].includes(item.system.type);
  const targetTokensList = targetList.filter(t => t && t.center);
  const isExempt = TargetingHelper.isExemptFromEngagement(item.system, targetTokensList, creatureToken);
  const hasEngagementPenalty = isEngaged && isMissileOrSpell && !isExempt;
  const engagementMod = hasEngagementPenalty ? -2 : 0;

  const creatureEffBonus = actor ? TrespasserEffectsHelper.getAttributeBonus(actor, "accuracy", "use") : 0;
  const creatureAccuracy = actor?.system?.combat?.accuracy ?? 0;
  const creatureDC = creatureAccuracy + creatureEffBonus + apBonus + engagementMod;

  let anyHit = false;
  let maxSparks = 0;
  const results = [];

  for (const targetToken of targetList) {
    const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
    if (!targetActor) continue;

    const statKey = versus.toLowerCase(); // "guard" or "resist"
    const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
    let defTotal = 10;
    let diceResult = 10;

    if (targetActor.type === "creature") {
      // NPC vs NPC: compare creature DC vs target creature stat directly
      const totalDef = targetActor.system?.combat?.[statKey] ?? 10;
      const defEffBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
      defTotal = totalDef + defEffBonus;
    } else {
      // Player character target: prompt player via websocket socket to roll defense
      const defResult = await requestPlayerDefenseRoll({
        targetActorId: targetActor.id,
        targetTokenId: targetToken.id,
        statKey,
        creatureDC,
        deedName: item.name,
        creatureName: actor.name
      });

      if (!defResult) return false; // Player cancelled defense roll

      defTotal = defResult.total;
      diceResult = defResult.diceResult;
    }

    const isHit = creatureDC >= defTotal;
    if (isHit) anyHit = true;

    const diff = creatureDC - defTotal;
    let sparks = 0;
    let shadows = 0;
    if (diff >= 0) sparks = Math.floor(diff / 5);
    else shadows = Math.floor(Math.abs(diff) / 5);

    if (diceResult === 20) shadows += 1;
    if (diceResult === 1) sparks += 1;

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
      rollTotal: defTotal,
      dc: creatureDC
    });
  }

  context.isHit = anyHit;
  context.maxSparks = maxSparks;
  context.accuracyResults = results;

  // Post creature defense roll results HTML
  let resultsHtml = "";
  for (const res of results) {
    const targetTokenObj = targetList.find(t => t.id === res.tokenId) || null;
    let counterBtnHtml = "";
    if (!res.isHit && res.shadows > 0 && targetTokenObj && creatureToken) {
      const counterCheck = TargetingHelper.checkCounterEligibility(targetTokenObj, creatureToken);
      if (counterCheck.canCounter) {
        counterBtnHtml = `<button type="button" class="trespasser-reaction-btn counter-reaction-btn" data-action="counter-reaction" data-defender-id="${res.actorId}" data-defender-token-id="${res.tokenId}" data-attacker-id="${actor.id}" data-attacker-token-id="${creatureToken.id}" data-sparks="${res.shadows}" data-weapon-die="${counterCheck.weaponDie || 'd6'}" title="${game.i18n.localize("TRESPASSER.Chat.Combat.CounterReaction")}">⚔️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Counter")} (${res.shadows}×${counterCheck.weaponDie || 'd6'})</button>`;
      }
    }

    const defended = !res.isHit;
    const statusLabel = defended
      ? (game.i18n.localize("TRESPASSER.Chat.Combat.Defended") || "DEFENDEU!")
      : (game.i18n.localize("TRESPASSER.Chat.Combat.DefenseFailed") || "ATINGIDO!");
    const statusColor = defended ? '#4fc3f7' : '#ff5252';

    // Presentation-wise, display sparks/shadows from defender perspective (mechanics untouched)
    const defenderSparks = res.shadows;
    const defenderShadows = res.sparks;

    resultsHtml += `
      <div class="target-result" style="border-top:1px solid var(--trp-border-light, #5c4f3a);padding-top:5px;margin-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${res.tokenName} <span style="font-size: var(--fs-10);color:var(--trp-text-dim, #a09070);">(Roll: ${res.rollTotal} vs DC: ${res.dc})</span></strong>
          <span class="${defended ? "hit-text" : "miss-text"}" style="font-weight:bold; color: ${statusColor};">${statusLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
          <div style="display:flex;gap:10px;font-size: var(--fs-11);">
            <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: defenderSparks }) || `Centelhas: ${defenderSparks}`}</span>
            <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: defenderShadows }) || `Sombras: ${defenderShadows}`}</span>
          </div>
          ${counterBtnHtml}
        </div>
      </div>`;
  }

  if (!context.currentPhaseOutputs) {
    context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
  }

  const engagementNote = hasEngagementPenalty ? ` <span style="color:#ff5252; font-size:var(--fs-10);">(-2 ${game.i18n.localize("TRESPASSER.Chat.Combat.EngagementPenalty")})</span>` : "";
  const headerTitle = game.i18n.format("TRESPASSER.Chat.Combat.DefenseVsHeader", { name: item.name, dc: creatureDC });
  context.currentPhaseOutputs.accuracyHtml = `
    <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
      <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
        ${headerTitle}${engagementNote}
      </h4>
      ${resultsHtml}
    </div>`;

  // Post accuracy result in chat immediately before spark dialog
  context.accuracyCardPosted = true;
  if (context.executor) {
    await context.executor._postPhaseCard(phaseKey, context.executor.system?.phases?.[phaseKey], true);
  }

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
