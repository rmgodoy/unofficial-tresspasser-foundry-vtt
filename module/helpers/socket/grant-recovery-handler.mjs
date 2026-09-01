import { askGrantRecoveryTargetDialog } from "../../dialogs/grant-recovery-dialog.mjs";

const _pendingRecoveryRequests = new Map();

/**
 * Request target character player to choose their own recovery dice.
 * Handles both local prompting (if current user owns target or GM) and remote socket prompting.
 *
 * @param {object} params
 * @param {Actor} params.targetActor - Targeted character actor.
 * @param {Actor} [params.casterActor] - Granting caster actor.
 * @param {number} params.intensity - Total intensity.
 * @param {number} params.casterDice - Dice allocated by caster.
 * @param {number} params.maxSpendable - Maximum dice target can spend.
 * @returns {Promise<number>} Number of dice chosen by target (0 if rejected or timed out).
 */
export async function requestGrantRecoveryTargetChoice({ targetActor, casterActor, intensity = 1, casterDice = 0, maxSpendable = 0 }) {
  if (maxSpendable <= 0) return 0;
  if (!targetActor) return 0;

  // Check if current user is owner of targetActor
  if (targetActor.isOwner) {
    return askGrantRecoveryTargetDialog({
      targetActor,
      casterActor,
      intensity,
      casterDice,
      maxSpendable
    });
  }

  // Find active player owner (non-GM)
  const targetUser = game.users.find(u => !u.isGM && targetActor.testUserPermission(u, "OWNER") && u.active);

  // If no active player owner, fallback to local prompt
  if (!targetUser) {
    return askGrantRecoveryTargetDialog({
      targetActor,
      casterActor,
      intensity,
      casterDice,
      maxSpendable
    });
  }

  // Emit socket request to target user
  const requestId = foundry.utils.randomID();
  const { TrespasserSocket } = await import("./socket.mjs");

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (_pendingRecoveryRequests.has(requestId)) {
        _pendingRecoveryRequests.delete(requestId);
        resolve(0);
      }
    }, 60000); // 60 seconds timeout

    _pendingRecoveryRequests.set(requestId, { resolve, timeout });

    TrespasserSocket.emit("GRANT_RECOVERY_REQUEST", {
      requestId,
      targetActorId: targetActor.id,
      targetUserId: targetUser.id,
      casterActorId: casterActor?.id,
      intensity,
      casterDice,
      maxSpendable
    });
  });
}

/**
 * Handle incoming GRANT_RECOVERY_REQUEST on the targeted player's client.
 * @param {object} data
 * @param {string} senderId
 */
export async function handleGrantRecoveryRequest(data, senderId) {
  const { requestId, targetActorId, targetUserId, casterActorId, intensity, casterDice, maxSpendable } = data;

  // Only the targeted user should process this dialog
  if (targetUserId !== game.user.id) return;

  const targetActor = game.actors.get(targetActorId);
  const casterActor = casterActorId ? game.actors.get(casterActorId) : null;
  if (!targetActor) return;

  const chosenDice = await askGrantRecoveryTargetDialog({
    targetActor,
    casterActor,
    intensity,
    casterDice,
    maxSpendable
  });

  const { TrespasserSocket } = await import("./socket.mjs");
  TrespasserSocket.emit("GRANT_RECOVERY_RESPONSE", {
    requestId,
    chosenDice: chosenDice || 0,
    targetUserId: senderId
  });
}

/**
 * Handle incoming GRANT_RECOVERY_RESPONSE on the caster's client.
 * @param {object} data
 */
export function handleGrantRecoveryResponse(data) {
  const { requestId, chosenDice, targetUserId } = data;

  if (targetUserId && game.user.id !== targetUserId) return;

  const pending = _pendingRecoveryRequests.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve(chosenDice || 0);
    _pendingRecoveryRequests.delete(requestId);
  }
}
