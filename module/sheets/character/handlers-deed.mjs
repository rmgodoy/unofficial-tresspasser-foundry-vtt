/**
 * Character Sheet — Deed roll handlers & skill check helpers
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { messageVisibility }         from "../../helpers/compat.mjs";
import { formatDiceIcons }           from "../../helpers/dice-icon-helper.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function onDeedRoll(event, sheet) {
  event.preventDefault();
  const el = event.currentTarget.closest("[data-item-id]");
  if (!el) return;
  const item = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  const { DeedExecutor } = await import("../../helpers/deed-executor.mjs");
  const sourceToken = sheet.token?.object || sheet.actor?.token?.object || canvas.tokens?.controlled.find(t => t.actor?.id === sheet.actor?.id) || null;
  const executor = new DeedExecutor(item, sheet.actor, { token: sourceToken });
  return await executor.execute();
}

// ─────────────────────────────────────────────────────────────────────────────
// Deed phase chat output (legacy helper)
// ─────────────────────────────────────────────────────────────────────────────

export async function postDeedPhase(phaseName, phaseData, actor, item, options = {}, sheet) {
  const pData = phaseData || {};
  let finalEffects = [];

  if (options.resolvedEffects !== undefined) {
    if (Array.isArray(options.resolvedEffects)) {
      finalEffects = Array.from(options.resolvedEffects).map(e => ({ ...e }));
    }
  } else if (pData.appliedEffects) {
    finalEffects = Array.from(pData.appliedEffects).map(e => ({ ...e }));
  }

  const activeWeapons = sheet?._getActiveWeapons ? sheet._getActiveWeapons() : [];
  const validWeaponDeedTypes = ["melee", "missile", "versatile", "innate"];
  const isWeaponDeed = validWeaponDeedTypes.includes(item?.system?.effectiveAbilityType || item?.system?.abilityType || item?.system?.type);

  if (pData.appliesWeaponEffects || (pData.damage && pData.damage.includes("<wd>")) || isWeaponDeed) {
    for (const weapon of activeWeapons) {
      if (!weapon) continue;

      if (pData.appliesWeaponEffects && weapon.system.effects) {
        finalEffects.push(...Array.from(weapon.system.effects).map(e => ({...e})));
      }

      if (phaseName === "Spark" && Array.isArray(weapon.system.enhancementEffects)) {
        finalEffects.push(...Array.from(weapon.system.enhancementEffects).map(e => ({...e})));
      }

      if (phaseName === "Hit" && options.anyHit && Array.isArray(weapon.system.oilEffects) && weapon.system.oilEffects.length > 0) {
        finalEffects.push(...Array.from(weapon.system.oilEffects).map(e => ({...e})));
        weapon.update({ "system.oilEffects": [] });
      }

      if (weapon.system.properties?.fragile && options.fragileItems) options.fragileItems.add(weapon);
    }
  }

  let targetDamage = pData.damage;
  if (options.resolvedDamage !== undefined) {
    targetDamage = options.resolvedDamage;
  }

  const hasDamage      = targetDamage && targetDamage.trim() !== "";
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
  if (!effectsHtml && hasDescription) flavorHtml += `<p><em>${formatDiceIcons(pData.description)}</em></p>`;
  if (options.introText) flavorHtml += `<p>${options.introText}</p>`;
  flavorHtml += `</div>`;

  if (hasDamage) {
    let parsedDamage = targetDamage;
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
      const mode = (actor.type === "creature" && hideCreatureRolls) ? "gm" : "public";
      await rollObj.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: flavorHtml + applyHealBtns
      }, messageVisibility(mode));
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
      <div class="metric spark"  style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
      <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
    </div>`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
    flavor:  `${flavor}<p>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd })}</p>${metrics}`
  });

  return roll;
}
