/**
 * wayfinding-helper.mjs
 * Handles Wayfinding check rolls and client-side prompt dialogs.
 */
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { evaluateAndShowRoll } from "../sheets/character/handlers-rolls.mjs";

/**
 * Perform the wayfinding check roll locally (shows TrespasserRollDialog).
 * @param {Actor} actor - The character actor rolling
 * @param {number} dc - The check DC
 * @returns {Promise<Roll|null>}
 */
export async function rollWayfindingCheck(actor, dc) {
  const chosenAttr = "intellect";
  const skillKey = "nature";

  const attr = actor.system.attributes;
  const bonuses = actor.system.bonuses;
  const skill = actor.system.skill;
  const isTrained = actor.system.skills.nature ?? false;
  const skillBonus = isTrained ? skill : 0;
  const trainedLabel = isTrained ? ` (${game.i18n.localize("TRESPASSER.Chat.Common.Trained")})` : "";
  const skillLabel = game.i18n.localize("TRESPASSER.Chat.Travel.WayfindingSkillCheck") || "Nature (Intellect)";
  const label = game.i18n.localize("TRESPASSER.Chat.Travel.WayfindingCheck") || "Wayfinding Check";

  let attrVal = attr[chosenAttr] ?? 0;
  let attrBonus = bonuses[chosenAttr] ?? 0;
  let effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, chosenAttr, "use");

  // Befuddled check
  let plightName = "";
  if (actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  }

  if (plightName) {
    attrVal = 0;
    attrBonus = 0;
    effectBonus = 0;
    const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, chosenAttr);
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
    cd: dc
  }, { title: `${label} — Nature` });

  if (!result) return null;

  let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
  if (attrBonus !== 0) formula += ` + ${attrBonus}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (skillBonus > 0) formula += ` + ${skillBonus}`;

  const roll = new foundry.dice.Roll(formula);
  const flavorFull = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`;

  const finalCD = result.cd ?? dc;
  const rollRes = await evaluateAndShowRoll(roll, flavorFull, finalCD, actor.sheet, { skillKey, isNonCombat: true });
  if (rollRes) await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: chosenAttr });

  return roll;
}

/**
 * Handle a wayfinding roll request from GM.
 * @param {object} data
 */
export async function handleWayfindingRollRequest(data) {
  const { targetActorId, targetUserId, dc } = data;

  if (targetUserId !== game.user.id) return;

  const actor = game.actors.get(targetActorId);
  if (!actor) return;

  const title = game.i18n.localize("TRESPASSER.Chat.Travel.WayfindingCheck") || "Wayfinding Check";
  const promptText = game.i18n.format("TRESPASSER.Chat.Travel.WayfindingRequestPrompt", { name: actor.name, dc }) ||
                     `${actor.name} has been chosen to roll a Wayfinding Check (Intellect | Nature) vs DC ${dc}.`;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title },
    content: `<p>${promptText}</p>`,
    yes: { label: game.i18n.localize("TRESPASSER.Terms.Party.Roll") || "Roll", icon: "fa-solid fa-dice" },
    no: { label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") },
    rejectClose: false
  });

  if (confirmed) {
    await rollWayfindingCheck(actor, dc);
  }
}
