/**
 * Character Sheet — Roll handlers
 * Attribute roll, combat-stat roll, skill roll
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";
import { evaluateAndShowRoll } from "./roll-evaluator.mjs";

export { evaluateAndShowRoll };

export async function onAttributeRoll(event, sheet) {
  event.preventDefault();
  const attrKey = event.currentTarget.dataset.attribute;
  let attrVal = sheet.actor.system.attributes[attrKey] ?? 0;
  let effectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(sheet.actor, attrKey, "use");

  // Befuddled & Sickly checks
  let plightName = "";
  if ((attrKey === "intellect" || attrKey === "spirit") && sheet.actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  } else if ((attrKey === "mighty" || attrKey === "agility") && sheet.actor.system.hasPlight?.("sickly")) {
    plightName = "Sickly";
  }

  if (plightName) {
    attrVal = 0;
    effectBonusEntry = { id: "effectBonus", label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus", value: 0, isAccordion: true, children: [] };
    const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const label   = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);

  const isAdv = TrespasserEffectsHelper.hasAdvantage(sheet.actor, attrKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    bonuses: [
      { key: "baseAttribute", label: game.i18n.localize("TRESPASSER.Dialog.Roll.BaseAttribute"), value: attrVal, toggleable: true },
      effectBonusEntry
    ],
    showCD: true,
    cd: 10,
    isNonCombat: true
  }, { title: `${label} Check` });

  if (!result) return;

  const activeBonusTotal = result.activeBonusTotal ?? (attrVal + (effectBonusEntry.value || 0));
  const formula = `${diceFormula} + ${activeBonusTotal} + ${result.modifier}`;

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
  const effectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(sheet.actor, statKey, "use");
  const baseVal     = statVal - (effectBonusEntry.value || 0);
  const label       = statKey.charAt(0).toUpperCase() + statKey.slice(1);
  const isAdv       = TrespasserEffectsHelper.hasAdvantage(sheet.actor, statKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";
  const targetCD    = (statKey === "resist" || statKey === "guard") ? sheet._getAccuracyFromTarget() : null;

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: targetCD ?? 10,
    bonuses: [
      { key: "baseStat", label: game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`), value: baseVal, toggleable: true },
      effectBonusEntry
    ]
  }, { title: `${label} Check` });

  if (!result) return;

  const activeBonusTotal = result.activeBonusTotal ?? (baseVal + (effectBonusEntry.value || 0));
  const formula = `${diceFormula} + ${activeBonusTotal} + ${result.modifier}`;

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
            let effectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(actor, chosenAttr, "use");

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
              effectBonusEntry = { id: "effectBonus", label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus", value: 0, isAccordion: true, children: [] };
              const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
              ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
            }

            const isAdv      = TrespasserEffectsHelper.hasAdvantage(actor, chosenAttr);
            const diceFormula = isAdv ? "2d20kh" : "1d20";

            const rollData = {
              dice: diceFormula,
              bonuses: [
                { key: "baseAttribute", label: game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.capitalize()}`), value: attrVal, toggleable: true },
                { key: "skillBonus", label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: skillBonus, toggleable: true }
              ]
            };
            if (attrBonus !== 0) rollData.bonuses.push({ key: "permBonus", label: game.i18n.localize("TRESPASSER.Dialog.Roll.PermanentBonus") || "Permanent Bonus", value: attrBonus, toggleable: true });
            rollData.bonuses.push(effectBonusEntry);

            const result = await TrespasserRollDialog.wait({
              ...rollData,
              showCD: true,
              cd: 10,
              isNonCombat: true
            }, { title: `${label} Check` });

            if (!result) return resolve(null); // Resolve with null if roll dialog canceled

            const activeBonusTotal = result.activeBonusTotal ?? (attrVal + attrBonus + (effectBonusEntry.value || 0) + skillBonus);
            const formula = `${diceFormula} + ${activeBonusTotal} + ${result.modifier}`;

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
