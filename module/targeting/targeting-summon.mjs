/**
 * targeting-summon.mjs
 * Interactive canvas session for choosing creature summon placement squares.
 */
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { getCanvasPointerPosition } from "../canvas/canvas-pointer-utils.mjs";
import { validateSummonFootprint } from "./summon-validation.mjs";
import { TargetingPreviewSyncer } from "./targeting-preview-syncer.mjs";

/**
 * Prompts the user to place a single creature on the canvas.
 * @param {object} options
 * @param {object} options.creature - Creature entry { id, uuid, name, img, size }
 * @param {number} options.index - Current creature index (0-based)
 * @param {number} options.total - Total number of creatures to summon
 * @param {Token} [options.sourceToken] - Caster token
 * @param {{x: number, y: number}|null} [options.sourcePos] - Source position override
 * @param {number|null} [options.maxRangeSq] - Maximum range in squares (when not in area mode)
 * @param {Array<{x: number, y: number}>|null} [options.areaSquares] - Allowed area squares
 * @param {Array<object>} [options.pendingPlacements=[]] - Already placed creature placements in this queue
 * @returns {Promise<{ x: number, y: number, size: number, squares: Array<{x: number, y: number}> } | { undo: true } | null>}
 */
export async function promptCreaturePlacement(options) {
  if (!canvas.ready) return null;

  const {
    creature,
    index = 0,
    total = 1,
    sourceToken = null,
    sourcePos = null,
    maxRangeSq = null,
    areaSquares = null,
    pendingPlacements = []
  } = options;

  const gridPx = canvas.grid.size;
  const size = Math.max(1, parseInt(creature.size) || 1);
  const isAreaMode = Array.isArray(areaSquares) && areaSquares.length > 0;

  let selectedOrigin = null;
  let hoveredOrigin = null;
  let selectedSquares = [];

  const pendingFootprints = pendingPlacements.map(p => p.squares || []);
  const allPendingSquares = pendingFootprints.flat();

  const computeFootprint = (origin) => {
    if (!origin) return [];
    const squares = [];
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        squares.push({ x: origin.x + dx * gridPx, y: origin.y + dy * gridPx });
      }
    }
    return squares;
  };

  const getSnappedOrigin = (canvasPos) => {
    const snapped = canvas.grid.getTopLeftPoint(canvasPos);
    if (size === 1) return { x: snapped.x, y: snapped.y };
    const offset = Math.floor(size / 2) * gridPx;
    return { x: snapped.x - offset, y: snapped.y - offset };
  };

  const redrawPreview = (session) => {
    if (!session || !session.graphics) return;
    session.graphics.clear();

    // 1. Draw Range Perimeter (or Area Boundary)
    if (isAreaMode) {
      CanvasSelectionRenderer.drawPlacedOrigin(session.graphics, areaSquares, gridPx, {
        color: 0x55AAFF,
        fillAlpha: 0.12,
        lineWeight: 1
      });
    } else if (sourceToken && maxRangeSq !== null && maxRangeSq !== undefined && maxRangeSq > 0) {
      CanvasSelectionRenderer.drawRangePerimeter(session.graphics, sourceToken, maxRangeSq, gridPx, {
        originOverride: sourcePos
      });
    }

    // 2. Draw Previously Placed Summon Footprints in Gold
    if (allPendingSquares.length > 0) {
      CanvasSelectionRenderer.drawPlacedOrigin(session.graphics, allPendingSquares, gridPx, {
        color: 0xE8C96B,
        fillAlpha: 0.35,
        lineWeight: 2
      });
    }

    // 3. Draw Currently Selected Footprint
    if (selectedOrigin && selectedSquares.length > 0) {
      CanvasSelectionRenderer.drawPlacedOrigin(session.graphics, selectedSquares, gridPx, {
        color: 0x4fc3f7,
        fillAlpha: 0.40,
        lineWeight: 2
      });
    }

    // 4. Draw Active Mouse Hover Overlay
    let hoverSquares = [];
    let blockedSquares = [];
    if (hoveredOrigin) {
      const isSame = selectedOrigin && hoveredOrigin.x === selectedOrigin.x && hoveredOrigin.y === selectedOrigin.y;
      if (!isSame) {
        hoverSquares = computeFootprint(hoveredOrigin);
        const validation = validateSummonFootprint(hoverSquares, {
          sourceToken,
          sourcePos,
          gridPx,
          maxRangeSq: isAreaMode ? null : maxRangeSq,
          areaSquares,
          pendingFootprints
        });

        if (validation.valid) {
          CanvasSelectionRenderer.drawCandidateSquares(session.graphics, hoverSquares, gridPx);
        } else {
          blockedSquares = validation.blockedSquares || hoverSquares;
          for (const bSq of blockedSquares) {
            CanvasSelectionRenderer.drawBlockedSquare(session.graphics, bSq, gridPx);
          }
        }
      }
    }

    // 5. Broadcast Preview to Other Clients (Spectator Mode)
    TargetingPreviewSyncer.sync({
      rangePerimeter: (!isAreaMode && sourceToken && maxRangeSq > 0) ? {
        tokenId: sourceToken?.id,
        rangeSq: maxRangeSq,
        originOverride: sourcePos
      } : null,
      placedSquares: [...allPendingSquares, ...selectedSquares],
      candidateSquares: hoverSquares.length > 0 ? hoverSquares : null,
      blockedSquares: blockedSquares.length > 0 ? blockedSquares : null
    });
  };

  const cleanup = () => {
    TargetingPreviewSyncer.clear();
  };

  const title = game.i18n.format("TRESPASSER.HUD.Action.SummonCreatureStep", {
    name: creature.name,
    current: index + 1,
    total
  }) || `Summon ${creature.name} (${index + 1}/${total})`;

  const details = isAreaMode
    ? (game.i18n.localize("TRESPASSER.Notification.Combat.SquareOutsideArea") || "Click inside designated area to place.")
    : (game.i18n.localize("TRESPASSER.HUD.AoE.SummonInstruction") || "Click to select placement location.");

  return CanvasInputSession.start({
    title,
    details,
    icon: "fas fa-paw",
    showConfirm: true,
    canConfirm: false,
    showUndo: index > 0,
    canUndo: index > 0,
    showCancel: true,
    onPointerMove: (ev, session) => {
      const lastPos = getCanvasPointerPosition(ev);
      if (!lastPos) return;
      hoveredOrigin = getSnappedOrigin(lastPos);
      redrawPreview(session);
    },
    onClick: (ev, session) => {
      const lastPos = getCanvasPointerPosition(ev);
      if (!lastPos) return;

      const origin = getSnappedOrigin(lastPos);
      const footprint = computeFootprint(origin);

      const validation = validateSummonFootprint(footprint, {
        sourceToken,
        sourcePos,
        gridPx,
        maxRangeSq: isAreaMode ? null : maxRangeSq,
        areaSquares,
        pendingFootprints
      });

      if (!validation.valid) {
        if (validation.reason === "outside_area") {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.SquareOutsideArea") || "Placement must be inside the designated area.");
        } else if (validation.reason === "creature") {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.SquareBlockedCreature") || "Cannot summon on occupied square.");
        } else if (validation.reason === "wall" || validation.reason === "obstacle") {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.SquareBlockedObstacle") || "Cannot summon on walls or obstacles.");
        } else if (validation.reason === "out_of_range") {
          ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
            name: creature.name,
            range: maxRangeSq,
            distance: validation.distance
          }) || `Out of range (${validation.distance} > ${maxRangeSq}).`);
        }
        return;
      }

      // Second click on the same spot auto-confirms
      if (selectedOrigin && selectedOrigin.x === origin.x && selectedOrigin.y === origin.y) {
        cleanup();
        if (CanvasInputSession.activeSession) CanvasInputSession.activeSession.confirm();
        return;
      }

      selectedOrigin = origin;
      selectedSquares = footprint;
      redrawPreview(session);

      if (CanvasInputSession.activeSession) {
        CanvasInputSession.activeSession.updateOverlay({ canConfirm: true });
      }
    },
    onConfirm: () => {
      cleanup();
      if (!selectedOrigin) return null;
      return {
        x: selectedOrigin.x,
        y: selectedOrigin.y,
        size,
        squares: selectedSquares
      };
    },
    onUndo: () => {
      cleanup();
      return { undo: true };
    },
    onCancel: () => {
      cleanup();
      return null;
    }
  });
}
