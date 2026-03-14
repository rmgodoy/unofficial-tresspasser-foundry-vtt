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
 * templateDoc = MeasuredTemplateDocument (only for aura, for persistent visual).
 * Use getTokensInSquares() for target resolution on all AOE types.
 */

export class TargetingHelper {

  /* -------------------------------------------- */
  /* Template Placement                            */
  /* -------------------------------------------- */

  /**
   * Place an AOE for a deed. All types return { squares, templateDoc } or null.
   * @param {Actor}  actor
   * @param {Token}  token   The caster's token
   * @param {object} deed    item.system of the deed
   * @returns {Promise<{squares: Array<{x:number,y:number}>, templateDoc: MeasuredTemplateDocument|null}|null>}
   */
  static async placeTemplate(actor, token, deed) {
    const type = deed.targetType;
    const size = deed.targetSize ?? 1;
    const gridPx = canvas.grid.size;

    switch (type) {
      case "blast":
        ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.PlaceBlast", { size }));
        return this.#placeBlast(token, size, gridPx, null);

      case "close_blast":
        ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.PlaceCloseBlast", { size }));
        return this.#placeBlast(token, size, gridPx, true);

      case "burst":
      case "aura": {
        const squares = this.#computeBurstSquares(token, size, gridPx);
        let templateDoc = null;
        // Aura persists visually using a MeasuredTemplate
        if (type === "aura") {
          templateDoc = await this.#createAuraTemplate(token, size, gridPx);
        }
        return { squares, templateDoc };
      }

      case "melee_burst": {
        const reach = this.#getMeleeReach(actor);
        const squares = this.#computeBurstSquares(token, reach, gridPx);
        return { squares, templateDoc: null };
      }

      case "path":
        ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.PlacePath", { size }));
        return this.#placePath(token, size, gridPx, false);

      case "close_path":
        ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.PlaceClosePath", { size }));
        return this.#placePath(token, size, gridPx, true);

      default:
        return null;
    }
  }

  /* -------------------------------------------- */
  /* Target Resolution                             */
  /* -------------------------------------------- */

  /**
   * Return all tokens whose centers fall within the given grid squares.
   * Works for all AOE types (blast, burst, path, etc.).
   * @param {Array<{x: number, y: number}>} squares  Top-left corners of grid squares
   * @param {number} gridPx
   * @param {object} [options]
   * @param {string} [options.excludeTokenId]
   * @returns {Token[]}
   */
  static getTokensInSquares(squares, gridPx, { excludeTokenId } = {}) {
    return canvas.tokens.placeables.filter(t => {
      if (excludeTokenId && t.id === excludeTokenId) return false;
      const cx = t.center.x;
      const cy = t.center.y;
      return squares.some(sq =>
        cx >= sq.x && cx < sq.x + gridPx &&
        cy >= sq.y && cy < sq.y + gridPx
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

    if (deed.actionType !== "support" && targetArr.length === 0) {
      return {
        valid: false,
        message: game.i18n.localize("TRESPASSER.Notifications.NoTargetsDefault")
      };
    }

    const maxTargets = deed.targetCount ?? 1;
    if (targetArr.length > maxTargets) {
      return {
        valid: false,
        message: game.i18n.format("TRESPASSER.Notifications.TooManyTargets", {
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
   * @returns {Promise<{squares, templateDoc: null}|null>}
   */
  static async #placeBlast(token, size, gridPx, close) {
    return new Promise((resolve) => {
      const highlights = [];
      const layer = canvas.interface;
      let currentSquares = [];
      // DOM events for clicks (bypass token interception),
      // PIXI globalpointermove for accurate coordinate tracking.
      const view = canvas.app.view;
      let lastCanvasPos = { x: 0, y: 0 };

      const drawPreview = (topLeftX, topLeftY) => {
        for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
        highlights.length = 0;
        currentSquares = [];

        for (let dx = 0; dx < size; dx++) {
          for (let dy = 0; dy < size; dy++) {
            const sq = { x: topLeftX + dx * gridPx, y: topLeftY + dy * gridPx };
            currentSquares.push(sq);

            const gfx = new PIXI.Graphics();
            gfx.beginFill(0xff9955, 0.35);
            gfx.lineStyle(2, 0xff9955, 0.8);
            gfx.drawRect(sq.x, sq.y, gridPx, gridPx);
            gfx.endFill();
            layer.addChild(gfx);
            highlights.push(gfx);
          }
        }
      };

      const pixiMoveHandler = (event) => {
        lastCanvasPos = event.getLocalPosition(canvas.stage);
        const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
        const offsetX = snapped.x - Math.floor(size / 2) * gridPx;
        const offsetY = snapped.y - Math.floor(size / 2) * gridPx;
        drawPreview(offsetX, offsetY);
      };

      const clickHandler = (event) => {
        if (event.button !== 0) return; // left click only
        if (currentSquares.length === 0) return;

        if (close) {
          if (!this.#isBlastAdjacentToToken(currentSquares, token, gridPx)) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.BlastMustBeAdjacent"));
            return;
          }
        }

        cleanup();
        resolve({ squares: [...currentSquares], templateDoc: null });
      };

      const rightClickHandler = (event) => {
        event.preventDefault();
        cleanup();
        resolve(null);
      };

      const cleanup = () => {
        canvas.stage.off("globalpointermove", pixiMoveHandler);
        view.removeEventListener("mousedown", clickHandler);
        view.removeEventListener("contextmenu", rightClickHandler);
        for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
        highlights.length = 0;
      };

      canvas.stage.on("globalpointermove", pixiMoveHandler);
      view.addEventListener("mousedown", clickHandler);
      view.addEventListener("contextmenu", rightClickHandler);
    });
  }

  /**
   * Check if any square in the blast is adjacent to (sharing an edge with)
   * any square occupied by the token.
   */
  static #isBlastAdjacentToToken(blastSquares, token, gridPx) {
    const tokenTopLeft = canvas.grid.getTopLeftPoint(token.center);
    const tokenW = token.document.width ?? 1;
    const tokenH = token.document.height ?? 1;

    // Build set of token-occupied positions
    const tokenPositions = [];
    for (let tx = 0; tx < tokenW; tx++) {
      for (let ty = 0; ty < tokenH; ty++) {
        tokenPositions.push({
          x: tokenTopLeft.x + tx * gridPx,
          y: tokenTopLeft.y + ty * gridPx
        });
      }
    }

    // Check if any blast square shares an edge with any token square
    for (const bSq of blastSquares) {
      for (const tSq of tokenPositions) {
        const dx = Math.abs(bSq.x - tSq.x);
        const dy = Math.abs(bSq.y - tSq.y);
        // Shares edge: one axis differs by gridPx, the other by 0
        // OR shares corner: both differ by gridPx (diagonal adjacency)
        if (dx <= gridPx && dy <= gridPx && !(dx === 0 && dy === 0)) return true;
      }
    }
    return false;
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
  static #computeBurstSquares(token, size, gridPx) {
    const tokenTopLeft = canvas.grid.getTopLeftPoint(token.center);
    const tokenW = token.document.width ?? 1;
    const tokenH = token.document.height ?? 1;

    const squares = [];
    for (let dx = -size; dx < tokenW + size; dx++) {
      for (let dy = -size; dy < tokenH + size; dy++) {
        squares.push({
          x: tokenTopLeft.x + dx * gridPx,
          y: tokenTopLeft.y + dy * gridPx
        });
      }
    }
    return squares;
  }

  /**
   * Create a persistent MeasuredTemplate for an aura (visual only).
   * Uses a circle to approximate the square shape visually on the canvas.
   */
  static async #createAuraTemplate(token, sizeInSquares, gridPx) {
    const gridDist = canvas.dimensions?.distance || canvas.scene?.grid?.distance || 5;
    // Use a circle with radius = size + 0.5 (to visually cover the grid squares)
    const distance = (sizeInSquares + 0.5) * gridDist;

    const templateData = {
      t: "circle",
      x: token.center.x,
      y: token.center.y,
      distance,
      direction: 0,
      fillColor: "#5599ff",
      flags: { trespasser: { autoPlaced: true, isAura: true } }
    };

    const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    return doc;
  }

  /* -------------------------------------------- */
  /* Private — Path (sequential square selection)  */
  /* -------------------------------------------- */

  /**
   * Interactive path placement. Click any reachable square to auto-draw the
   * shortest orthogonal path to it. Right-click undoes the last segment,
   * double-click confirms early. Directional arrows show path flow.
   * @returns {Promise<{squares, templateDoc: null}|null>}
   */
  static async #placePath(token, maxSquares, gridPx, close) {
    return new Promise((resolve) => {
      const squares = [];
      const highlights = [];
      const layer = canvas.interface;
      const view = canvas.app.view;
      let lastCanvasPos = { x: 0, y: 0 };

      // Track canvas-space mouse position via PIXI (accurate coords),
      // DOM events handle clicks (bypass token interception).
      const pixiMoveHandler = (event) => {
        lastCanvasPos = event.getLocalPosition(canvas.stage);
      };

      const sqKey = (s) => `${s.x},${s.y}`;

      // Check if adding sq to the current path would form a 2×2 block
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

      const isAdjacent = (a, b) => {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        return (dx === gridPx && dy === 0) || (dx === 0 && dy === gridPx);
      };

      // BFS to find shortest orthogonal path from `from` to `to`,
      // respecting the 2×2 constraint and avoiding already-placed squares.
      // Returns array of intermediate squares (excluding `from`, including `to`), or null.
      const findPath = (from, to, existingSquares, maxSteps) => {
        if (sqKey(from) === sqKey(to)) return null;
        const visited = new Set(existingSquares.map(sqKey));
        visited.add(sqKey(from));
        const queue = [{ pos: from, trail: [] }];
        const dirs = [
          { dx: gridPx, dy: 0 }, { dx: -gridPx, dy: 0 },
          { dx: 0, dy: gridPx }, { dx: 0, dy: -gridPx }
        ];
        while (queue.length > 0) {
          const { pos, trail } = queue.shift();
          for (const d of dirs) {
            const next = { x: pos.x + d.dx, y: pos.y + d.dy };
            const key = sqKey(next);
            if (visited.has(key)) continue;
            const newTrail = [...trail, next];
            if (newTrail.length > maxSteps) continue;
            // Check 2×2 constraint incrementally
            const testSquares = [...existingSquares, ...newTrail.slice(0, -1)];
            if (forms2x2(testSquares, next)) continue;
            if (key === sqKey(to)) return newTrail;
            visited.add(key);
            queue.push({ pos: next, trail: newTrail });
          }
        }
        return null;
      };

      // Draw a highlight square with a directional arrow
      const drawHighlight = (x, y, prev) => {
        const gfx = new PIXI.Graphics();
        // Fill
        gfx.beginFill(0x55aaff, 0.35);
        gfx.lineStyle(2, 0x55aaff, 0.8);
        gfx.drawRect(x, y, gridPx, gridPx);
        gfx.endFill();
        // Arrow showing direction from prev -> this square
        if (prev) {
          const cx = x + gridPx / 2;
          const cy = y + gridPx / 2;
          const dx = x - prev.x;
          const dy = y - prev.y;
          const arrowSize = gridPx * 0.15;
          gfx.beginFill(0xffffff, 0.7);
          gfx.lineStyle(0);
          if (dx > 0) {
            // pointing right
            gfx.moveTo(cx + arrowSize, cy);
            gfx.lineTo(cx - arrowSize, cy - arrowSize);
            gfx.lineTo(cx - arrowSize, cy + arrowSize);
          } else if (dx < 0) {
            // pointing left
            gfx.moveTo(cx - arrowSize, cy);
            gfx.lineTo(cx + arrowSize, cy - arrowSize);
            gfx.lineTo(cx + arrowSize, cy + arrowSize);
          } else if (dy > 0) {
            // pointing down
            gfx.moveTo(cx, cy + arrowSize);
            gfx.lineTo(cx - arrowSize, cy - arrowSize);
            gfx.lineTo(cx + arrowSize, cy - arrowSize);
          } else {
            // pointing up
            gfx.moveTo(cx, cy - arrowSize);
            gfx.lineTo(cx - arrowSize, cy + arrowSize);
            gfx.lineTo(cx + arrowSize, cy + arrowSize);
          }
          gfx.endFill();
        } else {
          // Start marker — small circle
          const cx = x + gridPx / 2;
          const cy = y + gridPx / 2;
          gfx.beginFill(0xffffff, 0.7);
          gfx.lineStyle(0);
          gfx.drawCircle(cx, cy, gridPx * 0.08);
          gfx.endFill();
        }
        layer.addChild(gfx);
        highlights.push(gfx);
      };

      // Redraw all highlights (needed after undo to refresh arrows)
      const redrawAll = () => {
        for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
        highlights.length = 0;
        for (let i = 0; i < squares.length; i++) {
          drawHighlight(squares[i].x, squares[i].y, i > 0 ? squares[i - 1] : null);
        }
      };

      // Track how many squares each click added, so undo removes the whole segment
      const segmentLengths = [];

      const clickHandler = (event) => {
        if (event.button !== 0) return;
        if (squares.length >= maxSquares) return;

        const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
        const target = { x: snapped.x, y: snapped.y };

        if (squares.some(s => s.x === target.x && s.y === target.y)) return;

        // First square: close_path must be adjacent to token
        if (squares.length === 0) {
          if (close) {
            const tokenTopLeft = canvas.grid.getTopLeftPoint(token.center);
            if (!isAdjacent(target, tokenTopLeft)) {
              ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.PathMustStartAdjacent"));
              return;
            }
          }
          squares.push(target);
          segmentLengths.push(1);
          drawHighlight(target.x, target.y, null);
          if (squares.length >= maxSquares) {
            cleanup();
            resolve({ squares: [...squares], templateDoc: null });
          }
          return;
        }

        const last = squares[squares.length - 1];
        const remaining = maxSquares - squares.length;

        // If adjacent, just add directly (fast path)
        if (isAdjacent(last, target)) {
          if (forms2x2(squares, target)) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.PathNo2x2"));
            return;
          }
          squares.push(target);
          segmentLengths.push(1);
          drawHighlight(target.x, target.y, last);
          if (squares.length >= maxSquares) {
            cleanup();
            resolve({ squares: [...squares], templateDoc: null });
          }
          return;
        }

        // Non-adjacent: BFS auto-fill
        const path = findPath(last, target, squares, remaining);
        if (!path) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.PathNoRoute"));
          return;
        }

        segmentLengths.push(path.length);
        for (const sq of path) {
          squares.push(sq);
        }
        redrawAll();

        if (squares.length >= maxSquares) {
          cleanup();
          resolve({ squares: [...squares], templateDoc: null });
        }
      };

      const rightClickHandler = (event) => {
        event.preventDefault();
        if (squares.length > 0) {
          // Undo the last segment
          const count = segmentLengths.pop() ?? 1;
          squares.splice(-count, count);
          redrawAll();
        } else {
          cleanup();
          resolve(null);
        }
      };

      const dblClickHandler = () => {
        if (squares.length === 0) {
          cleanup();
          resolve(null);
          return;
        }
        cleanup();
        resolve({ squares: [...squares], templateDoc: null });
      };

      const cleanup = () => {
        canvas.stage.off("globalpointermove", pixiMoveHandler);
        view.removeEventListener("mousedown", clickHandler);
        view.removeEventListener("contextmenu", rightClickHandler);
        view.removeEventListener("dblclick", dblClickHandler);
        for (const gfx of highlights) {
          layer.removeChild(gfx);
          gfx.destroy();
        }
        highlights.length = 0;
      };

      canvas.stage.on("globalpointermove", pixiMoveHandler);
      view.addEventListener("mousedown", clickHandler);
      view.addEventListener("contextmenu", rightClickHandler);
      view.addEventListener("dblclick", dblClickHandler);
    });
  }

  /* -------------------------------------------- */
  /* Engagement                                    */
  /* -------------------------------------------- */

  /**
   * Check if a token is engaged — any hostile token within melee range
   * that has a melee weapon equipped.
   * @param {Token} token
   * @returns {boolean}
   */
  static isEngaged(token) {
    if (!token) return false;
    const gridPx = canvas.grid.size;
    const maxDist = 2 * gridPx; // 2 squares = max melee reach

    for (const other of canvas.tokens.placeables) {
      if (other.id === token.id) continue;
      if (other.document.disposition === token.document.disposition) continue;

      const dist = Math.hypot(other.center.x - token.center.x, other.center.y - token.center.y);
      if (dist > maxDist) continue;

      const hasMelee = other.actor?.items.some(i =>
        i.type === "weapon" && i.system.equipped && i.system.type === "melee"
      );
      if (hasMelee) return true;
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
    if (exemptTypes.includes(deed.targetType)) return true;

    if (sourceToken && targets.length > 0) {
      const gridPx = canvas.grid.size;
      for (const t of targets) {
        const dist = Math.hypot(t.center.x - sourceToken.center.x, t.center.y - sourceToken.center.y);
        if (dist <= gridPx * 1.5) return true;
      }
    }
    return false;
  }

  /**
   * Check if a defending character has a melee weapon and is within melee range of attacker.
   * @param {Token} defenderToken
   * @param {Token} attackerToken
   * @returns {{ canCounter: boolean, weapon: Item|null }}
   */
  static checkCounterEligibility(defenderToken, attackerToken) {
    if (!defenderToken?.actor || !attackerToken) return { canCounter: false, weapon: null };

    const gridPx = canvas.grid.size;
    const dist = Math.hypot(
      defenderToken.center.x - attackerToken.center.x,
      defenderToken.center.y - attackerToken.center.y
    );
    if (dist > 2 * gridPx) return { canCounter: false, weapon: null };

    const meleeWeapon = defenderToken.actor.items.find(i =>
      i.type === "weapon" && i.system.equipped && i.system.type === "melee"
    );
    if (!meleeWeapon) return { canCounter: false, weapon: null };

    return { canCounter: true, weapon: meleeWeapon };
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
    const deedType = deed.type;

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
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notifications.NeedMeleeWeapon") };
      }
    }
    // Missile: requires missile weapon OR thrown melee weapon
    else if (deedType === "missile") {
      const hasMissile = activeWeapons.some(w =>
        w.system.type === "missile" || (w.system.type === "melee" && w.system.properties?.thrown)
      );
      if (!hasMissile) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notifications.NeedMissileWeapon") };
      }
    }
    // Spell: requires spell weapon OR free hand
    else if (deedType === "spell") {
      const hasSpell = hasFreeHand || activeWeapons.some(w => w.system.type === "spell");
      if (!hasSpell) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notifications.NeedSpellWeapon") };
      }
    }
    // Tool: requires free hand
    else if (deedType === "tool") {
      if (!hasFreeHand) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notifications.NeedFreeHand") };
      }
    }
    // Versatile: requires any melee or missile weapon
    else if (deedType === "versatile") {
      const hasCompatible = activeWeapons.some(w =>
        ["melee", "missile"].includes(w.system.type)
      );
      if (!hasCompatible) {
        return { valid: false, message: game.i18n.localize("TRESPASSER.Notifications.NeedWeapon") };
      }
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
  static validateRange(targets, sourceToken, deed, activeWeapons) {
    if (!sourceToken || targets.length === 0) return { valid: true };
    // Only applies to creature-targeted deeds
    if (deed.targetType !== "creature") return { valid: true };
    // Support deeds don't need range validation
    if (deed.actionType === "support") return { valid: true };

    const gridPx = canvas.grid.size;
    const gridDist = canvas.dimensions?.distance ?? 5;

    // Determine max range in grid squares based on deed type
    let maxRangeSq;

    const deedType = deed.type;
    const isThrown = activeWeapons.some(w => w.system.properties?.thrown);

    if (deedType === "melee" || deedType === "unarmed") {
      if (isThrown) {
        // Thrown weapon used at missile range
        const relevant = activeWeapons.filter(w => w.system.properties?.thrown);
        maxRangeSq = this.#getWeaponRangeInSquares(relevant, gridDist);
      } else {
        // Melee reach: parse from weapon range field, default 1 (free hand = 1)
        const meleeWeapons = activeWeapons.filter(w => w.system.type === "melee");
        maxRangeSq = this.#getWeaponRangeInSquares(meleeWeapons, gridDist);
        if (maxRangeSq === 0) maxRangeSq = 1; // free hand / default
      }
    } else if (deedType === "missile") {
      const relevant = activeWeapons.filter(w =>
        w.system.type === "missile" || w.system.properties?.thrown
      );
      maxRangeSq = this.#getWeaponRangeInSquares(relevant, gridDist);
    } else if (deedType === "spell") {
      // Spell weapons have spell range; free hand = 4 squares
      const spellWeapons = activeWeapons.filter(w => w.system.type === "spell");
      maxRangeSq = this.#getWeaponRangeInSquares(spellWeapons, gridDist);
      if (maxRangeSq === 0) maxRangeSq = 4; // free hand default
    } else if (deedType === "tool") {
      // Tool range = 5 + Agility (throwing range)
      const agility = sourceToken.actor?.system?.attributes?.agility ?? 0;
      maxRangeSq = 5 + agility;
    } else if (deedType === "versatile") {
      maxRangeSq = this.#getWeaponRangeInSquares(activeWeapons, gridDist);
    } else {
      // Innate: no range enforcement
      return { valid: true };
    }

    // If no parseable range found, skip validation (don't block deeds with empty range)
    if (!maxRangeSq || maxRangeSq <= 0) return { valid: true };

    // Check each target using Chebyshev distance (grid squares)
    for (const t of targets) {
      const dx = Math.abs(t.center.x - sourceToken.center.x);
      const dy = Math.abs(t.center.y - sourceToken.center.y);
      const distSq = Math.max(dx, dy) / gridPx; // Chebyshev distance in squares
      if (distSq > maxRangeSq) {
        return {
          valid: false,
          message: game.i18n.format("TRESPASSER.Notifications.TargetOutOfRange", {
            name: t.name,
            range: maxRangeSq,
            distance: Math.round(distSq)
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
