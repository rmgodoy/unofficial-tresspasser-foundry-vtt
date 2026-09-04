/**
 * TargetingHelper — AOE template placement and target resolution for deeds.
 *
 * All Trespasser AOE shapes are grid-square-based (not geometric circles/rects).
 * Per the rulebook:
 *   creature     — manual targeting (no template)
 *   personal     — auto-target self
 *   blast N      — N×N grid square block, placed within range
 *   close_blast N— N×N grid square block, must be adjacent to caster
 *   burst N      — all squares within N of caster = (2N+1)×(2N+1) for 1×1 token
 *   melee_burst  — burst sized to weapon reach
 *   path N       — N sequential squares sharing edges (no diagonals, no 2×2)
 *   close_path N — path starting adjacent to caster
 *   aura N       — same shape as burst, but persists
 *
 * placeTemplate() returns { squares, templateDoc } or null.
 * squares = array of {x, y} top-left pixel positions.
 * templateDoc = RegionDocument (only for aura, for persistent visual).
 * Use getTokensInSquares() for target resolution on all AOE types.
 */

import { isAtLeastV14 } from "./compat.mjs";
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { RangeHelper } from "./range-helper.mjs";

export class TargetingHelper {

  /* -------------------------------------------- */
  /* Template Placement                            */
  /* -------------------------------------------- */

  /**
   * Place an AOE for a deed. All types return { squares, templateDoc } or null.
   * @param {Actor}  actor
   * @param {Token}  token   The caster's token
   * @param {object} deed    item.system of the deed
   * @returns {Promise<{squares: Array<{x:number,y:number}>, templateDoc: RegionDocument|null}|null>}
   */
  static async placeTemplate(actor, token, deed, activeWeapons = [], options = {}) {
    const type = deed.targetType;
    const size = deed.targetSize ?? 1;
    const gridPx = canvas.grid.size;

    const effectiveDeed = { ...(options.item?.system || {}), ...deed };
    const maxRangeSq = RangeHelper.getDeedRange(token, effectiveDeed, actor);
    const isClose = effectiveDeed.close === true || type === "close_blast" || type === "close_path";

    switch (type) {
      case "blast":
        return this.#placeBlast(token, size, gridPx, isClose, maxRangeSq);

      case "close_blast":
        return this.#placeBlast(token, size, gridPx, true, 1);

      case "burst":
      case "aura": {
        const result = await this.#placeBurst(token, size, gridPx, false, type === "aura", options);
        if (!result) return null;
        let templateDoc = null;
        // Aura persists visually using a token-attached Region emanation
        if (type === "aura") {
          templateDoc = await this.#createAuraRegion(token, size);
        }
        return { squares: result.squares, templateDoc };
      }

      case "melee_burst": {
        return this.#placeBurst(token, 0, gridPx, true, false, options);
      }

      case "path":
        return this.#placePath(token, size, gridPx, isClose, maxRangeSq);

      case "close_path":
        return this.#placePath(token, size, gridPx, true, 1);

      default:
        return null;
    }
  }

  /* -------------------------------------------- */
  /* Target Resolution                             */
  /* -------------------------------------------- */

  /**
   * Check if a token matches the required disposition filter.
   * Supports both relative (enemy, ally) and absolute (friendly, neutral, hostile, secret) dispositions.
   * @param {Token|TokenDocument} targetToken
   * @param {string} [disposition] - "any"|"enemy"|"ally"|"friendly"|"neutral"|"hostile"|"secret"
   * @param {Token|TokenDocument|Actor} [sourceToken]
   * @returns {boolean}
   */
  static matchesDisposition(targetToken, disposition, sourceToken = null) {
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
   * Return all tokens whose centers fall within the given grid squares.
   * Works for all AOE types (blast, burst, path, etc.).
   * @param {Array<{x: number, y: number}>} squares  Top-left corners of grid squares
   * @param {number} gridPx
   * @param {object} [options]
   * @param {string} [options.excludeTokenId]
   * @param {string} [options.disposition]
   * @param {Token|TokenDocument|Actor} [options.sourceToken]
   * @returns {Token[]}
   */
  static getTokensInSquares(squares, gridPx, { excludeTokenId, disposition, sourceToken } = {}) {
    return canvas.tokens.placeables.filter(t => {
      if (excludeTokenId && t.id === excludeTokenId) return false;
      if (disposition && !this.matchesDisposition(t, disposition, sourceToken)) return false;
      
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
  static getTokensInPath(squares, gridPx, opts) {
    return this.getTokensInSquares(squares, gridPx, opts);
  }

  /* -------------------------------------------- */
  /* Validation                                    */
  /* -------------------------------------------- */

  /**
   * Validate manually selected targets for "creature" type deeds.
   * @param {Set<Token>} targets
   * @param {object} deed  item.system
   * @param {Token}  sourceToken
   * @returns {{ valid: boolean, message?: string }}
   */
  static validateTargets(targets, deed, sourceToken) {
    const targetArr = Array.from(targets);

    const maxTargets = deed.targetCount ?? 1;
    if (targetArr.length > maxTargets) {
      return {
        valid: false,
        message: game.i18n.format("TRESPASSER.Notification.Combat.TooManyTargets", {
          max: maxTargets,
          count: targetArr.length
        })
      };
    }

    return { valid: true };
  }

  /* -------------------------------------------- */
  /* Private — Blast (N×N interactive placement)   */
  /* -------------------------------------------- */

  /**
   * Interactive N×N blast placement. A highlighted grid overlay follows the
   * mouse cursor. Left-click to confirm, right-click to cancel.
   * @param {Token} token        Caster token
   * @param {number} size        Blast size in squares (N)
   * @param {number} gridPx      Pixels per grid square
   * @param {boolean|null} close If true, blast must be adjacent to caster
   * @param {number|null} maxRangeSq Max range in squares
   * @returns {Promise<{squares, templateDoc: null}|null>}
   */
  static async #placeBlast(token, size, gridPx, close, maxRangeSq = null) {
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
            if (!this.#isBlastAdjacentToToken(testSquares, token, gridPx)) {
              ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.BlastMustBeAdjacent"));
              const disregardRange = game.settings.get("trespasser", "disregardRangeOnAttack");
              if (!disregardRange) return;
            }
          } else if (maxRangeSq !== null && maxRangeSq !== undefined && maxRangeSq > 0) {
            const tokenSquares = this.#getTokenOccupiedSquares(token, gridPx);
            const distSq = this.#getMinSquareDistance(testSquares, tokenSquares, gridPx);
            if (distSq > maxRangeSq) {
              ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
                name: game.i18n.localize("TRESPASSER.Notification.Combat.TargetTypeBlast"),
                range: maxRangeSq,
                distance: distSq
              }));
              const disregardRange = game.settings.get("trespasser", "disregardRangeOnAttack");
              if (!disregardRange) return;
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

  /**
   * Check if any square in the blast is adjacent to (sharing an edge with)
   * any square occupied by the token.
   */
  static #isBlastAdjacentToToken(blastSquares, token, gridPx) {
    const tokenPositions = this.#getTokenOccupiedSquares(token, gridPx);

    for (const bsq of blastSquares) {
      for (const tsq of tokenPositions) {
        const dx = Math.abs(bsq.x - tsq.x);
        const dy = Math.abs(bsq.y - tsq.y);
        // Adjacent if they are exactly 1 square apart (horizontally, vertically, or diagonally)
        // Since we are using top-left coordinates, dx or dy must be exactly gridPx
        if (dx <= gridPx && dy <= gridPx && (dx > 0 || dy > 0)) {
          return true;
        }
      }
    }
    return false;
  }

  static #getTokenOccupiedSquares(token, gridPx) {
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

  static #getCentersFromSquares(squares, gridPx) {
    return squares.map(sq => ({
      x: sq.x + gridPx / 2,
      y: sq.y + gridPx / 2
    }));
  }

  static #getMinSquareDistance(squaresA, squaresB, gridPx) {
    const gridDist = canvas.dimensions?.distance ?? 5;
    const centersA = this.#getCentersFromSquares(squaresA, gridPx);
    const centersB = this.#getCentersFromSquares(squaresB, gridPx);

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



  /* -------------------------------------------- */
  /* Private — Burst (interactive overlay placement) */
  /* -------------------------------------------- */

  /**
   * Interactive burst placement and confirmation overlay.
   * Renders the burst square area around the token and highlights targets inside.
   * Asks the user to confirm via CanvasInputSession before executing.
   * @param {Token} token Caster token
   * @param {number} size Burst size in squares
   * @param {number} gridPx Pixels per grid square
   * @param {boolean} [isMelee=false] If true, size is derived from melee reach
   * @param {boolean} [isAura=false] If true, type is aura
   * @param {object} [options]
   * @returns {Promise<{squares: Array<{x:number, y:number}>, templateDoc: null}|null>}
   */
  static async #placeBurst(token, size, gridPx, isMelee = false, isAura = false, options = {}) {
    return new Promise(async (resolve) => {
      const actor = token.actor;
      const reach = isMelee ? this.#getMeleeReach(actor) : size;
      const squares = this.#computeBurstSquares(token, reach, gridPx, options.originOverride);
      const targets = this.getTokensInSquares(squares, gridPx);

      const highlights = [];
      const layer = canvas.interface;

      const drawPreview = () => {
        for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
        highlights.length = 0;

        const gfx = new PIXI.Graphics();
        CanvasSelectionRenderer.drawPlacedOrigin(gfx, squares, gridPx);
        layer.addChild(gfx);
        highlights.push(gfx);
      };

      const cleanup = () => {
        for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
        highlights.length = 0;
      };

      drawPreview();

      if (game.user.updateTokenTargets && targets.length > 0) {
        game.user.updateTokenTargets(targets.map(t => t.id));
      }

      let title;
      if (isMelee) {
        title = game.i18n.has("TRESPASSER.HUD.Action.MeleeBurst")
          ? game.i18n.localize("TRESPASSER.HUD.Action.MeleeBurst")
          : "Melee Burst";
      } else if (isAura) {
        title = game.i18n.has("TRESPASSER.Sheet.Item.Details.TargetTypeChoices.Aura")
          ? `${game.i18n.localize("TRESPASSER.Sheet.Item.Details.TargetTypeChoices.Aura")} ${reach}`
          : `Aura ${reach}`;
      } else {
        title = game.i18n.has("TRESPASSER.HUD.Action.Burst")
          ? `${game.i18n.localize("TRESPASSER.HUD.Action.Burst")} ${reach}`
          : `Burst ${reach}`;
      }

      let details;
      if (isMelee) {
        details = game.i18n.has("TRESPASSER.HUD.AoE.MeleeBurstInstruction")
          ? game.i18n.format("TRESPASSER.HUD.AoE.MeleeBurstInstruction", { targets: targets.length })
          : `Melee Burst: ${targets.length} target(s) affected. Confirm to execute.`;
      } else if (isAura) {
        details = game.i18n.has("TRESPASSER.HUD.AoE.AuraInstruction")
          ? game.i18n.format("TRESPASSER.HUD.AoE.AuraInstruction", { size: reach, targets: targets.length })
          : `Aura ${reach}: ${targets.length} target(s) affected. Confirm to execute.`;
      } else {
        details = game.i18n.has("TRESPASSER.HUD.AoE.BurstInstruction")
          ? game.i18n.format("TRESPASSER.HUD.AoE.BurstInstruction", { size: reach, targets: targets.length })
          : `Burst ${reach}: ${targets.length} target(s) affected. Confirm to execute.`;
      }

      await CanvasInputSession.start({
        title,
        details,
        icon: "fas fa-expand-alt",
        showConfirm: true,
        canConfirm: true,
        showUndo: false,
        canUndo: false,
        showCancel: true,
        onClick: (ev) => {
          if (ev.data?.originalEvent?.detail === 2) {
            cleanup();
            if (CanvasInputSession.activeSession) CanvasInputSession.activeSession.confirm();
            resolve({ squares: [...squares], templateDoc: null });
          }
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

  /* -------------------------------------------- */
  /* Private — Burst (square ring computation)     */
  /* -------------------------------------------- */

  /**
   * Compute all grid squares within Chebyshev distance N of the token's space.
   * For a 1×1 token with Burst N: (2N+1)×(2N+1) square area centered on token.
   * For a 2×2 (Large) token: expands N outward from the token's occupied space.
   * @param {Token} token
   * @param {number} size  Burst size in squares
   * @param {number} gridPx
   * @returns {Array<{x: number, y: number}>}
   */
  static #computeBurstSquares(token, size, gridPx, originOverride = null) {
    const tokenTopLeft = originOverride
      ? { x: originOverride.x, y: originOverride.y }
      : { x: token.document.x, y: token.document.y };
    const tokenW = token.document.width ?? 1;
    const tokenH = token.document.height ?? 1;

    const squares = [];
    for (let dx = -size; dx < tokenW + size; dx++) {
      for (let dy = -size; dy < tokenH + size; dy++) {
        // Caster's own occupied space is white/unaffected in burst patterns
        const isCasterSpace = dx >= 0 && dx < tokenW && dy >= 0 && dy < tokenH;
        if (isCasterSpace) continue;

        squares.push({
          x: tokenTopLeft.x + dx * gridPx,
          y: tokenTopLeft.y + dy * gridPx
        });
      }
    }
    return squares;
  }

  /**
   * Create a persistent aura visual. MeasuredTemplates were removed in
   * Foundry v14, where a token-attached Region emanation covers the same
   * squares and follows the token; v13 keeps the original circle template.
   */
  static async #createAuraRegion(token, sizeInSquares) {
    const gridDist = canvas.dimensions?.distance || canvas.scene?.grid?.distance || 5;

    if (isAtLeastV14()) {
      // Emanation range extends outward from the token's edge in grid units
      const range = sizeInSquares * gridDist;
      const region = await CONFIG.Region.documentClass.createTokenEmanation(token.document, range, {
        name: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TargetTypeChoices.Aura"),
        color: "#5599ff",
        visibility: CONST.REGION_VISIBILITY.ALWAYS,
        flags: { trespasser: { autoPlaced: true, isAura: true } }
      });
      return region ?? null;
    }

    // v13: a circle with radius size + 0.5 visually covers the aura squares
    const distance = (sizeInSquares + 0.5) * gridDist;
    const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
      t: "circle",
      x: token.center.x,
      y: token.center.y,
      distance,
      direction: 0,
      fillColor: "#5599ff",
      flags: { trespasser: { autoPlaced: true, isAura: true } }
    }]);
    return doc;
  }

  /* -------------------------------------------- */
  /* Private — Path (sequential square selection)  */
  /* -------------------------------------------- */
  /**
   * Interactive path placement. Click any reachable square to auto-draw the
   * shortest orthogonal path to it. Right-click undoes the last segment,
   * double-click confirms early. Directional arrows show path flow.
   * @returns {Promise<{squares: Array, templateDoc: null}|null>}
   */
  static async #placePath(token, maxSquares, gridPx, close, maxRangeSq = null) {
    return new Promise(async (resolve) => {
      const squares = [];
      const highlights = [];
      const candidateHighlights = [];
      let hoveredSquare = null;
      const layer = canvas.interface;

      const sqKey = (s) => `${s.x},${s.y}`;

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

      const isAdjacentToCasterToken = (sq, tokenObj) => {
        const tokenTopLeft = { x: tokenObj.document.x, y: tokenObj.document.y };
        const tokenW = tokenObj.document.width ?? 1;
        const tokenH = tokenObj.document.height ?? 1;

        for (let tx = 0; tx < tokenW; tx++) {
          for (let ty = 0; ty < tokenH; ty++) {
            const tsq = { x: tokenTopLeft.x + tx * gridPx, y: tokenTopLeft.y + ty * gridPx };
            const dx = Math.abs(sq.x - tsq.x);
            const dy = Math.abs(sq.y - tsq.y);
            if (dx <= gridPx && dy <= gridPx && (dx > 0 || dy > 0)) {
              return true;
            }
          }
        }
        return false;
      };

      const drawHighlight = (x, y, prev) => {
        const gfx = new PIXI.Graphics();
        gfx.beginFill(0x55aaff, 0.4);
        gfx.lineStyle(2, 0x55aaff, 0.9);
        gfx.drawRect(x, y, gridPx, gridPx);
        gfx.endFill();

        if (prev) {
          const cx = x + gridPx / 2;
          const cy = y + gridPx / 2;
          const dx = x - prev.x;
          const dy = y - prev.y;
          const arrowSize = gridPx * 0.15;
          gfx.beginFill(0xffffff, 0.8);
          gfx.lineStyle(0);
          if (dx > 0) {
            gfx.moveTo(cx + arrowSize, cy);
            gfx.lineTo(cx - arrowSize, cy - arrowSize);
            gfx.lineTo(cx - arrowSize, cy + arrowSize);
          } else if (dx < 0) {
            gfx.moveTo(cx - arrowSize, cy);
            gfx.lineTo(cx + arrowSize, cy - arrowSize);
            gfx.lineTo(cx + arrowSize, cy + arrowSize);
          } else if (dy > 0) {
            gfx.moveTo(cx, cy + arrowSize);
            gfx.lineTo(cx - arrowSize, cy - arrowSize);
            gfx.lineTo(cx + arrowSize, cy - arrowSize);
          } else {
            gfx.moveTo(cx, cy - arrowSize);
            gfx.lineTo(cx - arrowSize, cy + arrowSize);
            gfx.lineTo(cx + arrowSize, cy + arrowSize);
          }
          gfx.endFill();
        } else {
          const cx = x + gridPx / 2;
          const cy = y + gridPx / 2;
          gfx.beginFill(0xffffff, 0.8);
          gfx.lineStyle(0);
          gfx.drawCircle(cx, cy, gridPx * 0.1);
          gfx.endFill();
        }
        layer.addChild(gfx);
        highlights.push(gfx);
      };

      const drawCandidateHighlight = (x, y) => {
        const isHovered = hoveredSquare && hoveredSquare.x === x && hoveredSquare.y === y;
        const gfx = new PIXI.Graphics();
        const fillAlpha = isHovered ? 0.45 : 0.25;
        const lineWeight = isHovered ? 3 : 2;
        const lineAlpha = isHovered ? 1.0 : 0.8;
        gfx.beginFill(0x00FF00, fillAlpha);
        gfx.lineStyle(lineWeight, 0x00FF00, lineAlpha);
        gfx.drawRect(x, y, gridPx, gridPx);
        gfx.endFill();
        layer.addChild(gfx);
        candidateHighlights.push(gfx);
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

        // 0. Draw dotted blue range perimeter (range 1 for close path, or maxRangeSq for ranged path) when selecting start
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
              if (!isAdjacentToCasterToken(target, token)) {
                ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.PathMustStartAdjacent"));
                const disregardRange = game.settings.get("trespasser", "disregardRangeOnAttack");
                if (!disregardRange) return;
              }
            } else if (maxRangeSq !== null && maxRangeSq !== undefined && maxRangeSq > 0) {
              const tokenSquares = this.#getTokenOccupiedSquares(token, gridPx);
              const distSq = this.#getMinSquareDistance([target], tokenSquares, gridPx);
              if (distSq > maxRangeSq) {
                ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
                  name: game.i18n.has("TRESPASSER.Notification.Combat.TargetTypePath")
                    ? game.i18n.localize("TRESPASSER.Notification.Combat.TargetTypePath")
                    : "Path",
                  range: maxRangeSq,
                  distance: distSq
                }));
                const disregardRange = game.settings.get("trespasser", "disregardRangeOnAttack");
                if (!disregardRange) return;
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

  /* -------------------------------------------- */

  /**
   * Check if a token is engaged — any hostile token within melee/engagement range.
   * Creatures use their engagement_range attribute (defaults to 1).
   * Characters/commoners engage if they have an equipped melee weapon within reach.
   * @param {Token} token
   * @returns {boolean}
   */
  static isEngaged(token) {
    if (!token || !canvas?.grid) return false;
    const gridPx = canvas.grid.size || 100;

    for (const other of (canvas.tokens?.placeables || [])) {
      if (other.id === token.id) continue;
      if (other.document.disposition === token.document.disposition) continue;
      if (other.actor && other.actor.system?.health <= 0) continue;

      let engageSquares = 1;
      if (other.actor?.type === "creature") {
        engageSquares = other.actor.system?.combat?.engagement_range 
          ?? other.actor.system?.engagement_range 
          ?? 1;
      } else {
        const meleeWeapon = other.actor?.items.find(i =>
          i.type === "weapon" && i.system.equipped && i.system.type === "melee"
        );
        if (!meleeWeapon) continue;
        const parsedRange = parseInt(meleeWeapon.system?.range);
        engageSquares = (!isNaN(parsedRange) && parsedRange > 0) ? parsedRange : 1;
      }

      // Chebyshev distance in squares (diagonal = 1 square)
      const distSquares = Math.max(
        Math.abs(other.center.x - token.center.x),
        Math.abs(other.center.y - token.center.y)
      ) / gridPx;

      if (distSquares <= engageSquares + 0.1) return true;
    }
    return false;
  }

  /**
   * Check if a deed is exempt from the engagement penalty.
   * Exempt if: targeting adjacent creature, or is burst/close_blast/close_path/melee_burst.
   * @param {object} deed  item.system
   * @param {Token[]} targets
   * @param {Token} sourceToken
   * @returns {boolean}
   */
  static isExemptFromEngagement(deed, targets, sourceToken) {
    const exemptTypes = ["burst", "close_blast", "close_path", "melee_burst", "personal"];
    if (exemptTypes.includes(deed?.targetType)) return true;

    if (sourceToken && targets && targets.length > 0) {
      const gridPx = canvas.grid.size || 100;
      for (const t of targets) {
        if (!t?.center) continue;
        const distSquares = Math.max(
          Math.abs(t.center.x - sourceToken.center.x),
          Math.abs(t.center.y - sourceToken.center.y)
        ) / gridPx;
        if (distSquares <= 1.1) return true; // adjacent
      }
    }
    return false;
  }

  /**
   * Check if a defending character has a melee weapon and is within melee range of attacker.
   * Melee range is adjacent (1 space) or the equipped melee weapon's range.
   * @param {Token} defenderToken
   * @param {Token} attackerToken
   * @returns {{ canCounter: boolean, weapon: Item|null, weaponDie: string }}
   */
  static checkCounterEligibility(defenderToken, attackerToken) {
    if (!defenderToken?.actor || !attackerToken || !canvas?.grid) {
      return { canCounter: false, weapon: null, weaponDie: "d6" };
    }

    const gridPx = canvas.grid.size || 100;
    const distSquares = Math.max(
      Math.abs(defenderToken.center.x - attackerToken.center.x),
      Math.abs(defenderToken.center.y - attackerToken.center.y)
    ) / gridPx;

    if (defenderToken.actor.type === "creature") {
      const engageRange = defenderToken.actor.system?.combat?.engagement_range 
        ?? defenderToken.actor.system?.engagement_range 
        ?? 1;
      const creatureDie = defenderToken.actor.system?.combat?.damage_die
        ?? defenderToken.actor.system?.damage_die
        ?? "d6";
      if (distSquares > engageRange + 0.1) return { canCounter: false, weapon: null, weaponDie: creatureDie };
      return { canCounter: true, weapon: null, weaponDie: creatureDie };
    }

    const meleeWeapon = defenderToken.actor.items.find(i =>
      i.type === "weapon" && i.system.equipped && i.system.type === "melee"
    );
    if (!meleeWeapon) return { canCounter: false, weapon: null, weaponDie: "d6" };

    const parsedRange = parseInt(meleeWeapon.system?.range);
    const maxRange = (!isNaN(parsedRange) && parsedRange > 0) ? parsedRange : 1;

    if (distSquares > maxRange + 0.1) return { canCounter: false, weapon: null, weaponDie: "d6" };

    const weaponDie = meleeWeapon.system.weaponDie || "d6";
    return { canCounter: true, weapon: meleeWeapon, weaponDie };
  }

  /* -------------------------------------------- */
  /* Weapon Compatibility & Range Validation       */
  /* -------------------------------------------- */

  /**
   * Check that the actor has a compatible weapon equipped for this deed type.
   * Per rulebook: melee/spell deeds allow a free hand; spell deeds accept spell weapons.
   * @param {object} deed     item.system of the deed
   * @param {Item[]} activeWeapons  from sheet._getActiveWeapons()
   * @param {Actor}  [actor]  needed to check for free hand (equipment slots)
   * @returns {{ valid: boolean, message?: string }}
   */
  static validateWeaponCompatibility(deed, activeWeapons, actor) {
    const deedType = deed.effectiveAbilityType || deed.abilityType || deed.type;

    // Innate deeds require nothing
    if (deedType === "innate") return { valid: true };

    // Unarmed deeds require no weapon
    if (deedType === "unarmed") return { valid: true };

    // Check if actor has a free hand (either hand slot is empty)
    const hasFreeHand = actor ? this.#hasFreeHand(actor) : false;

    // Melee: requires melee weapon, thrown missile weapon, OR free hand
    if (deedType === "melee") {
      const hasMelee = hasFreeHand || activeWeapons.some(w =>
        w.system.type === "melee" || (w.system.type === "missile" && w.system.properties?.thrown)
      );
      if (!hasMelee) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedMeleeWeapon") };
      }
    }
    // Missile: requires missile weapon OR thrown melee weapon
    else if (deedType === "missile") {
      const hasMissile = activeWeapons.some(w =>
        w.system.type === "missile" || (w.system.type === "melee" && w.system.properties?.thrown)
      );
      if (!hasMissile) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedMissileWeapon") };
      }
    }
    // Spell: requires spell weapon OR free hand
    else if (deedType === "spell") {
      const hasSpell = hasFreeHand || activeWeapons.some(w => w.system.type === "spell");
      if (!hasSpell) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedSpellWeapon") };
      }
    }
    // Tool: requires free hand
    else if (deedType === "tool") {
      if (!hasFreeHand) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedFreeHand") };
      }
    }
    // Versatile: does not require any weapon
    else if (deedType === "versatile") {
      return { valid: true };
    }

    return { valid: true };
  }

  /**
   * Validate that all creature-targeted tokens are within range of the source.
   * Melee deeds: check melee reach. Missile/spell/thrown: check weapon range.
   * @param {Token[]} targets
   * @param {Token} sourceToken
   * @param {object} deed         item.system
   * @param {Item[]} activeWeapons
   * @returns {{ valid: boolean, message?: string }}
   */
  static getMaxRangeSq(sourceToken, deed, activeWeapons = []) {
    return RangeHelper.getDeedRange(sourceToken, deed, sourceToken?.actor);
  }

  static validateRange(targets, sourceToken, deed, activeWeapons) {
    if (!sourceToken || targets.length === 0) return { valid: true };
    // Only applies to creature-targeted deeds
    if (deed.targetType !== "creature") return { valid: true };
    // Support deeds don't need range validation
    if (deed.actionType === "support") return { valid: true };

    const gridPx = canvas.grid.size;

    const maxRangeSq = this.getMaxRangeSq(sourceToken, deed, activeWeapons);

    // If no parseable range found, skip validation (don't block deeds with empty range)
    if (maxRangeSq === null || maxRangeSq === undefined || maxRangeSq <= 0) return { valid: true };

    const sourceSquares = this.#getTokenOccupiedSquares(sourceToken, gridPx);

    // Check each target using Chebyshev edge-to-edge distance calculation
    for (const t of targets) {
      const targetSquares = this.#getTokenOccupiedSquares(t, gridPx);
      const distSq = this.#getMinSquareDistance(sourceSquares, targetSquares, gridPx);

      if (distSq > maxRangeSq) {
        return {
          valid: false,
          message: game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
            name: t.name,
            range: maxRangeSq,
            distance: distSq
          })
        };
      }
    }

    return { valid: true };
  }

  /* -------------------------------------------- */
  /* Private — Utility                             */
  /* -------------------------------------------- */

  /**
   * Check if an actor has at least one free hand (empty hand slot).
   */
  static #hasFreeHand(actor) {
    const mainHandId = actor.system.equipment?.main_hand;
    const offHandId = actor.system.equipment?.off_hand;
    return !mainHandId || !offHandId;
  }

  /**
   * Parse the max range in grid squares from a set of weapons.
   * Handles formats like "5", "10 squares", "30 ft", "6 sq", etc.
   * Returns the highest range found, or 0 if none parseable.
   */
  static #getWeaponRangeInSquares(weapons, gridDist) {
    let best = 0;
    for (const w of weapons) {
      const raw = String(w.system.range ?? "").trim();
      if (!raw) continue;
      const num = parseInt(raw);
      if (isNaN(num) || num <= 0) continue;
      // If the string contains "ft" or "feet", convert via gridDist
      if (/ft|feet/i.test(raw)) {
        best = Math.max(best, Math.round(num / gridDist));
      } else {
        // Assume squares
        best = Math.max(best, num);
      }
    }
    return best;
  }

  /**
   * Get the melee reach in grid squares for a melee_burst deed.
   * Parses the weapon range field; defaults to 1.
   */
  static #getMeleeReach(actor) {
    const weapons = actor.items.filter(i =>
      i.type === "weapon" && i.system.equipped && i.system.type === "melee"
    );
    if (weapons.length === 0) return 1;
    const gridDist = canvas.dimensions?.distance ?? 5;
    const parsed = this.#getWeaponRangeInSquares(weapons, gridDist);
    return Math.max(1, parsed);
  }
}
