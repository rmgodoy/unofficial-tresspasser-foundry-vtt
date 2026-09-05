import { TerrainHelper } from "../helpers/terrain-helper.mjs";

/**
 * Test native wall collision between two grid square points.
 * @param {{x:number, y:number}|null} fromPos
 * @param {number} toX
 * @param {number} toY
 * @param {number} gridPx
 * @returns {boolean}
 */
export function testNativeWallCollision(fromPos, toX, toY, gridPx) {
  if (!fromPos || !canvas.ready || !canvas.walls) return false;
  
  const p0 = { x: (fromPos.x + 0.5) * gridPx, y: (fromPos.y + 0.5) * gridPx };
  const p1 = { x: (toX + 0.5) * gridPx, y: (toY + 0.5) * gridPx };

  try {
    const RayClass = foundry.canvas.geometry.Ray || globalThis.Ray;
    const ray = RayClass ? new RayClass(p0, p1) : { A: p0, B: p1 };
    const res = canvas.walls.checkCollision(ray, { type: "move", mode: "any" });
    if (res === true) return true;
    if (Array.isArray(res) && res.length > 0) return true;
  } catch (e) {}

  try {
    const backend = CONFIG.Canvas.polygonBackends?.move || CONFIG.Canvas.polygonBackends?.sight;
    if (backend?.testCollision) {
      const res = backend.testCollision(p0, p1, { type: "move", mode: "any" });
      if (res === true) return true;
      if (Array.isArray(res) && res.length > 0) return true;
    }
  } catch (e) {}

  return false;
}

/**
 * Check if the target grid square has a wall, creature, or terrain obstacle collision.
 * @param {number} x
 * @param {number} y
 * @param {number} gridPx
 * @param {string} movingTokenId
 * @param {{x:number, y:number}|null} [fromPos=null]
 * @returns {{type: string, [token]: TokenDocument, [region]: RegionDocument, [damage]: number}}
 */
export function checkCollisionAtSquare(x, y, gridPx, movingTokenId, fromPos = null) {
  const cx = (x + 0.5) * gridPx;
  const cy = (y + 0.5) * gridPx;
  
  // 1. Native Foundry Wall collision check
  if (fromPos && testNativeWallCollision(fromPos, x, y, gridPx)) {
    return { type: "wall", isNative: true };
  }

  // 2. Creature collision check
  const tokens = canvas.scene?.tokens?.filter(t => t.id !== movingTokenId && !t.hidden) || [];
  for (const t of tokens) {
    const tw = (t.width || 1) * gridPx;
    const th = (t.height || 1) * gridPx;
    if (cx >= t.x && cx <= t.x + tw && cy >= t.y && cy <= t.y + th) {
      return { type: "creature", token: t };
    }
  }

  // 3. Custom Terrain Region Wall & Obstacle check
  const regions = TerrainHelper.getTerrainAtSquare(x, y, gridPx);
  for (const r of regions) {
    const cat = r.flags?.trespasser?.terrain?.system?.category;
    if (cat === "wall") {
      return { type: "wall", region: r };
    }
  }
  for (const r of regions) {
    const cat = r.flags?.trespasser?.terrain?.system?.category;
    if (cat === "obstacle") {
      return { type: "obstacle", region: r };
    }
  }

  return { type: "none" };
}
