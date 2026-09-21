import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { selectTokensInteractive } from "./select-target-interactive.mjs";

/**
 * SwapPositionsBehavior — Exchanges the grid positions of two tokens on canvas
 * (Self with Target, or between two Targets).
 *
 * Elevation is preserved per actor to prevent unintended transfer of Airborne / Sunken states.
 */
export class SwapPositionsBehavior {

  /**
   * Execute swapPositions behavior node.
   * @param {object} behavior - Behavior node data { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey="base"] - Current execution phase
   * @returns {Promise<boolean>}
   */
  static async execute(behavior, context, actor, item, phaseKey = "base") {
    const params = behavior.params || {};
    const swapMode = params.swapMode || "selfWithTarget"; // "selfWithTarget" | "targetWithAnother" | "twoTargets"
    const movementType = params.movementType || "teleport"; // "teleport" | "walk" | "jump"

    const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(actor);
    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);

    let tokenA = null;
    let tokenB = null;

    if (swapMode === "selfWithTarget") {
      tokenA = sourceToken;
      if (!tokenA) {
        ui.notifications?.warn(game.i18n.localize("TRESPASSER.Chat.SwapPositions.NoSourceToken") || "No source token found to swap places.");
        return false;
      }
      if (validTargets && validTargets.length > 0) {
        tokenB = validTargets[0];
      } else {
        const chosen = await selectTokensInteractive({
          maxCount: 1,
          sourceToken,
          item,
          actor,
          activeNodeId: behavior.id,
          runtimeContext: context
        });
        tokenB = chosen?.[0] || null;
      }
      if (!tokenB) return false;
    } else if (swapMode === "targetWithAnother") {
      if (validTargets && validTargets.length > 0) {
        tokenA = validTargets[0];
      } else {
        const chosenA = await selectTokensInteractive({
          maxCount: 1,
          sourceToken,
          item,
          actor,
          activeNodeId: behavior.id,
          runtimeContext: context
        });
        tokenA = chosenA?.[0] || null;
      }
      if (!tokenA) return false;

      const chosenB = await selectTokensInteractive({
        maxCount: 1,
        sourceToken,
        item,
        actor,
        activeNodeId: behavior.id,
        runtimeContext: context
      });
      tokenB = chosenB?.[0] || null;
      if (!tokenB) return false;
    } else if (swapMode === "twoTargets") {
      if (validTargets && validTargets.length >= 2) {
        tokenA = validTargets[0];
        tokenB = validTargets[1];
      } else if (validTargets && validTargets.length === 1) {
        tokenA = validTargets[0];
        const chosen = await selectTokensInteractive({
          maxCount: 1,
          sourceToken,
          item,
          actor,
          activeNodeId: behavior.id,
          runtimeContext: context
        });
        tokenB = chosen?.[0] || null;
        if (!tokenB) return false;
      } else {
        const chosen = await selectTokensInteractive({
          maxCount: 2,
          sourceToken,
          item,
          actor,
          activeNodeId: behavior.id,
          runtimeContext: context
        });
        if (!chosen || chosen.length < 2) {
          ui.notifications?.warn(game.i18n.localize("TRESPASSER.Chat.SwapPositions.NeedTwoTargets") || "Swapping two targets requires at least two selected targets.");
          return false;
        }
        tokenA = chosen[0];
        tokenB = chosen[1];
      }
    }

    if (!tokenA || !tokenB || tokenA.id === tokenB.id) return true;

    const tokenDocA = tokenA.document || tokenA;
    const tokenDocB = tokenB.document || tokenB;

    const nameA = DeedBehaviorUtils.getTokenDisplayName(tokenA);
    const nameB = DeedBehaviorUtils.getTokenDisplayName(tokenB);

    const posA = { x: tokenDocA.x, y: tokenDocA.y };
    const posB = { x: tokenDocB.x, y: tokenDocB.y };

    const isTeleport = movementType === "teleport";

    const canDirectlyUpdate = (tokenDocA.canUserModify ? tokenDocA.canUserModify(game.user, "update") : (tokenDocA.isOwner || game.user?.isGM)) &&
                              (tokenDocB.canUserModify ? tokenDocB.canUserModify(game.user, "update") : (tokenDocB.isOwner || game.user?.isGM));

    if (canDirectlyUpdate) {
      await canvas.scene.updateEmbeddedDocuments("Token", [
        { _id: tokenDocA.id, x: posB.x, y: posB.y },
        { _id: tokenDocB.id, x: posA.x, y: posA.y }
      ], { animate: !isTeleport, trespasserSwap: true });

      // Trigger movement hooks
      await this._triggerTokenMoveHooks(tokenA, isTeleport);
      await this._triggerTokenMoveHooks(tokenB, isTeleport);
    } else {
      // Execute via GM socket
      const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
      await emitDeedActionAndWait("swapTokens", {
        tokenAId: tokenDocA.id,
        tokenBId: tokenDocB.id,
        posA,
        posB,
        movementType
      });
    }

    // Update context source position if caster was tokenA
    if (tokenA.id === sourceToken?.id) {
      context.sourcePosition = { x: posB.x, y: posB.y };
    } else if (tokenB.id === sourceToken?.id) {
      context.sourcePosition = { x: posA.x, y: posA.y };
    }

    const noteText = game.i18n.format("TRESPASSER.Chat.SwapPositions.Swapped", {
      tokenA: nameA,
      tokenB: nameB,
      movementType: game.i18n.localize(`TRESPASSER.Sheet.Item.Details.MovementTypeChoices.${movementType.charAt(0).toUpperCase() + movementType.slice(1)}`) || movementType
    });

    if (noteText && context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(noteText);
    }

    return true;
  }

  /**
   * Triggers onMove callbacks and status/terrain movement hooks on an actor.
   * @private
   */
  static async _triggerTokenMoveHooks(token, isTeleport) {
    const actor = token?.actor || (token instanceof Actor ? token : null);
    if (!actor) return;

    if (typeof actor.onMove === "function") {
      await actor.onMove({ isForced: false, isTeleport });
    } else {
      await TrespasserEffectsHelper.triggerEffects(actor, "on-move");
    }
  }
}
