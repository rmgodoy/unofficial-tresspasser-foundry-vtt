import { TrespasserCombat } from "../documents/combat.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { showRetreatDialog } from "../dialogs/retreat-dialog.mjs";
import { TerrainHelper } from "../helpers/terrain-helper.mjs";
import { attemptRetreat } from "./combat-initiative.mjs";
import { SYSTEM_ID, getSystemFlag, setSystemFlag, unsetSystemFlag } from "../system-id.mjs";

/**
 * Find the correct combatant for an actor, token, tokenId, or actorId
 * in the currently active combat phase.
 * @param {Actor|Token|TokenDocument|string} target
 * @param {Combat} [combat=game.combat]
 * @returns {Combatant|null}
 */
export function getPhaseCombatant(target, combat = game.combat) {
  if (!target || !combat) return null;

  let actorId = null;
  let tokenId = null;

  if (typeof target === "string") {
    actorId = target;
    tokenId = target;
  } else if (target instanceof Actor) {
    actorId = target.id;
  } else {
    tokenId = target.id ?? target.document?.id;
    actorId = target.actor?.id ?? target.document?.actor?.id;
  }

  const matches = (c) =>
    (tokenId && c.tokenId === tokenId) ||
    (actorId && c.actorId === actorId);

  const activePhase = getSystemFlag(combat, "activePhase");

  if (activePhase !== undefined && activePhase !== null) {
    const phaseMatch = combat.combatants.find(
      c => matches(c) && Number(c.initiative) === Number(activePhase)
    );
    if (phaseMatch) return phaseMatch;
  }

  if (combat.combatant && matches(combat.combatant)) return combat.combatant;

  return combat.combatants.find(c => matches(c)) ?? null;
}

/**
 * Record that a HUD action has been used this turn for a given actor.
 * @param {Actor|string} actorOrId
 * @param {string} actionId
 * @param {Combat} [combat=game.combat]
 */
export async function recordHUDAction(actorOrId, actionId, combat = game.combat) {
  const target = typeof actorOrId === "string" ? { id: actorOrId } : actorOrId;
  const combatant = getPhaseCombatant(target, combat);
  if (!combatant) return;
  const used = new Set(getSystemFlag(combatant, "usedHUDActions") ?? []);
  used.add(actionId);
  await setSystemFlag(combatant, "usedHUDActions", [...used]);
}

/**
 * Remove a HUD action from the used actions list for a given actor.
 * @param {Actor|string} actorOrId
 * @param {string} actionId
 * @param {Combat} [combat=game.combat]
 */
export async function removeHUDAction(actorOrId, actionId, combat = game.combat) {
  const target = typeof actorOrId === "string" ? { id: actorOrId } : actorOrId;
  const combatant = getPhaseCombatant(target, combat);
  if (!combatant) return;
  const used = new Set(getSystemFlag(combatant, "usedHUDActions") ?? []);
  used.delete(actionId);
  await setSystemFlag(combatant, "usedHUDActions", [...used]);
}

/**
 * Returns the first phase (highest initiative value) that has at least one non-defeated combatant.
 * @param {Combat} combat
 * @returns {number}
 */
export function getFirstNonEmptyPhase(combat) {
  const phases = Object.values(TrespasserCombat.PHASES).sort((a, b) => b - a);
  for (const p of phases) {
    if (combat.combatants.some(c => c.initiative === p && !c.defeated)) return p;
  }
  return TrespasserCombat.PHASES.EARLY;
}

/**
 * Start combat flow and initialize focus, AP, and turn order.
 * @param {Combat} combat
 */
export async function startCombatFlow(combat) {
  if (game.user.isGM) {
    const initResults = await combat.rollAllTrespasserInitiatives();
    
    const combatantUpdates = initResults.updates;
    for (const combatant of combat.combatants) {
      if (combatant.actor?.type === "character" || combatant.actor?.type === "commoner") {
        const isDistracted = combatant.actor.system.hasPlight?.("distracted") || false;
        const skillBonus = isDistracted ? 0 : (combatant.actor.system.skill || 2);
        await combatant.actor.update({ "system.combat.focus": skillBonus });
      }
      
      let up = combatantUpdates.find(u => u._id === combatant.id);
      if (!up) {
        up = { _id: combatant.id };
        combatantUpdates.push(up);
      }
      
      up[`flags.${SYSTEM_ID}.actionPoints`] = 3;
      up[`flags.${SYSTEM_ID}.usedHUDActions`] = [];
      up[`flags.${SYSTEM_ID}.reactionCount`] = 0;
      up[`flags.${SYSTEM_ID}.aimRangeBonus`] = 0;
      if (combatant.actor) {
        await unsetSystemFlag(combatant.actor, "aimRangeBonus");
      }
    }
    
    if (combatantUpdates.length > 0) {
      await combat.updateEmbeddedDocuments("Combatant", combatantUpdates);
    }
    
    if (initResults.newCombatants.length > 0) {
      await combat.createEmbeddedDocuments("Combatant", initResults.newCombatants);
    }

    const playerFacingInit = game.settings.get(SYSTEM_ID, "playerFacingInitiative");
    const isWaiting = getSystemFlag(combat, "waitingForInitiatives");

    if (!playerFacingInit || !isWaiting) {
      const initialPhase = getFirstNonEmptyPhase(combat);
      await setSystemFlag(combat, "activePhase", initialPhase);
      await onStartOfCombat(combat);
      await onStartOfRound(combat);
      await onStartOfTurn(combat, initialPhase);
    } else {
      await onStartOfCombat(combat);
      await onStartOfRound(combat);
    }
  }
}

/**
 * Handle new round progression, re-rolls, and retreat checks.
 * @param {Combat} combat
 */
export async function nextRoundFlow(combat) {
  if (game.user.isGM) {
    const initResults = await combat.rollAllTrespasserInitiatives();
    
    const combatantUpdates = initResults.updates;
    for (const combatant of combat.combatants) {
      let up = combatantUpdates.find(u => u._id === combatant.id);
      if (!up) {
        up = { _id: combatant.id };
        combatantUpdates.push(up);
      }
      up[`flags.${SYSTEM_ID}.actionPoints`] = 3;
      up[`flags.${SYSTEM_ID}.usedHUDActions`] = [];
      up[`flags.${SYSTEM_ID}.reactionCount`] = 0;
      up[`flags.${SYSTEM_ID}.aimRangeBonus`] = 0;
      if (combatant.actor) {
        await unsetSystemFlag(combatant.actor, "aimRangeBonus");
      }
    }
    
    if (combatantUpdates.length > 0) {
      await combat.updateEmbeddedDocuments("Combatant", combatantUpdates);
    }

    if (initResults.newCombatants.length > 0) {
      await combat.createEmbeddedDocuments("Combatant", initResults.newCombatants);
    }

    const enableRetreat = game.settings.get(SYSTEM_ID, "enableRetreatDialog");
    if (enableRetreat) {
      const combatInfo = getSystemFlag(combat, "combatInfo");
      const choice = await showRetreatDialog(combatInfo);
      
      if (choice === "retreat") {
        await attemptRetreat(combat, combatInfo.enemyMaxInit);
        if (!game.combats.has(combat.id)) return combat;
        return;
      }
    }

    const playerFacingInit = game.settings.get(SYSTEM_ID, "playerFacingInitiative");
    const isWaiting = getSystemFlag(combat, "waitingForInitiatives");

    if (!playerFacingInit || !isWaiting) {
      const initialPhase = getFirstNonEmptyPhase(combat);
      await setSystemFlag(combat, "activePhase", initialPhase);
      await onStartOfRound(combat);
      await onStartOfTurn(combat, initialPhase);
    } else {
      await onStartOfRound(combat);
    }
  }
}

/**
 * Advance to the next combat phase.
 * @param {Combat} combat
 */
export async function nextPhaseFlow(combat) {
  if (!game.user.isGM) return;

  const currentPhase = getSystemFlag(combat, "activePhase") ?? TrespasserCombat.PHASES.EARLY;

  await onEndOfTurn(combat, currentPhase);

  const phases = Object.values(TrespasserCombat.PHASES).sort((a, b) => b - a);
  const currentIndex = phases.indexOf(currentPhase);

  let nextPhase = null;
  for (let i = currentIndex + 1; i < phases.length; i++) {
    const p = phases[i];
    if (combat.combatants.some(c => c.initiative === p && !c.defeated)) {
      nextPhase = p;
      break;
    }
  }

  if (nextPhase !== null) {
    await setSystemFlag(combat, "activePhase", nextPhase);
    await combat.update({ turn: 0 });
    await onStartOfTurn(combat, nextPhase);
  } else {
    await onEndOfRound(combat);
    return combat.nextRound();
  }
}

/**
 * Check if the current active phase has no combatants and auto-advance if so.
 * @param {Combat} combat
 */
export async function checkEmptyPhaseAdvanceFlow(combat) {
  if (!game.user.isGM) return;
  if (!combat.started) return;

  const isWaiting = getSystemFlag(combat, "waitingForInitiatives");
  if (isWaiting) return;

  const activePhase = getSystemFlag(combat, "activePhase");
  if (activePhase === null || activePhase === undefined) return;

  const hasOccupants = combat.combatants.some(
    c => Number(c.initiative) === Number(activePhase) && !c.defeated
  );
  if (hasOccupants) return;

  const phases = Object.values(TrespasserCombat.PHASES).sort((a, b) => b - a);
  const currentIndex = phases.indexOf(activePhase);

  let nextPhase = null;
  for (let i = currentIndex + 1; i < phases.length; i++) {
    const p = phases[i];
    if (combat.combatants.some(c => c.initiative === p && !c.defeated)) {
      nextPhase = p;
      break;
    }
  }

  if (nextPhase !== null) {
    await setSystemFlag(combat, "activePhase", nextPhase);
    await combat.update({ turn: 0 });
    await onStartOfTurn(combat, nextPhase);
  } else {
    await onEndOfRound(combat);
    return combat.nextRound();
  }
}

export async function onStartOfCombat(combat) {
  for (const c of combat.combatants) {
    if (c.actor && typeof c.actor.onCombatStart === "function") {
      await c.actor.onCombatStart(combat);
    }
  }
}

export async function onStartOfRound(combat) {
  const processedActors = new Set();
  for (const c of combat.combatants) {
    if (c.actor && !processedActors.has(c.actor.id)) {
      processedActors.add(c.actor.id);
      await TrespasserEffectsHelper.decrementRound(c.actor);
      if (typeof c.actor.onRoundStart === "function") {
        await c.actor.onRoundStart(combat);
      }
    }
  }
}

export async function onEndOfRound(combat) {
  for (const c of combat.combatants) {
    if (c.actor && typeof c.actor.onRoundEnd === "function") {
      await c.actor.onRoundEnd(combat);
    }
  }
}

export async function onStartOfTurn(combat, phase) {
  const phaseEntrants = combat.combatants.filter(c => c.initiative === phase && !c.defeated);
  for (const c of phaseEntrants) {
    if (getSystemFlag(c, "isWaitFinish")) {
      await setSystemFlag(c, "isWaitFinish", false);
      continue;
    }

    const tokenDoc = c.token;
    if (tokenDoc?.clearMovementHistory) {
      await tokenDoc.clearMovementHistory();
    }
    
    await c.update({
      [`flags.${SYSTEM_ID}.hasMovedThisTurn`]: false,
      [`flags.${SYSTEM_ID}.moveActionTaken`]: false,
      [`flags.${SYSTEM_ID}.movementAllowed`]: 0,
      [`flags.${SYSTEM_ID}.movementUsed`]: 0,
      [`flags.${SYSTEM_ID}.moveActionMovements`]: [],
      [`flags.${SYSTEM_ID}.moveActionCost`]: 0,
      [`flags.${SYSTEM_ID}.movementHistory`]: tokenDoc?.movementHistory ?? [],
      [`flags.${SYSTEM_ID}.usedExpensiveDeed`]: false,
      [`flags.${SYSTEM_ID}.usedHUDActions`]: []
    });

    if (tokenDoc) {
      await unsetSystemFlag(tokenDoc, "terrainEnteredThisTurn");
      await unsetSystemFlag(tokenDoc, "terrainSquaresVisitedThisTurn");
      await unsetSystemFlag(tokenDoc, "slipperyCheckedThisTurn");
    }

    if (c.actor && typeof c.actor.onTurnStart === "function") {
      await c.actor.onTurnStart(c);
    }

    if (tokenDoc) {
      const terrainRegions = TerrainHelper.getTerrainRegionsContainingToken(tokenDoc);
      for (const region of terrainRegions) {
        await TerrainHelper.onTokenStartTurnInTerrain(tokenDoc, region);
      }
    }
  }
}

export async function onEndOfTurn(combat, phase) {
  const currentCombatants = combat.combatants.filter(c => c.initiative === phase && !c.defeated);
  for (const c of currentCombatants) {
    await setSystemFlag(c, "actionPoints", 0);
    if (c.actor && typeof c.actor.onTurnEnd === "function") {
      await c.actor.onTurnEnd(c);
    }
  }
}
