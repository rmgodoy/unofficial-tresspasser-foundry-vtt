/**
 * Character Sheet — Deed roll handlers
 * onDeedRoll, postDeedPhase, requestCDAndRoll, evaluateAndShowRoll
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

export async function onDeedRoll(event, sheet) {
  event.preventDefault();
  const el = event.currentTarget.closest("[data-item-id]");
  if (!el) return;
  const item = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  // Ammo check
  const activeWeapons = sheet._getActiveWeapons();
  let ammoNeeded = false;
  let weaponRef  = null;

  const isMissileDeed = item.system.type === "missile" || (item.system.type === "versatile" && activeWeapons.some(w => w.system.type === "missile"));
  if (isMissileDeed) {
    for (const w of activeWeapons) {
      if (w.system.type === "missile" && w.system.needsAmmo) { ammoNeeded = true; weaponRef = w; break; }
    }
  }

  if (ammoNeeded) {
    const ammoItems = sheet.actor.items.filter(i => i.system.isAmmo);
    if (ammoItems.length === 0) { ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.NoAmmo")); return; }
    const selectedAmmoId = await sheet._selectAmmoDialog(ammoItems, weaponRef);
    if (!selectedAmmoId) return;
    const ammoItem   = sheet.actor.items.get(selectedAmmoId);
    const currentQty = ammoItem.system.quantity ?? 1;
    if (currentQty > 1) await ammoItem.update({ "system.quantity": currentQty - 1 });
    else await ammoItem.delete();
    ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.AmmoConsumed", { name: ammoItem.name }));
  }

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
  const totalCost        = baseCost + currentBonusCost;

  if (totalCost > 0) {
    const currentFocus = sheet.actor.system.combat.focus || 0;
    if (currentFocus < totalCost) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Notifications.NotEnoughFocus", { name: item.name, cost: totalCost, current: currentFocus }));
      return;
    }
    await sheet.actor.update({ "system.combat.focus": currentFocus - totalCost });
  }

  if (["heavy", "mighty", "special"].includes(tier)) {
    const combatant = game.combat?.combatants.find(c => c.actorId === sheet.actor.id);
    if (combatant) await combatant.setFlag("trespasser", "usedExpensiveDeed", true);
  }

  await item.update({ "system.uses": currentUses + 1, "system.bonusCost": currentBonusCost + costIncrease });

  const effects      = item.system.effects || {};
  const fragileItems = new Set();
  const phaseOptions = { fragileItems };

  await sheet._postDeedPhase("Start",  effects.start,  sheet.actor, item, phaseOptions);
  await sheet._postDeedPhase("Before", effects.before, sheet.actor, item, phaseOptions);

  // Trigger on-use-deed
  await TrespasserEffectsHelper.triggerEffects(sheet.actor, "on-use-deed");

  // Accuracy roll
  const isAdv    = TrespasserEffectsHelper.hasAdvantage(sheet.actor, "accuracy");
  const accuracy = sheet.actor.system.combat.accuracy ?? 0;
  const formula  = isAdv ? `2d20kh + ${accuracy}` : `1d20 + ${accuracy}`;
  const accRoll  = new foundry.dice.Roll(formula);
  await accRoll.evaluate();

  const rollTotal  = accRoll.total;
  const diceResult = accRoll.dice[0].results[0].result;
  const targets    = Array.from(game.user.targets);

  if (targets.length === 0 && item.system.target === "1 Creature") {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTargetsDefault"));
  }

  const targetList = targets.length > 0 ? targets : [null];
  let maxSparks = 0, anyHit = false, resultsHtml = "";

  for (const targetToken of targetList) {
    const targetActor = targetToken?.actor;
    let targetValue = targetActor?.system?.combat?.guard ?? 10;

    if (targetActor) {
      const statKey = item.system.accuracyTest?.toLowerCase() || "guard";
      targetValue = targetActor.system.combat[statKey] ?? 10;
      await TrespasserEffectsHelper.triggerEffects(targetActor, "targeted");
      await TrespasserEffectsHelper.triggerEffects(targetActor, "on-targeted-deed");
    }

    const isHit = rollTotal >= targetValue;
    if (isHit) {
      anyHit = true;
      if (targetActor) {
        await TrespasserEffectsHelper.triggerEffects(targetActor, "on-deed-hit-received");
        await TrespasserEffectsHelper.triggerEffects(sheet.actor, "on-deed-hit");
      }
    } else {
      if (targetActor) {
        await TrespasserEffectsHelper.triggerEffects(targetActor, "on-deed-miss-received");
        await TrespasserEffectsHelper.triggerEffects(sheet.actor, "on-deed-miss");
      }
    }

    const diff    = rollTotal - targetValue;
    let sparks = 0, shadows = 0;
    if (diff >= 0) sparks  = Math.floor(diff / 5);
    else           shadows = Math.floor(Math.abs(diff) / 5);
    if (diceResult === 20) sparks  += 1;
    if (diceResult === 1)  shadows += 1;
    if (sparks > maxSparks) maxSparks = sparks;

    if (targetActor) {
      resultsHtml += `
        <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${targetToken.name}</strong>
            <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Hit") : game.i18n.localize("TRESPASSER.Chat.Miss")}</span>
          </div>
          <div style="display:flex;gap:10px;font-size:11px;">
            <span style="color:#64b5f6;">${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</span>
            <span style="color:#9575cd;">${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</span>
          </div>
        </div>`;
    } else {
      resultsHtml += `
        <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
          <div class="metric spark"  style="color:#64b5f6;"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</div>
          <div class="metric shadow" style="color:#9575cd;"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</div>
        </div>`;
    }
  }

  let accFlavor = `<div class="trespasser-chat-card">
    <h3>${game.i18n.format("TRESPASSER.Chat.AccuracyRoll", { name: item.name })}${isAdv ? game.i18n.localize("TRESPASSER.Chat.RollAdv").replace("{name} — {skill} Roll", "") : ""}</h3>
    <p><strong>${game.i18n.localize("TRESPASSER.Chat.RollTotal")}</strong> ${rollTotal} <span style="font-size:10px;color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
    ${resultsHtml}`;
  if (totalCost > 0) accFlavor += `<p class="cost-note" style="margin-top:5px;">${game.i18n.format("TRESPASSER.Chat.SpentFocus", { count: totalCost })}</p>`;
  accFlavor += `</div>`;

  await accRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor: accFlavor });

  if (anyHit || targets.length === 0) {
    await sheet._postDeedPhase("Base", effects.base, sheet.actor, item, phaseOptions);
    await sheet._postDeedPhase("Hit",  effects.hit,  sheet.actor, item, phaseOptions);
    if (maxSparks > 0) {
      await sheet._postDeedPhase("Spark", effects.spark, sheet.actor, item, {
        ...phaseOptions, title: maxSparks > 1 ? `Spark (x${maxSparks})` : "Spark"
      });
    }
  }

  await sheet._postDeedPhase("After", effects.after, sheet.actor, item, phaseOptions);
  await sheet._postDeedPhase("End",   effects.end,   sheet.actor, item, phaseOptions);

  for (const weapon of fragileItems) await sheet._runDepletionCheck(weapon);
}

export async function postDeedPhase(phaseName, phaseData, actor, item, options, sheet) {
  if (!phaseData) return;

  let finalEffects = [];
  if (phaseData.appliedEffects) finalEffects = Array.from(phaseData.appliedEffects).map(e => ({...e}));

  const activeWeapons = sheet._getActiveWeapons();

  if (phaseData.appliesWeaponEffects || (phaseData.damage && phaseData.damage.includes("<wd>"))) {
    for (const weapon of activeWeapons) {
      if (!weapon) continue;
      if (phaseData.appliesWeaponEffects && weapon.system.effects) {
        finalEffects.push(...Array.from(weapon.system.effects).map(e => ({...e})));
      }
      if (weapon.system.properties?.fragile && options.fragileItems) options.fragileItems.add(weapon);
    }
  }

  const activeOnlyEffects = [];
  for (const eff of finalEffects) {
    const source = await fromUuid(eff.uuid);
    if (["effect", "state"].includes(source?.type) && source.system.type === "passive") continue;
    activeOnlyEffects.push(eff);
  }
  finalEffects = activeOnlyEffects;

  const hasDamage      = phaseData.damage      && phaseData.damage.trim()      !== "";
  const hasEffects     = finalEffects.length > 0;
  const hasDescription = phaseData.description && phaseData.description.trim() !== "";
  const title          = options.title || phaseName;

  if (!hasDamage && !hasEffects && !hasDescription && !options.forceOutput) return;

  let flavorHtml = `<div class="trespasser-chat-card"><h3>${item.name} — ${title}</h3>`;
  if (options.introText)  flavorHtml += `<p>${options.introText}</p>`;
  if (hasDescription)     flavorHtml += `<p><em>${phaseData.description}</em></p>`;

  if (hasEffects) {
    flavorHtml += `<div class="applied-effects"><strong>${game.i18n.localize("TRESPASSER.Chat.EffectsStates")}</strong>`;
    for (const eff of finalEffects) {
      const intensity  = parseInt(eff.intensity) ?? 1;
      const nameLabel  = intensity !== 0 ? `${eff.name} ${intensity}` : eff.name;
      flavorHtml += `<a class="apply-effect-btn" data-uuid="${eff.uuid}" data-intensity="${intensity}">
        <img src="${eff.img}" width="20" height="20" /><span>${nameLabel}</span><i class="fas fa-hand-sparkles"></i>
      </a>`;
    }
    flavorHtml += `</div>`;
  }
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

    // Damage Dealt bonus from active effects — rolled async so dice expressions and <sd>/<wd> are resolved
    const damageBonus = await TrespasserEffectsHelper.evaluateDamageBonus(actor, "damage_dealt", weaponDie);
    if (damageBonus !== 0) parsedDamage = `(${parsedDamage}) + ${damageBonus}`;

    let rollObj;
    try {
      rollObj = new foundry.dice.Roll(parsedDamage);
      await rollObj.evaluate();
    } catch (e) { console.error("Trespasser | Deed Damage Roll Error", e); }

    if (rollObj) {
      // Add apply/heal buttons to the flavor HTML
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
