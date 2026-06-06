/**
 * Helper class for coordinating non-combat roll Sparks and Shadows selection.
 * Handles async prompts, socket requests, and response routing between players and GM.
 */

const _pendingRequests = new Map();

const timeout = 600000;

/**
 * Prompt the GM to pick shadows on behalf of a player.
 * Resolves with chosen shadows array (e.g. ["costly"]), or null on timeout/cancellation.
 */
export async function requestGMShadows({ requestId, shadowCount, rollLabel }) {
  const activeGMs = game.users.filter(u => u.isGM && u.active);
  if (activeGMs.length === 0) return null; // No GMs online

  console.log(`Trespasser | requestGMShadows: Sending request ${requestId} for ${shadowCount} shadows.`);

  const promise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn(`Trespasser | requestGMShadows: Request ${requestId} timed out.`);
      _pendingRequests.delete(requestId);
      // Cancel the GM dialogs
      const { TrespasserSocket } = game.trespasser || {};
      TrespasserSocket?.emit("CANCEL_NON_COMBAT_POPUP", { requestId });
      resolve(null);
    }, timeout); // 15 seconds timeout

    _pendingRequests.set(requestId, { resolve, timeout });
  });

  const { TrespasserSocket } = game.trespasser || {};
  TrespasserSocket?.emit("NON_COMBAT_SHADOWS_REQUEST", {
    requestId,
    shadowCount,
    rollLabel
  });

  return promise;
}

/**
 * Prompt a specific player to pick sparks on behalf of a check (e.g. Group check highest roller).
 */
export async function requestPlayerSparks({ requestId, targetUserId, sparkCount, rollLabel }) {
  const targetUser = game.users.get(targetUserId);
  if (!targetUser || !targetUser.active) return null;

  console.log(`Trespasser | requestPlayerSparks: Sending request ${requestId} to player ${targetUserId} for ${sparkCount} sparks.`);

  const promise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn(`Trespasser | requestPlayerSparks: Request ${requestId} timed out.`);
      _pendingRequests.delete(requestId);
      // Cancel the player dialog
      const { TrespasserSocket } = game.trespasser || {};
      TrespasserSocket?.emit("CANCEL_NON_COMBAT_POPUP", { requestId });
      resolve(null);
    }, timeout); // 15 seconds timeout

    _pendingRequests.set(requestId, { resolve, timeout });
  });

  const { TrespasserSocket } = game.trespasser || {};
  TrespasserSocket?.emit("NON_COMBAT_SPARKS_REQUEST", {
    requestId,
    targetUserId,
    sparkCount,
    rollLabel
  });

  return promise;
}

/**
 * Handle incoming GM Shadows request (runs on GM client).
 */
export async function handleShadowsRequest(data, senderId) {
  const { requestId, shadowCount, rollLabel } = data;
  if (!game.user.isGM) return;

  console.log(`Trespasser | handleShadowsRequest: Received request ${requestId} for ${shadowCount} shadows from ${senderId}.`);

  // Fallback / placeholder until dialog classes are implemented in Task 2
  if (game.trespasser.NonCombatShadowDialog) {
    const chosenShadows = await game.trespasser.NonCombatShadowDialog.wait(shadowCount, { title: rollLabel, requestId });
    if (chosenShadows) {
      const { TrespasserSocket } = game.trespasser || {};
      TrespasserSocket?.emit("NON_COMBAT_SHADOWS_RESPONSE", {
        requestId,
        chosenShadows
      });
      return;
    }
  } else {
    // Console testing fallback
    console.log(`Trespasser | GM choice fallback: Execute game.trespasser.NonCombatHelper.submitShadows("${requestId}", ["costly"])`);
  }
}

/**
 * Resolve pending shadows request on rolling player client.
 */
export async function handleShadowsResponse(data) {
  const { requestId, chosenShadows } = data;
  const pending = _pendingRequests.get(requestId);
  if (pending) {
    console.log(`Trespasser | handleShadowsResponse: Resolving request ${requestId} with:`, chosenShadows);
    clearTimeout(pending.timeout);
    _pendingRequests.delete(requestId);
    pending.resolve(chosenShadows);
  }
}

/**
 * Handle incoming player Sparks request (runs on target player client).
 */
export async function handleSparksRequest(data, senderId) {
  const { requestId, targetUserId, sparkCount, rollLabel } = data;
  if (game.user.id !== targetUserId) return;

  console.log(`Trespasser | handleSparksRequest: Received request ${requestId} for ${sparkCount} sparks.`);

  // Fallback / placeholder until dialog classes are implemented in Task 2
  if (game.trespasser.NonCombatSparkDialog) {
    const chosenSparks = await game.trespasser.NonCombatSparkDialog.wait(sparkCount, { title: rollLabel, requestId });
    if (chosenSparks) {
      const { TrespasserSocket } = game.trespasser || {};
      TrespasserSocket?.emit("NON_COMBAT_SPARKS_RESPONSE", {
        requestId,
        chosenSparks
      });
      return;
    }
  } else {
    // Console testing fallback
    console.log(`Trespasser | Player choice fallback: Execute game.trespasser.NonCombatHelper.submitSparks("${requestId}", ["canny"])`);
  }
}

/**
 * Resolve pending sparks request on sender client.
 */
export async function handleSparksResponse(data) {
  const { requestId, chosenSparks } = data;
  const pending = _pendingRequests.get(requestId);
  if (pending) {
    console.log(`Trespasser | handleSparksResponse: Resolving request ${requestId} with:`, chosenSparks);
    clearTimeout(pending.timeout);
    _pendingRequests.delete(requestId);
    pending.resolve(chosenSparks);
  }
}

/**
 * Handle popup cancellation on timeout/cleanup.
 */
export async function handleCancelPopup(data) {
  const { requestId } = data;
  console.log(`Trespasser | handleCancelPopup: Cancelling popup for request ${requestId}`);
  const activeDialog = Object.values(ui.windows).find(
    w => (w.options?.requestId === requestId) || (w.sparkCount && w.options?.requestId === requestId)
  );
  if (activeDialog) activeDialog.close();
}

/**
 * Helper to manually submit selections from console during testing.
 */
export function submitShadows(requestId, chosenShadows) {
  const { TrespasserSocket } = game.trespasser || {};
  TrespasserSocket?.emit("NON_COMBAT_SHADOWS_RESPONSE", {
    requestId,
    chosenShadows
  });
}

export function submitSparks(requestId, chosenSparks) {
  const { TrespasserSocket } = game.trespasser || {};
  TrespasserSocket?.emit("NON_COMBAT_SPARKS_RESPONSE", {
    requestId,
    chosenSparks
  });
}
