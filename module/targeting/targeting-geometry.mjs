/**
 * Targeting geometry and spatial calculation utilities.
 */

/**
 * Check if a token matches the required disposition filter.
 * Supports both relative (enemy, ally) and absolute (friendly, neutral, hostile, secret) dispositions.
 * @param {Token|TokenDocument} targetToken
 * @param {string} [disposition] - "any"|"enemy"|"ally"|"friendly"|"neutral"|"hostile"|"secret"
 * @param {Token|TokenDocument|Actor} [sourceToken]
 * @returns {boolean}
 */
export function matchesDisposition(targetToken, disposition, sourceToken = null) {
  if (!disposition || disposition === "any") return true;
  if (!targetToken) return false;

  const targetDisp = targetToken.document?.disposition 
    ?? targetToken.disposition 
    ?? targetToken.actor?.prototypeToken?.disposition 
    ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL;

  const sourceDisp = sourceToken?.document?.disposition 
    ?? sourceToken?.disposition 
    ?? sourceToken?.prototypeToken?.disposition 
    ?? sourceToken?.actor?.prototypeToken?.disposition 
    ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;

  switch (disposition) {
    case "enemy":
      if (sourceDisp === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
        return targetDisp === CONST.TOKEN_DISPOSITIONS.HOSTILE || targetDisp === CONST.TOKEN_DISPOSITIONS.SECRET;
      }
      if (sourceDisp === CONST.TOKEN_DISPOSITIONS.HOSTILE || sourceDisp === CONST.TOKEN_DISPOSITIONS.SECRET) {
        return targetDisp === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      }
      if (sourceDisp === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
        return targetDisp === CONST.TOKEN_DISPOSITIONS.HOSTILE || targetDisp === CONST.TOKEN_DISPOSITIONS.SECRET;
      }
      return targetDisp !== sourceDisp;

    case "ally":
      return targetDisp === sourceDisp;

    case "friendly":
      return targetDisp === CONST.TOKEN_DISPOSITIONS.FRIENDLY;

    case "hostile":
      return targetDisp === CONST.TOKEN_DISPOSITIONS.HOSTILE;

    case "neutral":
      return targetDisp === CONST.TOKEN_DISPOSITIONS.NEUTRAL;

    case "secret":
      return targetDisp === CONST.TOKEN_DISPOSITIONS.SECRET;

    default:
      return true;
  }
}

/**
 * Get the list of 1x1 grid squares occupied by a token.
 * @param {Token} token
 * @param {number} gridPx
 * @returns {Array<{x: number, y: number}>}
 */
export function getTokenOccupiedSquares(token, gridPx) {
  const tokenTopLeft = { x: token.document.x, y: token.document.y };
  const tokenW = token.document.width ?? 1;
  const tokenH = token.document.height ?? 1;

  const squares = [];
  for (let tx = 0; tx < tokenW; tx++) {
    for (let ty = 0; ty < tokenH; ty++) {
      squares.push({
        x: tokenTopLeft.x + tx * gridPx,
        y: tokenTopLeft.y + ty * gridPx
      });
    }
  }
  return squares;
}

/**
 * Get center coordinates for a list of squares.
 * @param {Array<{x: number, y: number}>} squares
 * @param {number} gridPx
 * @returns {Array<{x: number, y: number}>}
 */
export function getCentersFromSquares(squares, gridPx) {
  return squares.map(sq => ({
    x: sq.x + gridPx / 2,
    y: sq.y + gridPx / 2
  }));
}

/**
 * Get minimum Chebyshev distance between two sets of squares in grid units.
 * @param {Array<{x: number, y: number}>} squaresA
 * @param {Array<{x: number, y: number}>} squaresB
 * @param {number} gridPx
 * @returns {number}
 */
export function getMinSquareDistance(squaresA, squaresB, gridPx) {
  const gridDist = canvas.dimensions?.distance ?? 5;
  const centersA = getCentersFromSquares(squaresA, gridPx);
  const centersB = getCentersFromSquares(squaresB, gridPx);

  let minDistSq = Infinity;
  for (const cA of centersA) {
    for (const cB of centersB) {
      const path = [cA, cB];
      const distUnits = canvas.grid.measurePath(path).distance;
      const distSq = distUnits / gridDist;
      if (distSq < minDistSq) minDistSq = distSq;
    }
  }
  return Math.round(minDistSq);
}

/**
 * Check if any square in the blast is adjacent to any square occupied by the token.
 * @param {Array<{x: number, y: number}>} blastSquares
 * @param {Token} token
 * @param {number} gridPx
 * @returns {boolean}
 */
export function isBlastAdjacentToToken(blastSquares, token, gridPx) {
  const tokenPositions = getTokenOccupiedSquares(token, gridPx);

  for (const bsq of blastSquares) {
    for (const tsq of tokenPositions) {
      const dx = Math.abs(bsq.x - tsq.x);
      const dy = Math.abs(bsq.y - tsq.y);
      if (dx <= gridPx && dy <= gridPx && (dx > 0 || dy > 0)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a square is adjacent to any square of a token.
 * @param {{x: number, y: number}} sq
 * @param {Token} tokenObj
 * @param {number} gridPx
 * @returns {boolean}
 */
export function isAdjacentToCasterToken(sq, tokenObj, gridPx) {
  const tokenPositions = getTokenOccupiedSquares(tokenObj, gridPx);
  for (const tsq of tokenPositions) {
    const dx = Math.abs(sq.x - tsq.x);
    const dy = Math.abs(sq.y - tsq.y);
    if (dx <= gridPx && dy <= gridPx && (dx > 0 || dy > 0)) {
      return true;
    }
  }
  return false;
}

/**
 * Return all tokens whose bounding boxes intersect the given grid squares.
 * Works for all AOE types (blast, burst, path, etc.).
 * @param {Array<{x: number, y: number}>} squares  Top-left corners of grid squares
 * @param {number} gridPx
 * @param {object} [options]
 * @param {string} [options.excludeTokenId]
 * @param {string} [options.disposition]
 * @param {Token|TokenDocument|Actor} [options.sourceToken]
 * @returns {Token[]}
 */
export function getTokensInSquares(squares, gridPx, { excludeTokenId, disposition, sourceToken } = {}) {
  return canvas.tokens.placeables.filter(t => {
    if (excludeTokenId && t.id === excludeTokenId) return false;
    if (disposition && !matchesDisposition(t, disposition, sourceToken)) return false;
    
    const tX = t.document.x;
    const tY = t.document.y;
    const tW = (t.document.width ?? 1) * gridPx;
    const tH = (t.document.height ?? 1) * gridPx;

    return squares.some(sq => 
      tX < sq.x + gridPx &&
      tX + tW > sq.x &&
      tY < sq.y + gridPx &&
      tY + tH > sq.y
    );
  });
}

/**
 * @deprecated Use getTokensInSquares instead. Kept for backward compat.
 */
export function getTokensInPath(squares, gridPx, opts) {
  return getTokensInSquares(squares, gridPx, opts);
}
