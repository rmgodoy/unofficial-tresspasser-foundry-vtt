import { TrespasserCombat } from "../../documents/combat.mjs";
import { askAPDialog } from "../../dialogs/ap-dialog.mjs";
import { getEffectiveDeedAttributes } from "../deed-behaviors/roll-accuracy.mjs";
import { getActiveWeapons } from "../../sheets/character/handlers-combat.mjs";
import { RangeHelper } from "../range-helper.mjs";

/**
 * Validate Focus and AP resources without mutating documents or deducting flags.
 * @param {DeedExecutor} executor
 * @returns {Promise<boolean>}
 */
export async function validateResources(executor) {
  if (executor.options.isSubDeed || !executor.actor) return true;

  const combatant = TrespasserCombat.getPhaseCombatant(executor.actor);
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  let apSpent = 1;
  let apBonus = 0;

  if (combatant) {
    const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    if (restrictAPF && availableAP < 1) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
      return false;
    }

    if (executor.options.apSpent !== undefined && executor.options.apSpent !== null) {
      apSpent = Math.max(1, parseInt(executor.options.apSpent) || 1);
    } else if (availableAP > 1) {
      apSpent = await askAPDialog(availableAP);
      if (apSpent === null || apSpent === undefined) return false;
    }
    apBonus = (apSpent - 1) * 2;
  }

  const usedActions = new Set(combatant?.getFlag("trespasser", "usedHUDActions") ?? []);
  const surcharge = usedActions.has("maneuver") ? 2 : 0;
  const tier = (executor.system.tier || "light").toLowerCase();
  const defaultCost = tier === "heavy" ? 2 : tier === "mighty" ? 4 : 0;
  const baseCost = executor.system.focusCost ?? defaultCost;
  const costIncrease = executor.system.focusIncrease ?? ((tier === "heavy" || tier === "mighty") ? 1 : 0);
  const currentBonusCost = executor.system.bonusCost || 0;
  const currentUses = executor.system.uses || 0;
  const totalFocusCost = baseCost + currentBonusCost + surcharge;

  if (totalFocusCost > 0) {
    const currentFocus = executor.actor.system?.combat?.focus ?? 0;
    if (restrictAPF && currentFocus < totalFocusCost) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Notification.Combat.NotEnoughFocus", {
        name: executor.item.name,
        cost: totalFocusCost,
        current: currentFocus
      }));
      return false;
    }
  }

  executor.context.apSpent = apSpent;
  executor.context.apBonus = apBonus;
  executor.context.totalFocusCost = totalFocusCost;
  executor.context.costIncrease = costIncrease;
  executor.context.currentBonusCost = currentBonusCost;
  executor.context.currentUses = currentUses;

  return true;
}

/**
 * Commit AP, Focus, and Item Uses deductions to database after successful execution.
 * @param {DeedExecutor} executor
 */
export async function commitResourceUsage(executor) {
  if (executor.options.isSubDeed || !executor.actor) return;
  const combatant = TrespasserCombat.getPhaseCombatant(executor.actor);

  if (combatant && executor.context.apSpent > 0) {
    const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    await combatant.setFlag("trespasser", "actionPoints", Math.max(0, availableAP - executor.context.apSpent));
  }

  if (executor.context.totalFocusCost > 0) {
    const currentFocus = executor.actor.system?.combat?.focus ?? 0;
    await executor.actor.update({ "system.combat.focus": Math.max(0, currentFocus - executor.context.totalFocusCost) });
  }

  if (executor.context.costIncrease > 0) {
    await executor.item.update({
      "system.uses": (executor.context.currentUses || 0) + 1,
      "system.bonusCost": (executor.context.currentBonusCost || 0) + executor.context.costIncrease
    });
  }
}

/**
 * Handle unequipped and lost status for thrown weapons used in missile deeds.
 * @param {DeedExecutor} executor
 */
export async function handleThrownWeapons(executor) {
  if (!executor.actor) return;
  const { abilityType } = getEffectiveDeedAttributes(executor.item);
  const eff = executor.context.abilityType || abilityType || executor.system?.abilityType || executor.system?.type;
  if (eff !== "missile" && eff !== "versatile") return;

  const thrown = getActiveWeapons(executor.actor).filter(w => w.type === "weapon" && w.system?.properties?.thrown && !w.system?.isThrown);
  if (!thrown.length) return;

  if (eff === "versatile" && executor.context.targets?.length) {
    const hasRanged = executor.context.targets.some(t => RangeHelper.measureDistanceSquares(executor.sourceToken, t) > 1);
    if (!hasRanged) return;
  }

  for (const weapon of thrown) {
    if (typeof executor.actor.unequipItem === "function") await executor.actor.unequipItem(weapon.id);
    else await weapon.update({ "system.equipped": false });
    await weapon.update({ "system.isThrown": true });
    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Combat.WeaponThrown", {
      actor: executor.actor.name,
      weapon: weapon.name
    }));
  }
}
