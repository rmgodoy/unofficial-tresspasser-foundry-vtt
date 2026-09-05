import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { isBlastAdjacentToToken, getTokenOccupiedSquares, getMinSquareDistance } from "./targeting-geometry.mjs";

/**
 * Interactive N×N blast placement. A highlighted grid overlay follows the
 * mouse cursor. Left-click to confirm, right-click to cancel.
 * @param {Token} token        Caster token
 * @param {number} size        Blast size in squares (N)
 * @param {number} gridPx      Pixels per grid square
 * @param {boolean|null} close If true, blast must be adjacent to caster
 * @param {number|null} maxRangeSq Max range in squares
 * @returns {Promise<{squares: Array<{x:number, y:number}>, templateDoc: null}|null>}
 */
export async function placeBlast(token, size, gridPx, close, maxRangeSq = null) {
  return new Promise(async (resolve) => {
    const layer = canvas.interface;
    let selectedOrigin = null;
    let hoveredOrigin = null;
    let currentSquares = [];
    const highlights = [];

    const redrawPreview = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;
      currentSquares = [];

      const gfx = new PIXI.Graphics();

      // 0. Draw dotted blue range perimeter (range 1 for close blast, or maxRangeSq for ranged blast)
      const effectiveRange = close ? 1 : maxRangeSq;
      if (effectiveRange !== null && effectiveRange !== undefined && effectiveRange > 0) {
        CanvasSelectionRenderer.drawRangePerimeter(gfx, token, effectiveRange, gridPx);
      }

      // 1. Draw selected origin if set (in gold/placed style)
      if (selectedOrigin) {
        for (let dx = 0; dx < size; dx++) {
          for (let dy = 0; dy < size; dy++) {
            currentSquares.push({ x: selectedOrigin.x + dx * gridPx, y: selectedOrigin.y + dy * gridPx });
          }
        }
        CanvasSelectionRenderer.drawPlacedOrigin(gfx, currentSquares, gridPx);
      }

      // 2. Draw active mouse hover overlay (in standard green selection style)
      if (hoveredOrigin) {
        const isSame = selectedOrigin && hoveredOrigin.x === selectedOrigin.x && hoveredOrigin.y === selectedOrigin.y;
        if (!isSame) {
          const hoverSquares = [];
          for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
              hoverSquares.push({ x: hoveredOrigin.x + dx * gridPx, y: hoveredOrigin.y + dy * gridPx });
            }
          }
          CanvasSelectionRenderer.drawCandidateSquares(gfx, hoverSquares, gridPx);
        }
      }

      layer.addChild(gfx);
      highlights.push(gfx);
    };

    const cleanup = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;
    };

    const title = close 
      ? (game.i18n.has("TRESPASSER.HUD.Action.CloseBlast") ? game.i18n.localize("TRESPASSER.HUD.Action.CloseBlast") : `Close Blast ${size}`)
      : (game.i18n.has("TRESPASSER.HUD.Action.Blast") ? game.i18n.localize("TRESPASSER.HUD.Action.Blast") : `Blast ${size}`);

    const details = close
      ? game.i18n.format("TRESPASSER.HUD.AoE.CloseBlastInstruction", { size })
      : game.i18n.format("TRESPASSER.HUD.AoE.BlastInstruction", { size });

    // Render initial range perimeter immediately
    redrawPreview();

    await CanvasInputSession.start({
      title,
      details,
      icon: "fas fa-bullseye",
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
        const offsetX = snapped.x - Math.floor(size / 2) * gridPx;
        const offsetY = snapped.y - Math.floor(size / 2) * gridPx;
        hoveredOrigin = { x: offsetX, y: offsetY };
        redrawPreview();
      },
      onClick: (ev) => {
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
        const offsetX = snapped.x - Math.floor(size / 2) * gridPx;
        const offsetY = snapped.y - Math.floor(size / 2) * gridPx;

        const testSquares = [];
        for (let dx = 0; dx < size; dx++) {
          for (let dy = 0; dy < size; dy++) {
            testSquares.push({ x: offsetX + dx * gridPx, y: offsetY + dy * gridPx });
          }
        }

        if (close) {
          if (!isBlastAdjacentToToken(testSquares, token, gridPx)) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.BlastMustBeAdjacent"));
            const enforceRange = game.settings.get("trespasser", "enforceAttackRange");
            if (enforceRange) return;
          }
        } else if (maxRangeSq !== null && maxRangeSq !== undefined) {
          const tokenSquares = getTokenOccupiedSquares(token, gridPx);
          const distSq = getMinSquareDistance(testSquares, tokenSquares, gridPx);
          if (distSq > maxRangeSq) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
              name: game.i18n.localize("TRESPASSER.Notification.Combat.TargetTypeBlast"),
              range: maxRangeSq,
              distance: distSq
            }));
            const enforceRange = game.settings.get("trespasser", "enforceAttackRange");
            if (enforceRange || maxRangeSq === 0) return;
          }
        }

        // Check for second click (double click) on already selected origin -> auto confirm!
        if (selectedOrigin && selectedOrigin.x === offsetX && selectedOrigin.y === offsetY) {
          cleanup();
          if (CanvasInputSession.activeSession) CanvasInputSession.activeSession.confirm();
          resolve({ squares: [...currentSquares], templateDoc: null });
          return;
        }

        selectedOrigin = { x: offsetX, y: offsetY };
        redrawPreview();

        if (CanvasInputSession.activeSession) {
          CanvasInputSession.activeSession.updateOverlay({ canConfirm: true });
        }
      },
      onConfirm: () => {
        cleanup();
        resolve({ squares: [...currentSquares], templateDoc: null });
      },
      onCancel: () => {
        cleanup();
        resolve(null);
      }
    });
  });
}
