import { TerrainHelper } from "../helpers/terrain-helper.mjs";
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { checkCollisionAtSquare } from "./forced-movement-collision.mjs";

export const FORCED_MOVEMENT_TYPES = {
  PUSH: "push",
  PULL: "pull",
  SWEEP: "sweep",
  SHOVE: "shove",
  DRAG: "drag"
};

/**
 * Calculate valid next grid squares for forced movement step.
 */
export function getValidSquares(movingToken, currentPos, movementType, existingPath, targetInitialPos, referenceToken, options = {}) {
  const valid = [];
  const gridSize = canvas.scene.grid.size;
  
  let refPos = null;
  if (referenceToken) {
    refPos = {
      x: Math.floor(referenceToken.center.x / gridSize),
      y: Math.floor(referenceToken.center.y / gridSize)
    };
  } else if (options.terrainRegion) {
    const region = options.terrainRegion;
    const shape = region.shapes?.[0];
    if (shape) {
      let cx = 0, cy = 0;
      if (shape.type === "rectangle") {
        cx = shape.x + (shape.width / 2);
        cy = shape.y + (shape.height / 2);
      } else if (shape.type === "emanation" && shape.base) {
        const baseW = (shape.base.width || 1) * gridSize;
        const baseH = (shape.base.height || 1) * gridSize;
        cx = shape.base.x + (baseW / 2);
        cy = shape.base.y + (baseH / 2);
      }
      refPos = {
        x: Math.floor(cx / gridSize),
        y: Math.floor(cy / gridSize)
      };
    }
  }

  const currentDist = refPos ? Math.max(Math.abs(currentPos.x - refPos.x), Math.abs(currentPos.y - refPos.y)) : 0;

  const directions = [
    {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1},
    {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}
  ];

  for (const dir of directions) {
    const testPos = { x: currentPos.x + dir.dx, y: currentPos.y + dir.dy };

    if (existingPath.some(sq => sq.x === testPos.x && sq.y === testPos.y)) continue;
    if (testPos.x === targetInitialPos.x && testPos.y === targetInitialPos.y) continue;

    let isValid = false;

    if (options.direction) {
      if (options.direction === "caster_choice") {
        isValid = true;
      } else if (options.direction === "along_terrain_path" && options.pathSquares) {
        const inTerrain = options.pathSquares.some(sq => sq.x === testPos.x && sq.y === testPos.y);
        if (inTerrain) {
          if (refPos) {
            const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
            isValid = testDist > currentDist;
          } else {
            isValid = true;
          }
        }
      } else if (options.direction === "toward_origin" && refPos) {
        const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
        isValid = testDist < currentDist;
      } else if (options.direction === "away_from_origin" && refPos) {
        const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
        isValid = testDist > currentDist;
      } else if (options.direction === "path_direction" && options.pathSquares) {
        const currentIdx = options.pathSquares.findIndex(sq => sq.x === currentPos.x && sq.y === currentPos.y);
        const testIdx = options.pathSquares.findIndex(sq => sq.x === testPos.x && sq.y === testPos.y);
        isValid = testIdx > currentIdx;
      }
    } else {
      if (refPos) {
        const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
        if (movementType === FORCED_MOVEMENT_TYPES.PUSH || movementType === FORCED_MOVEMENT_TYPES.SHOVE || movementType === FORCED_MOVEMENT_TYPES.DRAG) {
          isValid = testDist > currentDist;
        } else if (movementType === FORCED_MOVEMENT_TYPES.PULL) {
          isValid = testDist < currentDist;
        } else if (movementType === FORCED_MOVEMENT_TYPES.SWEEP) {
          isValid = true;
        } else {
          isValid = testDist > currentDist;
        }
      } else {
         isValid = true;
      }
    }

    if (isValid) {
      valid.push(testPos);
    }
  }
  return valid;
}

/**
 * Interactive path selection overlay for forced movement.
 */
export async function selectForcedPath(movingToken, referenceToken, movementType, distance, options = {}) {
  return new Promise(async (resolve) => {
    let remainingSquares = distance;
    let path = [];
    let totalDamage = 0;
    let collisions = [];
    const historyStack = [];

    const gridSize = canvas.scene.grid.size;
    const initialPos = { 
      x: Math.floor(movingToken.center.x / gridSize), 
      y: Math.floor(movingToken.center.y / gridSize) 
    };
    let currentPos = { ...initialPos };

    const typeKey = Object.values(FORCED_MOVEMENT_TYPES).includes(movementType) ? movementType : "push";
    const typeLabel = game.i18n.localize(`TRESPASSER.HUD.ForcedMovement.Types.${typeKey}`);

    const overlayGraphics = new PIXI.Graphics();
    canvas.controls.addChild(overlayGraphics);

    const drawOverlay = () => {
      overlayGraphics.clear();

      if (remainingSquares > 0) {
        const validSquares = getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken, options);
        const pixelSquares = validSquares.map(sq => ({ x: sq.x * gridSize, y: sq.y * gridSize }));
        CanvasSelectionRenderer.drawCandidateSquares(overlayGraphics, pixelSquares, gridSize);
      }

      if (path.length > 0) {
        const pixelPath = path.map(sq => ({ x: sq.x * gridSize, y: sq.y * gridSize }));
        CanvasSelectionRenderer.drawPath(overlayGraphics, pixelPath, gridSize, { drawArrows: false });
      }

      if (collisions.length > 0 && historyStack.length > 0) {
        const lastRecord = historyStack[historyStack.length - 1];
        if (lastRecord.pos && (lastRecord.damageAdded > 0 || lastRecord.collisionsAdded.some(c => c.type === "creature" || c.type === "wall"))) {
          CanvasSelectionRenderer.drawBlockedSquare(overlayGraphics, { x: lastRecord.pos.x * gridSize, y: lastRecord.pos.y * gridSize }, gridSize);
        }
      }
    };

    const cleanupGraphics = () => {
      if (overlayGraphics && !overlayGraphics.destroyed) {
        overlayGraphics.clear();
        overlayGraphics.destroy();
      }
    };

    const updateOverlayText = () => {
      if (CanvasInputSession.activeSession) {
        const title = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerTitle", {
          type: typeLabel,
          name: movingToken.name,
          remaining: remainingSquares
        });
        const details = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerDamage", { damage: totalDamage });
        CanvasInputSession.activeSession.updateOverlay({
          title,
          details,
          showUndo: historyStack.length > 0,
          canUndo: historyStack.length > 0,
          canConfirm: true
        });
      }
    };

    drawOverlay();

    const initialTitle = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerTitle", {
      type: typeLabel,
      name: movingToken.name,
      remaining: remainingSquares
    });
    const initialDetails = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerDamage", { damage: totalDamage });

    await CanvasInputSession.start({
      title: initialTitle,
      details: initialDetails,
      icon: "fas fa-compress-arrows-alt",
      showConfirm: true,
      canConfirm: true,
      showUndo: false,
      canUndo: false,
      showCancel: true,
      onPointerMove: () => {
        drawOverlay();
      },
      onClick: async (ev) => {
        if (remainingSquares <= 0) return;

        let pos;
        if (typeof ev.getLocalPosition === "function") {
          pos = ev.getLocalPosition(canvas.app.stage);
        } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
          pos = ev.data.getLocalPosition(canvas.app.stage);
        } else if (ev.interactionData && ev.interactionData.origin) {
          pos = ev.interactionData.origin;
        }
        if (!pos) return;

        const gridX = Math.floor(pos.x / gridSize);
        const gridY = Math.floor(pos.y / gridSize);

        const validSquares = getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken, options);
        const isValid = validSquares.some(sq => sq.x === gridX && sq.y === gridY);

        if (isValid) {
          const collision = checkCollisionAtSquare(gridX, gridY, gridSize, movingToken.id, currentPos);
          const stepRecord = {
            pos: { x: gridX, y: gridY },
            damageAdded: 0,
            collisionsAdded: [],
            prevRemaining: remainingSquares,
            wasPathStep: false
          };

          if (collision.type === "wall") {
            const damage = Math.min(10 - totalDamage, 2 * remainingSquares);
            totalDamage += damage;
            const col = { type: "wall", damage };
            collisions.push(col);
            stepRecord.damageAdded = damage;
            stepRecord.collisionsAdded.push(col);
            remainingSquares = 0;
          } else if (collision.type === "creature") {
            const col = { type: "creature", token: collision.token };
            collisions.push(col);
            stepRecord.collisionsAdded.push(col);
            remainingSquares = 0;
          } else {
            path.push({ x: gridX, y: gridY });
            currentPos = { x: gridX, y: gridY };
            remainingSquares--;
            stepRecord.wasPathStep = true;

            if (collision.type === "obstacle") {
              const damage = Math.min(10 - totalDamage, 2);
              totalDamage += damage;
              const col = { type: "obstacle", damage, region: collision.region };
              collisions.push(col);
              stepRecord.damageAdded = damage;
              stepRecord.collisionsAdded.push(col);
              await TerrainHelper.transformObstacleToRubble(collision.region);
            }
          }

          historyStack.push(stepRecord);
          drawOverlay();
          updateOverlayText();
        }
      },
      onUndo: () => {
        if (historyStack.length === 0) return;
        const lastStep = historyStack.pop();
        if (lastStep.damageAdded) totalDamage -= lastStep.damageAdded;
        if (lastStep.collisionsAdded && lastStep.collisionsAdded.length > 0) {
          for (const col of lastStep.collisionsAdded) {
            const idx = collisions.indexOf(col);
            if (idx !== -1) collisions.splice(idx, 1);
          }
        }

        if (lastStep.wasPathStep && path.length > 0) {
          path.pop();
        }

        if (path.length > 0) {
          currentPos = { ...path[path.length - 1] };
        } else {
          currentPos = { ...initialPos };
        }
        remainingSquares = lastStep.prevRemaining;

        drawOverlay();
        updateOverlayText();
      },
      onConfirm: () => {
        cleanupGraphics();
        resolve({ path, collisions, totalDamage });
      },
      onCancel: () => {
        cleanupGraphics();
        resolve({ path: [], collisions: [], totalDamage: 0 });
      }
    });
  });
}
