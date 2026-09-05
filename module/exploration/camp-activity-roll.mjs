import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";

/**
 * Automate a skill check for a camp activity.
 * @param {Actor} actor
 * @param {object} activityConfig
 * @param {string} activityKey
 * @param {number} dc
 * @param {number} assists
 * @returns {Promise<Roll|null>}
 */
export async function performCampRoll(actor, activityConfig, activityKey, dc, assists) {
  const { attribute, skill } = activityConfig.check;
  const attrKey = attribute;
  const skillKey = skill;
  
  let attrVal    = actor.system.attributes[attrKey]    ?? 0;
  let attrBonus  = actor.system.bonuses[attrKey] ?? 0;
  let effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, attrKey, "use");

  // Befuddled & Sickly checks
  let plightName = "";
  if ((attrKey === "intellect" || attrKey === "spirit") && actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  } else if ((attrKey === "mighty" || attrKey === "agility") && actor.system.hasPlight?.("sickly")) {
    plightName = "Sickly";
  }

  if (plightName) {
    attrVal = 0;
    attrBonus = 0;
    effectBonus = 0;
    const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, attrKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  // Check if they are trained
  const skillVal = actor.system.skill;
  const isTrained = actor.system.skills?.[skillKey] ?? false;
  const skillBonus = isTrained ? skillVal : 0;
  const trainedLabel = isTrained ? game.i18n.localize("TRESPASSER.Chat.Common.Trained") : "";

  const activityLabel = game.i18n.localize(activityConfig.label);

  const rollData = {
    dice: diceFormula,
    bonuses: [
      { label: game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`), value: attrVal },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: skillBonus },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
    ]
  };
  if (attrBonus !== 0) rollData.bonuses.push({ label: "Permanent Bonus", value: attrBonus });

  const result = await TrespasserRollDialog.wait({
    ...rollData,
    showCD: true,
    cd: dc
  }, { title: `${activityLabel} Check` });

  if (!result) return null;

  let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
  if (attrBonus !== 0) formula += ` + ${attrBonus}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (skillBonus > 0) formula += ` + ${skillBonus}`;

  const roll = new foundry.dice.Roll(formula);
  const flavorStr = game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: activityLabel });
  const flavorFull = isAdv 
    ? flavorStr.replace("Check", "Check (Advantage)") + ` (${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)} | ${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)})${trainedLabel}`
    : flavorStr + ` (${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)} | ${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)})${trainedLabel}`;

  const finalCD = result.cd ?? dc;
  
  await roll.evaluate();
  const total = roll.total;
  let diff = total - finalCD;
  let sparks = 0, shadows = 0;

  const dieResult = roll.dice[0]?.results[0]?.result;
  const isNatural20 = dieResult === 20;
  const isNatural1 = dieResult === 1;

  if (isNatural20) {
    diff = Math.max(0, diff);
    sparks = Math.floor(diff / 5) + 1;
  } else {
    if (diff >= 0) {
      sparks = Math.floor(diff / 5);
    } else {
      shadows = Math.floor(Math.abs(diff) / 5);
      if (isNatural1) shadows += 1;
    }
  }

  // Inject assists if it's a success
  if (diff >= 0 && assists > 0) {
    sparks += assists;
    ui.notifications.info(`${actor.name} gains ${assists} extra spark(s) from assists!`);
  }

  sparks = Math.min(5, sparks);
  shadows = Math.min(5, shadows);

  const flavorWithAssist = assists > 0 ? `${flavorFull}<div style="font-size: var(--fs-13);color:var(--trp-spark);margin-top:2px;">[+${assists} Assist${assists > 1 ? 's' : ''}]</div>` : flavorFull;

  const metrics = `
    <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
      <div class="metric spark"  style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
      <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
    </div>`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor:  `${flavorWithAssist}<p>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd: finalCD })}</p>${metrics}`
  });

  if (diff >= 0) {
    await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: attrKey });
  }

  return roll;
}
