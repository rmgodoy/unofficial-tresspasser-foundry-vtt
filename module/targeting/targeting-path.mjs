import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { isAdjacentToCasterToken, getTokenOccupiedSquares, getMinSquareDistance } from "./targeting-geometry.mjs";

/**
 * Interactive path placement. Click any reachable square to draw the
 * path step-by-step. Right-click undoes the last segment,
 * double-click confirms early. Directional arrows show path flow.
 * @param {Token} token
 * @param {number} maxSquares
 * @param {number} gridPx
 * @param {boolean} close
 * @param {number|null} [maxRangeSq=null]
 * @returns {Promise<{squares: Array<{x:number, y:number}>, templateDoc: null}|null>}
 */
export async function placePath(token, maxSquares, gridPx, close, maxRangeSq = null) {
  return new Promise(async (resolve) => {
    const squares = [];
    const highlights = [];
    const candidateHighlights = [];
    let hoveredSquare = null;
    const layer = canvas.interface;

    const forms2x2 = (testSquares, sq) => {
      const all = [...testSquares, sq];
      for (const s of all) {
        const right = all.some(o => o.x === s.x + gridPx && o.y === s.y);
        const below = all.some(o => o.x === s.x && o.y === s.y + gridPx);
        const diag  = all.some(o => o.x === s.x + gridPx && o.y === s.y + gridPx);
        if (right && below && diag) return true;
      }
      return false;
    };

    const isOrthogonalAdjacent = (a, b) => {
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      return (dx === gridPx && dy === 0) || (dx === 0 && dy === gridPx);
    };

    const getInitialCloseCandidates = () => {
      const candidates = [];
      const tokenTopLeft = { x: token.document.x, y: token.document.y };
      const tokenW = token.document.width ?? 1;
      const tokenH = token.document.height ?? 1;

      for (let tx = -1; tx <= tokenW; tx++) {
        for (let ty = -1; ty <= tokenH; ty++) {
          if (tx >= 0 && tx < tokenW && ty >= 0 && ty < tokenH) continue;
          candidates.push({
            x: tokenTopLeft.x + tx * gridPx,
            y: tokenTopLeft.y + ty * gridPx
          });
        }
      }
      return candidates;
    };

    const redrawAll = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;

      const gfx = new PIXI.Graphics();

      // 0. Draw dotted blue range perimeter when selecting start
      const effectiveRange = close ? 1 : maxRangeSq;
      if (effectiveRange !== null && effectiveRange !== undefined && effectiveRange > 0 && squares.length === 0) {
        CanvasSelectionRenderer.drawRangePerimeter(gfx, token, effectiveRange, gridPx);
      }

      // 1. Draw selected path squares
      if (squares.length > 0) {
        CanvasSelectionRenderer.drawPath(gfx, squares, gridPx);
      }

      // 2. Draw candidate next squares
      if (squares.length < maxSquares) {
        let candidates = [];
        if (squares.length === 0) {
          if (close) {
            candidates = getInitialCloseCandidates();
          }
        } else {
          const last = squares[squares.length - 1];
          const rawCandidates = [
            { x: last.x + gridPx, y: last.y },
            { x: last.x - gridPx, y: last.y },
            { x: last.x, y: last.y + gridPx },
            { x: last.x, y: last.y - gridPx }
          ];
          candidates = rawCandidates.filter(c => 
            !squares.some(s => s.x === c.x && s.y === c.y) && !forms2x2(squares, c)
          );
        }
        CanvasSelectionRenderer.drawCandidateSquares(gfx, candidates, gridPx, { hoveredSquare });
      }

      layer.addChild(gfx);
      highlights.push(gfx);
    };

    const cleanup = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;
      for (const gfx of candidateHighlights) { layer.removeChild(gfx); gfx.destroy(); }
      candidateHighlights.length = 0;
    };

    const updateOverlayState = () => {
      if (CanvasInputSession.activeSession) {
        const details = squares.length === 0
          ? (close 
              ? game.i18n.format("TRESPASSER.HUD.AoE.ClosePathInitialInstruction", { size: maxSquares })
              : game.i18n.format("TRESPASSER.HUD.AoE.PathInitialInstruction", { size: maxSquares }))
          : game.i18n.format("TRESPASSER.HUD.AoE.PathStepInstruction", { current: squares.length, max: maxSquares });

        CanvasInputSession.activeSession.updateOverlay({
          details,
          showUndo: squares.length > 0,
          canUndo: squares.length > 0,
          canConfirm: squares.length > 0
        });
      }
    };

    const title = close 
      ? (game.i18n.has("TRESPASSER.HUD.Action.ClosePath") ? game.i18n.localize("TRESPASSER.HUD.Action.ClosePath") : `Close Path ${maxSquares}`)
      : (game.i18n.has("TRESPASSER.HUD.Action.Path") ? game.i18n.localize("TRESPASSER.HUD.Action.Path") : `Path ${maxSquares}`);

    const initialDetails = close
      ? game.i18n.format("TRESPASSER.HUD.AoE.ClosePathInitialInstruction", { size: maxSquares })
      : game.i18n.format("TRESPASSER.HUD.AoE.PathInitialInstruction", { size: maxSquares });

    redrawAll();

    await CanvasInputSession.start({
      title,
      details: initialDetails,
      icon: "fas fa-route",
      showConfirm: true,
      canConfirm: false,
      showUndo: false,
      canUndo: false,
      showCancel: true,
      onPointerMove: (ev) => {
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
        redrawAll();
      },
      onClick: (ev) => {
        if (squares.length >= maxSquares) return;

        let pos;
        if (typeof ev.getLocalPosition === "function") {
          pos = ev.getLocalPosition(canvas.stage);
        } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
          pos = ev.data.getLocalPosition(canvas.stage);
        } else if (ev.interactionData && ev.interactionData.origin) {
          pos = ev.interactionData.origin;
        }
        if (!pos) return;

        const snapped = canvas.grid.getTopLeftPoint(pos);
        const target = { x: snapped.x, y: snapped.y };

        if (squares.some(s => s.x === target.x && s.y === target.y)) return;

        // Step 1: Initial square selection
        if (squares.length === 0) {
          if (close) {
            if (!isAdjacentToCasterToken(target, token, gridPx)) {
              ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.PathMustStartAdjacent"));
              const enforceRange = game.settings.get("trespasser", "enforceAttackRange");
              if (enforceRange) return;
            }
          } else if (maxRangeSq !== null && maxRangeSq !== undefined) {
            const tokenSquares = getTokenOccupiedSquares(token, gridPx);
            const distSq = getMinSquareDistance([target], tokenSquares, gridPx);
            if (distSq > maxRangeSq) {
              ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
                name: game.i18n.has("TRESPASSER.Notification.Combat.TargetTypePath")
                  ? game.i18n.localize("TRESPASSER.Notification.Combat.TargetTypePath")
                  : "Path",
                range: maxRangeSq,
                distance: distSq
              }));
              const enforceRange = game.settings.get("trespasser", "enforceAttackRange");
              if (enforceRange || maxRangeSq === 0) return;
            }
          }
          squares.push(target);
          redrawAll();
          updateOverlayState();
          return;
        }

        // Step 2 to N: Must be orthogonally adjacent to the last square
        const last = squares[squares.length - 1];
        if (!isOrthogonalAdjacent(last, target)) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.PathNoRoute"));
          return;
        }

        if (forms2x2(squares, target)) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.PathNo2x2"));
          return;
        }

        squares.push(target);
        redrawAll();
        updateOverlayState();
      },
      onUndo: () => {
        if (squares.length === 0) return;
        squares.pop();
        redrawAll();
        updateOverlayState();
      },
      onConfirm: () => {
        cleanup();
        resolve({ squares: [...squares], templateDoc: null });
      },
      onCancel: () => {
        cleanup();
        resolve(null);
      }
    });
  });
}
