/**
 * summon-validation.mjs
 * Validates candidate summon placement squares against range, area boundaries, tokens, walls, and obstacles.
 */
import { checkCollisionAtSquare } from "../movement/forced-movement-collision.mjs";
import { getTokenOccupiedSquares, getMinSquareDistance } from "./targeting-geometry.mjs";

/**
 * Validates whether a candidate token footprint (array of pixel coordinates) can be placed.
 * @param {Array<{x: number, y: number}>} footprintSquares - Pixel squares of the creature footprint
 * @param {object} options
 * @param {Token} [options.sourceToken] - Caster token
 * @param {{x: number, y: number}} [options.sourcePos] - Source position
 * @param {number} options.gridPx - Grid size in pixels
 * @param {number|null} [options.maxRangeSq=null] - Maximum range in squares (when not in area mode)
 * @param {Array<{x: number, y: number}>|null} [options.areaSquares=null] - Allowed area squares
 * @param {Array<Array<{x: number, y: number}>>} [options.pendingFootprints=[]] - Previously placed summon footprints
 * @returns {{ valid: boolean, reason?: string, blockedSquares?: Array<{x: number, y: number}>, distance?: number }}
 */
export function validateSummonFootprint(footprintSquares, options = {}) {
  if (!Array.isArray(footprintSquares) || footprintSquares.length === 0) {
    return { valid: false, reason: "invalid_footprint" };
  }

  const {
    sourceToken = null,
    sourcePos = null,
    gridPx = canvas.grid?.size || 100,
    maxRangeSq = null,
    areaSquares = null,
    pendingFootprints = []
  } = options;

  // 1. Area Boundary Check (if in area mode)
  if (Array.isArray(areaSquares) && areaSquares.length > 0) {
    const areaSquareSet = new Set(
      areaSquares.map(sq => `${Math.floor(sq.x / gridPx)},${Math.floor(sq.y / gridPx)}`)
    );

    const outsideSquares = footprintSquares.filter(sq => {
      const key = `${Math.floor(sq.x / gridPx)},${Math.floor(sq.y / gridPx)}`;
      return !areaSquareSet.has(key);
    });

    if (outsideSquares.length > 0) {
      return {
        valid: false,
        reason: "outside_area",
        blockedSquares: outsideSquares
      };
    }
  }

  // 2. Range Check (if not in area mode and maxRangeSq is specified)
  if (!areaSquares && maxRangeSq !== null && maxRangeSq !== undefined && Number.isFinite(maxRangeSq) && sourceToken) {
    const tokenSquares = getTokenOccupiedSquares(sourceToken, gridPx);
    const distSq = getMinSquareDistance(footprintSquares, tokenSquares, gridPx);
    if (distSq > maxRangeSq) {
      return {
        valid: false,
        reason: "out_of_range",
        distance: distSq,
        blockedSquares: [...footprintSquares]
      };
    }
  }

  // 3. Collision, Obstacle, and Creature Occupancy Checks
  const blockedSquares = [];
  let detectedReason = "none";

  // Pending footprints from earlier steps in current summon session
  const pendingSet = new Set();
  for (const pFootprint of pendingFootprints) {
    for (const pSq of pFootprint) {
      pendingSet.add(`${Math.floor(pSq.x / gridPx)},${Math.floor(pSq.y / gridPx)}`);
    }
  }

  const fromPosGrid = sourcePos ? { x: Math.floor(sourcePos.x / gridPx), y: Math.floor(sourcePos.y / gridPx) } : null;

  for (const sq of footprintSquares) {
    const gx = Math.floor(sq.x / gridPx);
    const gy = Math.floor(sq.y / gridPx);
    const key = `${gx},${gy}`;

    // Check overlap with pending summons
    if (pendingSet.has(key)) {
      blockedSquares.push(sq);
      if (detectedReason === "none") detectedReason = "creature";
      continue;
    }

    // Check collision with scene tokens, terrain regions (walls/obstacles), and native walls
    const collision = checkCollisionAtSquare(gx, gy, gridPx, sourceToken?.id, fromPosGrid);
    if (collision && collision.type !== "none") {
      blockedSquares.push(sq);
      if (detectedReason === "none") detectedReason = collision.type;
    }
  }

  if (blockedSquares.length > 0) {
    return {
      valid: false,
      reason: detectedReason,
      blockedSquares
    };
  }

  return { valid: true };
}
