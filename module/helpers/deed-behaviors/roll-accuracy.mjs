import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";
import { askSparkDialog } from "../../dialogs/spark-dialog.mjs";
import { requestPlayerDefenseRoll } from "../defense-roll-helper.mjs";

/**
 * RollAccuracyBehavior — Implements accuracy checks for Behavior-Driven Deeds.
 *
 * Supports both:
 * 1. Creature Attacking Characters (Player-Facing Defense Roll via Socket)
 * 2. Character Attacking (Player Roll vs Target CD/DC)
 *
 * Returns condition results for executor branching:
 *   { conditions: { onHit: boolean, onMiss: boolean, onSpark: boolean, always: true } }
 */
export class RollAccuracyBehavior {
  /**
   * Execute accuracy roll behavior.
   * @param {object} behavior - Behavior node data { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Attacking actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   * @returns {Promise<object|boolean>} Returns condition mapping or false if cancelled
   */
  static async execute(behavior, context, actor, item, phaseKey = "base") {
    const isAttack = item.system.actionType !== "support";
    const versus = item.system.versus ?? "Guard";
    const apBonus = context.apBonus || 0;

    // Check targets: context.targets or current user targets
    let targetList = (context.targets && context.targets.length > 0)
      ? context.targets
      : Array.from(game.user?.targets || []);

    if (targetList.length > 0 && (!context.targets || context.targets.length === 0)) {
      context.targets = targetList;
    }

    const isVersus10 = versus === "10" || !isAttack || !versus;

    // If no targets and versus requires a target defense, skip accuracy check (treated as miss)
    if (targetList.length === 0 && !isVersus10) {
      ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.NoTargetsSkippingAccuracy"));
      context.isHit = false;
      context.isSpark = false;
      context.maxSparks = 0;
      context.sparkChoices = null;
      context.accuracyResults = [];

      if (!context.currentPhaseOutputs) {
        context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
      }
      context.currentPhaseOutputs.accuracyHtml = `
        <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: item.name })}
          </h4>
          <div style="font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); font-style: italic; margin-top: 4px;">
            ${game.i18n.localize("TRESPASSER.Chat.Combat.NoTargetsSkipped")}
          </div>
        </div>`;

      return {
        conditions: {
          onHit: false,
          onMiss: true,
          onSpark: false,
          always: true
        }
      };
    }

    const isCreatureAttacker = actor?.type === "creature";

    // ─────────────────────────────────────────────────────────────────────────
    // Case 1: Creature Attacking Characters (Player-Facing Defense Roll via Socket)
    // ─────────────────────────────────────────────────────────────────────────
    if (isCreatureAttacker && isAttack && !isVersus10) {
      const creatureEffBonus = actor ? TrespasserEffectsHelper.getAttributeBonus(actor, "accuracy", "use") : 0;
      const creatureAccuracy = actor?.system?.combat?.accuracy ?? 0;
      const creatureDC = creatureAccuracy + creatureEffBonus + apBonus;

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
        resultsHtml += `
          <div class="target-result" style="border-top:1px solid var(--trp-border-light, #5c4f3a);padding-top:5px;margin-top:5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${res.tokenName} <span style="font-size: var(--fs-10);color:var(--trp-text-dim, #a09070);">(Roll: ${res.rollTotal} vs DC: ${res.dc})</span></strong>
              <span class="${res.isHit ? "hit-text" : "miss-text"}" style="font-weight:bold; color: ${res.isHit ? '#4fc3f7' : '#ff5252'};">${res.isHit ? (game.i18n.localize("TRESPASSER.Chat.Combat.Hit") || "ACERTO!") : (game.i18n.localize("TRESPASSER.Chat.Combat.Miss") || "ERRO!")}</span>
            </div>
            <div style="display:flex;gap:10px;font-size: var(--fs-11);margin-top:2px;">
              <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: res.sparks }) || `Centelhas: ${res.sparks}`}</span>
              <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: res.shadows }) || `Sombras: ${res.shadows}`}</span>
            </div>
          </div>`;
      }

      if (!context.currentPhaseOutputs) {
        context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
      }

      context.currentPhaseOutputs.accuracyHtml = `
        <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: item.name })} (Creature Attack DC: ${creatureDC})
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

      return {
        conditions: {
          onHit: anyHit && !applySparkPhase,
          onMiss: !anyHit,
          onSpark: applySparkPhase,
          always: true
        }
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Case 2: Character Attacking (Player Roll vs Target CD/DC)
    // ─────────────────────────────────────────────────────────────────────────
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
    const totalBonuses = `${baseAccuracy} + ${effectBonus} + ${apBonus} + ${userModifier}`;
    const formula = isAdv ? `2d20kh + ${totalBonuses}` : `1d20 + ${totalBonuses}`;

    const rollData = actor?.getRollData() || {};
    const accRoll = new foundry.dice.Roll(formula, rollData);
    await accRoll.evaluate();

    const rollTotal = accRoll.total;
    const diceResult = accRoll.dice[0]?.results?.find(r => r.active)?.result ?? accRoll.dice[0]?.results[0]?.result ?? 10;

    let anyHit = false;
    let maxSparks = 0;
    const results = [];

    const actualTargets = isAttack && targetList.length > 0 ? targetList : [null];

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

      resultsHtml += `
        <div class="target-result" style="border-top:1px solid var(--trp-border-light, #5c4f3a);padding-top:5px;margin-top:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            ${headerText}
            <span class="${res.isHit ? "hit-text" : "miss-text"}" style="font-weight:bold; color: ${hitColor};">${hitLabel}</span>
          </div>
          <div style="display:flex;gap:10px;font-size: var(--fs-11);margin-top:2px;">
            <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: res.sparks }) || `Centelhas: ${res.sparks}`}</span>
            <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: res.shadows }) || `Sombras: ${res.shadows}`}</span>
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

    return {
      conditions: {
        onHit: anyHit && !applySparkPhase,
        onMiss: !anyHit,
        onSpark: applySparkPhase,
        always: true
      }
    };
  }
}
