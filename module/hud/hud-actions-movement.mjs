import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";
import { MovementOverlay }         from "../canvas/movement-overlay.mjs";
import { ForcedMovementHelper }    from "../helpers/forced-movement-helper.mjs";
import { getCombatant, getVaultRange } from "./hud-context.mjs";

/**
 * Handle panel toggling specifically for Move and Movement overlays.
 * @param {TrespasserTokenHUD} hud
 * @param {string} panelId
 * @returns {boolean} true if fast-activated and remaining panels closed
 */
export function handleMovePanelPreToggle(hud, panelId) {
  if (panelId !== "move") return false;
  const combatant = getCombatant(hud._token);
  const moveActionTaken = combatant?.getFlag("trespasser", "moveActionTaken");
  const restrictMovement = game.settings.get("trespasser", "restrictMovementAction");
  
  if (moveActionTaken && restrictMovement) {
    const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
    const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
    const pointsLeft = movementAllowed - movementUsed;
    
    if (pointsLeft > 0) {
      MovementOverlay.activateMoveMode(hud._token, pointsLeft);
      hud.element.querySelectorAll(".hud-sub-panel").forEach(p => p.classList.add("hidden"));
      hud._activePanel = null;
      return true;
    }
  }
  return false;
}

/**
 * Update Movement overlay after panel state changes.
 * @param {TrespasserTokenHUD} hud
 * @param {string} panelId
 * @param {boolean} panelNowOpen
 */
export function updateMovementOverlayForPanel(hud, panelId, panelNowOpen) {
  if (panelId === "move") {
    const restrictMovement = game.settings.get("trespasser", "restrictMovementAction");
    if (panelNowOpen && restrictMovement && hud._token) {
      const combatant = getCombatant(hud._token);
      const availableAP = combatant?.getFlag("trespasser", "actionPoints") ?? 3;
      const baseSpeed = hud._token.actor?.system.combat?.speed ?? 5;
      const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(hud._token.actor, "speed");
      const speed = baseSpeed + bonusSpeed;
      const vaultRange = getVaultRange(hud._token);
      MovementOverlay.showInformativeOverlay(hud._token, speed, vaultRange, availableAP);
    } else {
      MovementOverlay.clearInformativeOverlay();
      MovementOverlay.deactivate();
    }
  } else {
    MovementOverlay.clearInformativeOverlay();
    MovementOverlay.deactivate();
  }
}

/**
 * Execute Move action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeMove(hud) {
  const costInput = hud.element.querySelector('[name="move-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const baseSpeed = hud._token.actor?.system.combat?.speed ?? 5;
  const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(hud._token.actor, "speed");
  const speed = baseSpeed + bonusSpeed;
  const dist = speed + (cost - 1) * getVaultRange(hud._token);

  await combatant.update({
    "flags.trespasser.actionPoints": Math.max(0, currentAP - cost),
    "flags.trespasser.moveActionTaken": true,
    "flags.trespasser.movementAllowed": dist,
    "flags.trespasser.movementUsed": 0,
    "flags.trespasser.moveActionCost": cost,
    "flags.trespasser.moveActionMovements": []
  });

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: `<strong>${hud._token.name}</strong> uses <strong>Move</strong> for ${cost} AP (Speed: ${dist} sq).`
  });

  await TrespasserCombat.recordHUDAction(hud._token.actor, "move");

  const restrictMovement = game.settings.get("trespasser", "restrictMovementAction");
  if (restrictMovement) {
    MovementOverlay.activateMoveMode(hud._token, dist);
  } else {
    hud._activePanel = null;
  }

  hud.render();
}

/**
 * Undo last step of Move action.
 * @param {TrespasserTokenHUD} hud
 */
export async function undoMove(hud) {
  if (!hud._token) return;

  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const tokenDoc = hud._token.document;
  const moveActionMovements = Array.from(combatant.getFlag("trespasser", "moveActionMovements") ?? []);

  if (moveActionMovements.length === 0) return;

  const lastMove = moveActionMovements.pop();
  if (!lastMove || !lastMove.from) return;

  globalThis._trespasserUndoSet ??= new Set();
  globalThis._trespasserUndoSet.add(tokenDoc.id);

  try {
    await tokenDoc.update({ x: lastMove.from.x, y: lastMove.from.y }, { animate: false });

    if (tokenDoc.clearMovementHistory) {
      await tokenDoc.clearMovementHistory();
    }

    const currentUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
    const stepDist = lastMove.distance ?? 0;
    const newUsed = Math.max(0, currentUsed - stepDist);

    if (moveActionMovements.length === 0 && newUsed === 0) {
      const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      const cost = combatant.getFlag("trespasser", "moveActionCost") ?? 1;

      await combatant.update({
        "flags.trespasser.actionPoints": currentAP + cost,
        "flags.trespasser.moveActionTaken": false,
        "flags.trespasser.movementAllowed": 0,
        "flags.trespasser.movementUsed": 0,
        "flags.trespasser.moveActionMovements": [],
        "flags.trespasser.moveActionCost": 0
      });

      await TrespasserCombat.removeHUDAction(hud._token.actor, "move");
    } else {
      await combatant.update({
        "flags.trespasser.movementUsed": newUsed,
        "flags.trespasser.moveActionMovements": moveActionMovements
      });
    }
  } catch (e) {
    console.error("Trespasser | Error undoing Move action step:", e);
  } finally {
    globalThis._trespasserUndoSet.delete(tokenDoc.id);
  }

  hud.render();
}

/**
 * Execute Vault action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeVault(hud) {
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < 1) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const range = getVaultRange(hud._token);
  MovementOverlay.activateVaultMode(hud._token, range);

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Wait action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeWait(hud) {
  const combat = game.combat;
  if (!combat) return;

  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const activePhase = combat.getFlag("trespasser", "activePhase");
  if (activePhase !== TrespasserCombat.PHASES.EARLY) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
  const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;

  await combatant.update({
    initiative: TrespasserCombat.PHASES.LATE,
    "flags.trespasser.movementAllowed": movementAllowed - movementUsed,
    "flags.trespasser.movementUsed": 0,
    "flags.trespasser.isWaitFinish": true
  });

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.WaitMessage", {
      name: hud._token.name,
      ap: currentAP,
      move: movementAllowed - movementUsed
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute GM Force Move action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeForceMove(hud) {
  const typeSelect = hud.element.querySelector('[name="force-move-type"]');
  const distanceInput = hud.element.querySelector('[name="force-move-distance"]');
  if (!typeSelect || !distanceInput || !hud._token) return;

  const type = typeSelect.value;
  const distance = parseInt(distanceInput.value) || 0;

  if (distance > 0) {
    await ForcedMovementHelper.executeForcedMovement(
      hud._token, 
      [hud._token], 
      type, 
      distance
    );
  }

  hud._activePanel = null;
  hud.render();
}

/**
 * Modify MP directly (GM tool).
 * @param {TrespasserTokenHUD} hud
 * @param {Event} ev
 */
export async function modifyMP(hud, ev) {
  if (!game.user.isGM) return;
  const btn = ev.target.closest("[data-delta]");
  const delta = parseInt(btn.dataset.delta) || 0;
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
  const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
  const newAllowed = Math.max(movementUsed, movementAllowed + delta);
  const newRemaining = Math.max(0, newAllowed - movementUsed);

  const updates = {
    "flags.trespasser.movementAllowed": newAllowed
  };

  if (newRemaining > 0 && !combatant.getFlag("trespasser", "moveActionTaken")) {
    updates["flags.trespasser.moveActionTaken"] = true;
  } else if (newRemaining === 0 && movementUsed === 0) {
    updates["flags.trespasser.moveActionTaken"] = false;
  }

  await combatant.update(updates);

  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Combat.MPModified", { 
    name: hud._token.name, 
    mp: newRemaining 
  }));
  hud.render();
}
