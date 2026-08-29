import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";

/**
 * Roll a companion combat stat (initiative, accuracy, guard, resist, prevail).
 * @param {Actor} actor - The companion actor
 * @param {string} stat - The stat key ("speed", "initiative", "accuracy", "guard", "resist", "prevail")
 * @param {TrespasserCompanionSheet} [sheet] - The companion sheet instance
 */
export async function onCompanionStatRoll(actor, stat, sheet) {
  if (stat === "speed") {
    return onCompanionSpeedRoll(actor);
  }

  const statVal = actor.system.combat?.[stat] ?? 0;
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, stat, "use");
  const baseVal = statVal - effectBonus;
  const statLabel = game.i18n.localize(`TRESPASSER.Sheet.Companion.${stat.charAt(0).toUpperCase() + stat.slice(1)}`) || stat;

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, stat);
  const diceFormula = isAdv ? "2d20kh" : "1d20";
  const targetCD = (stat === "resist" || stat === "guard") ? sheet?._getAccuracyFromTarget?.() : null;

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: targetCD ?? 10,
    bonuses: [
      { label: statLabel, value: baseVal },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
    ]
  }, { title: `${statLabel} Check` });

  if (!result) return;

  let formula = `${diceFormula} + ${baseVal} + ${result.modifier}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;

  const roll = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: statLabel })
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: statLabel });

  const cd = result.cd ?? 10;
  if (sheet?._evaluateAndShowRoll) {
    await sheet._evaluateAndShowRoll(roll, flavor, cd, { statKey: stat });
  } else {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    });
  }

  await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: stat });
  return roll;
}

/**
 * Roll the companion's damage die.
 * @param {Actor} actor - The companion actor
 * @param {TrespasserCompanionSheet} [sheet] - The companion sheet instance
 */
export async function onCompanionDamageRoll(actor, sheet) {
  const damageDie = actor.system.damageDie || "d6";
  const damageBonus = actor.system.bonuses?.damage ?? 0;
  const label = game.i18n.localize("TRESPASSER.Sheet.Companion.DamageDie") || "Damage Die";

  const result = await TrespasserRollDialog.wait({
    dice: damageDie,
    bonuses: [
      { label, value: 0 },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: damageBonus }
    ],
    showCD: false
  }, { title: `${actor.name} — ${label}` });

  if (!result) return;

  let formula = `${damageDie} + ${result.modifier}`;
  if (damageBonus !== 0) formula += ` + ${damageBonus}`;

  const roll = new foundry.dice.Roll(formula);
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${actor.name} — ${label}`
  });

  return roll;
}

/**
 * Display companion speed in chat.
 * @param {Actor} actor - The companion actor
 */
export async function onCompanionSpeedRoll(actor) {
  const speed = actor.system.combat?.speed ?? 5;
  const speedBonus = actor.system.combat?.speed_bonus ?? 2;
  const label = game.i18n.localize("TRESPASSER.Sheet.Companion.Speed") || "Speed";

  const content = `<div class="trespasser-chat-card">
    <h3>${actor.name}</h3>
    <p><strong>${label}:</strong> ${speed} / +${speedBonus}</p>
  </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}
