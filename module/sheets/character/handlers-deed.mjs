/**
 * Character Sheet — Deed roll handlers
 * onDeedRoll       — orchestrator, called from both sheet and HUD
 * rollCharacterDeed — character targeting a creature
 * rollCreatureDeed  — creature targeting a character
 * postDeedPhase    — chat output for a single deed phase
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../../documents/combat.mjs";
import { TrespasserRollDialog }    from "../../dialogs/roll-dialog.mjs";
import { TargetingHelper }         from "../../helpers/targeting-helper.mjs";
import { askSparkDialog }          from "../../dialogs/spark-dialog.mjs";
import { requestPlayerDefenseRoll } from "../../helpers/defense-roll-helper.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../../dialogs/tempt-fate-dialogs.mjs";
import * as NonCombatHelper from "../../helpers/non-combat-helper.mjs";


// ─────────────────────────────────────────────────────────────────────────────
// Deed card chat message
// ─────────────────────────────────────────────────────────────────────────────

async function postDeedCard(actor, item) {
  const sys = item.system;
  const phases = ["start", "before", "base", "hit", "spark", "after", "end"];
  const allPhases = phases.map(key => ({
    key,
    label: game.i18n.localize(`TRESPASSER.Terms.DeedPhases.${key.charAt(0).toUpperCase() + key.slice(1)}`),
    data: sys.effects?.[key] ?? {}
  }));
  const cardPhases = allPhases.filter(p => p.data.description);

  const tier = sys.tier;
  let baseCost = sys.focusCost;
  if (baseCost === null || baseCost === undefined) {
    if (tier === "heavy") baseCost = 2;
    else if (tier === "mighty") baseCost = 4;
    else baseCost = 0;
  }
  const displayCost = baseCost + (sys.bonusCost || 0);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/trespasser/templates/chat/deed-card.hbs",
    {
      name: item.name,
      tierLabel: game.i18n.localize(`TRESPASSER.Sheet.Item.Details.Tiers.${tier.charAt(0).toUpperCase() + tier.slice(1)}`),
      type: sys.type,
      actionType: sys.actionType,
      accuracyTest: sys.accuracyTest,
      target: sys.target,
      displayCost,
      showCost: displayCost > 0,
      cardPhases
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function onDeedRoll(event, sheet) {
  event.preventDefault();
  const el = event.currentTarget.closest("[data-item-id]");
  if (!el) return;
  const item = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  const isAttack  = item.system.actionType !== "support";
  const isCreature = sheet.actor.type === "creature";

  // ── 1. Ammo check (characters only) ───────────────────────────────────────
  let ammoToConsumeId = null;
  if (!isCreature) {
    const activeWeapons = sheet._getActiveWeapons();
    const isMissileDeed = item.system.type === "missile" ||
      (item.system.type === "versatile" && activeWeapons.some(w => w.system.type === "missile"));

    if (isMissileDeed) {
      for (const w of activeWeapons) {
        if (w.system.type === "missile" && w.system.needsAmmo) {
          const ammoItems = sheet.actor.items.filter(i => i.system.isAmmo);
          if (ammoItems.length === 0) {
            ui.notifications.error(game.i18n.localize("TRESPASSER.Notification.Combat.NoAmmo"));
            return;
          }
          ammoToConsumeId = await sheet._selectAmmoDialog(ammoItems, w);
          if (!ammoToConsumeId) return;
          break;
        }
      }
    }
  }

  // ── 1b. Weapon compatibility check (characters only) ──────────────────────
  if (!isCreature) {
    const wpnCheck = TargetingHelper.validateWeaponCompatibility(
      item.system, sheet._getActiveWeapons(), sheet.actor
    );
    if (!wpnCheck.valid) {
      ui.notifications.warn(wpnCheck.message);
      return;
    }
  }

  // ── 2. Focus cost & Surcharge ──────────────────────────────────────────────
  const combatant   = TrespasserCombat.getPhaseCombatant(sheet.actor);
  const usedActions = new Set(combatant?.getFlag("trespasser", "usedHUDActions") ?? []);
  const surcharge   = usedActions.has("maneuver") ? 2 : 0;

  const tier = item.system.tier;
  let baseCost = item.system.focusCost;
  if (baseCost === null || baseCost === undefined) {
    if (tier === "heavy") baseCost = 2;
    else if (tier === "mighty") baseCost = 4;
    else baseCost = 0;
  }
  let costIncrease = item.system.focusIncrease;
  if (costIncrease === null || costIncrease === undefined) {
    costIncrease = (tier === "heavy" || tier === "mighty") ? 1 : 0;
  }
  const currentBonusCost = item.system.bonusCost || 0;
  const currentUses      = item.system.uses || 0;
  const totalCost        = baseCost + currentBonusCost + surcharge;

  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  if (totalCost > 0) {
    const currentFocus = sheet.actor.system.combat.focus || 0;
    if (restrictAPF && currentFocus < totalCost) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Notification.Combat.NotEnoughFocus",
        { name: item.name, cost: totalCost, current: currentFocus }));
      return;
    }
  }

  // ── 3. Target resolution (AOE-aware) ──────────────────────────────────────
  const deed = item.system;
  let targets;
  let templateDoc = null;

  // Resolve the caster's token for AOE placement
  const sourceToken = sheet.actor.token?.object || 
                     canvas.tokens.controlled.find(t => t.actor?.id === sheet.actor.id) ||
                     canvas.tokens.placeables.find(t => t.actor?.id === sheet.actor.id);

  if (deed.targetType === "personal") {
    // Personal: auto-target self
    targets = sourceToken ? [sourceToken] : [];
  } else if (["blast", "close_blast", "burst", "melee_burst", "path", "close_path", "aura"]
             .includes(deed.targetType)) {
    // AOE: place template and resolve targets from grid squares
    if (!sourceToken) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoTokenOnCanvas"));
      return;
    }

    const activeWeapons = typeof sheet._getActiveWeapons === "function" ? sheet._getActiveWeapons() : [];
    const aoeResult = await TargetingHelper.placeTemplate(sheet.actor, sourceToken, deed, activeWeapons);
    if (!aoeResult) return; // cancelled
    templateDoc = aoeResult.templateDoc;
    const gridPx = canvas.grid.size;
    targets = TargetingHelper.getTokensInSquares(aoeResult.squares, gridPx, {
      excludeTokenId: isAttack ? sourceToken.id : null
    });
  } else {
    // "creature" type — use manual targeting with validation
    targets = Array.from(game.user.targets);
    const validation = TargetingHelper.validateTargets(targets, deed, sourceToken);
    if (!validation.valid) {
      ui.notifications.warn(validation.message);
      return;
    }
    if (isAttack && targets.length === 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoTargetsDefault"));
      return;
    }

    // Range validation
    if (sourceToken) {
      let rangeCheck = { valid: true };
      
      if (isCreature) {
        // Creatures: Check range ONLY if deed.range is set
        if (deed.range !== null) {
          rangeCheck = TargetingHelper.validateRange(targets, sourceToken, deed, []);
        }
      } else {
        // Characters: Existing weapon-based range check
        const activeWeapons = sheet._getActiveWeapons() || [];
        rangeCheck = TargetingHelper.validateRange(targets, sourceToken, deed, activeWeapons);
      }
      
      if (!rangeCheck.valid) {
        const disregardRange = game.settings.get("trespasser", "disregardRangeOnAttack");
        ui.notifications.warn(rangeCheck.message);
        if (!disregardRange) return;
      }
    }
  }

  // ── 4. Resolve AP ─────────────────────────────────────────────────────────
  let apSpent = 1;
  let apBonus = 0;

  if (combatant) {
    const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    if (restrictAPF && availableAP < 1) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
      return;
    }
    if (availableAP > 1 && sheet._askAPDialog) {
      apSpent = await sheet._askAPDialog(availableAP);
      if (apSpent === null) return; // cancelled
    }
    apBonus = (apSpent - 1) * 2;
  }

  // ── 4.5. Roll Dialog (Characters only) ────────────────────────────────────
  let userModifier = 0;
  if (!isCreature) {
    const isAdv          = TrespasserEffectsHelper.hasAdvantage(sheet.actor, "accuracy");
    const effectBonus    = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, "accuracy", "use");
    const totalAccuracy  = sheet.actor.system.combat.accuracy ?? 0;
    const baseAccuracy   = totalAccuracy - effectBonus;
    const diceFormula    = isAdv ? "2d20kh" : "1d20";

    const rollData = {
      dice: diceFormula,
      bonuses: [
        { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Accuracy"), value: baseAccuracy },
        { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
      ]
    };
    if (apBonus > 0) rollData.bonuses.push({ label: game.i18n.localize("TRESPASSER.Chat.Check.AccuracyFromAP"), value: apBonus });

    const result = await TrespasserRollDialog.wait({
      ...rollData,
      showCD: false
    }, { title: `${item.name} Roll` });
    if (!result) return;
    userModifier = result.modifier;
  }

  // ── 4.6. Final side-effects (Focus, Ammo) ─────────────────────────────────
  if (!isCreature) {
    if (totalCost > 0) {
      const currentFocus = sheet.actor.system.combat.focus || 0;
      await sheet.actor.update({ "system.combat.focus": Math.max(0, currentFocus - totalCost) });
      if (surcharge > 0 && restrictAPF) {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
          content: `<strong>${sheet.actor.name}</strong> ${game.i18n.format("TRESPASSER.Chat.Action.DeedSurcharge", { count: 2 })}`
        });
      }
    }
    // Ammo consumption
    if (ammoToConsumeId) {
      const ammoItem = sheet.actor.items.get(ammoToConsumeId);
      if (ammoItem) {
        const currentQty = ammoItem.system.quantity ?? 1;
        if (currentQty > 1) await ammoItem.update({ "system.quantity": currentQty - 1 });
        else await ammoItem.delete();
        ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Combat.AmmoConsumed", { name: ammoItem.name }));
      }
    }
  }

  // ── 5. Item bookkeeping ────────────────────────────────────────────────────
  if (["heavy", "mighty", "special"].includes(tier) && combatant) {
    await combatant.setFlag("trespasser", "usedExpensiveDeed", true);
  }
  await item.update({ "system.uses": currentUses + 1, "system.bonusCost": currentBonusCost + costIncrease });

  // ── 6. Post deed card to chat, then Start/Before phases + on-use-deed ─────
  await postDeedCard(sheet.actor, item);

  const effects      = item.system.effects || {};
  const fragileItems = new Set();
  const phaseOptions = { fragileItems };

  await sheet._postDeedPhase("Start",  effects.start,  sheet.actor, item, phaseOptions);
  await sheet._postDeedPhase("Before", effects.before, sheet.actor, item, phaseOptions);
  await TrespasserEffectsHelper.triggerEffects(sheet.actor, "on-use-deed");

  // ── 7. Targeted effects ────────────────────────────────────────────────────
  for (const t of targets) {
    if (t?.actor) {
      await TrespasserEffectsHelper.triggerEffects(t.actor, "targeted");
      await TrespasserEffectsHelper.triggerEffects(t.actor, "on-targeted-deed");
    }
  }

  // ── 8. Roll (dispatch to actor-type specific handler) ─────────────────────
  let anyHit = false, maxSparks = 0, results = [];

  if (isCreature) {
    ({ anyHit, maxSparks, results } = await rollCreatureDeed(item, sheet, targets, apBonus));
  } else {
    ({ anyHit, maxSparks, results } = await rollCharacterDeed(item, sheet, targets, apBonus, totalCost, userModifier));
  }

  // ── 9. Hit/miss effects ────────────────────────────────────────────────────
  for (const t of targets) {
    if (!t?.actor) continue;
    if (anyHit) {
      await TrespasserEffectsHelper.triggerEffects(t.actor,       "on-deed-hit-received");
      await TrespasserEffectsHelper.triggerEffects(sheet.actor,   "on-deed-hit");
    } else {
      await TrespasserEffectsHelper.triggerEffects(t.actor,       "on-deed-miss-received");
      await TrespasserEffectsHelper.triggerEffects(sheet.actor,   "on-deed-miss");
    }
  }

  // ── 9b. Focus refund on total miss (heavy/mighty attack deeds) ────────
  if (!anyHit && isAttack && totalCost > 0) {
    const refund = Math.floor(totalCost / 2);
    if (refund > 0) {
      const currentFocus = sheet.actor.system.combat.focus || 0;
      await sheet.actor.update({ "system.combat.focus": currentFocus + refund });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
        content: `<div class="trespasser-chat-card"><p><strong>${sheet.actor.name}</strong> ${game.i18n.format("TRESPASSER.Chat.Action.FocusRefund", { count: refund })}</p></div>`
      });
    }
  }

  // ── 9c. Spark selection dialog ────────────────────────────────────────────
  let sparkChoices = null;
  if (maxSparks > 0 && anyHit) {
    sparkChoices = await askSparkDialog(results);
    // null = cancelled or no sparks; proceed without spark effects
  }

  // ── 10. Spend AP + record action ──────────────────────────────────────────
  if (combatant) {
    const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - apSpent));
    await TrespasserCombat.recordHUDAction(sheet.actor, "attempt-deed");
  }

  // ── 11. Base/Hit/Spark/After/End phases + depletion ──────────────────────
  const commonOptions = { ...phaseOptions, anyHit, maxSparks, results, sparkChoices };

  // Base always fires (miss AND hit) for attack deeds
  await sheet._postDeedPhase("Base", effects.base, sheet.actor, item, commonOptions);

  // Hit and Spark only on success (or for support deeds / no targets)
  if (anyHit || !isAttack || targets.length === 0) {
    await sheet._postDeedPhase("Hit",  effects.hit,  sheet.actor, item, {
      ...commonOptions, targetIds: results.filter(r => r.isHit).map(r => r.tokenId)
    });

    // Spark phase: only fire if deed spark was chosen, or if no dialog was shown
    const showSpark = maxSparks > 0 && (!sparkChoices || sparkChoices.applyDeedSpark);
    if (showSpark) {
      const sparkTargets = results.filter(r => r.sparks > 0);
      await sheet._postDeedPhase("Spark", effects.spark, sheet.actor, item, {
        ...commonOptions,
        title: maxSparks > 1 ? `Spark (x${maxSparks})` : "Spark",
        targetIds: sparkTargets.map(r => r.tokenId)
      });
    }
  }

  await sheet._postDeedPhase("After", effects.after, sheet.actor, item, commonOptions);
  await sheet._postDeedPhase("End",   effects.end,   sheet.actor, item, commonOptions);

  // ── 11b. Separate Power bonus damage roll ────────────────────────────────
  const powerDice = sparkChoices?.powerBonusDice ?? 0;
  if (powerDice > 0 && anyHit) {
    const sd = sheet.actor.system.skill_die || "d6";
    const powerFormula = `${powerDice}${sd}`;
    const powerRoll = new foundry.dice.Roll(powerFormula);
    await powerRoll.evaluate();

    // Determine targets for the Apply Damage button (only hit targets)
    const hitTargetIds = results.filter(r => r.isHit).map(r => r.tokenId).filter(Boolean);
    const targetIdAttr = hitTargetIds.length
      ? ` data-target-ids="${hitTargetIds.join(",")}"`
      : "";

    const powerFlavor = `<div class="trespasser-chat-card">
      <h3>${item.name} — ${game.i18n.localize("TRESPASSER.Chat.Combat.PowerBonus")}</h3>
      <p><em>${game.i18n.format("TRESPASSER.Chat.Combat.PowerBonusDesc", { count: powerDice, die: sd })}</em></p>
      <div class="trp-damage-actions" data-damage="${powerRoll.total}"${targetIdAttr} style="display:flex;gap:6px;margin-top:8px;">
        <button class="apply-damage-btn" data-damage="${powerRoll.total}"${targetIdAttr} style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
          <i class="fas fa-heart-broken"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.ApplyDamage")}
        </button>
        <button class="heal-damage-btn" data-damage="${powerRoll.total}"${targetIdAttr} style="flex:1;background:var(--trp-bg-dark);border:1px solid #27ae60;color:#2ecc71;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
          <i class="fas fa-heart"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.Heal")}
        </button>
      </div>
    </div>`;

    const hideCreatureRolls = game.settings.get("trespasser", "hideCreatureDamageRolls");
    const rollMode = (sheet.actor.type === "creature" && hideCreatureRolls) ? "gmroll" : "roll";
    await powerRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      flavor: powerFlavor
    }, { rollMode });
  }

  // ── 11c. Potency bonus chat message ──────────────────────────────────────
  const potencyBonus = sparkChoices?.potencyBonus ?? 0;
  if (potencyBonus > 0 && anyHit) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      content: `<div class="trespasser-chat-card">
        <h3>${item.name} — ${game.i18n.localize("TRESPASSER.Chat.Combat.PotencyBonus")}</h3>
        <p>${game.i18n.format("TRESPASSER.Chat.Combat.PotencyBonusDesc", { count: potencyBonus })}</p>
      </div>`
    });
  }

  // ── 11d. Impact bonus chat message ───────────────────────────────────────
  const impactBonus = sparkChoices?.impactBonus ?? 0;
  if (impactBonus > 0 && anyHit) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      content: `<div class="trespasser-chat-card">
        <h3>${item.name} — ${game.i18n.localize("TRESPASSER.Chat.Combat.ImpactBonus")}</h3>
        <p>${game.i18n.format("TRESPASSER.Chat.Combat.ImpactBonusDesc", { count: impactBonus })}</p>
      </div>`
    });
  }

  if (!isCreature) {
    for (const weapon of fragileItems) await sheet._runDepletionCheck(weapon);
  }

  // ── 12. Cleanup AOE template (unless aura, which persists) ──────────────
  if (templateDoc && deed.targetType !== "aura") {
    await templateDoc.delete();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Character → Creature deed roll
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Item}   item
 * @param {ActorSheet} sheet
 * @param {Token[]} targets
 * @param {number} apBonus
 * @param {number} totalFocusCost  - for display only
 * @param {number} userModifier
 * @returns {{ anyHit: boolean, maxSparks: number, results: Array }}
 */
async function rollCharacterDeed(item, sheet, targets, apBonus, totalFocusCost = 0, userModifier = 0) {
  const isAttack    = item.system.actionType !== "support";
  const isAdv       = TrespasserEffectsHelper.hasAdvantage(sheet.actor, "accuracy");
  const effectBonus   = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, "accuracy", "use");
  const totalAccuracy = sheet.actor.system.combat.accuracy ?? 0;
  const baseAccuracy  = totalAccuracy - effectBonus;
  const totalBonuses = `${baseAccuracy} + ${effectBonus} + ${apBonus} + ${userModifier}`;

  // Engagement penalty: -2 accuracy for missile/spell deeds when engaged and not targeting adjacent
  let engagementPenalty = 0;
  if (isAttack && ["missile", "spell"].includes(item.system.type)) {
    // Find the correct source token on the canvas
    const sourceToken = sheet.actor.token?.object || 
                       canvas.tokens.controlled.find(t => t.actor?.id === sheet.actor.id) ||
                       canvas.tokens.placeables.find(t => t.actor?.id === sheet.actor.id);
    if (TargetingHelper.isEngaged(sourceToken) &&
        !TargetingHelper.isExemptFromEngagement(item.system, targets, sourceToken)) {
      engagementPenalty = -2;
    }
  }

  let formula = isAdv ? `2d20kh + ${totalBonuses}` : `1d20 + ${totalBonuses}`;
  if (engagementPenalty !== 0) formula += ` + ${engagementPenalty}`;

  const accRoll  = new foundry.dice.Roll(formula);
  await accRoll.evaluate();
  const rollTotal  = accRoll.total;
  const diceResult = accRoll.dice[0].results[0].result;

  // Trigger accuracy "use" effects
  await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: "accuracy" });

  let anyHit = false, maxSparks = 0, resultsHtml = "";
  const results = [];

  const targetList = isAttack ? targets : [null]; // support: always one pseudo-result vs CD 10

  for (const targetToken of targetList) {
    const targetActor = targetToken?.actor ?? null;

    // Determine Defense Class (DC)
    let dc = 10; // Default 10
    if (isAttack && targetActor) {
      const statKey  = item.system.accuracyTest?.toLowerCase() || "guard";
      const totalDef = targetActor.system.combat[statKey] ?? 10;
      const effBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
      const targetCD = totalDef + effBonus;
      // Characters aggregate bonuses in combat.stat, creatures keep them separate.
      dc = (targetActor.type === "character") ? (targetCD + 10) : targetCD;
    }

    let isHit = rollTotal >= dc;
    if (diceResult === 20) isHit = true; // Nat 20 auto-success
    if (isHit) anyHit = true;

    const diff    = rollTotal - dc;
    let sparks = 0, shadows = 0;
    if (diff >= 0) sparks  = Math.floor(diff / 5);
    else           shadows = Math.floor(Math.abs(diff) / 5);
    if (diceResult === 20) sparks  += 1;
    if (diceResult === 1)  shadows += 1;
    // Sparks cancel Shadows
    const net = sparks - shadows;
    sparks  = Math.max(0, net);
    shadows = Math.max(0, -net);

    if (sparks > maxSparks) maxSparks = sparks;

    // Track per-target results
    results.push({
      tokenId: targetToken?.id ?? null,
      tokenName: targetToken?.name ?? null,
      actorId: targetActor?.id ?? null,
      isHit,
      sparks,
      shadows,
      dc
    });

    if (targetToken) {
      // Always show target info (name, CD, hit/miss, sparks/shadows) for every target
      resultsHtml += `
        <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${targetToken.name} <span style="font-size:var(--fs-10);color:var(--trp-text-dim);">(${game.i18n.localize("TRESPASSER.Sheet.Combat." + (item.system.accuracyTest || "Guard"))}: ${dc})</span></strong>
            <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Combat.Hit") : game.i18n.localize("TRESPASSER.Chat.Combat.Miss")}</span>
          </div>
          <div style="display:flex;gap:10px;font-size:var(--fs-11);">
            <span style="color:var(--trp-spark);">${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</span>
            <span style="color:var(--trp-shadow);">${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</span>
          </div>
        </div>`;
    } else {
      // Support deed (no target)
      resultsHtml += `
        <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
          <div style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
          <div style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
        </div>`;
    }
  }

  let flavor = `<div class="trespasser-chat-card">
    <h3>${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: item.name })}${isAdv ? " (Adv)" : ""}</h3>
    <p><strong>${game.i18n.localize("TRESPASSER.Chat.Common.RollTotal")}</strong> ${rollTotal} <span style="font-size:var(--fs-10);color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
    ${resultsHtml}`;
  if (totalFocusCost > 0) flavor += `<p class="cost-note" style="margin-top:5px;">${game.i18n.format("TRESPASSER.Chat.Action.SpentFocus", { count: totalFocusCost })}</p>`;
  if (apBonus > 0)        flavor += `<p class="cost-note" style="margin-top:2px;color:#2ecc71;">+${apBonus} ${game.i18n.localize("TRESPASSER.Chat.Check.AccuracyFromAP")}</p>`;
  if (engagementPenalty !== 0) flavor += `<p class="cost-note" style="margin-top:2px;color:#e74c3c;">${game.i18n.localize("TRESPASSER.Chat.Combat.EngagementPenalty")}</p>`;
  flavor += `</div>`;

  await accRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });

  return { anyHit, maxSparks, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creature → Character deed roll (defense roll mechanic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Item}   item
 * @param {ActorSheet} sheet
 * @param {Token[]} targets
 * @param {number} apBonus
 * @returns {{ anyHit: boolean, maxSparks: number, results: Array }}
 */
async function rollCreatureDeed(item, sheet, targets, apBonus) {
  const isAttack = item.system.actionType !== "support";

  // Support deeds: just post phases, no roll
  if (!isAttack) {
    return { anyHit: true, maxSparks: 0, results: [] };
  }

  // Creature's accuracy DC
  const creatureEffBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, "accuracy", "use");
  const creatureAccuracy = sheet.actor.system.combat.accuracy ?? 0;
  const creatureDC       = creatureAccuracy + creatureEffBonus + apBonus;

  let anyHit = false, maxSparks = 0;
  const results = [];

  await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: "accuracy" });

  const targetPromises = targets.map(async (targetToken) => {
    const targetActor = targetToken?.actor ?? null;
    if (!targetActor) return null;

    const statKey     = item.system.accuracyTest?.toLowerCase() || "guard";
    const totalDef    = targetActor.system.combat[statKey] ?? 10;
    const defEffBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
    
    let defTotal, diceResult = null, finalDC = creatureDC, isHit;
    const label = statKey.charAt(0).toUpperCase() + statKey.slice(1);

    if (targetActor.type === "creature") {
      // NPC vs NPC: No rolls, just compare values
      defTotal = totalDef + defEffBonus;
      isHit    = finalDC >= defTotal;
    } else {
      // Character: prompt the OWNING PLAYER to roll defense via socket/flag
      const defenseResult = await requestPlayerDefenseRoll({
        targetActorId: targetActor.id,
        targetTokenId: targetToken.id,
        statKey,
        creatureDC,
        deedName: item.name,
        creatureName: sheet.actor.name
      });

      if (!defenseResult) return null; // Player cancelled or timed out

      defTotal = defenseResult.total;
      diceResult = defenseResult.diceResult;
      finalDC = defenseResult.cd;
      isHit = finalDC >= defTotal;
    }

    const diff = finalDC - defTotal;
    let sparks = 0, shadows = 0;
    if (isHit) {
      sparks  = Math.floor(diff / 5);
      if (diceResult === 1)  sparks  += 1; 
    } else {
      shadows = Math.floor(Math.abs(diff) / 5);
      if (diceResult === 20) shadows += 1;
    }
    // Sparks cancel Shadows
    const net = sparks - shadows;
    sparks  = Math.max(0, net);
    shadows = Math.max(0, -net);

    const resultObj = {
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      actorId: targetActor.id,
      isHit,
      sparks,
      shadows,
      dc: finalDC
    };

    const resultsHtml = `
      <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${targetToken.name} <span style="font-size:var(--fs-10);color:var(--trp-text-dim);">(${game.i18n.localize("TRESPASSER.Chat.Combat.Defense")}: ${defTotal})</span></strong>
          <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Combat.Hit") : game.i18n.localize("TRESPASSER.Chat.Combat.Miss")}</span>
        </div>
        <div style="display:flex;gap:10px;font-size:var(--fs-11);">
          <span style="color:var(--trp-spark);">${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</span>
          <span style="color:var(--trp-shadow);">${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</span>
        </div>
      </div>`;

    // Post to chat immediately
    let flavor = "";
    if (targetActor.type === "creature") {
      flavor = `<div class="trespasser-chat-card">
        <h3>${item.name} — ${game.i18n.localize("TRESPASSER.Chat.Combat.Defense")}</h3>
        <p><strong>${targetToken.name}</strong> ${game.i18n.localize("TRESPASSER.Chat.Combat.Defense")}: <strong>${defTotal}</strong></p>
        <p>${game.i18n.localize("TRESPASSER.Chat.Check.CreatureAccuracy")}: <strong>${finalDC}</strong></p>
        <p class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;font-size:var(--fs-14);text-align:center;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Combat.Hit") : game.i18n.localize("TRESPASSER.Chat.Combat.Miss")}</p>
        ${resultsHtml}
      </div>`;
    } else {
      flavor = `<div class="trespasser-chat-card">
        <h3>${item.name} — ${game.i18n.localize("TRESPASSER.Chat.Check.DefenseRoll")}</h3>
        <p><strong>${targetToken.name}</strong> ${game.i18n.localize("TRESPASSER.Chat.Common.Rolls")} ${game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`)}: <strong>${defTotal}</strong> <span style="font-size:var(--fs-10);color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
        <p>${game.i18n.localize("TRESPASSER.Chat.Check.CreatureAccuracy")}: <strong>${finalDC}</strong></p>
        <p class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;font-size:var(--fs-14);text-align:center;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Combat.Hit") : game.i18n.localize("TRESPASSER.Chat.Combat.Miss")}</p>
        ${resultsHtml}
        </div>`;
    }
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      content: flavor
    });

    // Counter reaction: if creature missed, defender may counter-attack
    if (!isHit && shadows > 0) {
      const creatureToken = canvas.tokens.placeables.find(t => t.actor?.id === sheet.actor.id);
      const { canCounter, weapon } = TargetingHelper.checkCounterEligibility(targetToken, creatureToken);

      if (canCounter && targetActor.type === "character") {
        // Floating promise so it doesn't block the Promise.all resolution for other targets
        _askCounterReaction(targetToken, creatureToken, weapon, shadows).then(async (counterAccepted) => {
          if (counterAccepted) {
            // Roll counter damage: shadows × weapon die
            const wDie = weapon.system.weaponDie || "d4";
            const counterFormula = `${shadows}${wDie}`;
            const counterRoll = new foundry.dice.Roll(counterFormula);
            await counterRoll.evaluate();

            const counterFlavor = `<div class="trespasser-chat-card">
              <h3>${game.i18n.format("TRESPASSER.Chat.Combat.CounterReaction", { name: targetToken.name })}</h3>
              <p>${game.i18n.format("TRESPASSER.Chat.Combat.CounterDamageDesc", { count: shadows, die: wDie, weapon: weapon.name })}</p>
              <div class="trp-damage-actions" data-damage="${counterRoll.total}" data-target-ids="${creatureToken?.id ?? ""}" style="display:flex;gap:6px;margin-top:8px;">
                <button class="apply-damage-btn" data-damage="${counterRoll.total}" data-target-ids="${creatureToken?.id ?? ""}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
                  <i class="fas fa-heart-broken"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.ApplyDamage")}
                </button>
              </div>
            </div>`;
            await counterRoll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: targetActor }),
              flavor: counterFlavor
            });
          }
        });
      }
    }

    return resultObj;
  });

  const resolvedResults = await Promise.all(targetPromises);

  for (const res of resolvedResults) {
    if (!res) continue;
    results.push(res);
    if (res.isHit) anyHit = true;
    if (res.sparks > maxSparks) maxSparks = res.sparks;
  }

  return { anyHit, maxSparks, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter reaction prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prompt the defender to use their counter reaction.
 * @param {Token} defenderToken
 * @param {Token} creatureToken
 * @param {Item} weapon  The defender's melee weapon
 * @param {number} shadows  Number of shadows (= counter dice)
 * @returns {Promise<boolean>}
 */
async function _askCounterReaction(defenderToken, creatureToken, weapon, shadows) {
  const wDie = weapon.system.weaponDie || "d4";
  const content = `<div class="trespasser-dialog">
    <p>${game.i18n.format("TRESPASSER.Chat.Combat.CounterPrompt", {
      defender: defenderToken.name,
      count: shadows,
      die: wDie,
      weapon: weapon.name,
      creature: creatureToken?.name ?? "?"
    })}</p>
  </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Chat.Combat.CounterReaction") },
    classes: ["trespasser", "dialog"],
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "counter",
        icon: "fas fa-shield-alt",
        label: game.i18n.localize("TRESPASSER.Global.Action.Accept"),
        default: true,
        callback: () => true
      },
      {
        action: "pass",
        icon: "fas fa-times",
        label: game.i18n.localize("TRESPASSER.Global.Action.Pass"),
        callback: () => false
      }
    ],
    rejectClose: false,
    close: () => false
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deed phase chat output
// ─────────────────────────────────────────────────────────────────────────────

export async function postDeedPhase(phaseName, phaseData, actor, item, options, sheet) {
  const pData = phaseData || {};
  let finalEffects = [];
  
  if (pData.appliedEffects) finalEffects = Array.from(pData.appliedEffects).map(e => ({...e}));

  const activeWeapons = sheet._getActiveWeapons();

  const validWeaponDeedTypes = ["melee", "missile", "versatile", "innate"];
  const isWeaponDeed = validWeaponDeedTypes.includes(item?.system?.type);

  if (pData.appliesWeaponEffects || (pData.damage && pData.damage.includes("<wd>")) || isWeaponDeed) {
    for (const weapon of activeWeapons) {
      if (!weapon) continue;
      
      // Weapon Basic Effects
      if (pData.appliesWeaponEffects && weapon.system.effects) {
        finalEffects.push(...Array.from(weapon.system.effects).map(e => ({...e})));
      }

      // Enhancement Effects: ONLY on the Spark phase
      if (phaseName === "Spark" && Array.isArray(weapon.system.enhancementEffects)) {
        finalEffects.push(...Array.from(weapon.system.enhancementEffects).map(e => ({...e})));
      }

      // Oil Effects: ONLY on the Hit phase
      if (phaseName === "Hit" && options.anyHit && Array.isArray(weapon.system.oilEffects) && weapon.system.oilEffects.length > 0) {
        finalEffects.push(...Array.from(weapon.system.oilEffects).map(e => ({...e})));
        // Consume the oil effects after applying them to the Hit phase
        weapon.update({ "system.oilEffects": [] });
      }

      if (weapon.system.properties?.fragile && options.fragileItems) options.fragileItems.add(weapon);
    }
  }

  const hasDamage      = pData.damage      && pData.damage.trim()      !== "";
  const hasDescription = pData.description && pData.description.trim() !== "";
  const hasEffects     = finalEffects.length > 0;

  if (!hasDamage && !hasEffects && !hasDescription && !options.forceOutput) return;

  const effectsHtml = await TrespasserEffectsHelper.applyEffectChat(finalEffects, actor, {
    title: options.title || phaseName,
    description: pData.description,
    renderOnly: true,
    bypassFilter: true
  });

  let flavorHtml = effectsHtml || `<div class="trespasser-chat-card"><h3>${item.name} — ${options.title || phaseName}</h3>`;
  if (!effectsHtml && hasDescription) flavorHtml += `<p><em>${pData.description}</em></p>`;
  if (options.introText) flavorHtml += `<p>${options.introText}</p>`;
  flavorHtml += `</div>`;

  if (hasDamage) {
    let parsedDamage = phaseData.damage;
    const skillDie  = actor.system.skill_die || "d6";
    let weaponDie   = "d4";

    if (activeWeapons.length > 0) {
      if (activeWeapons.length > 1) {
        const d1Str = activeWeapons[0].system.weaponDie || "d4";
        const d2Str = activeWeapons[1].system.weaponDie || "d4";
        const d1 = parseInt(String(d1Str).replace("d", "")) || 0;
        const d2 = parseInt(String(d2Str).replace("d", "")) || 0;
        weaponDie = d1 >= d2 ? d1Str : d2Str;
      } else {
        weaponDie = activeWeapons[0].system.weaponDie || "0";
      }
    }

    parsedDamage = TrespasserEffectsHelper.replacePlaceholders(parsedDamage, actor, weaponDie);
    const damageBonus = await TrespasserEffectsHelper.evaluateDamageBonus(actor, "damage_dealt", weaponDie);
    if (damageBonus !== 0) parsedDamage = `(${parsedDamage}) + ${damageBonus}`;

    let rollObj;
    try {
      rollObj = new foundry.dice.Roll(parsedDamage);
      await rollObj.evaluate();
    } catch (e) { console.error("Trespasser | Deed Damage Roll Error", e); }

    if (rollObj) {
      const targetIdAttr = options.targetIds?.length
        ? ` data-target-ids="${options.targetIds.join(",")}"`
        : "";
      const applyHealBtns = `<div class="trp-damage-actions" data-damage="${rollObj.total}"${targetIdAttr} style="display:flex;gap:6px;margin-top:8px;">
        <button class="apply-damage-btn" data-damage="${rollObj.total}"${targetIdAttr} style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
          <i class="fas fa-heart-broken"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.ApplyDamage")}
        </button>
        <button class="heal-damage-btn" data-damage="${rollObj.total}"${targetIdAttr} style="flex:1;background:var(--trp-bg-dark);border:1px solid #27ae60;color:#2ecc71;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
          <i class="fas fa-heart"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.Heal")}
        </button>
      </div>`;
      const hideCreatureRolls = game.settings.get("trespasser", "hideCreatureDamageRolls");
      const rollMode = (actor.type === "creature" && hideCreatureRolls) ? "gmroll" : "roll";
      await rollObj.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: flavorHtml + applyHealBtns
      }, { rollMode });
      return;
    }
  }

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: flavorHtml });
}

// ─────────────────────────────────────────────────────────────────────────────
// Other exports (Challenge Roll helpers used by character sheet)
// ─────────────────────────────────────────────────────────────────────────────

export async function requestCDAndRoll(roll, flavor, sheet) {
  const content = `
    <div class="form-group">
      <label>${game.i18n.localize("TRESPASSER.Dialog.SkillCheck.ChallengeDifficulty")}</label>
      <input type="number" name="roll-cd" value="10" autofocus />
    </div>`;

  const cd = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.SkillCheck.ChallengeTitle") },
    classes: ["trespasser", "dialog"],
    content,
    buttons: [
      {
        action: "roll",
        label: game.i18n.localize("TRESPASSER.Global.Action.RunCheck"),
        default: true,
        callback: (event, button) => parseInt(button.form.elements["roll-cd"].value) || 0
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  if (cd === null) return null;
  return sheet._evaluateAndShowRoll(roll, flavor, cd);
}

export async function evaluateAndShowRoll(roll, flavor, cd, sheet, options = {}) {
  await roll.evaluate();
  const total = roll.total;
  let diff  = total - cd;
  let sparks = 0, shadows = 0;

  const dieResult = roll.dice[0]?.results[0]?.result;
  const isNatural20 = dieResult === 20;
  const isNatural1 = dieResult === 1;

  if (options.isNonCombat) {
    // Determine sparks and shadows count
    if (isNatural20) {
      // Auto-success and +1 extra spark
      diff = Math.max(0, diff);
      sparks = Math.floor(diff / 5) + 1;
      shadows = 0;
    } else {
      if (diff >= 0) {
        sparks = Math.floor(diff / 5);
        shadows = 0;
      } else {
        sparks = 0;
        shadows = Math.floor(Math.abs(diff) / 5);
        if (isNatural1) shadows += 1;
      }
    }

    // Cap at 5 unique sparks/shadows
    sparks = Math.min(5, sparks);
    shadows = Math.min(5, shadows);

    let chosenSparks = [];
    let chosenShadows = [];
    let showShadowButton = false;
    const requestId = foundry.utils.randomID();

    // 1. Sparks picker (Player who rolled)
    if (sparks > 0) {
      if (game.user.isGM || sheet.actor.isOwner) {
        // Local prompt
        chosenSparks = await NonCombatSparkDialog.wait(sparks);
      } else {
        // Prompt player owning actor via socket
        chosenSparks = await NonCombatHelper.requestPlayerSparks({
          requestId,
          targetUserId: game.user.id,
          sparkCount: sparks,
          rollLabel: flavor
        });
      }
      chosenSparks = chosenSparks || [];
    }

    // 2. Shadows picker (GM)
    if (shadows > 0) {
      if (game.user.isGM) {
        // Local GM prompt
        chosenShadows = await NonCombatShadowDialog.wait(shadows);
      } else {
        // Remote GM prompt via socket
        chosenShadows = await NonCombatHelper.requestGMShadows({
          requestId,
          shadowCount: shadows,
          rollLabel: flavor
        });
      }
      
      if (!chosenShadows || chosenShadows.length === 0) {
        // Fallback: Show button for GM to pick shadows later
        showShadowButton = true;
        chosenShadows = [];
      }
    }

    // 3. Format message content
    let metrics = `<div class="non-combat-roll-details" data-request-id="${requestId}">`;
    
    if (options.isTemptFate && options.temptShadow) {
      metrics += `
        <div class="tempt-fate-shadow-results" style="margin-bottom: 5px;">
          <strong>Tempt Fate Shadow:</strong>
          <ul>
            <li><span style="color:var(--trp-shadow); font-weight:bold;"><i class="fas fa-moon"></i> ${options.temptShadow.toUpperCase()}</span></li>
          </ul>
        </div>`;
    }

    if (chosenSparks.length > 0) {
      metrics += `<div class="spark-results"><strong>Sparks:</strong><ul>`;
      for (const spark of chosenSparks) {
        metrics += `<li><span style="color:var(--trp-spark);"><i class="fas fa-sun"></i> ${spark.capitalize()}</span></li>`;
      }
      metrics += `</ul></div>`;
    }
    
    if (chosenShadows.length > 0) {
      metrics += `<div class="shadow-results"><strong>Shadows:</strong><ul>`;
      for (const shadow of chosenShadows) {
        metrics += `<li><span style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${shadow.capitalize()}</span></li>`;
      }
      metrics += `</ul></div>`;
    }

    if (showShadowButton) {
      metrics += `
        <div class="pending-shadows-warning" style="margin-top:5px;color:var(--trp-red);font-weight:bold;">
          <i class="fas fa-exclamation-triangle"></i> Pending GM Shadow Selections
        </div>
        <button type="button" class="select-non-combat-shadows-btn" data-shadow-count="${shadows}" style="margin-top:5px;width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-bg-panel);border:1px solid var(--trp-border);color:var(--trp-gold);">
          <i class="fas fa-moon"></i> Select Shadows (GM Only)
        </button>`;
    }

    metrics += `</div>`;

    // Append Tempt Fate button if failed skill check, and not already a Tempt Fate reroll
    let temptFateButton = "";
    if (options.skillKey && diff < 0 && !options.isTemptFate) {
      temptFateButton = `
        <div class="tempt-fate-container" style="margin-top:8px;">
          <button type="button" class="tempt-fate-btn" data-skill-key="${options.skillKey}" data-actor-id="${sheet.actor.id}" data-cd="${cd}" style="width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-gold);color:var(--trp-bg-dark);border:none;border-radius:4px;">
            <i class="fas fa-dice"></i> ${game.i18n.localize("TRESPASSER.Dialog.TemptFate.Tempt")}
          </button>
        </div>`;
    }

    let finalFlavor = flavor;
    if (options.isTemptFate) {
      finalFlavor = `<div class="tempt-fate-header" style="border-bottom:1px solid var(--trp-border);margin-bottom:6px;padding-bottom:4px;"><strong style="font-family:var(--trp-font-header);color:var(--trp-gold-bright);text-transform:uppercase;font-size:var(--fs-12);"><i class="fas fa-dice"></i> Tempt Fate — ${sheet.actor.name} Intervenes!</strong></div>${flavor}`;
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      flavor: `${finalFlavor}<p>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd })}</p>${metrics}${temptFateButton}`,
      flags: {
        trespasser: {
          isNonCombatRoll: true,
          isTemptFate: !!options.isTemptFate,
          temptShadow: options.temptShadow || null,
          skillKey: options.skillKey || null,
          actorId: sheet.actor.id,
          cd: cd,
          sparksCount: sparks,
          shadowsCount: shadows,
          chosenSparks,
          chosenShadows,
          showShadowButton
        }
      }
    });

    return roll;
  } else {
    // Combat / other rolls fallback (existing code)
    if (diff >= 0) sparks  = Math.floor(diff / 5);
    else           shadows = Math.floor(Math.abs(diff) / 5);

    if (dieResult === 20) sparks  += 1;
    if (dieResult === 1)  shadows += 1;

    const metrics = `
      <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
        <div class="metric spark"  style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
        <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
      </div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      flavor:  `${flavor}<p>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd })}</p>${metrics}`
    });

    return roll;
  }
}
