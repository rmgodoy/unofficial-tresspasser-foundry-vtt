/**
 * Character Sheet — Deed roll handlers
 * onDeedRoll       — orchestrator, called from both sheet and HUD
 * rollCharacterDeed — character targeting a creature
 * rollCreatureDeed  — creature targeting a character
 * postDeedPhase    — chat output for a single deed phase
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../../documents/combat.mjs";
import { askAPDialog }             from "../../dialogs/ap-dialog.mjs";
import { TargetingHelper }         from "../../helpers/targeting-helper.mjs";
import { askSparkDialog }          from "../../dialogs/spark-dialog.mjs";

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
  if (!isCreature) {
    const activeWeapons = sheet._getActiveWeapons();
    const isMissileDeed = item.system.type === "missile" ||
      (item.system.type === "versatile" && activeWeapons.some(w => w.system.type === "missile"));

    if (isMissileDeed) {
      for (const w of activeWeapons) {
        if (w.system.type === "missile" && w.system.needsAmmo) {
          const ammoItems = sheet.actor.items.filter(i => i.system.isAmmo);
          if (ammoItems.length === 0) {
            ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.NoAmmo"));
            return;
          }
          const selectedAmmoId = await sheet._selectAmmoDialog(ammoItems, w);
          if (!selectedAmmoId) return;
          const ammoItem   = sheet.actor.items.get(selectedAmmoId);
          const currentQty = ammoItem.system.quantity ?? 1;
          if (currentQty > 1) await ammoItem.update({ "system.quantity": currentQty - 1 });
          else await ammoItem.delete();
          ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.AmmoConsumed", { name: ammoItem.name }));
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

  if (totalCost > 0) {
    const currentFocus = sheet.actor.system.combat.focus || 0;
    const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
    if (restrictAPF && currentFocus < totalCost) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Notifications.NotEnoughFocus",
        { name: item.name, cost: totalCost, current: currentFocus }));
      return;
    }
    if (restrictAPF) {
      await sheet.actor.update({ "system.combat.focus": Math.max(0, currentFocus - totalCost) });
      
      if (surcharge > 0) {
          ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
              content: `<strong>${sheet.actor.name}</strong> ${game.i18n.format("TRESPASSER.Chat.DeedSurcharge", { count: 2 })}`
          });
      }
    }
  }

  // ── 3. Target resolution (AOE-aware) ──────────────────────────────────────
  const deed = item.system;
  let targets;
  let templateDoc = null;

  // Resolve the caster's token for AOE placement
  const sourceToken = canvas.tokens.placeables.find(t => t.actor?.id === sheet.actor.id);

  if (deed.targetType === "personal") {
    // Personal: auto-target self
    targets = sourceToken ? [sourceToken] : [];
  } else if (["blast", "close_blast", "burst", "melee_burst", "path", "close_path", "aura"]
             .includes(deed.targetType)) {
    // AOE: place template and resolve targets from grid squares
    if (!sourceToken) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTokenOnCanvas"));
      return;
    }

    const aoeResult = await TargetingHelper.placeTemplate(sheet.actor, sourceToken, deed);
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
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTargetsDefault"));
      return;
    }

    // Range validation for creature-targeted deeds (characters only)
    if (!isCreature && sourceToken) {
      const activeWeapons = sheet._getActiveWeapons();
      const rangeCheck = TargetingHelper.validateRange(targets, sourceToken, deed, activeWeapons);
      if (!rangeCheck.valid) {
        ui.notifications.warn(rangeCheck.message);
        return;
      }
    }
  }

  // ── 4. Resolve AP ─────────────────────────────────────────────────────────
  let apSpent = 1;
  let apBonus = 0;

  if (combatant) {
    const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
    if (restrictAPF && availableAP < 1) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
      return;
    }
    if (availableAP > 1 && sheet._askAPDialog) {
      apSpent = await sheet._askAPDialog(availableAP);
      if (apSpent === null) return; // cancelled
    }
    apBonus = (apSpent - 1) * 2;
  }

  // ── 5. Item bookkeeping ────────────────────────────────────────────────────
  if (["heavy", "mighty", "special"].includes(tier) && combatant) {
    await combatant.setFlag("trespasser", "usedExpensiveDeed", true);
  }
  await item.update({ "system.uses": currentUses + 1, "system.bonusCost": currentBonusCost + costIncrease });

  // ── 6. Start/Before phases + on-use-deed ──────────────────────────────────
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
    ({ anyHit, maxSparks, results } = await rollCharacterDeed(item, sheet, targets, apBonus, totalCost));
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
        content: `<div class="trespasser-chat-card"><p><strong>${sheet.actor.name}</strong> ${game.i18n.format("TRESPASSER.Chat.FocusRefund", { count: refund })}</p></div>`
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
    const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
    if (restrictAPF) {
      await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - apSpent));
    }
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
 * @returns {{ anyHit: boolean, maxSparks: number, results: Array }}
 */
async function rollCharacterDeed(item, sheet, targets, apBonus, totalFocusCost = 0) {
  const isAttack    = item.system.actionType !== "support";
  const isAdv       = TrespasserEffectsHelper.hasAdvantage(sheet.actor, "accuracy");
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, "accuracy", "use");
  const accuracy    = sheet.actor.system.combat.accuracy ?? 0;

  // Engagement penalty: -2 accuracy for missile/spell deeds when engaged and not targeting adjacent
  let engagementPenalty = 0;
  if (isAttack && ["missile", "spell"].includes(item.system.type)) {
    const sourceToken = canvas.tokens.placeables.find(t => t.actor?.id === sheet.actor.id);
    if (TargetingHelper.isEngaged(sourceToken) &&
        !TargetingHelper.isExemptFromEngagement(item.system, targets, sourceToken)) {
      engagementPenalty = -2;
    }
  }

  let formula = isAdv ? `2d20kh + ${accuracy}` : `1d20 + ${accuracy}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (apBonus     !== 0) formula += ` + ${apBonus}`;
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
    let dc = 10; // default for support deeds
    if (isAttack && targetActor) {
      const statKey = item.system.accuracyTest?.toLowerCase() || "guard";
      const baseVal = targetActor.system.combat[statKey] ?? 10;
      const effBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
      dc = baseVal + effBonus;
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

    if (targetActor) {
      resultsHtml += `
        <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${targetToken.name} <span style="font-size:10px;color:var(--trp-text-dim);">(${game.i18n.localize("TRESPASSER.Sheet.Combat." + (item.system.accuracyTest || "Guard"))}: ${dc})</span></strong>
            <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Hit") : game.i18n.localize("TRESPASSER.Chat.Miss")}</span>
          </div>
          <div style="display:flex;gap:10px;font-size:11px;">
            <span style="color:#64b5f6;">${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</span>
            <span style="color:#9575cd;">${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</span>
          </div>
        </div>`;
    } else {
      // Support deed (no target)
      resultsHtml += `
        <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
          <div style="color:#64b5f6;"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</div>
          <div style="color:#9575cd;"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</div>
        </div>`;
    }
  }

  let flavor = `<div class="trespasser-chat-card">
    <h3>${game.i18n.format("TRESPASSER.Chat.AccuracyRoll", { name: item.name })}${isAdv ? " (Adv)" : ""}</h3>
    <p><strong>${game.i18n.localize("TRESPASSER.Chat.RollTotal")}</strong> ${rollTotal} <span style="font-size:10px;color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
    ${resultsHtml}`;
  if (totalFocusCost > 0) flavor += `<p class="cost-note" style="margin-top:5px;">${game.i18n.format("TRESPASSER.Chat.SpentFocus", { count: totalFocusCost })}</p>`;
  if (apBonus > 0)        flavor += `<p class="cost-note" style="margin-top:2px;color:#2ecc71;">+${apBonus} ${game.i18n.localize("TRESPASSER.Chat.AccuracyFromAP")}</p>`;
  if (engagementPenalty !== 0) flavor += `<p class="cost-note" style="margin-top:2px;color:#e74c3c;">${game.i18n.localize("TRESPASSER.Chat.EngagementPenalty")}</p>`;
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

  let anyHit = false, maxSparks = 0, resultsHtml = "";
  const results = [];

  await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: "accuracy" });

  for (const targetToken of targets) {
    const targetActor = targetToken?.actor ?? null;
    if (!targetActor) continue;

    // Character rolls their defense stat
    const statKey     = item.system.accuracyTest?.toLowerCase() || "guard";
    const baseDefense = targetActor.system.combat[statKey] ?? 10;
    const defEffBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");

    const defFormula = `1d20 + ${baseDefense + defEffBonus}`;
    const defRoll    = new foundry.dice.Roll(defFormula);
    await defRoll.evaluate();

    await TrespasserEffectsHelper.triggerEffects(targetActor, "use", { filterTarget: statKey });

    const defTotal   = defRoll.total;
    const diceResult = defRoll.dice[0].results[0].result;

    // Creature hits if its DC >= character's defense roll
    const isHit = creatureDC >= defTotal;
    if (isHit) anyHit = true;

    const diff = creatureDC - defTotal;
    let sparks = 0, shadows = 0;
    if (isHit) {
      sparks  = Math.floor(diff / 5);
      if (diceResult === 1)  sparks  += 1; // defender nat 1 = good for attacker
    } else {
      shadows = Math.floor(Math.abs(diff) / 5);
      if (diceResult === 20) shadows += 1; // defender nat 20 = heroic dodge
    }
    // Sparks cancel Shadows
    const net = sparks - shadows;
    sparks  = Math.max(0, net);
    shadows = Math.max(0, -net);

    if (sparks > maxSparks) maxSparks = sparks;

    // Track per-target results
    results.push({
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      actorId: targetActor.id,
      isHit,
      sparks,
      shadows,
      dc: creatureDC
    });

    resultsHtml += `
      <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${targetToken.name} <span style="font-size:10px;color:var(--trp-text-dim);">(${game.i18n.localize("TRESPASSER.Chat.Defense")}: ${defTotal})</span></strong>
          <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Hit") : game.i18n.localize("TRESPASSER.Chat.Miss")}</span>
        </div>
        <div style="display:flex;gap:10px;font-size:11px;">
          <span style="color:#64b5f6;">${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</span>
          <span style="color:#9575cd;">${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</span>
        </div>
      </div>`;

    // Post the defense roll to chat
    const defFlavor = `<div class="trespasser-chat-card">
      <h3>${item.name} — ${game.i18n.localize("TRESPASSER.Chat.DefenseRoll")}</h3>
      <p><strong>${targetToken.name}</strong> ${game.i18n.localize("TRESPASSER.Chat.Rolls")} ${game.i18n.localize("TRESPASSER.Sheet.Combat." + statKey.charAt(0).toUpperCase() + statKey.slice(1))}: <strong>${defTotal}</strong> <span style="font-size:10px;color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
      <p>${game.i18n.localize("TRESPASSER.Chat.CreatureAccuracy")}: <strong>${creatureDC}</strong></p>
      <p class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;font-size:14px;text-align:center;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Hit") : game.i18n.localize("TRESPASSER.Chat.Miss")}</p>
      ${resultsHtml}
      </div>`;

    await defRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      flavor: defFlavor
    });

    // Reset resultsHtml — it was already embedded in the message above
    resultsHtml = "";

    // Counter reaction: if creature missed, defender may counter-attack
    if (!isHit && shadows > 0) {
      const creatureToken = canvas.tokens.placeables.find(t => t.actor?.id === sheet.actor.id);
      const { canCounter, weapon } = TargetingHelper.checkCounterEligibility(targetToken, creatureToken);

      if (canCounter) {
        const counterAccepted = await _askCounterReaction(
          targetToken, creatureToken, weapon, shadows
        );
        if (counterAccepted) {
          // Roll counter damage: shadows × weapon die
          const wDie = weapon.system.weaponDie || "d4";
          const counterFormula = `${shadows}${wDie}`;
          const counterRoll = new foundry.dice.Roll(counterFormula);
          await counterRoll.evaluate();

          const counterFlavor = `<div class="trespasser-chat-card">
            <h3>${game.i18n.format("TRESPASSER.Chat.CounterReaction", { name: targetToken.name })}</h3>
            <p>${game.i18n.format("TRESPASSER.Chat.CounterDamageDesc", { count: shadows, die: wDie, weapon: weapon.name })}</p>
            <div class="trp-damage-actions" data-damage="${counterRoll.total}" data-target-ids="${creatureToken?.id ?? ""}" style="display:flex;gap:6px;margin-top:8px;">
              <button class="apply-damage-btn" data-damage="${counterRoll.total}" data-target-ids="${creatureToken?.id ?? ""}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
                <i class="fas fa-heart-broken"></i> ${game.i18n.localize("TRESPASSER.Chat.Apply")} ${game.i18n.localize("TRESPASSER.Chat.DamageMessage")}
              </button>
            </div>
          </div>`;
          await counterRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            flavor: counterFlavor
          });
        }
      }
    }
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
function _askCounterReaction(defenderToken, creatureToken, weapon, shadows) {
  const wDie = weapon.system.weaponDie || "d4";
  const content = `<div class="trespasser-dialog">
    <p>${game.i18n.format("TRESPASSER.Chat.CounterPrompt", {
      defender: defenderToken.name,
      count: shadows,
      die: wDie,
      weapon: weapon.name,
      creature: creatureToken?.name ?? "?"
    })}</p>
  </div>`;

  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("TRESPASSER.Chat.CounterTitle"),
      content,
      buttons: {
        counter: {
          icon: '<i class="fas fa-shield-alt"></i>',
          label: game.i18n.localize("TRESPASSER.Chat.CounterAccept"),
          callback: () => resolve(true)
        },
        pass: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("TRESPASSER.Chat.CounterPass"),
          callback: () => resolve(false)
        }
      },
      default: "counter"
    }, {
      classes: ["trespasser", "dialog"],
      width: 380
    }).render(true);
  });
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

    // Spark Power: add extra skill dice to damage
    const powerDice = options.sparkChoices?.powerBonusDice ?? 0;
    if (powerDice > 0) {
      const sd = actor.system.skill_die || "d6";
      parsedDamage = `(${parsedDamage}) + ${powerDice}${sd}`;
    }

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
        <button class="apply-damage-btn" data-damage="${rollObj.total}"${targetIdAttr} style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
          <i class="fas fa-heart-broken"></i> Apply Damage
        </button>
        <button class="heal-damage-btn" data-damage="${rollObj.total}"${targetIdAttr} style="flex:1;background:var(--trp-bg-dark);border:1px solid #27ae60;color:#2ecc71;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
          <i class="fas fa-heart"></i> Heal
        </button>
      </div>`;
      await rollObj.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: flavorHtml + applyHealBtns
      });
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
      <label>Challenge Difficulty (CD):</label>
      <input type="number" id="roll-cd" value="10" autofocus />
    </div>`;

  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("TRESPASSER.Dialog.ChallengeCheck") || "Challenge Check",
      content,
      buttons: {
        roll: {
          label: game.i18n.localize("TRESPASSER.Sheet.Combat.Roll"),
          callback: async (html) => {
            const cd     = parseInt(html.find("#roll-cd").val()) || 0;
            const result = await sheet._evaluateAndShowRoll(roll, flavor, cd);
            resolve(result);
          }
        },
        cancel: { label: game.i18n.localize("TRESPASSER.Dialog.Cancel"), callback: () => resolve(null) }
      },
      default: "roll"
    }, { classes: ["trespasser", "dialog"] }).render(true);
  });
}

export async function evaluateAndShowRoll(roll, flavor, cd, sheet) {
  await roll.evaluate();
  const total = roll.total;
  const diff  = total - cd;
  let sparks = 0, shadows = 0;

  if (diff >= 0) sparks  = Math.floor(diff / 5);
  else           shadows = Math.floor(Math.abs(diff) / 5);

  const dieResult = roll.dice[0]?.results[0]?.result;
  if (dieResult === 20) sparks  += 1;
  if (dieResult === 1)  shadows += 1;

  const metrics = `
    <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
      <div class="metric spark"  style="color:#64b5f6;"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</div>
      <div class="metric shadow" style="color:#9575cd;"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</div>
    </div>`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
    flavor:  `${flavor}<p>${game.i18n.format("TRESPASSER.Chat.VsCD", { cd })}</p>${metrics}`
  });

  return roll;
}
