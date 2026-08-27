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
  console.warn('Here');
  console.warn(payload);
  
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
      case "applyEffects":
        result = await _handleApplyEffects(data);
        break;
      case "spawnTerrain":
        result = await _handleSpawnTerrain(data);
        break;
      case "moveTerrain":
        result = await _handleMoveTerrain(data);
        break;
      case "forceMoveTokens":
        result = await _handleForceMoveTokens(data);
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
    await actor.applyDamage(data.damage);
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


async function _handleApplyEffects(data) {
  const token = canvas.tokens?.get(data.tokenId) || game.scenes?.current?.tokens.get(data.tokenId);
  const actor = token?.actor || game.actors.get(data.actorId);
  if (actor) {
    await actor.createEmbeddedDocuments("Item", data.itemDataArray);
  }
  return true;
}

async function _handleSpawnTerrain(data) {
  if (data.useTerrainHelper) {
    const terrainItem = await fromUuid(data.terrainUuid);
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
