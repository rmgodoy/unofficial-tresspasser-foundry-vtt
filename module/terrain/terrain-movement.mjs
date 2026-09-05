import { isPointInRegion, getGridPath } from "./terrain-geometry.mjs";
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
import { resolveItem } from "../helpers/item-resolver.mjs";

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
  const scene = tokenDoc.parent || canvas.scene;
  if (!scene) return;

  const actor = tokenDoc.actor;
  if (!actor) return;

  const gridSize = scene.grid.size;
  const tokenW = (tokenDoc.width || 1) * gridSize;
  const tokenH = (tokenDoc.height || 1) * gridSize;

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
    tokenDoc.flags?.trespasser?.terrainSquaresVisitedThisTurn || {}
  );
  let slipperyChecked = tokenDoc.flags?.trespasser?.slipperyCheckedThisTurn || false;

  const terrainDamageMap = new Map();
  const effectsToApply = [];
  let slipperyCheckRegion = null;

  for (const square of fullPath) {
    const squareKey = `${square.x},${square.y}`;
    const squareCenterX = (square.x + 0.5) * gridSize;
    const squareCenterY = (square.y + 0.5) * gridSize;

    for (const region of scene.regions) {
      const terrainData = region.flags?.trespasser?.terrain;
      if (!terrainData) continue;
      if (!isPointInRegion(squareCenterX, squareCenterY, region, gridSize)) continue;

      const sys = terrainData.system;

      if (sys.centerMode === "actor" && sys.centerActorId === actor.id) continue;

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
    "flags.trespasser.terrainSquaresVisitedThisTurn": visitedState
  };
  if (slipperyChecked && !tokenDoc.flags?.trespasser?.slipperyCheckedThisTurn) {
    flagUpdates["flags.trespasser.slipperyCheckedThisTurn"] = true;
  }
  await tokenDoc.update(flagUpdates);

  const groupedEffects = new Map();
  for (const { eff, terrainName } of effectsToApply) {
    const effInt = (eff.intensity !== undefined && eff.intensity !== null && !isNaN(Number(eff.intensity))) ? Number(eff.intensity) : 0;
    if (groupedEffects.has(eff.uuid)) {
      const existing = groupedEffects.get(eff.uuid);
      existing.totalIntensity += effInt;
      existing.terrainNames.add(terrainName);
    } else {
      groupedEffects.set(eff.uuid, {
        eff,
        totalIntensity: effInt,
        terrainNames: new Set([terrainName])
      });
    }
  }

  if (terrainDamageMap.size > 0 || groupedEffects.size > 0 || slipperyCheckRegion) {
    const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
    if (tokenPlaceable) {
      if (tokenPlaceable.animationContexts?.size > 0) {
        const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
        await Promise.allSettled(promises);
      } else if (tokenPlaceable._animation) {
        await tokenPlaceable._animation;
      }
    }

    for (const [uuid, data] of groupedEffects) {
      const sourceEffect = await resolveItem({ uuid, name: data.name }, { type: "effect" });
      if (!sourceEffect) continue;
      const effectData = sourceEffect.toObject();
      effectData.system.intensity = data.totalIntensity;
      delete effectData._id;
      await Item.createDocuments([effectData], { parent: actor });
    }

    let totalDamage = 0;
    if (terrainDamageMap.size > 0) {
      for (const [, data] of terrainDamageMap) {
        totalDamage += data.damage;
      }
      if (typeof actor.applyDamage === "function") {
        await actor.applyDamage(totalDamage);
      } else {
        const newHp = Math.max(0, (actor.system.health ?? 0) - totalDamage);
        await actor.update({ "system.health": newHp });
      }
    }

    if (terrainDamageMap.size > 0 || groupedEffects.size > 0) {
      await postMovementSummary(tokenDoc, actor, terrainDamageMap, groupedEffects);
    }

    if (slipperyCheckRegion) {
      await handleSlipperyCheck(tokenDoc, actor, slipperyCheckRegion);
    }
  }

  await syncWhileInsideEffectsForToken(tokenDoc);

  const auraRegions = scene.regions.filter(r => {
    const t = r.flags?.trespasser?.terrain;
    if (t?.system?.centerMode !== "actor") return false;
    const centerTokenId = r.flags?.trespasser?.centerTokenId;
    return centerTokenId ? centerTokenId === tokenDoc.id : (t.system.centerActorId === actor.id || r.flags?.trespasser?.centerActorId === actor.id);
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
  const terrainData = region.flags?.trespasser?.terrain;
  if (!terrainData) return;

  const tokenDoc = token.document ?? token;
  if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
  const actor = tokenDoc.actor;
  if (!actor) return;

  const enteredThisTurn = tokenDoc.flags?.trespasser?.terrainEnteredThisTurn || {};
  if (enteredThisTurn[region.id]) return;

  await tokenDoc.setFlag("trespasser", `terrainEnteredThisTurn.${region.id}`, true);

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
  const terrainData = region.flags?.trespasser?.terrain;
  if (!terrainData) return;

  const tokenDoc = token.document ?? token;
  if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
  const actor = tokenDoc.actor;
  if (!actor) return;

  if (tokenDoc.flags?.trespasser?.terrainEnteredThisTurn?.[region.id]) {
    await tokenDoc.unsetFlag("trespasser", `terrainEnteredThisTurn.${region.id}`);
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
  const terrainData = region.flags?.trespasser?.terrain;
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

/**
 * Post a single combined chat message summarizing terrain damage and effects.
 * @param {TokenDocument} tokenDoc
 * @param {Actor} actor
 * @param {Map} terrainDamageMap
 * @param {Map} groupedEffects
 */
export async function postMovementSummary(tokenDoc, actor, terrainDamageMap, groupedEffects) {
  const lines = [];

  for (const [, data] of terrainDamageMap) {
    lines.push(`<li><span style="color:var(--trp-red, #c44);">⚡ ${data.damage} ${game.i18n.localize("TRESPASSER.Sheet.Terrain.Fields.TerrainDamage")}</span> — ${data.name}</li>`);
  }

  for (const [, data] of groupedEffects) {
    const img = data.eff.img ? `<img src="${data.eff.img}" width="16" height="16" style="border:none; vertical-align:middle; margin-right:4px;">` : "";
    const terrains = [...data.terrainNames].join(", ");
    lines.push(`<li>${img}<strong>${data.eff.name}</strong> (${data.totalIntensity}) — ${terrains}</li>`);
  }

  const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flavor: `🌍 ${game.i18n.format("TRESPASSER.Notification.Terrain.MovementSummary", { name: tokenDoc.name })}`
  });
}
