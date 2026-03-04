/**
 * Character Sheet — Roll handlers
 * Attribute roll, combat-stat roll, skill roll
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

export async function onAttributeRoll(event, sheet) {
  event.preventDefault();
  const attrKey = event.currentTarget.dataset.attribute;
  const attrVal = sheet.actor.system.attributes[attrKey] ?? 0;
  const bonus   = sheet.actor.system.bonuses[attrKey] ?? 0;
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, attrKey, "use");
  const label   = game.i18n.localize(`TRESPASSER.Sheet.Attributes.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);

  const isAdv = TrespasserEffectsHelper.hasAdvantage(sheet.actor, attrKey);
  let formula = isAdv ? `2d20kh + ${attrVal}` : `1d20 + ${attrVal}`;
  if (bonus !== 0) formula += ` + ${bonus}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;

  const roll   = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.SkillCheckAdv", { name: sheet.actor.name, skill: label })
    : game.i18n.format("TRESPASSER.Chat.SkillCheck", { name: sheet.actor.name, skill: label });
  
  const result = await sheet._requestCDAndRoll(roll, flavor);
  if (result) await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: attrKey });
}

export async function onCombatStatRoll(event, sheet) {
  event.preventDefault();
  const statKey = event.currentTarget.dataset.stat;
  const statVal = sheet.actor.system.combat[statKey] ?? 0;
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(sheet.actor, statKey, "use");
  const label   = statKey.charAt(0).toUpperCase() + statKey.slice(1);
  const isAdv   = TrespasserEffectsHelper.hasAdvantage(sheet.actor, statKey);
  
  let formula = isAdv ? `2d20kh + ${statVal}` : `1d20 + ${statVal}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;

  const roll   = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.RollAdv", { name: sheet.actor.name, skill: label })
    : game.i18n.format("TRESPASSER.Chat.Roll", { name: sheet.actor.name, skill: label });

  if (statKey === "resist" || statKey === "guard") {
    const targetCD = sheet._getAccuracyFromTarget();
    if (targetCD !== null) {
      const result = await sheet._evaluateAndShowRoll(roll, flavor, targetCD);
      if (result) await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: statKey });
      return;
    }
  }

  const result = await sheet._requestCDAndRoll(roll, flavor);
  if (result) await TrespasserEffectsHelper.triggerEffects(sheet.actor, "use", { filterTarget: statKey });
}

export async function onSkillRoll(skillKey, isTrained, sheet) {
  const actor  = sheet.actor;
  const attr   = actor.system.attributes;
  const bonuses = actor.system.bonuses;
  const skill  = actor.system.skill;
  const label  = skillKey.charAt(0).toUpperCase() + skillKey.slice(1);
  const skillBonus   = isTrained ? skill : 0;
  const trainedLabel = isTrained ? game.i18n.localize("TRESPASSER.Chat.Trained") : "";

  const formatAttrBtn = (key, lbl) => {
    const base  = attr[key]    ?? 0;
    const bon   = bonuses[key] ?? 0;
    const eff   = TrespasserEffectsHelper.getAttributeBonus(actor, key, "use");
    const total = base + bon + eff;
    return `<button class="trp-attr-btn" data-attr="${key}">${lbl} (${total})</button>`;
  };

  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.format("TRESPASSER.Dialog.SkillCheckTitle", { skill: label }),
      content: `
        <div class="dialog-content">
          <p style="margin-bottom:12px;">
            ${game.i18n.localize("TRESPASSER.Dialog.SkillCheckQ")}
            ${isTrained ? `<em>${game.i18n.format("TRESPASSER.Dialog.SkillCheckBonus", { skill })}</em>` : ""}
          </p>
          <div class="trp-attr-pick">
            ${formatAttrBtn("mighty",    game.i18n.localize("TRESPASSER.Sheet.Attributes.Mighty"))}
            ${formatAttrBtn("agility",   game.i18n.localize("TRESPASSER.Sheet.Attributes.Agility"))}
            ${formatAttrBtn("intellect", game.i18n.localize("TRESPASSER.Sheet.Attributes.Intellect"))}
            ${formatAttrBtn("spirit",    game.i18n.localize("TRESPASSER.Sheet.Attributes.Spirit"))}
          </div>
        </div>`,
      buttons: { cancel: { label: game.i18n.localize("TRESPASSER.Dialog.Cancel"), callback: () => resolve(null) } },
      default: "cancel",
      render: (html) => {
        html.find(".trp-attr-btn").on("click", async (ev) => {
          const chosenAttr = ev.currentTarget.dataset.attr;
          const attrVal    = attr[chosenAttr]    ?? 0;
          const attrBonus  = bonuses[chosenAttr] ?? 0;
          const effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, chosenAttr, "use");
          const isAdv      = TrespasserEffectsHelper.hasAdvantage(actor, chosenAttr);

          let formula = isAdv ? `2d20kh + ${attrVal}` : `1d20 + ${attrVal}`;
          if (attrBonus  !== 0) formula += ` + ${attrBonus}`;
          if (effectBonus !== 0) formula += ` + ${effectBonus}`;
          if (skillBonus  > 0)  formula += ` + ${skillBonus}`;

          const roll = new foundry.dice.Roll(formula);
          const flavorFull = isAdv
            ? game.i18n.format("TRESPASSER.Chat.SkillCheckAdv", { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`
            : game.i18n.format("TRESPASSER.Chat.SkillCheck",    { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`;
          
          const result = await sheet._requestCDAndRoll(roll, flavorFull);
          if (result) await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: chosenAttr });
          
          html.closest(".app").find(".header-button.close").trigger("click");
          resolve(roll);
        });
      },
    }, { classes: ["trespasser", "dialog"] }).render(true);
  });
}
