import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { CanvasInputSession } from "../../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../../canvas/canvas-selection-renderer.mjs";
import { RangeHelper } from "../range-helper.mjs";
import { getActiveWeapons } from "../../sheets/character/handlers-combat.mjs";

export class SelectTargetBehavior {
  /**
   * 1. selectTarget: Target mode "self", "creatures", "aoe", or "area".
   * For "creatures" mode: prompts interactive canvas selection for up to N targets.
   * For "aoe" / "area" mode: selects all valid tokens by default, or prompts interactive
   * selection to choose up to N creatures from inside the area if chooseCreatures is enabled.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, actor, item) {
    const params = behavior.params || {};
    const mode = params.targetMode || "creatures";
    const token = context.sourceToken || DeedBehaviorUtils.findToken(actor);

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

      const resultTargets = await this.#selectTokensInteractive({
        maxCount,
        sourceToken: token,
        params,
        item,
        actor
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
        ...item?.system,
        targetType: aoeType,
        targetSize: aoeSize,
        range: item?.system?.range ?? null
      };

      if (!token) {
        ui.notifications.warn("No token found on canvas for AoE template placement.");
        return false;
      }

      const activeWeapons = getActiveWeapons(actor);
      const result = await TargetingHelper.placeTemplate(actor, token, deedData, activeWeapons, {
        item,
        originOverride: context.sourcePosition || null
      });
      if (!result || !result.squares) {
        ui.notifications.info("AoE template placement cancelled.");
        return false;
      }

      // Save area in context for subsequent behaviors and phases
      const isPath = (aoeType === "path" || aoeType === "close_path");
      const areaData = {
        id: behavior.id,
        squares: result.squares,
        type: aoeType,
        size: aoeSize,
        isPath
      };
      if (!context.areas) context.areas = new Map();
      context.areas.set(behavior.id, areaData);
      context.area = areaData;
      DeedBehaviorUtils.renderAreaHighlight(context);

      const gridPx = canvas.grid.size;
      const tokensInAoE = TargetingHelper.getTokensInSquares(result.squares, gridPx, {
        disposition: params.disposition,
        sourceToken: token,
        excludeTokenId: params.ignoreSelf ? token?.id : null
      });

      if (!params.chooseCreatures) {
        context.targets = tokensInAoE;
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets(tokensInAoE.map(t => t.id));
        }
        ui.notifications.info(`AoE targeted ${tokensInAoE.length} token(s).`);
        return true;
      }

      if (tokensInAoE.length === 0) {
        context.targets = [];
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets([]);
        }
        ui.notifications.info("No valid targets in AoE.");
        return true;
      }

      const maxCount = parseInt(params.targetCount) || 1;
      const resultTargets = await this.#selectTokensInteractive({
        candidateTokens: tokensInAoE,
        maxCount,
        sourceToken: token,
        params,
        areaSquares: result.squares
      });

      if (resultTargets === null) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = resultTargets;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(resultTargets.map(t => t.id));
      }
      ui.notifications.info(`Targeted ${resultTargets.length} token(s) from AoE.`);
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
      const sourceToken = token || DeedBehaviorUtils.findToken(actor);
      const selectedTargets = TargetingHelper.getTokensInSquares(evalSquares, gridPx, {
        disposition: params.disposition,
        sourceToken: sourceToken,
        excludeTokenId: params.ignoreSelf ? sourceToken?.id : null
      });

      if (!params.chooseCreatures) {
        context.targets = selectedTargets;
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets(selectedTargets.map(t => t.id));
        }
        ui.notifications.info(`Targeted ${selectedTargets.length} token(s) based on selected area (${areaRelation}).`);
        return true;
      }

      if (selectedTargets.length === 0) {
        context.targets = [];
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets([]);
        }
        ui.notifications.info("No valid targets in selected area.");
        return true;
      }

      const maxCount = parseInt(params.targetCount) || 1;
      const resultTargets = await this.#selectTokensInteractive({
        candidateTokens: selectedTargets,
        maxCount,
        sourceToken,
        params,
        areaSquares: evalSquares
      });

      if (resultTargets === null) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = resultTargets;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(resultTargets.map(t => t.id));
      }
      ui.notifications.info(`Targeted ${resultTargets.length} token(s) from selected area (${areaRelation}).`);
      return true;
    }
  }

  /**
   * Interactive token selection session via CanvasInputSession.
   * @param {object} options
   * @param {Token[]} [options.candidateTokens] - If provided, only allows choosing from these candidate tokens
   * @param {number} options.maxCount - Max targets to select
   * @param {Token} options.sourceToken - Source caster token
   * @param {object} options.params - Behavior params
   * @param {Array<{x:number, y:number}>} [options.areaSquares] - Optional area squares for visual boundary overlay
   * @returns {Promise<Token[]|null>}
   * @private
   */
  static async #selectTokensInteractive({ candidateTokens = null, maxCount = 1, sourceToken, params = {}, areaSquares = null, item = null, actor = null }) {
    const isAreaMode = Array.isArray(areaSquares) && areaSquares.length > 0;
    const gridPx = canvas.grid.size;
    const maxRangeSq = isAreaMode ? null : RangeHelper.getDeedRange(sourceToken, item, actor);
    let hoveredSquare = null;

    // If candidate tokens exist and count <= maxCount, pre-populate selection for convenience
    const selectedTargets = (candidateTokens && candidateTokens.length <= maxCount)
      ? [...candidateTokens]
      : [];

    if (game.user.updateTokenTargets && selectedTargets.length > 0) {
      game.user.updateTokenTargets(selectedTargets.map(t => t.id));
    }

    const title = isAreaMode
      ? (game.i18n.has("TRESPASSER.HUD.Action.SelectTargetsFromArea")
          ? game.i18n.localize("TRESPASSER.HUD.Action.SelectTargetsFromArea")
          : "Select Target(s) from Area")
      : (game.i18n.has("TRESPASSER.HUD.Action.SelectTargets")
          ? game.i18n.localize("TRESPASSER.HUD.Action.SelectTargets")
          : "Select Target(s)");

    const formatDetails = (count) => {
      if (isAreaMode && game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsFromAreaInstruction")) {
        return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsFromAreaInstruction", { current: count, max: maxCount });
      }
      if (maxRangeSq && maxRangeSq > 0 && game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsRangeInstruction")) {
        return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsRangeInstruction", { current: count, max: maxCount, range: maxRangeSq });
      }
      if (game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsInstruction")) {
        return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsInstruction", { current: count, max: maxCount });
      }
      return `Select target(s) on canvas (${count} of ${maxCount} selected).`;
    };

    const redrawHighlights = (session, hoveredSq = null) => {
      if (!session || !session.graphics) return;
      session.graphics.clear();

      // 1. Draw subtle area boundary overlay if area mode
      if (isAreaMode) {
        CanvasSelectionRenderer.drawPlacedOrigin(session.graphics, areaSquares, gridPx, {
          color: 0x55AAFF,
          fillAlpha: 0.12,
          lineWeight: 1
        });
      } else if (maxRangeSq && maxRangeSq > 0) {
        CanvasSelectionRenderer.drawRangePerimeter(session.graphics, sourceToken, maxRangeSq, gridPx);
      }

      // 2. Draw candidate token outlines in green (if not yet selected)
      if (candidateTokens) {
        for (const cToken of candidateTokens) {
          if (selectedTargets.some(t => t.id === cToken.id)) continue;
          const tW = cToken.document.width ?? 1;
          const tH = cToken.document.height ?? 1;
          const cSq = [];
          for (let tx = 0; tx < tW; tx++) {
            for (let ty = 0; ty < tH; ty++) {
              cSq.push({ x: cToken.document.x + tx * gridPx, y: cToken.document.y + ty * gridPx });
            }
          }
          CanvasSelectionRenderer.drawCandidateSquares(session.graphics, cSq, gridPx, { hoveredSquare: null });
        }
      }

      // 3. Draw gold highlight boxes over already selected targets
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

      // 4. Draw green candidate highlight box over hovered square
      if (hoveredSq) {
        CanvasSelectionRenderer.drawCandidateSquares(session.graphics, [hoveredSq], gridPx, { hoveredSquare: hoveredSq });
      }
    };

    return CanvasInputSession.start({
      title,
      details: formatDetails(selectedTargets.length),
      icon: isAreaMode ? "fas fa-bullseye" : "fas fa-crosshairs",
      showConfirm: true,
      canConfirm: selectedTargets.length > 0,
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
        const rawTokens = TargetingHelper.getTokensInSquares([{ x: snapped.x, y: snapped.y }], gridPx);
        const tokensInSq = TargetingHelper.getTokensInSquares([{ x: snapped.x, y: snapped.y }], gridPx, {
          disposition: params.disposition,
          sourceToken,
          excludeTokenId: params.ignoreSelf ? sourceToken?.id : null
        });

        if (isAreaMode && candidateTokens) {
          const hitToken = tokensInSq.find(t => candidateTokens.some(c => c.id === t.id));
          if (hitToken) {
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
          } else if (rawTokens.length > 0) {
            const isInsideCandidate = rawTokens.some(t => candidateTokens.some(c => c.id === t.id));
            if (!isInsideCandidate) {
              ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.TargetMustBeInArea") || "Selected target must be inside the designated area.");
            } else {
              ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidTargetDisposition") || "Selected target does not match the required disposition.");
            }
          }
        } else {
          if (tokensInSq.length > 0) {
            const hitToken = tokensInSq[0];
            const idx = selectedTargets.findIndex(t => t.id === hitToken.id);
            if (idx >= 0) {
              selectedTargets.splice(idx, 1);
            } else {
              if (maxRangeSq && !RangeHelper.isWithinRange(sourceToken, hitToken, maxRangeSq)) {
                const dist = RangeHelper.measureDistanceSquares(sourceToken, hitToken);
                ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
                  name: hitToken.name,
                  range: maxRangeSq,
                  distance: dist
                }));
                return;
              }
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
          } else if (rawTokens.length > 0) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidTargetDisposition") || "Selected target does not match the required disposition.");
          }
        }
      },
      onConfirm: () => {
        return selectedTargets;
      },
      onCancel: () => {
        return null;
      }
    });
  }
}
