import { TargetingHelper } from "../targeting-helper.mjs";
import { CanvasInputSession } from "../../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../../canvas/canvas-selection-renderer.mjs";
import { RangeHelper } from "../range-helper.mjs";

/**
 * Prompts the user to select the terrain placement on the canvas using CanvasInputSession.
 * @param {Item} terrainItem
 * @param {Token} sourceToken
 * @param {Item} deedItem
 * @returns {Promise<{x: number, y: number}|null>}
 */
export async function promptCanvasPlacement(terrainItem, sourceToken, deedItem) {
  if (!canvas.ready || !terrainItem) return null;

  const gridSize = canvas.grid.size;
  const wSq = terrainItem.system.width || 1;
  const hSq = terrainItem.system.height || 1;
  const wPx = wSq * gridSize;
  const hPx = hSq * gridSize;
  const range = deedItem ? (RangeHelper.getDeedRange(sourceToken, deedItem, sourceToken?.actor) ?? deedItem.system?.range ?? 0) : 0;

  let selectedPos = null;
  let hoveredPos = null;
  const highlights = [];
  const layer = canvas.interface;

  const redrawTerrainPreview = () => {
    for (const gfx of highlights) {
      layer.removeChild(gfx);
      gfx.destroy();
    }
    highlights.length = 0;

    const gfx = new PIXI.Graphics();

    if (sourceToken && range > 0) {
      CanvasSelectionRenderer.drawRangePerimeter(gfx, sourceToken, range, gridSize);
    }

    if (selectedPos) {
      const placedSquares = [];
      for (let dx = 0; dx < wSq; dx++) {
        for (let dy = 0; dy < hSq; dy++) {
          placedSquares.push({ x: selectedPos.x + dx * gridSize, y: selectedPos.y + dy * gridSize });
        }
      }
      CanvasSelectionRenderer.drawPlacedOrigin(gfx, placedSquares, gridSize);
    }

    if (hoveredPos) {
      const isSame = selectedPos && hoveredPos.x === selectedPos.x && hoveredPos.y === selectedPos.y;
      if (!isSame) {
        const hoverSquares = [];
        for (let dx = 0; dx < wSq; dx++) {
          for (let dy = 0; dy < hSq; dy++) {
            hoverSquares.push({ x: hoveredPos.x + dx * gridSize, y: hoveredPos.y + dy * gridSize });
          }
        }
        CanvasSelectionRenderer.drawCandidateSquares(gfx, hoverSquares, gridSize);
      }
    }

    layer.addChild(gfx);
    highlights.push(gfx);
  };

  const cleanup = () => {
    for (const gfx of highlights) {
      layer.removeChild(gfx);
      gfx.destroy();
    }
    highlights.length = 0;
  };

  const title = game.i18n.format("TRESPASSER.Notification.Combat.PlaceTerrain", { name: terrainItem.name })
    || `Place ${terrainItem.name}`;

  const positionResult = await CanvasInputSession.start({
    title,
    details: game.i18n.localize("TRESPASSER.HUD.AoE.BlastInstruction") || "Click to select terrain location.",
    icon: "fas fa-mountain",
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
      const offsetX = snapped.x - Math.floor(wSq / 2) * gridSize;
      const offsetY = snapped.y - Math.floor(hSq / 2) * gridSize;
      hoveredPos = { x: offsetX, y: offsetY };
      redrawTerrainPreview();
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
      const offsetX = snapped.x - Math.floor(wSq / 2) * gridSize;
      const offsetY = snapped.y - Math.floor(hSq / 2) * gridSize;

      // Check range if applicable
      if (range > 0 && sourceToken) {
        const testSquares = [];
        for (let dx = 0; dx < wSq; dx++) {
          for (let dy = 0; dy < hSq; dy++) {
            testSquares.push({ x: offsetX + dx * gridSize, y: offsetY + dy * gridSize });
          }
        }
        const tokenSquares = TargetingHelper.getTokenOccupiedSquares?.(sourceToken, gridSize) || [{ x: sourceToken.x, y: sourceToken.y }];
        let minDist = Infinity;
        for (const ts of testSquares) {
          for (const tks of tokenSquares) {
            const d = Math.max(Math.abs(ts.x - tks.x), Math.abs(ts.y - tks.y)) / gridSize;
            if (d < minDist) minDist = d;
          }
        }
        if (minDist > range) {
          ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
            name: terrainItem.name,
            range: range,
            distance: minDist
          }) || `Out of range (${minDist} > ${range}).`);
          const enforceRange = game.settings.get?.("trespasser", "enforceAttackRange");
          if (enforceRange) return;
        }
      }

      // Double click / second click on same pos -> auto confirm
      if (selectedPos && selectedPos.x === offsetX && selectedPos.y === offsetY) {
        cleanup();
        if (CanvasInputSession.activeSession) CanvasInputSession.activeSession.confirm();
        return;
      }

      selectedPos = { x: offsetX, y: offsetY };
      redrawTerrainPreview();

      if (CanvasInputSession.activeSession) {
        CanvasInputSession.activeSession.updateOverlay({ canConfirm: true });
      }
    },
    onConfirm: () => {
      cleanup();
      return selectedPos ? { x: selectedPos.x + wPx / 2, y: selectedPos.y + hPx / 2 } : null;
    },
    onCancel: () => {
      cleanup();
      return null;
    }
  });

  return positionResult;
}
