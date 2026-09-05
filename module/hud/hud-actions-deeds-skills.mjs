import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";
import { getCombatant }            from "./hud-context.mjs";

/**
 * Execute Attempt Deed action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeAttemptDeed(hud) {
  hud._deedDropdownOpen = false;
  const deedSelect = hud.element.querySelector("[name='attempt-deed-id']");
  const apSelect   = hud.element.querySelector("[name='attempt-deed-ap']");
  if (!deedSelect || !apSelect) return;

  const deedId  = deedSelect.value;
  const apSpent = parseInt(apSelect.value) || 1;
  const item    = hud._token.actor?.items.get(deedId);

  if (item && item.type === "deed") {
    const { DeedExecutor } = await import("../helpers/deed-executor.mjs");
    const executor = new DeedExecutor(item, hud._token.actor, { apSpent, token: hud._token });
    await executor.execute();
    hud._activePanel = null;
    hud.render();
    return;
  }

  const mockSheet = {
    actor: hud._token.actor,
    _askAPDialog: async () => apSpent,
    _getActiveWeapons: () => {
      const equipment = hud._token.actor.system.equipment || {};
      const ids = [equipment.main_hand, equipment.off_hand].filter(Boolean);
      return ids.map(id => hud._token.actor.items.get(id)).filter(Boolean);
    },
    _selectAmmoDialog: async (ammoItems, weaponRef) => {
      const { showAmmoDialog } = await import("../dialogs/ammo-dialog.mjs");
      return showAmmoDialog(ammoItems, weaponRef);
    },
    _postDeedPhase: async (phaseName, phaseData, actor, itm, options) => {
      const { postDeedPhase } = await import("../sheets/character/handlers-deed.mjs");
      return postDeedPhase(phaseName, phaseData, actor, itm, options ?? {}, mockSheet);
    },
    _runDepletionCheck: async (itm) => {
      const { runDepletionCheck } = await import("../sheets/character/handlers-items.mjs").catch(() => ({ runDepletionCheck: async () => {} }));
      return runDepletionCheck?.(itm, mockSheet);
    },
    render: () => hud.render()
  };

  const { onDeedRoll } = await import("../sheets/character/handlers-deed.mjs");
  const fakeEvent = {
    preventDefault: () => {},
    currentTarget: { closest: () => ({ dataset: { itemId: deedId } }) }
  };

  await onDeedRoll(fakeEvent, mockSheet);

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Use Concoction action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeUseConcoction(hud) {
  const select = hud.element.querySelector("[name='concoction-id']");
  if (!select) return;
  const itemId = select.value;
  if (!itemId) return;

  await hud._token.actor.onItemConsume(itemId);

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Interact action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeInteract(hud) {
  const costInput = hud.element.querySelector('[name="interact-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const bonus = (cost - 1) * 2;
  const bonusText = bonus > 0 ? game.i18n.format("TRESPASSER.HUD.Common.WithBonus", { bonus }) : "";

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  await TrespasserCombat.recordHUDAction(hud._token.actor, "interact");

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.InteractMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.Interact"),
      cost: cost,
      bonusText: bonusText
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Maneuver action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeManeuver(hud) {
  const costInput = hud.element.querySelector('[name="maneuver-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const usedActions = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
  let focusCost = 0;
  if (usedActions.has("attempt-deed")) {
    focusCost = 2;
  }

  const actor = hud._token.actor;
  const currentFocus = actor.system.combat?.focus ?? 0;

  if (restrictAPF && focusCost > 0 && currentFocus < focusCost) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.NotEnoughFocus", {
      name: game.i18n.localize("TRESPASSER.HUD.Action.Maneuver"),
      cost: focusCost,
      current: currentFocus
    }));
    return;
  }

  const bonus = (cost - 1) * 2;
  const focusText = focusCost > 0 ? game.i18n.format("TRESPASSER.HUD.Resource.SpentFocusMsg", { count: focusCost }) : "";

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  if (focusCost > 0) {
    await actor.update({ "system.combat.focus": Math.max(0, currentFocus - focusCost) });
  }
  await TrespasserCombat.recordHUDAction(hud._token.actor, "maneuver");

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.ManeuverMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.Maneuver"),
      cost: cost,
      focusText: focusText,
      bonus: bonus
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Smash action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeSmash(hud) {
  const costInput = hud.element.querySelector('[name="smash-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const actor = hud._token.actor;
  const baseMight = actor.system.attributes?.mighty ?? 0;
  const extraAP = cost - 1;
  const totalMight = baseMight + extraAP;

  let materialIdx = totalMight;
  if (materialIdx < 1) materialIdx = 1;
  if (materialIdx > 5) materialIdx = 5;

  const materialStr = game.i18n.localize(`TRESPASSER.HUD.SmashMaterial.${materialIdx}`);

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  await TrespasserCombat.recordHUDAction(actor, "smash");

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.SmashMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.Smash"),
      cost: cost,
      material: materialStr
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Rummage action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeRummage(hud) {
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < 1) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - 1));
  await TrespasserCombat.recordHUDAction(hud._token.actor, "rummage");

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.RummageMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.Rummage"),
      cost: 1
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Modify AP directly (GM tool).
 * @param {TrespasserTokenHUD} hud
 * @param {Event} ev
 */
export async function modifyAP(hud, ev) {
  if (!game.user.isGM) return;
  const btn = ev.target.closest("[data-delta]");
  const delta = parseInt(btn.dataset.delta) || 0;
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
  const newAP = Math.max(0, currentAP + delta);
  await combatant.setFlag("trespasser", "actionPoints", newAP);
  
  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Combat.APModified", { 
    name: hud._token.name, 
    ap: newAP 
  }));
  hud.render();
}

/**
 * Spend 1 AP directly from dot indicator.
 * @param {TrespasserTokenHUD} hud
 */
export async function onSpendAP(hud) {
  const combatant = getCombatant(hud._token);
  if (!combatant) return;
  if (!combatant.testUserPermission(game.user, "OWNER") && !game.user.isGM) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
  if (currentAP <= 0) return;

  const newAP = Math.max(0, currentAP - 1);
  await combatant.setFlag("trespasser", "actionPoints", newAP);
  hud.render();
}
