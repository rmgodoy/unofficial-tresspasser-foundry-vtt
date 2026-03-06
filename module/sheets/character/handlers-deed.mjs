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
    if (currentFocus < totalCost) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Notifications.NotEnoughFocus",
        { name: item.name, cost: totalCost, current: currentFocus }));
      return;
    }
    await sheet.actor.update({ "system.combat.focus": currentFocus - totalCost });
    
    if (surcharge > 0) {
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
            content: `<strong>${sheet.actor.name}</strong> ${game.i18n.format("TRESPASSER.Chat.SpentFocusMsg", { count: 2 })} to use a Deed after a Maneuver.`
        });
    }
  }

  // ── 3. Target check (attack deeds only) ───────────────────────────────────
  const targets = Array.from(game.user.targets);
  if (isAttack && targets.length === 0) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTargetsDefault"));
    return;
  }

  // ── 4. Resolve AP ─────────────────────────────────────────────────────────
  let apSpent = 1;
  let apBonus = 0;

  if (combatant) {
    const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    if (availableAP < 1) {
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
  let anyHit = false, maxSparks = 0;

  if (isCreature) {
    ({ anyHit, maxSparks } = await rollCreatureDeed(item, sheet, targets, apBonus));
  } else {
    ({ anyHit, maxSparks } = await rollCharacterDeed(item, sheet, targets, apBonus, totalCost));
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

  // ── 10. Spend AP + record action ──────────────────────────────────────────
  if (combatant) {
    const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - apSpent));
    await TrespasserCombat.recordHUDAction(sheet.actor, "attempt-deed");
  }

  // ── 11. After/End phases + depletion ──────────────────────────────────────
  if (anyHit || !isAttack || targets.length === 0) {
    const commonOptions = { ...phaseOptions, anyHit, maxSparks };
    await sheet._postDeedPhase("Base", effects.base, sheet.actor, item, commonOptions);
    await sheet._postDeedPhase("Hit",  effects.hit,  sheet.actor, item, commonOptions);
    if (maxSparks > 0) {
      await sheet._postDeedPhase("Spark", effects.spark, sheet.actor, item, {
        ...commonOptions, title: maxSparks > 1 ? `Spark (x${maxSparks})` : "Spark"
      });
    }
  }

  const finalOptions = { ...phaseOptions, anyHit, maxSparks };
  await sheet._postDeedPhase("After", effects.after, sheet.actor, item, finalOptions);
  await sheet._postDeedPhase("End",   effects.end,   sheet.actor, item, finalOptions);

  if (!isCreature) {
    for (const weapon of fragileItems) await sheet._runDepletionCheck(weapon);
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
 * @returns {{ anyHit: boolean, maxSparks: number }}
 */
async function rollCharacterDeed(item, sheet, targets, apBonus, totalFocusCost = 0) {
  const isAttack    = item.system.actionType !== "support";
  const isAdv       = TrespasserEffectsHelper.hasAdvantage(sheet.actor, "accuracy");
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, "accuracy", "use");
  const accuracy    = sheet.actor.system.combat.accuracy ?? 0;

  let formula = isAdv ? `2d20kh + ${accuracy}` : `1d20 + ${accuracy}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (apBonus     !== 0) formula += ` + ${apBonus}`;

  const accRoll  = new foundry.dice.Roll(formula);
  await accRoll.evaluate();
  const rollTotal  = accRoll.total;
  const diceResult = accRoll.dice[0].results[0].result;

  // Trigger accuracy "use" effects
  await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: "accuracy" });

  let anyHit = false, maxSparks = 0, resultsHtml = "";

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

    const isHit = rollTotal >= dc;
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
  flavor += `</div>`;

  await accRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });

  return { anyHit, maxSparks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creature → Character deed roll (defense roll mechanic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Item}   item
 * @param {ActorSheet} sheet
 * @param {Token[]} targets
 * @param {number} apBonus
 * @returns {{ anyHit: boolean, maxSparks: number }}
 */
async function rollCreatureDeed(item, sheet, targets, apBonus) {
  const isAttack = item.system.actionType !== "support";

  // Support deeds: just post phases, no roll
  if (!isAttack) {
    return { anyHit: true, maxSparks: 0 };
  }

  // Creature's accuracy DC
  const creatureEffBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, "accuracy", "use");
  const creatureAccuracy = sheet.actor.system.combat.accuracy ?? 0;
  const creatureDC       = creatureAccuracy + creatureEffBonus + apBonus;

  let anyHit = false, maxSparks = 0, resultsHtml = "";

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
  }

  return { anyHit, maxSparks };
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
      const applyHealBtns = `<div class="trp-damage-actions" data-damage="${rollObj.total}" style="display:flex;gap:6px;margin-top:8px;">
        <button class="apply-damage-btn" data-damage="${rollObj.total}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
          <i class="fas fa-heart-broken"></i> Apply Damage
        </button>
        <button class="heal-damage-btn" data-damage="${rollObj.total}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #27ae60;color:#2ecc71;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
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
