import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { CanvasInputSession } from "../../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../../canvas/canvas-selection-renderer.mjs";

export class SelectTargetBehavior {
  /**
   * 1. selectTarget: Target mode "self", "creatures", or "aoe"
   * For "creatures" mode: spawns a 1x1 template repeatedly to select up to N targets.
   * Right-clicking during targeting finishes selection early with chosen targets.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, actor, item) {
    const params = behavior.params || {};
    const mode = params.targetMode || "creatures";
    const token = DeedBehaviorUtils.findToken(actor);

    if (mode === "self") {
      context.targets = token ? [token] : (actor ? [actor] : []);
      ui.notifications.info(`Targeted self: ${actor?.name || token?.name || "Self"}`);
      return true;
    }

    if (mode === "creatures") {
      const maxCount = parseInt(params.targetCount) || 1;

      if (!token) {
        ui.notifications.warn("No token found on canvas for target selection.");
        return false;
      }

      const selectedTargets = [];
      const gridPx = canvas.grid.size;
      let hoveredSquare = null;

      const title = game.i18n.has("TRESPASSER.HUD.Action.SelectTargets")
        ? game.i18n.localize("TRESPASSER.HUD.Action.SelectTargets")
        : `Select Target(s)`;

      const formatDetails = (count) => {
        if (game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsInstruction")) {
          return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsInstruction", { current: count, max: maxCount });
        }
        return `Select target(s) on canvas (${count} of ${maxCount} selected).`;
      };

      const redrawHighlights = (session, hoveredSq = null) => {
        if (!session || !session.graphics) return;
        session.graphics.clear();

        // 1. Draw gold highlight boxes over already selected targets
        for (const targetToken of selectedTargets) {
          const tW = targetToken.document.width ?? 1;
          const tH = targetToken.document.height ?? 1;
          const tSq = [];
          for (let tx = 0; tx < tW; tx++) {
            for (let ty = 0; ty < tH; ty++) {
              tSq.push({ x: targetToken.document.x + tx * gridPx, y: targetToken.document.y + ty * gridPx });
            }
          }
          CanvasSelectionRenderer.drawPlacedOrigin(session.graphics, tSq, gridPx);
        }

        // 2. Draw green candidate highlight box over hovered square
        if (hoveredSq) {
          CanvasSelectionRenderer.drawCandidateSquares(session.graphics, [hoveredSq], gridPx, { hoveredSquare: hoveredSq });
        }
      };

      const resultTargets = await CanvasInputSession.start({
        title,
        details: formatDetails(0),
        icon: "fas fa-crosshairs",
        showConfirm: true,
        canConfirm: false,
        showUndo: false,
        canUndo: false,
        showCancel: true,
        onPointerMove: (ev, session) => {
          let lastCanvasPos;
          if (typeof ev.getLocalPosition === "function") {
            lastCanvasPos = ev.getLocalPosition(canvas.stage);
          } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
            lastCanvasPos = ev.data.getLocalPosition(canvas.stage);
          } else if (ev.interactionData && ev.interactionData.origin) {
            lastCanvasPos = ev.interactionData.origin;
          }
          if (!lastCanvasPos) return;

          const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
          hoveredSquare = { x: snapped.x, y: snapped.y };
          redrawHighlights(session, hoveredSquare);
        },
        onClick: (ev, session) => {
          let lastCanvasPos;
          if (typeof ev.getLocalPosition === "function") {
            lastCanvasPos = ev.getLocalPosition(canvas.stage);
          } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
            lastCanvasPos = ev.data.getLocalPosition(canvas.stage);
          } else if (ev.interactionData && ev.interactionData.origin) {
            lastCanvasPos = ev.interactionData.origin;
          }
          if (!lastCanvasPos) return;

          const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
          hoveredSquare = { x: snapped.x, y: snapped.y };
          const tokensInSq = TargetingHelper.getTokensInSquares([{ x: snapped.x, y: snapped.y }], gridPx);

          if (tokensInSq.length > 0) {
            const hitToken = tokensInSq[0];
            const idx = selectedTargets.findIndex(t => t.id === hitToken.id);
            if (idx >= 0) {
              selectedTargets.splice(idx, 1);
            } else {
              if (selectedTargets.length < maxCount) {
                selectedTargets.push(hitToken);
              } else {
                ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TooManyTargets", { max: maxCount, count: selectedTargets.length + 1 }));
              }
            }

            if (game.user.updateTokenTargets) {
              game.user.updateTokenTargets(selectedTargets.map(t => t.id));
            }

            if (CanvasInputSession.activeSession) {
              CanvasInputSession.activeSession.updateOverlay({
                details: formatDetails(selectedTargets.length),
                canConfirm: selectedTargets.length > 0
              });
            }

            redrawHighlights(session, hoveredSquare);
          }
        },
        onConfirm: () => {
          return selectedTargets;
        },
        onCancel: () => {
          return null;
        }
      });

      if (!resultTargets || resultTargets.length === 0) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = resultTargets;
      ui.notifications.info(`Targeted ${resultTargets.length} token(s).`);
      return true;
    }

    if (mode === "aoe") {
      const aoeType = params.aoeType || "blast";
      const aoeSize = parseInt(params.aoeSize) || 1;
      const deedData = {
        targetType: aoeType,
        targetSize: aoeSize,
        range: item?.system?.range || 0
      };

      if (!token) {
        ui.notifications.warn("No token found on canvas for AoE template placement.");
        return false;
      }

      const result = await TargetingHelper.placeTemplate(actor, token, deedData, [], {
        originOverride: context.sourcePosition || null
      });
      if (!result || !result.squares) {
        ui.notifications.info("AoE template placement cancelled.");
        return false;
      }

      const gridPx = canvas.grid.size;
      const tokensInAoE = TargetingHelper.getTokensInSquares(result.squares, gridPx);
      context.targets = tokensInAoE;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(tokensInAoE.map(t => t.id));
      }
      ui.notifications.info(`AoE targeted ${tokensInAoE.length} token(s).`);
      return true;
    }

    if (mode === "area") {
      const targetArea = DeedBehaviorUtils.resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for target selection.");
        return false;
      }

      const areaRelation = params.areaRelation || "inside";
      const gridPx = canvas.grid.size;
      const baseSquares = targetArea.squares;
      const targetSqMap = new Map();

      for (const sq of baseSquares) {
        if (areaRelation === "inside" || areaRelation === "insideAndAdjacent") {
          targetSqMap.set(`${sq.x},${sq.y}`, sq);
        }
        if (areaRelation === "adjacent" || areaRelation === "insideAndAdjacent") {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              const adjSq = { x: sq.x + dx * gridPx, y: sq.y + dy * gridPx };
              const key = `${adjSq.x},${adjSq.y}`;
              if (areaRelation === "adjacent") {
                const isInside = baseSquares.some(s => s.x === adjSq.x && s.y === adjSq.y);
                if (!isInside) targetSqMap.set(key, adjSq);
              } else {
                targetSqMap.set(key, adjSq);
              }
            }
          }
        }
      }

      const evalSquares = Array.from(targetSqMap.values());
      let selectedTargets = TargetingHelper.getTokensInSquares(evalSquares, gridPx);

      if (params.ignoreSelf) {
        const sourceToken = DeedBehaviorUtils.findToken(actor);
        if (sourceToken) {
          selectedTargets = selectedTargets.filter(t => t.id !== sourceToken.id);
        }
      }

      context.targets = selectedTargets;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(selectedTargets.map(t => t.id));
      }
      ui.notifications.info(`Targeted ${selectedTargets.length} token(s) based on selected area (${areaRelation}).`);
      return true;
    }
  }
}
