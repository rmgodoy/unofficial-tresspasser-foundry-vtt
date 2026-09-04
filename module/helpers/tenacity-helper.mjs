import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";

/**
 * Helper to build the HTML for the "Roll Tenacity" button on chat cards.
 * @param {Actor}  actor
 * @param {number} negativeHp  Negative HP value (e.g. -2)
 * @returns {string}
 */
export function buildTenacityButtonHtml(actor, negativeHp) {
  if (!actor) return "";
  const cd = 10 + Math.abs(negativeHp || 0);
  const label = game.i18n.localize("TRESPASSER.Chat.Combat.RollTenacity");
  return `
    <div class="tenacity-action-row" style="margin-top: 8px;">
      <button type="button" class="roll-tenacity-btn" data-actor-id="${actor.id}" data-cd="${cd}" style="height: auto; min-height: 34px; padding: 6px 10px; line-height: 1.3; color: var(--trp-gold-bright, #e8c96b); background: var(--trp-bg-dark, #1a1714); border: 1px solid var(--trp-gold, #c9a84c); font-size: var(--fs-11); font-family: var(--trp-font-header, 'Cinzel', serif); font-weight: bold; text-align: center;">
        <i class="fas fa-shield-heart" style="color: var(--trp-gold-bright, #e8c96b);"></i> ${label} (CD ${cd})
      </button>
    </div>`;
}

/**
 * Prompts the owner or GM to roll a Tenacity check for the given actor.
 * Evaluates success/failure and outputs the full rule outcome in chat without automating actor states.
 * @param {string} actorId
 * @param {number|string} cd
 */
export async function promptTenacityRoll(actorId, cd) {
  const actor = game.actors.get(actorId) || canvas.tokens.get(actorId)?.actor;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.ActorNotFound") || "Actor not found.");
    return;
  }

  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.NotOwner") || "You do not have permission to roll for this character.");
    return;
  }

  if (actor.system.health > 0) {
    ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Combat.NoTenacityNeeded", { name: actor.name }) || `${actor.name} has above 0 HP and does not need to roll Tenacity.`);
    return;
  }

  const statKey = "tenacity";
  const statVal = actor.system.combat?.[statKey] ?? 0;
  const effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, statKey, "use");
  const baseVal = statVal - effectBonus;
  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, statKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";
  const targetCD = parseInt(cd) || 10;

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: targetCD,
    bonuses: [
      { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Tenacity"), value: baseVal },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
    ]
  }, { title: game.i18n.localize("TRESPASSER.Chat.Combat.TenacityCheck") });

  if (!result) return;

  let formula = `${diceFormula} + ${baseVal} + ${effectBonus} + ${result.modifier}`;
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const finalCD = result.cd ?? targetCD;
  const diff = roll.total - finalCD;
  const dieResult = roll.dice[0]?.results[0]?.result;
  const isNat20 = dieResult === 20;
  const isNat1 = dieResult === 1;

  let sparks = 0;
  let shadows = 0;
  let outcomeTitle = "";
  let outcomeDesc = "";
  let outcomeClass = "";

  if (diff >= 0) {
    sparks = Math.floor(diff / 5) + (isNat20 ? 1 : 0);
    shadows = 0;
    outcomeTitle = game.i18n.localize("TRESPASSER.Chat.Common.Success");
    outcomeDesc = game.i18n.localize("TRESPASSER.Chat.Combat.TenacitySuccess");
    outcomeClass = "hit-text";
  } else {
    sparks = 0;
    shadows = Math.floor(Math.abs(diff) / 5) + (isNat1 ? 1 : 0);
    outcomeClass = "miss-text";

    if (shadows === 0) {
      outcomeTitle = game.i18n.localize("TRESPASSER.Chat.Combat.TenacityScarTitle");
      outcomeDesc = game.i18n.localize("TRESPASSER.Chat.Combat.TenacityScarDesc");
    } else if (shadows === 1) {
      outcomeTitle = game.i18n.localize("TRESPASSER.Chat.Combat.TenacityInjuryTitle");
      outcomeDesc = game.i18n.localize("TRESPASSER.Chat.Combat.TenacityInjuryDesc");
    } else {
      outcomeTitle = game.i18n.localize("TRESPASSER.Chat.Combat.TenacityDeathTitle");
      outcomeDesc = game.i18n.localize("TRESPASSER.Chat.Combat.TenacityDeathDesc");
    }
  }

  let metricsHtml = "";
  if (sparks > 0 || shadows > 0) {
    metricsHtml = `
      <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
        <div class="metric spark" style="color:var(--trp-spark);"><i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: sparks })}</div>
        <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
      </div>`;
  }

  const headerTitle = game.i18n.format("TRESPASSER.Chat.Combat.TenacityCheckVs", { name: actor.name, cd: finalCD });
  const flavor = `
    <div class="trespasser-chat-card tenacity-result-card">
      <h3><i class="fas fa-shield-heart"></i> ${headerTitle}</h3>
      <p><strong>${game.i18n.localize("TRESPASSER.Chat.Common.RollTotal")}</strong> ${roll.total} (${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd: finalCD })})</p>
      <p class="${outcomeClass}" style="margin-top: 6px;"><strong>${outcomeTitle}</strong></p>
      <p style="font-size:var(--fs-12);color:var(--trp-text-dim);line-height:1.4;">${outcomeDesc}</p>
      ${metricsHtml}
    </div>`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });

  await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: "tenacity" });
}

/**
 * Registers click listeners on chat message HTML elements for Tenacity rolls.
 * @param {HTMLElement} htmlElement
 */
export function registerTenacityChatListeners(htmlElement) {
  const buttons = htmlElement.querySelectorAll(".roll-tenacity-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const actorId = btn.dataset.actorId;
      const cd = btn.dataset.cd;
      await promptTenacityRoll(actorId, cd);
    });
  });
}
