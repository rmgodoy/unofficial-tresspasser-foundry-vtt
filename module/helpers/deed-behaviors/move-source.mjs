import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";

export class MoveSourceBehavior {
  /**
   * Helper to find a path of grid squares from start position to destination position.
   * Prioritizes remaining within areaSquares if provided.
   * Private to MoveSourceBehavior.
   * @param {{x: number, y: number}} startPos
   * @param {{x: number, y: number}} destPos
   * @param {Array<{x: number, y: number}>} [areaSquares]
   * @returns {Array<{x: number, y: number}>}
   * @protected
   */
  static _findGridPath(startPos, destPos, areaSquares = []) {
    const gridPx = canvas.grid.size || 100;
    const sqKey = (s) => `${Math.floor(s.x / gridPx)},${Math.floor(s.y / gridPx)}`;
    const startKey = sqKey(startPos);
    const destKey = sqKey(destPos);

    if (startKey === destKey) return [destPos];

    const areaSet = new Set(areaSquares.map(sqKey));
    areaSet.add(startKey);

    const directions = [
      { dx: gridPx, dy: 0 }, { dx: -gridPx, dy: 0 },
      { dx: 0, dy: gridPx }, { dx: 0, dy: -gridPx },
      { dx: gridPx, dy: gridPx }, { dx: -gridPx, dy: gridPx },
      { dx: gridPx, dy: -gridPx }, { dx: -gridPx, dy: -gridPx }
    ];

    const bfs = (restrictToArea) => {
      const queue = [{ pos: startPos, path: [] }];
      const visited = new Set([startKey]);

      while (queue.length > 0) {
        const { pos, path } = queue.shift();
        for (const dir of directions) {
          const next = { x: pos.x + dir.dx, y: pos.y + dir.dy };
          const key = sqKey(next);
          if (visited.has(key)) continue;
          if (restrictToArea && !areaSet.has(key)) continue;

          visited.add(key);
          const newPath = [...path, next];
          if (key === destKey) return newPath;
          queue.push({ pos: next, path: newPath });
        }
      }
      return null;
    };

    // First attempt BFS restricted inside areaSquares
    const areaPath = bfs(true);
    const chosenPath = (areaPath && areaPath.length > 0) ? areaPath : bfs(false);
    if (chosenPath && chosenPath.length > 0) {
      chosenPath[chosenPath.length - 1] = destPos;
      return chosenPath;
    }
    return [destPos];
  }

  /**
   * Move token step-by-step along a path of grid squares, awaiting animation per step.
   * Private to MoveSourceBehavior.
   * @param {Token} token
   * @param {Array<{x: number, y: number}>} pathSquares
   * @param {boolean} [animate=true]
   * @protected
   */
  static async _animateTokenAlongPath(token, pathSquares, animate = true) {
    if (!token || !pathSquares || pathSquares.length === 0) return;

    if (!animate) {
      const last = pathSquares[pathSquares.length - 1];
      await token.document.update({ x: last.x, y: last.y }, { animate: false });
      return;
    }

    for (const sq of pathSquares) {
      if (token.document.x === sq.x && token.document.y === sq.y) continue;
      await token.document.update({ x: sq.x, y: sq.y }, { animate: true });

      if (token.animationContexts?.size > 0) {
        const promises = Array.from(token.animationContexts.values()).map(ctx => ctx.promise);
        await Promise.allSettled(promises);
      } else if (token._animation) {
        await token._animation;
      } else {
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  /**
   * 6. moveSource: Move the executing token
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   */
  static async execute(behavior, context, actor) {
    const params = behavior.params || {};
    const destinationMode = params.destinationMode || "distance";
    const movementEffect = actor ? TrespasserEffectsHelper.getActiveMovementEffect(actor) : null;
    const movementType = movementEffect ? TrespasserEffectsHelper.getMovementType(actor) : (params.movementType || "walk");

    const token = DeedBehaviorUtils.findToken(actor);
    if (!token) return true;

    /**
     * Set the token's movementAction to the desired type before moving,
     * then reset to previous/default ("walk") after the move completes.
     * @param {string|null} actionName
     * @param {Function} moveFn - Async function performing the actual position update(s).
     */
    const withMovementAction = async (actionName, moveFn) => {
      const currentAction = token.document.movementAction;
      const shouldChange = Boolean(actionName && currentAction !== actionName);
      if (shouldChange) {
        try {
          await canvas.scene.updateEmbeddedDocuments("Token", [
            { _id: token.document.id, movementAction: actionName }
          ]);
          canvas.tokens.recalculatePlannedMovementPaths();
        } catch (err) {
          console.warn("[MoveSourceBehavior] Could not update movementAction:", err);
        }
      }
      try {
        await moveFn();
      } finally {
        if (shouldChange) {
          try {
            await canvas.scene.updateEmbeddedDocuments("Token", [
              { _id: token.document.id, movementAction: currentAction || "walk" }
            ]);
            canvas.tokens.recalculatePlannedMovementPaths();
          } catch (err) {
            // Ignored
          }
        }
      }
    };

    // Map behavior movementType to Foundry's native movementAction names
    const actionName = movementType === "jump" ? "jump"
                     : movementType === "teleport" ? "blink"
                     : movementType === "walk" ? "walk"
                     : movementType;

    if (destinationMode === "selectedArea") {
      const targetArea = DeedBehaviorUtils.resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for character movement.");
        return false;
      }

      let destSq = null;

      if (targetArea.isPath === true) {
        destSq = targetArea.squares[targetArea.squares.length - 1];
      } else {
        ui.notifications.info("Choose a square within the selected area for movement destination.");
        const deedData = { targetType: "blast", targetSize: 1, range: 0 };

        while (!destSq) {
          const result = await TargetingHelper.placeTemplate(actor, token, deedData);
          if (!result || !result.squares || result.squares.length === 0) {
            ui.notifications.info("Movement cancelled.");
            return false;
          }

          const pickedSq = result.squares[0];
          const isValid = targetArea.squares.some(s => s.x === pickedSq.x && s.y === pickedSq.y);
          if (isValid) {
            destSq = pickedSq;
          } else {
            ui.notifications.warn("Please select a square inside the highlighted area.");
          }
        }
      }

      const startPos = { x: token.document.x, y: token.document.y };
      const destPos = { x: destSq.x, y: destSq.y };

      let pathSquares = [];
      if (targetArea.isPath === true) {
        const firstSq = targetArea.squares[0];
        const connectPath = this._findGridPath(startPos, firstSq);
        const prefix = (connectPath.length > 0 && connectPath[connectPath.length - 1].x === firstSq.x && connectPath[connectPath.length - 1].y === firstSq.y)
          ? connectPath.slice(0, -1)
          : [];
        pathSquares = [...prefix, ...targetArea.squares];
      } else {
        pathSquares = this._findGridPath(startPos, destPos, targetArea.squares);
      }

      await withMovementAction(actionName, async () => {
        await this._animateTokenAlongPath(token, pathSquares, movementType !== "teleport");
      });
      context.sourcePosition = { x: destPos.x, y: destPos.y };

      if (context.currentPhaseOutputs?.notes) {
        context.currentPhaseOutputs.notes.push(`Moved source (${movementType}) to selected area square`);
      }
      return true;
    }

    // destinationMode === "distance"
    const distance = parseInt(params.distance) || 1;

    // Prompt player to select destination square on canvas
    const { MovementOverlay } = await import("../../canvas/movement-overlay.mjs");
    const destPos = await new Promise((resolve) => {
      const onComplete = (targetToken, destination) => {
        Hooks.off("trespasserVaultCancelled", onCancel);
        resolve(destination);
      };
      const onCancel = () => {
        Hooks.off("trespasserVaultComplete", onComplete);
        resolve(null);
      };
      Hooks.once("trespasserVaultComplete", onComplete);
      Hooks.once("trespasserVaultCancelled", onCancel);
      MovementOverlay.activateVaultMode(token, distance, { free: true, phaseAction: true, movementType: movementType });
    });

    if (!destPos) {
      ui.notifications.info("Source movement cancelled.");
      return false; // Cancel execution if player cancels movement
    }

    const startPos = { x: token.document.x, y: token.document.y };
    const pathSquares = this._findGridPath(startPos, destPos);

    await withMovementAction(actionName, async () => {
      await this._animateTokenAlongPath(token, pathSquares, movementType !== "teleport");
    });
    context.sourceToken = token;
    context.sourcePosition = { x: destPos.x, y: destPos.y };

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Moved source (${movementType}, ${distance} sq)`);
    }
    return true;
  }
}
