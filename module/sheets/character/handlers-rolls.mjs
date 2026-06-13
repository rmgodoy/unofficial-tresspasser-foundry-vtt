/**
 * Character Sheet — Roll handlers
 * Attribute roll, combat-stat roll, skill roll
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../../dialogs/tempt-fate-dialogs.mjs";
import * as NonCombatHelper from "../../helpers/non-combat-helper.mjs";

export async function onAttributeRoll(event, sheet) {
  event.preventDefault();
  const attrKey = event.currentTarget.dataset.attribute;
  let attrVal = sheet.actor.system.attributes[attrKey] ?? 0;
  let effectBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, attrKey, "use");

  // Befuddled & Sickly checks
  let plightName = "";
  if ((attrKey === "intellect" || attrKey === "spirit") && sheet.actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  } else if ((attrKey === "mighty" || attrKey === "agility") && sheet.actor.system.hasPlight?.("sickly")) {
    plightName = "Sickly";
  }

  if (plightName) {
    attrVal = 0;
    effectBonus = 0;
    const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const label   = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);

  const isAdv = TrespasserEffectsHelper.hasAdvantage(sheet.actor, attrKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    bonuses: [
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.BaseAttribute"), value: attrVal },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
    ],
    showCD: true,
    cd: 10
  }, { title: `${label} Check` });

  if (!result) return;

  let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;

  const roll   = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: sheet.actor.name, skill: label })
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: sheet.actor.name, skill: label });
  
  const cd = result.cd ?? 10;
  const rollRes = await sheet._evaluateAndShowRoll(roll, flavor, cd, { attributeKey: attrKey, isNonCombat: true });
  if (rollRes) await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: attrKey });
}

export async function onCombatStatRoll(event, sheet) {
  event.preventDefault();
  const statKey = event.currentTarget.dataset.stat;
  const statVal     = sheet.actor.system.combat[statKey] ?? 0;
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, statKey, "use");
  const baseVal     = statVal - effectBonus;
  const label       = statKey.charAt(0).toUpperCase() + statKey.slice(1);
  const isAdv       = TrespasserEffectsHelper.hasAdvantage(sheet.actor, statKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";
  const targetCD    = (statKey === "resist" || statKey === "guard") ? sheet._getAccuracyFromTarget() : null;

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: targetCD ?? 10,
    bonuses: [
      { label: game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`), value: baseVal },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
    ]
  }, { title: `${label} Check` });

  if (!result) return;

  let formula = `${diceFormula} + ${baseVal} + ${effectBonus} + ${result.modifier}`;

  const roll   = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.RollAdv", { name: sheet.actor.name, skill: label })
    : game.i18n.format("TRESPASSER.Chat.Check.Roll", { name: sheet.actor.name, skill: label });

  const finalCD = result.cd ?? 10;
  const rollRes = await sheet._evaluateAndShowRoll(roll, flavor, finalCD);
  if (rollRes) await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: statKey });
}

export async function onSkillRoll(skillKey, isTrained, sheet) {
  const actor  = sheet.actor;
  const attr   = actor.system.attributes;
  const bonuses = actor.system.bonuses;
  const skill  = actor.system.skill;
  const label  = skillKey.charAt(0).toUpperCase() + skillKey.slice(1);
  const skillBonus   = isTrained ? skill : 0;
  const trainedLabel = isTrained ? game.i18n.localize("TRESPASSER.Chat.Common.Trained") : "";

  const formatAttrBtn = (key, lbl) => {
    let base  = attr[key]    ?? 0;
    let bon   = bonuses[key] ?? 0;
    let eff   = TrespasserEffectsHelper.getAttributeBonus(actor, key, "use");

    let isSuppressed = false;
    if ((key === "intellect" || key === "spirit") && actor.system.hasPlight?.("befuddled")) {
      isSuppressed = true;
    } else if ((key === "mighty" || key === "agility") && actor.system.hasPlight?.("sickly")) {
      isSuppressed = true;
    }

    if (isSuppressed) {
      base = 0;
      bon = 0;
      eff = 0;
    }

    const total = base + bon + eff;
    return `<button class="trp-attr-btn" data-attr="${key}">${lbl} (${total})</button>`;
  };

  return new Promise((resolve) => {
    let resolved = false;

    foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("TRESPASSER.Dialog.SkillCheckTitle", { skill: label }),
        width: 400
      },
      classes: ["trespasser", "dialog"],
      content: `
        <div class="dialog-content">
          <p style="margin-bottom:12px;">
            ${game.i18n.localize("TRESPASSER.Dialog.SkillCheck.Prompt")}
            ${isTrained ? game.i18n.format("TRESPASSER.Dialog.SkillCheck.BonusHint", { skill }) : ""}
          </p>
          <div class="trp-attr-pick">
            ${formatAttrBtn("mighty",    game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty"))}
            ${formatAttrBtn("agility",   game.i18n.localize("TRESPASSER.Terms.Attribute.Agility"))}
            ${formatAttrBtn("intellect", game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect"))}
            ${formatAttrBtn("spirit",    game.i18n.localize("TRESPASSER.Terms.Attribute.Spirit"))}
          </div>
        </div>`,
      buttons: [
        {
          action: "cancel",
          label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
          callback: () => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }
        }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        el.querySelectorAll(".trp-attr-btn").forEach(btn => {
          btn.addEventListener("click", async (ev) => {
            if (resolved) return;
            resolved = true;
            const chosenAttr = ev.currentTarget.dataset.attr;
            
            // Close immediately after selection
            dialog.close();

            let attrVal    = attr[chosenAttr]    ?? 0;
            let attrBonus  = bonuses[chosenAttr] ?? 0;
            let effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, chosenAttr, "use");

            // Befuddled & Sickly checks
            let plightName = "";
            if ((chosenAttr === "intellect" || chosenAttr === "spirit") && actor.system.hasPlight?.("befuddled")) {
              plightName = "Befuddled";
            } else if ((chosenAttr === "mighty" || chosenAttr === "agility") && actor.system.hasPlight?.("sickly")) {
              plightName = "Sickly";
            }

            if (plightName) {
              attrVal = 0;
              attrBonus = 0;
              effectBonus = 0;
              const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
              ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
            }

            const isAdv      = TrespasserEffectsHelper.hasAdvantage(actor, chosenAttr);
            const diceFormula = isAdv ? "2d20kh" : "1d20";

            const rollData = {
              dice: diceFormula,
              bonuses: [
                { label: game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.capitalize()}`), value: attrVal },
                { label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: skillBonus },
                { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
              ]
            };
            if (attrBonus !== 0) rollData.bonuses.push({ label: "Permanent Bonus", value: attrBonus });

            const result = await TrespasserRollDialog.wait({
              ...rollData,
              showCD: true,
              cd: 10
            }, { title: `${label} Check` });

            if (!result) return resolve(null); // Resolve with null if roll dialog canceled

            let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
            if (attrBonus  !== 0) formula += ` + ${attrBonus}`;
            if (effectBonus !== 0) formula += ` + ${effectBonus}`;
            if (skillBonus  > 0)  formula += ` + ${skillBonus}`;

            const roll = new foundry.dice.Roll(formula);
            const flavorFull = isAdv
              ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`
              : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck",    { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`;
            
            const finalCD = result.cd ?? 10;
            const rollRes = await sheet._evaluateAndShowRoll(roll, flavorFull, finalCD, { skillKey, isNonCombat: true });
            if (rollRes) await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: chosenAttr });
            
            resolve(roll);
          });
        });
      },
      rejectClose: false
    }).then(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
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

    // Plight shadows in Dungeon Frame (non-group checks only)
    const plightShadows = [];
    const hasActiveDungeon = game.actors.some(a => a.type === "dungeon" && a.system.sessionState === "active");
    const isGroupCheck = options.isGroupCheck || sheet.actor?.type === "party";
    if (hasActiveDungeon && !isGroupCheck) {
      if (sheet.actor?.system?.hasPlight?.("clumsy")) {
        plightShadows.push("costly");
      }
      if (sheet.actor?.system?.hasPlight?.("conspicuous")) {
        plightShadows.push("loud");
      }
    }

    const promptNonCombatSparkShadow = game.settings.get("trespasser", "promptNonCombatSparkShadow");

    // 1. Sparks picker (Player who rolled)
    if (sparks > 0 && promptNonCombatSparkShadow) {
      if (game.user.isGM || sheet.actor.isOwner) {
        // Local prompt
        chosenSparks = await NonCombatSparkDialog.wait(sparks, { actor: sheet.actor });
      } else {
        // Prompt player owning actor via socket
        chosenSparks = await NonCombatHelper.requestPlayerSparks({
          requestId,
          targetUserId: game.user.id,
          sparkCount: sparks,
          rollLabel: flavor,
          actorId: sheet.actor.id
        });
      }
      chosenSparks = chosenSparks || [];
    }

    // 2. Shadows picker (GM)
    if (shadows > 0 && promptNonCombatSparkShadow) {
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

    const finalShadows = [...chosenShadows, ...plightShadows];

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

    if (!promptNonCombatSparkShadow && (sparks > 0 || shadows > 0)) {
      metrics += `
        <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
          <div class="metric spark"  style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
          <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
        </div>`;
    }

    if (chosenSparks.length > 0) {
      metrics += `<div class="spark-results"><strong>Sparks:</strong><ul>`;
      for (const spark of chosenSparks) {
        metrics += `<li><span style="color:var(--trp-spark);"><i class="fas fa-sun"></i> ${spark.capitalize()}</span></li>`;
      }
      metrics += `</ul></div>`;
    }
    
    if (finalShadows.length > 0) {
      metrics += `<div class="shadow-results"><strong>Shadows:</strong><ul>`;
      for (const shadow of finalShadows) {
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
    const isDiscouraged = sheet.actor?.system?.hasPlight?.("discouraged");
    if (options.skillKey && diff < 0 && !options.isTemptFate && !isDiscouraged) {
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
          chosenShadows: finalShadows,
          plightShadows,
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
