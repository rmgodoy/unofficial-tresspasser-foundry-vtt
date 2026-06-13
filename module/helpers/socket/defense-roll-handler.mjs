/**
 * defense-roll-handler.mjs
 * Socket handlers for defense roll requests and responses.
 */
import { _rollDefenseLocally, resolveDefenseRoll, _askCounterReactionLocally, resolveCounterReaction } from "../defense-roll-helper.mjs";

/**
 * Handle a defense roll request from the GM.
 * @param {object} data - The request data
 * @param {string} senderId - ID of the GM who sent the request
 */
export async function handleDefenseRequest(data, senderId) {
  const { targetActorId, targetUserId, statKey, creatureDC, deedName, requestId } = data;

  // Only the targeted user should process this
  if (targetUserId !== game.user.id) return;

  const actor = game.actors.get(targetActorId);
  if (!actor) return;

  // Roll locally
  const result = await _rollDefenseLocally(actor, statKey, creatureDC, deedName);

  // Send response back via socket
  const { TrespasserSocket } = await import("./socket.mjs");
  TrespasserSocket.emit("DEFENSE_RESPONSE", {
    requestId,
    result
  });
}

/**
 * Handle a defense roll response from a player.
 * @param {object} data - The response data
 */
export async function handleDefenseResponse(data) {
  const { requestId, result } = data;
  
  // Only GMs should process the response
  if (!game.user.isGM) return;

  resolveDefenseRoll(requestId, result);
}

/**
 * Handle a counter reaction request from the GM.
 */
export async function handleCounterRequest(data, senderId) {
  const { requestId, targetActorId, targetTokenId, targetUserId, creatureTokenId, weaponId, shadows } = data;

  if (targetUserId !== game.user.id) return;

  const actor = game.actors.get(targetActorId);
  if (!actor) return;

  const targetToken = canvas.tokens.placeables.find(t => t.id === targetTokenId);
  const creatureToken = creatureTokenId ? canvas.tokens.placeables.find(t => t.id === creatureTokenId) : null;
  const weapon = actor.items.get(weaponId);

  const result = await _askCounterReactionLocally(targetToken, creatureToken, weapon, shadows);

  const { TrespasserSocket } = await import("./socket.mjs");
  TrespasserSocket.emit("COUNTER_RESPONSE", {
    requestId,
    result
  });
}

/**
 * Handle a counter reaction response from a player.
 */
export async function handleCounterResponse(data) {
  const { requestId, result } = data;
  if (!game.user.isGM) return;
  resolveCounterReaction(requestId, result);
}

