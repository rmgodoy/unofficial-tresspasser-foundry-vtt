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
  let effectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(actor, chosenAttr, "use");

  // Befuddled check
  let plightName = "";
  if (actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  }

  if (plightName) {
    attrVal = 0;
    attrBonus = 0;
    effectBonusEntry = { id: "effectBonus", label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus", value: 0, isAccordion: true, children: [] };
    const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, chosenAttr);
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
    cd: dc
  }, { title: `${label} — Nature` });

  if (!result) return null;

  const activeBonusTotal = result.activeBonusTotal ?? (attrVal + attrBonus + (effectBonusEntry.value || 0) + skillBonus);
  const formula = `${diceFormula} + ${activeBonusTotal} + ${result.modifier}`;

  const roll = new foundry.dice.Roll(formula);
  const flavorFull = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: label }) + ` (${chosenAttr})${trainedLabel}`;

  const finalCD = result.cd ?? dc;
  if (rollRes) {
    if (typeof actor.rollSkillCheck === "function") {
      await actor.rollSkillCheck(chosenAttr, { roll, skillKey, isNonCombat: true });
    } else {
      await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: chosenAttr });
    }
  }

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
