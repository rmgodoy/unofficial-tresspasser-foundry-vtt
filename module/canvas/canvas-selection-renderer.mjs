/**
 * CanvasSelectionRenderer — Unified static utility for PIXI canvas square, path, and range highlights.
 * Enforces system-wide visual language and color palette across all interactive canvas selection modes.
 */
export class CanvasSelectionRenderer {
  static COLOR_CANDIDATE = 0x00FF00;
  static COLOR_PLACED    = 0xFFD700;
  static COLOR_PATH      = 0x55AAFF;
  static COLOR_BLOCKED   = 0xFF0000;
  static COLOR_RANGE     = 0x55AAFF;

  /**
   * Draw candidate / selectable squares in standard green highlight.
   * @param {PIXI.Graphics} graphics
   * @param {Array<{x: number, y: number}>} squares
   * @param {number} gridPx
   * @param {object} [options]
   * @param {{x: number, y: number}|null} [options.hoveredSquare]
   */
  static drawCandidateSquares(graphics, squares, gridPx, options = {}) {
    if (!graphics || !squares) return;
    const hovered = options.hoveredSquare;

    for (const sq of squares) {
      const isHovered = hovered && hovered.x === sq.x && hovered.y === sq.y;
      const fillAlpha = isHovered ? 0.45 : 0.25;
      const lineWeight = isHovered ? 3 : 2;
      const lineAlpha = isHovered ? 1.0 : 0.8;

      graphics.beginFill(this.COLOR_CANDIDATE, fillAlpha);
      graphics.lineStyle(lineWeight, this.COLOR_CANDIDATE, lineAlpha);
      graphics.drawRect(sq.x, sq.y, gridPx, gridPx);
      graphics.endFill();
    }
  }

  /**
   * Draw placed template origin squares (e.g. Blast origin) in gold highlight.
   * @param {PIXI.Graphics} graphics
   * @param {Array<{x: number, y: number}>} squares
   * @param {number} gridPx
   * @param {object} [options]
   * @param {number} [options.color]
   * @param {number} [options.fillAlpha]
   * @param {number} [options.lineWeight]
   */
  static drawPlacedOrigin(graphics, squares, gridPx, options = {}) {
    if (!graphics || !squares) return;
    const color = options.color ?? this.COLOR_PLACED;
    const fillAlpha = options.fillAlpha ?? 0.45;
    const lineWeight = options.lineWeight ?? 4;

    for (const sq of squares) {
      graphics.beginFill(color, fillAlpha);
      graphics.lineStyle(lineWeight, color, 0.9);
      graphics.drawRect(sq.x, sq.y, gridPx, gridPx);
      graphics.endFill();
    }
  }

  /**
   * Draw sequential path squares with direction flow indicators.
   * @param {PIXI.Graphics} graphics
   * @param {Array<{x: number, y: number}>} squares
   * @param {number} gridPx
   * @param {object} [options]
   * @param {boolean} [options.drawArrows=true]
   * @param {number} [options.color]
   */
  static drawPath(graphics, squares, gridPx, options = {}) {
    if (!graphics || !squares) return;
    const color = options.color ?? this.COLOR_PATH;
    const drawArrows = options.drawArrows ?? true;

    for (let i = 0; i < squares.length; i++) {
      const sq = squares[i];
      const prev = i > 0 ? squares[i - 1] : null;

      graphics.beginFill(color, 0.4);
      graphics.lineStyle(2, color, 0.9);
      graphics.drawRect(sq.x, sq.y, gridPx, gridPx);
      graphics.endFill();

      if (drawArrows) {
        const cx = sq.x + gridPx / 2;
        const cy = sq.y + gridPx / 2;
        if (prev) {
          const dx = sq.x - prev.x;
          const dy = sq.y - prev.y;
          const arrowSize = gridPx * 0.15;
          graphics.beginFill(0xFFFFFF, 0.8);
          graphics.lineStyle(0);
          if (dx > 0) {
            graphics.moveTo(cx + arrowSize, cy);
            graphics.lineTo(cx - arrowSize, cy - arrowSize);
            graphics.lineTo(cx - arrowSize, cy + arrowSize);
          } else if (dx < 0) {
            graphics.moveTo(cx - arrowSize, cy);
            graphics.lineTo(cx + arrowSize, cy - arrowSize);
            graphics.lineTo(cx + arrowSize, cy + arrowSize);
          } else if (dy > 0) {
            graphics.moveTo(cx, cy + arrowSize);
            graphics.lineTo(cx - arrowSize, cy - arrowSize);
            graphics.lineTo(cx + arrowSize, cy - arrowSize);
          } else {
            graphics.moveTo(cx, cy - arrowSize);
            graphics.lineTo(cx - arrowSize, cy + arrowSize);
            graphics.lineTo(cx + arrowSize, cy + arrowSize);
          }
          graphics.endFill();
        } else {
          graphics.beginFill(0xFFFFFF, 0.8);
          graphics.lineStyle(0);
          graphics.drawCircle(cx, cy, gridPx * 0.1);
          graphics.endFill();
        }
      }
    }
  }

  /**
   * Draw a blocked or collision tile in red highlight.
   * @param {PIXI.Graphics} graphics
   * @param {{x: number, y: number}} square
   * @param {number} gridPx
   */
  static drawBlockedSquare(graphics, square, gridPx) {
    if (!graphics || !square) return;
    graphics.beginFill(this.COLOR_BLOCKED, 0.45);
    graphics.lineStyle(3, this.COLOR_BLOCKED, 0.95);
    graphics.drawRect(square.x, square.y, gridPx, gridPx);
    graphics.endFill();
  }

  /**
   * Draw multi-AP range zones for movement informative overlays.
   * @param {PIXI.Graphics} graphics
   * @param {Map<string, {dist: number}>} visitedMap
   * @param {number} sizeX
   * @param {number} sizeY
   * @param {number} baseMove
   * @param {number} moveCost
   * @param {number} extraAP
   */
  static drawRangeZones(graphics, visitedMap, sizeX, sizeY, baseMove, moveCost, extraAP) {
    if (!graphics || !visitedMap) return;
    graphics.clear();

    for (const [key, val] of visitedMap.entries()) {
      if (val.dist === 0) continue;
      const [xStr, yStr] = key.split(",");
      const x = parseInt(xStr) * sizeX;
      const y = parseInt(yStr) * sizeY;

      let color = this.COLOR_CANDIDATE; // Green (Base AP)
      let alpha = 0.20;

      if (val.dist > baseMove + moveCost) {
        if (extraAP < 2) continue;
        color = 0xFF8800; // Orange (2 extra AP)
      } else if (val.dist > baseMove) {
        if (extraAP < 1) continue;
        color = 0xFFFF00; // Yellow (1 extra AP)
      }

      graphics.beginFill(color, alpha);
      graphics.lineStyle(2, color, 0.5);
      graphics.drawRect(x, y, sizeX, sizeY);
      graphics.endFill();
    }
  }

  /**
   * Draw a dashed / dotted line between two coordinates in PIXI.
   * @param {PIXI.Graphics} graphics
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   * @param {object} [options]
   * @param {number} [options.color]
   * @param {number} [options.alpha]
   * @param {number} [options.width]
   * @param {number} [options.dash]
   * @param {number} [options.gap]
   */
  static drawDottedLine(graphics, x0, y0, x1, y1, options = {}) {
    if (!graphics) return;
    const color = options.color ?? this.COLOR_RANGE;
    const alpha = options.alpha ?? 0.9;
    const width = options.width ?? 2;
    const dash = options.dash ?? 6;
    const gap = options.gap ?? 5;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;

    const ux = dx / dist;
    const uy = dy / dist;

    graphics.lineStyle(width, color, alpha);

    let progress = 0;
    while (progress < dist) {
      const segLen = Math.min(dash, dist - progress);
      const sx = x0 + ux * progress;
      const sy = y0 + uy * progress;
      graphics.moveTo(sx, sy);
      graphics.lineTo(sx + ux * segLen, sy + uy * segLen);
      progress += dash + gap;
    }
  }

  /**
   * Draw a dotted blue perimeter bounding box around a token showing its deed reach.
   * In Chebyshev distance (Trespasser grid), range R from a WxH token forms a rectangular boundary R squares away.
   * @param {PIXI.Graphics} graphics
   * @param {Token|TokenDocument} token
   * @param {number} rangeSq Range in grid squares
   * @param {number} gridPx Pixels per grid square
   * @param {object} [options]
   * @param {number} [options.color]
   * @param {number} [options.alpha]
   * @param {number} [options.fillAlpha]
   * @param {number} [options.width]
   * @param {number} [options.dash]
   * @param {number} [options.gap]
   */
  static drawRangePerimeter(graphics, token, rangeSq, gridPx, options = {}) {
    if (!graphics || !token || rangeSq <= 0) return;
    const color = options.color ?? 0x00BFFF;
    const haloColor = options.haloColor ?? 0x001A33;
    const alpha = options.alpha ?? 1.0;
    const width = options.width ?? 3;
    const dash = options.dash ?? 8;
    const gap = options.gap ?? 6;
    const fillAlpha = options.fillAlpha ?? 0.08;

    const tokenDoc = token.document ?? token;
    const tokenW = tokenDoc.width ?? 1;
    const tokenH = tokenDoc.height ?? 1;

    const minX = tokenDoc.x - rangeSq * gridPx;
    const minY = tokenDoc.y - rangeSq * gridPx;
    const totalW = (tokenW + 2 * rangeSq) * gridPx;
    const totalH = (tokenH + 2 * rangeSq) * gridPx;
    const maxX = minX + totalW;
    const maxY = minY + totalH;

    // 1. Soft translucent blue fill over the range area
    if (fillAlpha > 0) {
      graphics.beginFill(color, fillAlpha);
      graphics.drawRect(minX, minY, totalW, totalH);
      graphics.endFill();
    }

    // 2. High-contrast dark halo backing underneath the dotted line
    const haloWidth = width + 2;
    this.drawDottedLine(graphics, minX, minY, maxX, minY, { color: haloColor, alpha: 0.8, width: haloWidth, dash, gap });
    this.drawDottedLine(graphics, maxX, minY, maxX, maxY, { color: haloColor, alpha: 0.8, width: haloWidth, dash, gap });
    this.drawDottedLine(graphics, maxX, maxY, minX, maxY, { color: haloColor, alpha: 0.8, width: haloWidth, dash, gap });
    this.drawDottedLine(graphics, minX, maxY, minX, minY, { color: haloColor, alpha: 0.8, width: haloWidth, dash, gap });

    // 3. Crisp vibrant blue dotted line on top
    this.drawDottedLine(graphics, minX, minY, maxX, minY, { color, alpha, width, dash, gap });
    this.drawDottedLine(graphics, maxX, minY, maxX, maxY, { color, alpha, width, dash, gap });
    this.drawDottedLine(graphics, maxX, maxY, minX, maxY, { color, alpha, width, dash, gap });
    this.drawDottedLine(graphics, minX, maxY, minX, minY, { color, alpha, width, dash, gap });
  }
}
