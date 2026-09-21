import { resolveItem } from "../item-resolver.mjs";

const pendingDeedRequests = new Map();

/**
 * Emit a deed action via socket and await its completion from the GM.
 * @param {string} action The action to perform
 * @param {object} data The data payload for the action
 * @returns {Promise<any>}
 */
export async function emitDeedActionAndWait(action, data) {
  const { TrespasserSocket } = await import("./socket.mjs");
  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    pendingDeedRequests.set(requestId, resolve);
    TrespasserSocket.emit("DEED_ACTION_REQUEST", { action, requestId, data });
  });
}

/**
 * Handle incoming DEED_ACTION_REQUEST on the GM side.
 * @param {object} payload 
 * @param {string} senderId 
 */
export async function handleDeedActionRequest(payload, senderId) {
  const { action, requestId, data } = payload;
  
  // Only the active GM should process this request to avoid duplication.
  const activeGMs = game.users.filter(u => u.active && u.isGM);
  const responsibleGM = activeGMs[0];
  if (!responsibleGM || game.user.id !== responsibleGM.id) return;

  let result = null;
  try {
    switch (action) {
      case "applyDamage":
        result = await _handleApplyDamage(data);
        break;
      case "applyHealing":
        result = await _handleApplyHealing(data);
        break;
      case "spendRecoveryDice":
        result = await _handleSpendRecoveryDice(data);
        break;
      case "applyEffects":
        result = await _handleApplyEffects(data);
        break;
      case "modifyEffects":
        result = await _handleModifyEffects(data);
        break;
      case "transferState":
        result = await _handleTransferState(data);
        break;
      case "spawnTerrain":
        result = await _handleSpawnTerrain(data);
        break;
      case "moveTerrain":
        result = await _handleMoveTerrain(data);
        break;
      case "updateTerrainRegion":
        result = await _handleUpdateTerrainRegion(data);
        break;
      case "forceMoveTokens":
        result = await _handleForceMoveTokens(data);
        break;
      case "swapTokens":
        result = await _handleSwapTokens(data);
        break;
      case "updateChatMessage":
        result = await _handleUpdateChatMessage(data);
        break;
      case "deleteChatMessage":
        result = await _handleDeleteChatMessage(data);
        break;
      case "setCombatantFlag":
        result = await _handleSetCombatantFlag(data);
        break;
    }
  } catch (err) {
    console.error(`Trespasser | Deed Action failed for ${action}`, err);
  }

  // Send response back
  const { TrespasserSocket } = await import("./socket.mjs");
  TrespasserSocket.emit("DEED_ACTION_RESPONSE", { requestId, result, targetUserId: senderId });
}

/**
 * Handle incoming DEED_ACTION_RESPONSE on the player side.
 * @param {object} payload 
 */
export function handleDeedActionResponse(payload) {
  const { requestId, result, targetUserId } = payload;
  
  // Only process on the requesting client
  if (game.user.id !== targetUserId) return; 

  const resolve = pendingDeedRequests.get(requestId);
  if (resolve) {
    resolve(result);
    pendingDeedRequests.delete(requestId);
  }
}

// -----------------------------------------
// Internal GM Execution Handlers
// -----------------------------------------

async function _handleApplyDamage(data) {
  const token = canvas.tokens?.get(data.tokenId) || game.scenes?.current?.tokens.get(data.tokenId);
  const actor = token?.actor || game.actors.get(data.actorId);
  if (actor && typeof actor.applyDamage === "function") {
    return await actor.applyDamage(data.damage, data.options || {});
  }
  return true;
}

async function _handleApplyHealing(data) {
  const token = canvas.tokens?.get(data.tokenId) || game.scenes?.current?.tokens.get(data.tokenId);
  const actor = token?.actor || game.actors.get(data.actorId);
  const sourceActor = data.sourceActor || (data.sourceActorId ? game.actors.get(data.sourceActorId) : null);
  if (actor && typeof actor.applyHealing === "function") {
    await actor.applyHealing(data.healing, { sourceActor });
  }
  return true;
}

async function _handleSpendRecoveryDice(data) {
  const token = canvas.tokens?.get(data.tokenId) || game.scenes?.current?.tokens.get(data.tokenId);
  const actor = token?.actor || game.actors.get(data.actorId);
  const amount = Math.max(0, parseInt(data.amount) || 0);
  if (actor && amount > 0 && actor.system.recovery_dice !== undefined) {
    const newRD = Math.max(0, actor.system.recovery_dice - amount);
    await actor.update({ "system.recovery_dice": newRD });
  }
  return true;
}


async function _handleApplyEffects(data) {
  const token = canvas.tokens?.get(data.tokenId) || game.scenes?.current?.tokens.get(data.tokenId);
  const actor = token?.actor || game.actors.get(data.actorId);
  if (!actor || !Array.isArray(data.itemDataArray)) return true;

  const toUpdate = [];
  const toCreate = [];
  for (const itemData of data.itemDataArray) {
    if (itemData._id && actor.items.has(itemData._id)) {
      toUpdate.push(itemData);
    } else {
      toCreate.push(itemData);
    }
  }

  const createdIds = [];
  if (toUpdate.length > 0) {
    await actor.updateEmbeddedDocuments("Item", toUpdate);
  }
  if (toCreate.length > 0) {
    const created = await actor.createEmbeddedDocuments("Item", toCreate);
    if (Array.isArray(created)) createdIds.push(...created.map(c => c.id));
  }
  return createdIds;
}

async function _handleSpawnTerrain(data) {
  if (data.useTerrainHelper) {
    const terrainItem = await resolveItem(data.terrainUuid, { type: "terrain" });
    const { TerrainHelper } = await import("../terrain-helper.mjs");
    const created = await TerrainHelper.placeTerrainOnCanvas(terrainItem, data.dropPosition, data.options);
    if (!created) return [];
    return Array.isArray(created) ? created.map(c => c.uuid) : [created.uuid];
  } else {
    const created = await canvas.scene.createEmbeddedDocuments("Tile", data.tileDataArray);
    return created.map(t => t.uuid);
  }
}

async function _handleMoveTerrain(data) {
  await canvas.scene.updateEmbeddedDocuments("Tile", data.updates);
  return true;
}

async function _handleUpdateTerrainRegion(data) {
  const scene = data.sceneId ? game.scenes.get(data.sceneId) : canvas.scene;
  if (!scene) return false;
  await scene.updateEmbeddedDocuments("Region", [data.updates]);
  const region = scene.regions.get(data.regionId || data.updates?._id);
  if (region) {
    const { TerrainHelper } = await import("../terrain-helper.mjs");
    await TerrainHelper.syncWhileInsideEffectsForRegion(region);
  }
  return true;
}

async function _handleForceMoveTokens(data) {
  const { movingTokenId, movingPath, otherTokenId, compoundPath, targetTokenId, collisions, totalDamage } = data;
  
  const movingToken = canvas.tokens.get(movingTokenId);
  const otherToken = otherTokenId ? canvas.tokens.get(otherTokenId) : null;
  const targetToken = canvas.tokens.get(targetTokenId);
  
  if (movingToken && movingPath?.length > 0) {
    for (let i = 0; i < movingPath.length; i++) {
      const updates = [{ _id: movingToken.id, x: movingPath[i].x, y: movingPath[i].y }];
      if (otherToken && compoundPath && compoundPath[i]) {
        updates.push({ _id: otherToken.id, x: compoundPath[i].x, y: compoundPath[i].y });
      }
      await canvas.scene.updateEmbeddedDocuments("Token", updates, { trespasserForcedMovement: true });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (movingToken?.actor) {
      if (typeof movingToken.actor.onMove === "function") {
        await movingToken.actor.onMove({ isForced: true });
      } else {
        const { TrespasserEffectsHelper } = await import("../effects-helper.mjs");
        await TrespasserEffectsHelper.triggerEffects(movingToken.actor, "on-move");
      }
    }
    if (otherToken?.actor) {
      if (typeof otherToken.actor.onMove === "function") {
        await otherToken.actor.onMove({ isForced: true });
      } else {
        const { TrespasserEffectsHelper } = await import("../effects-helper.mjs");
        await TrespasserEffectsHelper.triggerEffects(otherToken.actor, "on-move");
      }
    }
  }

  if (targetToken && collisions?.length > 0 && totalDamage > 0) {
    // Note: We replicate the postCollisionDamage logic on the GM side
    const actor = targetToken.actor;
    if (actor) {
      if (typeof actor.applyDamage === "function") {
        await actor.applyDamage(totalDamage);
      } else {
        const newHp = Math.max(0, actor.system.health - totalDamage);
        await actor.update({ "system.health": newHp });
      }

      const lines = collisions.map(c => {
        const dmgStr = game.i18n.format("TRESPASSER.Chat.Collision.Damage", { damage: c.damage }) || `${c.damage} Damage`;
        if (c.type === "wall") {
          const wallLabel = game.i18n.localize("TRESPASSER.Chat.Collision.Wall") || "Wall Collision";
          return `<li><span style="color:var(--trp-red, #c44);">⚡ ${dmgStr}</span> — ${wallLabel}</li>`;
        } else if (c.type === "obstacle") {
          const obstacleLabel = game.i18n.format("TRESPASSER.Chat.Collision.Obstacle", { name: c.region?.name || "Obstacle" }) || `Obstacle Collision (${c.region?.name || "Obstacle"})`;
          return `<li><span style="color:var(--trp-red, #c44);">⚡ ${dmgStr}</span> — ${obstacleLabel}</li>`;
        }
        return "";
      }).filter(Boolean);

      const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;
      const flavor = game.i18n.format("TRESPASSER.Chat.Collision.Flavor", { total: totalDamage }) || `💥 Forced Movement Collision (${totalDamage} Total Damage)`;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        flavor,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
      });
    }
  }
  
  return true;
}

async function _handleUpdateChatMessage(data) {
  const msg = game.messages.get(data.messageId);
  if (msg) {
    await msg.update(data.updateData);
    return true;
  }
  return false;
}

async function _handleDeleteChatMessage(data) {
  const msg = game.messages.get(data.messageId);
  if (msg) {
    await msg.delete();
    return true;
  }
  return false;
}

async function _handleSetCombatantFlag(data) {
  const combat = game.combat;
  const combatant = combat?.combatants?.get(data.combatantId);
  if (combatant) {
    await combatant.setFlag(data.scope || "trespasser", data.key, data.value);
    return true;
  }
  return false;
}

async function _handleModifyEffects(data) {
  const actor = game.actors.get(data.actorId);
  if (!actor) return null;

  const { operation, deleteItemId, createItemData, itemId, updates } = data;

  if (operation === "invert") {
    if (deleteItemId) {
      const existing = actor.items.get(deleteItemId);
      if (existing) await existing.delete();
    }
    if (createItemData) {
      const created = await actor.createEmbeddedDocuments("Item", [createItemData]);
      return { createdId: created[0]?.id || null };
    }
    return true;
  }

  if (operation === "update" && itemId && updates) {
    const item = actor.items.get(itemId);
    if (item) {
      await item.update(updates);
      return true;
    }
    return false;
  }

  if (operation === "delete" && itemId) {
    const item = actor.items.get(itemId);
    if (item) {
      await item.delete();
      return true;
    }
    return false;
  }

  return true;
}

async function _handleTransferState(data) {
  const {
    originActorId,
    destActorId,
    originItemId,
    shouldDeleteFromOrigin,
    shouldUpdateOrigin,
    remainingOriginInt,
    existingDestItemId,
    newDestIntensity,
    createDestItemData
  } = data;

  const originActor = game.actors.get(originActorId);
  const destActor = game.actors.get(destActorId);
  if (!originActor || !destActor) return null;

  // 1. Origin modifications
  if (originItemId) {
    const originItem = originActor.items.get(originItemId);
    if (originItem) {
      if (shouldDeleteFromOrigin) {
        await originItem.delete();
      } else if (shouldUpdateOrigin && remainingOriginInt > 0) {
        await originItem.update({ "system.intensity": remainingOriginInt });
      }
    }
  }

  // 2. Destination modifications
  let destItemId = null;
  if (existingDestItemId && newDestIntensity !== null && newDestIntensity !== undefined) {
    const existingDestItem = destActor.items.get(existingDestItemId);
    if (existingDestItem) {
      await existingDestItem.update({ "system.intensity": newDestIntensity });
      destItemId = existingDestItem.id;
    }
  } else if (createDestItemData) {
    const created = await destActor.createEmbeddedDocuments("Item", [createDestItemData]);
    destItemId = created[0]?.id || null;
  }

  return { destItemId };
}

async function _handleSwapTokens(data) {
  const { tokenAId, tokenBId, posA, posB, movementType } = data;
  const tokenDocA = canvas.scene?.tokens.get(tokenAId);
  const tokenDocB = canvas.scene?.tokens.get(tokenBId);
  if (!tokenDocA || !tokenDocB) return false;

  const isTeleport = movementType === "teleport";
  await canvas.scene.updateEmbeddedDocuments("Token", [
    { _id: tokenDocA.id, x: posB.x, y: posB.y },
    { _id: tokenDocB.id, x: posA.x, y: posA.y }
  ], { animate: !isTeleport, trespasserSwap: true });

  const tokenA = canvas.tokens.get(tokenAId);
  const tokenB = canvas.tokens.get(tokenBId);
  if (tokenA) {
    const { SwapPositionsBehavior } = await import("../deed-behaviors/swap-positions.mjs");
    await SwapPositionsBehavior._triggerTokenMoveHooks(tokenA, isTeleport);
  }
  if (tokenB) {
    const { SwapPositionsBehavior } = await import("../deed-behaviors/swap-positions.mjs");
    await SwapPositionsBehavior._triggerTokenMoveHooks(tokenB, isTeleport);
  }

  return true;
}
