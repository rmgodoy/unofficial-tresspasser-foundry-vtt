import { MovementHelper } from "../../helpers/movement-helper.mjs";
import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

// Token IDs currently undergoing a Trespasser undo or movement overlay animation — used to bypass movement hooks
globalThis._trespasserUndoSet = new Set();
globalThis._trespasserOverlaySet = new Set();

/**
 * Calculate total distance moved from native token document movement history.
 * @param {TokenDocument} tokenDoc
 * @returns {number}
 */
export function calculateTokenMovementDistance(tokenDoc) {
  const history = tokenDoc.movementHistory;
  if (!history || history.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 0; i < history.length - 1; i++) {
    const start = history[i];
    const end = history[i + 1];
    const distRaw = canvas.grid.measurePath([start, end]).distance;
    totalDistance += Math.round(distRaw / canvas.dimensions.distance);
  }
  return totalDistance;
}

/**
 * Register combat token movement validation and tracking hooks.
 */
export function registerTokenMovementHooks() {
  Hooks.on("preUpdateToken", (tokenDoc, changed, options, userId) => {
    // Only enforce if position changes
    if (changed.x === undefined && changed.y === undefined) return;
    // Bypass enforcement for undo operations or movement overlay path animations
    if (globalThis._trespasserUndoSet.has(tokenDoc.id) || globalThis._trespasserOverlaySet.has(tokenDoc.id)) return;
    if (!game.combat || !game.combat.active || !game.combat.started) return;
    
    const combatant = game.combat.combatants.find(c => c.tokenId === tokenDoc.id);
    if (!combatant) return;

    const activePhase = game.combat.getFlag("trespasser", "activePhase");
    
    // If it's not this token's phase, block non-GMs; GM repositioning is allowed but not tracked
    if (combatant.initiative !== activePhase) {
      const allowOutOfTurn = game.settings.get("trespasser", "allowOutOfTurnMovement");
      if (!game.user.isGM && !allowOutOfTurn) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotYourPhase"));
        return false;
      }
      return;
    }

    // Calculate distance of the proposed move
    const start = { x: tokenDoc.x, y: tokenDoc.y };
    const end = { x: changed.x ?? tokenDoc.x, y: changed.y ?? tokenDoc.y };
    const distRaw = canvas.grid.measurePath([start, end]).distance;
    const dist = Math.round(distRaw / canvas.dimensions.distance);

    // Bypass Move Action checks for free/independent movements
    if (MovementHelper.isFreeMovementActive(options)) {
      return;
    }

    // GMs bypass the action/limit checks if Move action was taken or restrictMovement setting is false
    const restrictMovement = game.settings.get("trespasser", "restrictMovementAction");
    const moveActionTaken = combatant.getFlag("trespasser", "moveActionTaken") ?? false;
    if (!restrictMovement || (game.user.isGM && moveActionTaken)) {
      options.trespasserTrack = true;
      options.trespasserMoveDist = dist;
      options.trespasserFrom = start;
      options.trespasserTo = end;
      return;
    }

    if (!moveActionTaken) {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.MoveActionRequired"));
        return false;
      }
      return;
    }

    const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
    const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
    const isVaulting = combatant.getFlag("trespasser", "isVaulting") ?? false;

    if (isVaulting) {
      const startPos = combatant.getFlag("trespasser", "vaultStartPos") || start;
      const dx = end.x - startPos.x;
      const dy = end.y - startPos.y;
      const isStraight = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
      
      if (!isStraight) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.VaultStraightLine"));
        return false;
      }
    }

    if ((movementUsed + dist) > movementAllowed) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.MovementLimitExceeded"));
      return false;
    }

    options.trespasserTrack = true;
    options.trespasserMoveDist = dist;
    options.trespasserFrom = start;
    options.trespasserTo = end;
    options.trespasserIsFirstMove = (movementUsed === 0);
  });

  Hooks.on("updateToken", async (tokenDoc, changed, options, userId) => {
    if (game.user.id !== userId) return;
    
    // Sync token name back to actor name if it's unlinked
    if (changed.name && !tokenDoc.isLinked && tokenDoc.actor) {
      if (tokenDoc.actor.name !== changed.name) {
        await tokenDoc.actor.update({ name: changed.name });
      }
    }

    // Sync token texture back to actor img if it's unlinked and updated directly
    if (changed.texture?.src && !tokenDoc.isLinked && tokenDoc.actor) {
      if (tokenDoc.actor.img !== changed.texture.src) {
        await tokenDoc.actor.update({ img: changed.texture.src });
      }
    }

    // Only position changes from here on
    if (changed.x === undefined && changed.y === undefined) return;
    if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
    if (globalThis._trespasserOverlaySet?.has(tokenDoc.id)) return;
    if (!game.combat || !game.combat.active || !game.combat.started) return;

    const combatant = game.combat.combatants.find(c => c.tokenId === tokenDoc.id);
    if (!combatant) return;

    const activePhase = game.combat.getFlag("trespasser", "activePhase");
    if (combatant.initiative !== activePhase) return;

    if (options.trespasserTrack) {
      const dist = options.trespasserMoveDist || 0;
      const currentUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
      const newUsed = currentUsed + dist;
      const moveActionMovements = Array.from(combatant.getFlag("trespasser", "moveActionMovements") ?? []);

      if (options.trespasserFrom && options.trespasserTo) {
        moveActionMovements.push({
          from: options.trespasserFrom,
          to: options.trespasserTo,
          distance: dist
        });
      }

      await combatant.update({
        "flags.trespasser.movementUsed": newUsed,
        "flags.trespasser.moveActionMovements": moveActionMovements,
        "flags.trespasser.movementHistory": tokenDoc.movementHistory,
        "flags.trespasser.hasMovedThisTurn": true,
        "flags.trespasser.isVaulting": false
      });

      if (combatant.actor) {
        if (options.trespasserIsFirstMove && dist > 0) {
          await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-first-move");
        }

        for (let i = 0; i < dist; i++) {
          await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-move");
        }
      }
    } else {
      await combatant.update({
        "flags.trespasser.moveActionMovements": [],
        "flags.trespasser.movementHistory": tokenDoc.movementHistory,
        "flags.trespasser.hasMovedThisTurn": true,
        "flags.trespasser.isVaulting": false
      });
    }

    // Re-render the HUD so the Undo button appears immediately after moving
    game.trespasser?.tokenHUD?.render();
  });
}
