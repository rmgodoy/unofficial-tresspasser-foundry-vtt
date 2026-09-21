import { isPointInRegion, getGridPath, getTerrainRegionsContainingToken } from "./terrain-geometry.mjs";
import {
  buildBehaviorContext,
  executeBehavior,
  handleSlipperyCheck,
  resolveIntPlaceholder,
  evaluateIntensityValue
} from "./terrain-behaviors.mjs";
import {
  syncWhileInsideEffectsForToken,
  syncWhileInsideEffectsForRegion
} from "./terrain-effects-sync.mjs";
import { applyTerrainDamageAndEffects, postMovementSummary } from "./terrain-hazard.mjs";
import { isSunken } from "../helpers/elevation-helper.mjs";
import { SYSTEM_ID, getSystemFlag, setSystemFlag, unsetSystemFlag } from "../system-id.mjs";

export const movementQueues = new Map();
let debounceMovementProcess = null;

/**
 * Enqueue a movement segment and debounce its processing.
 * @param {TokenDocument} tokenDoc 
 * @param {number} oldX 
 * @param {number} oldY 
 * @param {number} newX 
 * @param {number} newY 
 * @param {boolean} [isJump=false]
 */
export async function processTokenMovement(tokenDoc, oldX, oldY, newX, newY, isJump = false) {
  const scene = tokenDoc.parent;
  if (!scene || !canvas.ready) return;

  if (!movementQueues.has(tokenDoc.id)) {
    movementQueues.set(tokenDoc.id, []);
  }
  movementQueues.get(tokenDoc.id).push({ oldX, oldY, newX, newY, isJump });

  if (!debounceMovementProcess) {
    debounceMovementProcess = foundry.utils.debounce(() => processQueuedMovements(), 250);
  }
  debounceMovementProcess();
}

/**
 * Process all debounced queued movements.
 */
export async function processQueuedMovements() {
  for (const [tokenId, segments] of movementQueues.entries()) {
    if (segments.length === 0) continue;
    
    const tokenDoc = canvas.scene?.tokens.get(tokenId) || game.scenes.active?.tokens.get(tokenId);
    if (!tokenDoc) continue;

    await calculateBatchedMovement(tokenDoc, segments);
  }
  movementQueues.clear();
}

/**
 * Traces the full grid path across all accumulated segments,
 * then batches terrain damage per region and applies it in one update.
 * @param {TokenDocument} tokenDoc 
 * @param {Array<{oldX, oldY, newX, newY, isJump}>} segments 
 */
export async function calculateBatchedMovement(tokenDoc, segments) {
  if (!tokenDoc.isOwner && !game.user.isGM) return;
  const scene = tokenDoc.parent || canvas.scene;
  if (!scene) return;

  const actor = tokenDoc.actor;
  if (!actor) return;

  const gridSize = scene.grid.size;
  const tokenW = (tokenDoc.width || 1) * gridSize;
  const tokenH = (tokenDoc.height || 1) * gridSize;

  const isTokenSunken = isSunken(tokenDoc);

  const fullPath = [];
  const isBatchedJump = segments.some(seg => seg.isJump);

  if (isBatchedJump) {
    const lastSeg = segments[segments.length - 1];
    const newGridX = Math.floor((lastSeg.newX + tokenW / 2) / gridSize);
    const newGridY = Math.floor((lastSeg.newY + tokenH / 2) / gridSize);
    fullPath.push({ x: newGridX, y: newGridY });
  } else {
    for (const seg of segments) {
      const oldGridX = Math.floor((seg.oldX + tokenW / 2) / gridSize);
      const oldGridY = Math.floor((seg.oldY + tokenH / 2) / gridSize);
      const newGridX = Math.floor((seg.newX + tokenW / 2) / gridSize);
      const newGridY = Math.floor((seg.newY + tokenH / 2) / gridSize);
      
      const segPath = getGridPath(oldGridX, oldGridY, newGridX, newGridY);
      segPath.shift();
      
      for (const sq of segPath) {
        if (!fullPath.some(existing => existing.x === sq.x && existing.y === sq.y)) {
          fullPath.push(sq);
        }
      }
    }
  }
  
  if (fullPath.length === 0) return;

  const visitedState = foundry.utils.deepClone(
    getSystemFlag(tokenDoc, "terrainSquaresVisitedThisTurn") || {}
  );
  let slipperyChecked = getSystemFlag(tokenDoc, "slipperyCheckedThisTurn") || false;

  const terrainDamageMap = new Map();
  const effectsToApply = [];
  let slipperyCheckRegion = null;

  for (const square of fullPath) {
    const squareKey = `${square.x},${square.y}`;
    const squareCenterX = (square.x + 0.5) * gridSize;
    const squareCenterY = (square.y + 0.5) * gridSize;

    for (const region of scene.regions) {
      const terrainData = getSystemFlag(region, "terrain");
      if (!terrainData) continue;
      if (!isPointInRegion(squareCenterX, squareCenterY, region, gridSize)) continue;

      const sys = terrainData.system;

      if (sys.centerMode === "actor" && sys.centerActorId === actor.id) continue;

      // Sunken creatures ignore surface terrain damage, fields, and surface onMove behaviors
      if (isTokenSunken) continue;

      if (!visitedState[region.id]) visitedState[region.id] = [];
      if (visitedState[region.id].includes(squareKey)) continue;
      visitedState[region.id].push(squareKey);

      if (sys.terrainDamage > 0) {
        if (!terrainDamageMap.has(region.id)) {
          terrainDamageMap.set(region.id, { damage: 0, name: region.name });
        }
        terrainDamageMap.get(region.id).damage += sys.terrainDamage;
      }

      if (sys.category === "field" && sys.slippery && !slipperyChecked && !slipperyCheckRegion) {
        slipperyChecked = true;
        slipperyCheckRegion = region;
      }

      const onMoveBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onMove");
      for (const behavior of onMoveBehaviors) {
        if (behavior.action === "applyEffect") {
          const effList = (behavior.effects && behavior.effects.length > 0)
            ? behavior.effects
            : (behavior.effectUuid ? [{ uuid: behavior.effectUuid, name: behavior.effectName, img: behavior.effectImg, intensity: behavior.effectIntensity }] : []);

          for (const eff of effList) {
            if (!eff.uuid) continue;
            const rawIntensity = resolveIntPlaceholder(eff.intensity || "1", region);
            const intensity = evaluateIntensityValue(rawIntensity, 1);
            effectsToApply.push({
              eff: {
                uuid: eff.uuid,
                name: eff.name,
                img: eff.img,
                intensity: intensity
              },
              terrainName: region.name
            });
          }
        } else {
          const context = buildBehaviorContext(region);
          await executeBehavior(behavior, actor, region, context);
        }
      }
    }
  }

  const flagUpdates = {
    [`flags.${SYSTEM_ID}.terrainSquaresVisitedThisTurn`]: visitedState
  };
  if (slipperyChecked && !getSystemFlag(tokenDoc, "slipperyCheckedThisTurn")) {
    flagUpdates[`flags.${SYSTEM_ID}.slipperyCheckedThisTurn`] = true;
  }
  await tokenDoc.update(flagUpdates);

  await applyTerrainDamageAndEffects(tokenDoc, actor, terrainDamageMap, effectsToApply, slipperyCheckRegion);

  await syncWhileInsideEffectsForToken(tokenDoc);

  const auraRegions = scene.regions.filter(r => {
    const t = getSystemFlag(r, "terrain");
    if (t?.system?.centerMode !== "actor") return false;
    const centerTokenId = getSystemFlag(r, "centerTokenId");
    return centerTokenId ? centerTokenId === tokenDoc.id : (t.system.centerActorId === actor.id || getSystemFlag(r, "centerActorId") === actor.id);
  });
  if (auraRegions.length > 0) {
    for (const auraRegion of auraRegions) {
      await syncWhileInsideEffectsForRegion(auraRegion);
    }
  }
}

/**
 * Called when a token first enters a terrain region this turn.
 * @param {TokenDocument} token
 * @param {RegionDocument} region
 */
export async function onTokenEnterTerrain(token, region) {
  if (!token || !region) return;
  const terrainData = getSystemFlag(region, "terrain");
  if (!terrainData) return;

  const tokenDoc = token.document ?? token;
  if (!tokenDoc.isOwner && !game.user.isGM) return;
  if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
  const actor = tokenDoc.actor;
  if (!actor) return;

  // Sunken creatures ignore surface terrain onEnter triggers and cost notifications
  if (isSunken(tokenDoc)) return;

  const enteredThisTurn = getSystemFlag(tokenDoc, "terrainEnteredThisTurn") || {};
  if (enteredThisTurn[region.id]) return;

  await setSystemFlag(tokenDoc, `terrainEnteredThisTurn.${region.id}`, true);

  const sys = terrainData.system;
  if (sys.centerMode === "actor" && sys.centerActorId === actor.id) return;

  const onEnterBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onEnter");
  if (onEnterBehaviors.length > 0) {
    const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
    if (tokenPlaceable) {
      if (tokenPlaceable.animationContexts?.size > 0) {
        const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
        await Promise.allSettled(promises);
      } else if (tokenPlaceable._animation) {
        await tokenPlaceable._animation;
      }
    }

    const context = buildBehaviorContext(region);
    for (const behavior of onEnterBehaviors) {
      await executeBehavior(behavior, actor, region, context);
    }
  }

  if ((sys.category === "difficult_terrain" || sys.category === "field") && sys.extraMovementCost > 0) {
    ui.notifications.info(
      game.i18n.format("TRESPASSER.Notification.Terrain.DifficultTerrainCost", {
        cost: sys.extraMovementCost
      })
    );
  }
}

/**
 * Called when a token exits a terrain region.
 * @param {TokenDocument} token
 * @param {RegionDocument} region
 */
export async function onTokenExitTerrain(token, region) {
  if (!token || !region) return;
  const terrainData = getSystemFlag(region, "terrain");
  if (!terrainData) return;

  const tokenDoc = token.document ?? token;
  if (!tokenDoc.isOwner && !game.user.isGM) return;
  if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
  const actor = tokenDoc.actor;
  if (!actor) return;

  if (getSystemFlag(tokenDoc, "terrainEnteredThisTurn")?.[region.id]) {
    await unsetSystemFlag(tokenDoc, `terrainEnteredThisTurn.${region.id}`);
  }

  const sys = terrainData.system;
  if (sys.centerMode === "actor" && sys.centerActorId === actor.id) return;

  const onExitBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onExit");
  if (onExitBehaviors.length > 0) {
    const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
    if (tokenPlaceable) {
      if (tokenPlaceable.animationContexts?.size > 0) {
        const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
        await Promise.allSettled(promises);
      } else if (tokenPlaceable._animation) {
        await tokenPlaceable._animation;
      }
    }

    const context = buildBehaviorContext(region);
    for (const behavior of onExitBehaviors) {
      await executeBehavior(behavior, actor, region, context);
    }
  }
}

/**
 * Called at the start of a combat turn for a token in terrain.
 * @param {TokenDocument} tokenDoc
 * @param {RegionDocument} region
 */
export async function onTokenStartTurnInTerrain(tokenDoc, region) {
  if (!tokenDoc || !region) return;
  if (!tokenDoc.isOwner && !game.user.isGM) return;
  const terrainData = getSystemFlag(region, "terrain");
  if (!terrainData) return;

  const actor = tokenDoc.actor;
  if (!actor) return;

  const sys = terrainData.system;
  if (sys.centerMode === "actor" && sys.centerActorId === actor.id) return;

  const onStartTurnBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onStartTurn");
  if (onStartTurnBehaviors.length > 0) {
    const context = buildBehaviorContext(region);
    for (const behavior of onStartTurnBehaviors) {
      await executeBehavior(behavior, actor, region, context);
    }
  }
}

export { applyTerrainDamageAndEffects, postMovementSummary };

/**
 * Called when a token loses the sunken state while on the canvas.
 * Triggers onEnter behaviors, square terrain damage/effects, and syncs whileInside effects.
 * @param {TokenDocument} tokenDoc
 */
export async function onTokenSurfaced(tokenDoc) {
  if (!tokenDoc) return;
  const actor = tokenDoc.actor;
  if (!actor) return;
  if (!tokenDoc.isOwner && !game.user.isGM) return;

  const containingRegions = getTerrainRegionsContainingToken(tokenDoc);
  if (containingRegions.length === 0) return;

  const scene = tokenDoc.parent || canvas.scene;
  const gridSize = scene?.grid?.size || 100;
  const tokenW = tokenDoc.width || 1;
  const tokenH = tokenDoc.height || 1;

  const visitedState = foundry.utils.deepClone(
    getSystemFlag(tokenDoc, "terrainSquaresVisitedThisTurn") || {}
  );
  let slipperyChecked = getSystemFlag(tokenDoc, "slipperyCheckedThisTurn") || false;

  const terrainDamageMap = new Map();
  const effectsToApply = [];
  let slipperyCheckRegion = null;

  for (const region of containingRegions) {
    await onTokenEnterTerrain(tokenDoc, region);

    const terrainData = getSystemFlag(region, "terrain");
    if (!terrainData) continue;
    const sys = terrainData.system;
    if (sys.centerMode === "actor" && sys.centerActorId === actor.id) continue;

    for (let dx = 0; dx < tokenW; dx++) {
      for (let dy = 0; dy < tokenH; dy++) {
        const sqX = Math.floor(tokenDoc.x / gridSize) + dx;
        const sqY = Math.floor(tokenDoc.y / gridSize) + dy;
        const squareKey = `${sqX},${sqY}`;

        if (!visitedState[region.id]) visitedState[region.id] = [];
        if (visitedState[region.id].includes(squareKey)) continue;
        visitedState[region.id].push(squareKey);

        if (sys.terrainDamage > 0) {
          if (!terrainDamageMap.has(region.id)) {
            terrainDamageMap.set(region.id, { damage: 0, name: region.name });
          }
          terrainDamageMap.get(region.id).damage += sys.terrainDamage;
        }

        if (sys.category === "field" && sys.slippery && !slipperyChecked && !slipperyCheckRegion) {
          slipperyChecked = true;
          slipperyCheckRegion = region;
        }

        const onMoveBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onMove");
        for (const behavior of onMoveBehaviors) {
          if (behavior.action === "applyEffect") {
            const effList = (behavior.effects && behavior.effects.length > 0)
              ? behavior.effects
              : (behavior.effectUuid ? [{ uuid: behavior.effectUuid, name: behavior.effectName, img: behavior.effectImg, intensity: behavior.effectIntensity }] : []);

            for (const eff of effList) {
              if (!eff.uuid) continue;
              const rawIntensity = resolveIntPlaceholder(eff.intensity || "1", region);
              const intensity = evaluateIntensityValue(rawIntensity, 1);
              effectsToApply.push({
                eff: {
                  uuid: eff.uuid,
                  name: eff.name,
                  img: eff.img,
                  intensity: intensity
                },
                terrainName: region.name
              });
            }
          } else {
            const context = buildBehaviorContext(region);
            await executeBehavior(behavior, actor, region, context);
          }
        }
      }
    }
  }

  const flagUpdates = {
    [`flags.${SYSTEM_ID}.terrainSquaresVisitedThisTurn`]: visitedState
  };
  if (slipperyChecked && !getSystemFlag(tokenDoc, "slipperyCheckedThisTurn")) {
    flagUpdates[`flags.${SYSTEM_ID}.slipperyCheckedThisTurn`] = true;
  }
  await tokenDoc.update(flagUpdates);

  await applyTerrainDamageAndEffects(tokenDoc, actor, terrainDamageMap, effectsToApply, slipperyCheckRegion);

  await syncWhileInsideEffectsForToken(tokenDoc);
}

/**
 * Trigger surfacing logic for all active canvas tokens belonging to an actor.
 * @param {Actor} actor
 */
export async function handleActorSurfaced(actor) {
  if (!actor) return;
  let tokens = [];
  if (actor.isToken && actor.token) {
    tokens = [actor.token];
  } else if (typeof actor.getActiveTokens === "function") {
    tokens = actor.getActiveTokens(true, true) || [];
  }
  for (const token of tokens) {
    const tokenDoc = token.document ?? token;
    await onTokenSurfaced(tokenDoc);
  }
}
