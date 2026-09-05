/**
 * Geometry and spatial collision checking for terrain regions.
 */

/**
 * Check if a point is inside a region's shapes.
 * @param {number} px - Point X coordinate (canvas pixels).
 * @param {number} py - Point Y coordinate (canvas pixels).
 * @param {RegionDocument} region - The region document.
 * @param {number} [gridSize=100] - The grid square size in pixels.
 * @returns {boolean}
 */
export function isPointInRegion(px, py, region, gridSize = 100) {
  if (!region) return false;
  const doc = region.document ?? region;
  if (typeof doc.testPoint === "function") {
    try {
      const result = doc.testPoint({ x: px, y: py }, doc.elevation ?? 0);
      if (result) return true;
    } catch {}
  }

  const flags = doc.flags?.trespasser || {};
  if (flags.pathSquares && Array.isArray(flags.pathSquares) && flags.pathSquares.length > 0) {
    const gX = Math.floor(px / gridSize);
    const gY = Math.floor(py / gridSize);
    if (flags.pathSquares.some(sq => sq.x === gX && sq.y === gY)) {
      return true;
    }
  }

  const shapes = doc.shapes || [];
  for (const shape of shapes) {
    if (shape.type === "rectangle") {
      if (px >= shape.x && px <= shape.x + shape.width &&
          py >= shape.y && py <= shape.y + shape.height) {
        return true;
      }
    } else if (shape.type === "emanation" && shape.base) {
      let baseX = 0, baseY = 0, baseW = gridSize, baseH = gridSize;
      if (shape.base.uuid) {
        try {
          const tokenDoc = fromUuidSync(shape.base.uuid) || (canvas.tokens?.get(shape.base.uuid.split(".").pop())?.document);
          if (tokenDoc) {
            baseX = tokenDoc.x;
            baseY = tokenDoc.y;
            baseW = (tokenDoc.width || 1) * gridSize;
            baseH = (tokenDoc.height || 1) * gridSize;
          }
        } catch {}
      } else {
        baseX = shape.base.x ?? 0;
        baseY = shape.base.y ?? 0;
        baseW = (shape.base.width || 1) * gridSize;
        baseH = (shape.base.height || 1) * gridSize;
      }
      const radius = (shape.radius || 0) * gridSize;
      if (px >= baseX - radius && px <= baseX + baseW + radius &&
          py >= baseY - radius && py <= baseY + baseH + radius) {
        return true;
      }
    } else if (shape.type === "circle" || shape.type === "ellipse") {
      const rx = (shape.radiusX ?? shape.radius ?? 0);
      const ry = (shape.radiusY ?? shape.radius ?? 0);
      if (rx > 0 && ry > 0) {
        const dx = (px - shape.x) / rx;
        const dy = (py - shape.y) / ry;
        if ((dx * dx + dy * dy) <= 1) return true;
      }
    } else if (shape.type === "polygon" && Array.isArray(shape.points) && shape.points.length >= 6) {
      const pts = shape.points;
      let inside = false;
      for (let i = 0, j = pts.length - 2; i < pts.length; i += 2) {
        const xi = pts[i], yi = pts[i + 1];
        const xj = pts[j], yj = pts[j + 1];
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
        j = i;
      }
      if (inside) return true;
    }
  }
  return false;
}

/**
 * Check if any square occupied by a token is inside a region.
 * @param {TokenDocument} tokenDoc 
 * @param {RegionDocument} region 
 * @param {number} [gridSize=100] 
 * @returns {boolean}
 */
export function isTokenInRegion(tokenDoc, region, gridSize = 100) {
  if (!tokenDoc || !region) return false;
  const w = tokenDoc.width || 1;
  const h = tokenDoc.height || 1;
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const px = tokenDoc.x + (dx + 0.5) * gridSize;
      const py = tokenDoc.y + (dy + 0.5) * gridSize;
      if (isPointInRegion(px, py, region, gridSize)) return true;
    }
  }
  return false;
}

/**
 * Get all terrain regions that contain a given token.
 * @param {TokenDocument} tokenDoc
 * @returns {RegionDocument[]}
 */
export function getTerrainRegionsContainingToken(tokenDoc) {
  const scene = tokenDoc.parent || canvas.scene;
  if (!scene) return [];

  const gridSize = scene.grid?.size || 100;

  return scene.regions.filter(r => {
    const terrainData = r.flags?.trespasser?.terrain;
    if (!terrainData) return false;
    
    const sys = terrainData.system;
    if (sys.centerMode === "actor") {
      const centerTokenId = r.flags?.trespasser?.centerTokenId;
      if (centerTokenId ? centerTokenId === tokenDoc.id : sys.centerActorId === tokenDoc.actor?.id) return false;
    }

    return isTokenInRegion(tokenDoc, r, gridSize);
  });
}

/**
 * Get all terrain regions at a specific grid square.
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @param {number} gridPx - Grid size in pixels
 * @returns {RegionDocument[]}
 */
export function getTerrainAtSquare(x, y, gridPx) {
  if (!canvas.ready) return [];
  const px = (x + 0.5) * gridPx;
  const py = (y + 0.5) * gridPx;
  
  return canvas.scene.regions.filter(r => {
    const terrainData = r.flags?.trespasser?.terrain;
    if (!terrainData) return false;
    return isPointInRegion(px, py, r, gridPx);
  });
}

/**
 * Trace a grid path between two grid coordinates using Bresenham's line algorithm.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{x: number, y: number}[]}
 */
export function getGridPath(x0, y0, x1, y1) {
  const path = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;
  while (true) {
    path.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return path;
}
