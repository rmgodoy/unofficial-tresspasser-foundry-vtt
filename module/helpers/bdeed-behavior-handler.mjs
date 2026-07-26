import { TargetingHelper } from "./targeting-helper.mjs";
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TerrainHelper } from "./terrain-helper.mjs";
import { ForcedMovementHelper } from "./forced-movement-helper.mjs";

/**
 * BDeedBehaviorHandler — Dispatcher executing actual game logic for all 9 behavior types.
 *
 * Fully compliant with Trespasser TTRPG Sparks & Multiple Targets Layered Resolution Rules:
 *   - Layer 1 Choice applies to all targets with sparks >= 1
 *   - Layer 2 Choice applies only to targets with sparks >= 2
 *   - Layer k Choice applies only to targets with sparks >= k
 */
export class BDeedBehaviorHandler {

  /**
   * Dispatch a single behavior.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - BDeed item
   * @param {string} [phaseKey] - Current phase key ("start", "before", "base", "hit", "spark", "after", "end")
   */
  static async dispatch(behavior, context, actor, item, phaseKey = "") {
    switch (behavior.type) {
      case "selectTarget":     return this._selectTarget(behavior, context, actor, item);
      case "selectArea":       return this._selectArea(behavior, context, actor, item);
      case "applyDamage":      return this._applyDamage(behavior, context, actor, item, phaseKey);
      case "applyEffects":     return this._applyEffects(behavior, context, actor, item, phaseKey);
      case "modifyBehavior":   return; // Handled pre-pipeline by BDeedExecutor
      case "spawnTerrain":     return this._spawnTerrain(behavior, context, actor, item);
      case "moveTerrain":      return this._moveTerrain(behavior, context, item);
      case "moveSource":       return this._moveSource(behavior, context, actor);
      case "forceMoveTargets": return this._forceMoveTargets(behavior, context, actor, item, phaseKey);
      case "clearTargets":     return this._clearTargets(context);
      case "executeDeed":      return this._executeDeed(behavior, context, actor);
    }
  }

  /**
   * Helper to resolve the targeted area from runtime context.
   * Checks for specific areaBehaviorId match, falling back to context.area (latest).
   * @param {object} context
   * @param {object} [params]
   * @returns {object|null}
   */
  static _resolveArea(context, params = {}) {
    if (params.areaBehaviorId && context.areas?.has(params.areaBehaviorId)) {
      return context.areas.get(params.areaBehaviorId);
    }
    return context.area;
  }

  /**
   * Render or update visual grid highlights for the currently selected area in context.
   * @param {object} context
   */
  static renderAreaHighlight(context) {
    this.clearAreaHighlight(context);
    if (!context?.area?.squares || context.area.squares.length === 0) return;

    const layerName = "bdeedSelectArea";
    if (canvas.grid?.addHighlightLayer && canvas.grid?.highlightPosition) {
      try {
        canvas.grid.addHighlightLayer(layerName);
        for (const sq of context.area.squares) {
          canvas.grid.highlightPosition(layerName, { x: sq.x, y: sq.y, color: 0x3399ff, border: 0x0066cc });
        }
      } catch (err) {
        console.warn("[BDeedBehaviorHandler] Could not draw area highlight:", err);
      }
    }
  }

  /**
   * Clear canvas grid highlights for selected area.
   * @param {object} context
   */
  static clearAreaHighlight(context) {
    const layerName = "bdeedSelectArea";
    if (canvas.grid?.clearHighlightLayer) {
      try {
        canvas.grid.clearHighlightLayer(layerName);
      } catch (err) {
        // Ignored
      }
    }
  }

  /**
   * Helper to safely find source token or controlled token
   * @protected
   */
  static _findToken(actor) {
    if (actor?.token?.object) return actor.token.object;
    if (actor?.id) {
      const found = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);
      if (found) return found;
    }
    return canvas.tokens?.controlled[0] || null;
  }

  /**
   * Safely resolve the display name for a token or actor target.
   * Priority: Synthetic actor name > Token document name > Prototype token name > Actor name
   * @param {Token|TokenDocument|Actor} target
   * @returns {string}
   */
  static getTokenDisplayName(target) {
    if (!target) return "Target";
    const actor = target.actor || (target instanceof Actor ? target : null);
    if (actor?.name) return actor.name;
    if (target.document?.name) return target.document.name;
    if (target.name) return target.name;
    return "Target";
  }

  /**
   * Helper to filter valid target tokens for damage/effects/movement behaviors.
   * If accuracy check ran, filters hit targets.
   * If phase is "spark", filters ONLY targets that reached the layer where Deed Spark was chosen.
   * @param {object} context
   * @param {string} [phaseKey]
   * @returns {Array<Token>}
   */
  static getValidTargets(context, phaseKey = "") {
    let validTargets = context.targets || [];
    if (context.accuracyResults && context.accuracyResults.length > 0) {
      const isSparkPhase = phaseKey === "spark";
      const requiredSparks = isSparkPhase ? (context.sparkChoices?.deedSparkLayer || 1) : 0;
      const hitTokenIds = new Set(
        context.accuracyResults
          .filter(r => r.isHit && r.tokenId && (!isSparkPhase || r.sparks >= requiredSparks))
          .map(r => r.tokenId)
      );
      validTargets = validTargets.filter(t => hitTokenIds.has(t.id));
    }
    return validTargets;
  }

  /**
   * Helper to replace <sd> (Skill Die) and <wd> (Weapon Die) placeholders in roll formulas.
   * @param {string} expr - e.g. "2d6 + 1<sd> + <wd>"
   * @param {Actor} [actor]
   * @returns {string}
   */
  static resolveFormulaPlaceholders(expr, actor) {
    if (!expr) return "";
    let resolved = expr;

    // 1. Skill Die placeholder <sd>
    const skillDie = actor?.system?.skill_die || "d6"; // e.g. "d6", "d8"
    resolved = resolved.replace(/<sd>/gi, skillDie);

    // 2. Weapon Die placeholder <wd>
    let weaponDie = "d4";
    if (actor) {
      // Find equipped weapon item
      const weapons = actor.items?.filter(i => i.type === "weapon" && (i.system?.equipped || i.system?.isEquipped)) ?? [];
      const primaryWeapon = weapons[0] || actor.items?.find(i => i.type === "weapon");
      if (primaryWeapon?.system?.damage) {
        weaponDie = primaryWeapon.system.damage.trim();
      } else if (primaryWeapon?.system?.die) {
        weaponDie = primaryWeapon.system.die.trim();
      }
    }
    resolved = resolved.replace(/<wd>/gi, weaponDie);

    return resolved;
  }

  /**
   * 1. selectTarget: Target mode "self", "creatures", or "aoe"
   * For "creatures" mode: spawns a 1x1 template repeatedly to select up to N targets.
   * Right-clicking during targeting finishes selection early with chosen targets.
   * @protected
   */
  static async _selectTarget(behavior, context, actor, item) {
    const params = behavior.params || {};
    const mode = params.targetMode || "creatures";
    const token = this._findToken(actor);

    if (mode === "self") {
      context.targets = token ? [token] : (actor ? [actor] : []);
      ui.notifications.info(`Targeted self: ${actor?.name || token?.name || "Self"}`);
      return true;
    }

    if (mode === "creatures") {
      const maxCount = parseInt(params.targetCount) || 1;

      if (!token) {
        ui.notifications.warn("No token found on canvas for target selection.");
        return false;
      }

      const selectedTargets = [];
      const gridPx = canvas.grid.size;

      for (let i = 0; i < maxCount; i++) {
        ui.notifications.info(`Select target ${i + 1} of ${maxCount} (Right-click canvas to finish selection early).`);

        const deedData = {
          targetType: "blast",
          targetSize: 1,
          range: item?.system?.range || 0
        };

        const result = await TargetingHelper.placeTemplate(actor, token, deedData);

        // Right-click or cancellation stops adding targets
        if (!result || !result.squares || result.squares.length === 0) {
          break;
        }

        const tokensInSquare = TargetingHelper.getTokensInSquares(result.squares, gridPx);
        if (tokensInSquare.length > 0) {
          for (const t of tokensInSquare) {
            if (!selectedTargets.some(existing => existing.id === t.id)) {
              selectedTargets.push(t);
            }
          }
          // Update canvas target selection visually
          if (game.user.updateTokenTargets) {
            game.user.updateTokenTargets(selectedTargets.map(t => t.id));
          }
        } else {
          ui.notifications.warn("No token found in targeted square.");
        }
      }

      if (selectedTargets.length === 0) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = selectedTargets;
      ui.notifications.info(`Targeted ${selectedTargets.length} token(s).`);
      return true;
    }

    if (mode === "aoe") {
      const aoeType = params.aoeType || "blast";
      const aoeSize = parseInt(params.aoeSize) || 1;
      const deedData = {
        targetType: aoeType,
        targetSize: aoeSize,
        range: item?.system?.range || 0
      };

      if (!token) {
        ui.notifications.warn("No token found on canvas for AoE template placement.");
        return false;
      }

      const result = await TargetingHelper.placeTemplate(actor, token, deedData, [], {
        originOverride: context.sourcePosition || null
      });
      if (!result || !result.squares) {
        ui.notifications.info("AoE template placement cancelled.");
        return false;
      }

      const gridPx = canvas.grid.size;
      const tokensInAoE = TargetingHelper.getTokensInSquares(result.squares, gridPx);
      context.targets = tokensInAoE;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(tokensInAoE.map(t => t.id));
      }
      ui.notifications.info(`AoE targeted ${tokensInAoE.length} token(s).`);
      return true;
    }

    if (mode === "area") {
      const targetArea = this._resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for target selection.");
        return false;
      }

      const areaRelation = params.areaRelation || "inside";
      const gridPx = canvas.grid.size;
      const baseSquares = targetArea.squares;
      const targetSqMap = new Map();

      for (const sq of baseSquares) {
        if (areaRelation === "inside" || areaRelation === "insideAndAdjacent") {
          targetSqMap.set(`${sq.x},${sq.y}`, sq);
        }
        if (areaRelation === "adjacent" || areaRelation === "insideAndAdjacent") {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              const adjSq = { x: sq.x + dx * gridPx, y: sq.y + dy * gridPx };
              const key = `${adjSq.x},${adjSq.y}`;
              if (areaRelation === "adjacent") {
                const isInside = baseSquares.some(s => s.x === adjSq.x && s.y === adjSq.y);
                if (!isInside) targetSqMap.set(key, adjSq);
              } else {
                targetSqMap.set(key, adjSq);
              }
            }
          }
        }
      }

      const evalSquares = Array.from(targetSqMap.values());
      let selectedTargets = TargetingHelper.getTokensInSquares(evalSquares, gridPx);

      if (params.ignoreSelf) {
        const sourceToken = this._findToken(actor);
        if (sourceToken) {
          selectedTargets = selectedTargets.filter(t => t.id !== sourceToken.id);
        }
      }

      context.targets = selectedTargets;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(selectedTargets.map(t => t.id));
      }
      ui.notifications.info(`Targeted ${selectedTargets.length} token(s) based on selected area (${areaRelation}).`);
      return true;
    }
  }

  /**
   * 1b. selectArea: Target mode "squares" or "aoe"
   * Saves the grid squares directly to context.area.
   * @protected
   */
  static async _selectArea(behavior, context, actor, item) {
    const params = behavior.params || {};
    const mode = params.targetMode || "squares";
    const token = this._findToken(actor);

    if (!token) {
      ui.notifications.warn("No token found on canvas for area selection.");
      return false;
    }

    if (mode === "squares") {
      const maxCount = parseInt(params.targetCount) || 1;
      const selectedSquares = [];

      for (let i = 0; i < maxCount; i++) {
        ui.notifications.info(`Select square ${i + 1} of ${maxCount} (Right-click canvas to finish selection early).`);

        const deedData = {
          targetType: "blast",
          targetSize: 1,
          range: item?.system?.range || 0
        };

        const result = await TargetingHelper.placeTemplate(actor, token, deedData);

        if (!result || !result.squares || result.squares.length === 0) {
          break;
        }

        const sq = result.squares[0];
        if (!selectedSquares.some(s => s.x === sq.x && s.y === sq.y)) {
          selectedSquares.push(sq);
        }
      }

      if (selectedSquares.length === 0) {
        ui.notifications.info("Area selection cancelled.");
        return false;
      }

      const areaData = {
        id: behavior.id,
        squares: selectedSquares,
        type: "squares",
        size: selectedSquares.length,
        isPath: false
      };
      if (!context.areas) context.areas = new Map();
      context.areas.set(behavior.id, areaData);
      context.area = areaData;
      this.renderAreaHighlight(context);
      ui.notifications.info(`Selected ${selectedSquares.length} square(s).`);
      return true;
    }

    if (mode === "aoe") {
      const aoeType = params.aoeType || "blast";
      const aoeSize = parseInt(params.aoeSize) || 1;
      const deedData = {
        targetType: aoeType,
        targetSize: aoeSize,
        range: item?.system?.range || 0
      };

      const result = await TargetingHelper.placeTemplate(actor, token, deedData);
      if (!result || !result.squares || result.squares.length === 0) {
        ui.notifications.info("AoE area selection cancelled.");
        return false;
      }

      const isPath = (aoeType === "path" || aoeType === "close_path");
      const areaData = {
        id: behavior.id,
        squares: result.squares,
        type: aoeType,
        size: aoeSize,
        isPath
      };
      if (!context.areas) context.areas = new Map();
      context.areas.set(behavior.id, areaData);
      context.area = areaData;
      this.renderAreaHighlight(context);
      ui.notifications.info(`Selected area shape "${aoeType}" (${result.squares.length} squares).`);
      return true;
    }

    return false;
  }

  /**
   * 2. applyDamage: Evaluates expression as a roll formula, applies damage to hit target actors, and triggers token shake & floating damage text.
   * Layered Power spark bonus damage dice apply ONLY to targets whose spark count reached the layer where Power was selected.
   * Uses terms from evaluated rolls so rendered dice match calculated damage totals exactly.
   * @protected
   */
  static async _applyDamage(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    let rawExpr = params.expression?.trim();
    if (!rawExpr) return true;

    const validTargets = this.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    let expr = this.resolveFormulaPlaceholders(rawExpr, actor);
    const rollData = actor?.getRollData() || {};

    // 1. Base damage roll
    const baseRoll = new Roll(expr, rollData);
    await baseRoll.evaluate();
    const baseTotal = baseRoll.total;

    // 2. Max power dice across all target layers
    let maxPowerDice = 0;
    if (context.sparkChoices?.perTarget) {
      for (const tChoice of context.sparkChoices.perTarget.values()) {
        if (tChoice.power > maxPowerDice) maxPowerDice = tChoice.power;
      }
    }

    // 3. Roll power bonus dice if maxPowerDice > 0 using terms to avoid double-rolling
    const powerDiceRolls = [0];
    const skillDie = actor?.system?.skill_die || "d6";
    let combinedRoll = baseRoll;

    if (maxPowerDice > 0) {
      const powerFormula = `${maxPowerDice}${skillDie}`;
      const powerRoll = new Roll(powerFormula, rollData);
      await powerRoll.evaluate();

      const dieResults = powerRoll.dice[0]?.results?.map(r => r.result) || [];
      for (let k = 1; k <= maxPowerDice; k++) {
        powerDiceRolls[k] = dieResults.slice(0, k).reduce((a, b) => a + b, 0);
      }

      // Combine baseRoll and powerRoll terms into a single evaluated roll without re-evaluating dice
      combinedRoll = Roll.fromTerms([
        ...baseRoll.terms,
        new foundry.dice.terms.OperatorTerm({ operator: "+" }),
        ...powerRoll.terms
      ]);
      combinedRoll._evaluated = true;
      combinedRoll._total = baseRoll.total + powerRoll.total;
    }

    // 4. Apply per-target damage based on each target's layered power dice count & build chat output lines
    const targetDamageLines = [];
    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = BDeedBehaviorHandler.getTokenDisplayName(targetToken);
      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetPowerCount = Math.min(maxPowerDice, targetChoices?.power || 0);
      const targetPowerDmg = powerDiceRolls[targetPowerCount] || 0;
      const targetDmg = baseTotal + targetPowerDmg;

      await targetActor.applyDamage(targetDmg);

      const powerBonusLabel = targetPowerCount > 0 ? ` <span style="font-size: var(--fs-10); color:#e8c96b;">(+${targetPowerDmg} Power)</span>` : "";
      targetDamageLines.push(`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12); margin-top:4px; padding-top:3px; border-top:1px dotted var(--trp-border-light, #5c4f3a);">
          <span><strong>${tokenName}</strong>${powerBonusLabel}</span>
          <span style="color:#ff5252; font-weight:bold;">⚡ ${targetDmg} ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Dano"}</span>
        </div>
      `);
    }

    const rollHtml = await combinedRoll.render();

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    context.currentPhaseOutputs.rolls.push(combinedRoll);
    context.currentPhaseOutputs.rollEntries.push(`
      <div class="damage-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Damage"}: ${expr}${maxPowerDice > 0 ? " (Power Spark)" : ""}
        </h4>
        ${rollHtml}
        <div class="target-damage-results" style="margin-top: 6px;">
          ${targetDamageLines.join("")}
        </div>
      </div>
    `);

    return true;
  }

  /**
   * 3. applyEffects: Applies specified effects to context.targets (incorporating Potency spark bonus) and appends notes to current phase.
   * Potency spark bonus intensity applies ONLY to targets whose spark count reached the layer where Potency was selected.
   * @protected
   */
  static async _applyEffects(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const effects = params.effects || [];

    const validTargets = this.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    for (const eff of effects) {
      if (!eff.uuid) continue;
      const effectItem = await fromUuid(eff.uuid);
      if (!effectItem) continue;

      for (const targetToken of validTargets) {
        const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
        if (!targetActor) continue;

        const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
        const targetPotencyBonus = targetChoices?.potency || 0;

        const itemData = effectItem.toObject();
        itemData.system = itemData.system || {};
        const baseIntensity = eff.intensity || 1;
        itemData.system.intensity = baseIntensity + targetPotencyBonus;

        await targetActor.createEmbeddedDocuments("Item", [itemData]);
        if (context.currentPhaseOutputs?.notes) {
          const tokenName = BDeedBehaviorHandler.getTokenDisplayName(targetToken);
          context.currentPhaseOutputs.notes.push(`Applied effect "${effectItem.name}" (Intensity ${itemData.system.intensity}) to ${tokenName}`);
        }
      }
    }
    return true;
  }

  /**
   * 4. spawnTerrain: Places a terrain item on the canvas and tags canvas objects
   * @protected
   */
  static async _spawnTerrain(behavior, context, actor, item) {
    const params = behavior.params || {};
    if (!params.terrainUuid) return true;

    const terrainItem = await fromUuid(params.terrainUuid);
    if (!terrainItem) return true;

    const placement = params.placement || "on_target";

    if (placement === "selected_area") {
      const targetArea = this._resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for terrain placement.");
        return false;
      }
      const gridPx = canvas.grid.size;
      let evalSquares = targetArea.squares;

      if (params.ignoreSourceSquare) {
        const sourceToken = this._findToken(actor);
        if (sourceToken) {
          const srcX = context.sourcePosition?.x ?? sourceToken.document?.x ?? sourceToken.x;
          const srcY = context.sourcePosition?.y ?? sourceToken.document?.y ?? sourceToken.y;
          const srcGx = Math.floor(srcX / gridPx);
          const srcGy = Math.floor(srcY / gridPx);

          evalSquares = evalSquares.filter(sq => {
            const sqGx = Math.floor(sq.x / gridPx);
            const sqGy = Math.floor(sq.y / gridPx);
            return !(sqGx === srcGx && sqGy === srcGy);
          });
        }
      }

      const gridSquares = evalSquares.map(sq => ({ x: Math.floor(sq.x / gridPx), y: Math.floor(sq.y / gridPx) }));
      const created = await TerrainHelper.placeTerrainOnCanvas(terrainItem, { x: 0, y: 0 }, { pathSquares: gridSquares });
      if (created) {
        if (Array.isArray(created)) {
          context.spawnedTerrains.push(...created);
        } else {
          context.spawnedTerrains.push(created);
        }
      }
      if (context.currentPhaseOutputs?.notes) {
        context.currentPhaseOutputs.notes.push(`Spawned terrain "${terrainItem.name}" on selected area`);
      }
      return true;
    }

    let dropPos = { x: canvas.stage?.width / 2 || 0, y: canvas.stage?.height / 2 || 0 };
    const token = this._findToken(actor);

    if (placement === "on_self" && token) {
      dropPos = { x: token.x, y: token.y };
    } else if (placement === "on_target" && context.targets?.[0]) {
      const targetToken = context.targets[0];
      dropPos = { x: targetToken.x, y: targetToken.y };
    } else if (placement === "choose" && token) {
      const deedData = { targetType: "blast", targetSize: 1, range: item?.system?.range || 0 };
      const result = await TargetingHelper.placeTemplate(actor, token, deedData);
      if (result && result.squares?.[0]) {
        const sq = result.squares[0];
        dropPos = { x: sq.x * canvas.grid.size, y: sq.y * canvas.grid.size };
      }
    }

    const tileData = {
      texture: { src: terrainItem.img || "icons/svg/item-bag.svg" },
      width: canvas.grid.size,
      height: canvas.grid.size,
      x: dropPos.x,
      y: dropPos.y,
      flags: {
        trespasser: {
          isTerrain: true,
          terrainUuid: terrainItem.uuid,
          terrainName: terrainItem.name,
          sourceItemId: item?.id || null
        }
      }
    };

    const createdTiles = await canvas.scene?.createEmbeddedDocuments("Tile", [tileData]);
    if (createdTiles && createdTiles.length > 0) {
      context.spawnedTerrains.push(createdTiles[0]);
    }

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Spawned terrain "${terrainItem.name}" on canvas`);
    }
    return true;
  }

  /**
   * 5. moveTerrain: Move spawned terrain tiles on canvas
   * @protected
   */
  static async _moveTerrain(behavior, context, item) {
    const params = behavior.params || {};
    const mode = params.terrainSelectMode || "last_spawned";
    const distance = parseInt(params.distance) || 1;

    let targetTiles = [];
    if (mode === "last_spawned") {
      if (context.spawnedTerrains?.length > 0) {
        targetTiles = [context.spawnedTerrains[context.spawnedTerrains.length - 1]];
      }
    } else if (mode === "all_spawned") {
      targetTiles = context.spawnedTerrains || [];
    }

    if (targetTiles.length === 0) return true;

    for (const tileDoc of targetTiles) {
      const gridPx = canvas.grid.size;
      const updates = { _id: tileDoc.id, x: tileDoc.x + (distance * gridPx) };
      await canvas.scene?.updateEmbeddedDocuments("Tile", [updates]);
    }

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Moved ${targetTiles.length} terrain tile(s) by ${distance} sq`);
    }
    return true;
  }

  /**
   * Helper to find a path of grid squares from start position to destination position.
   * Prioritizes remaining within areaSquares if provided.
   * @param {{x: number, y: number}} startPos
   * @param {{x: number, y: number}} destPos
   * @param {Array<{x: number, y: number}>} [areaSquares]
   * @returns {Array<{x: number, y: number}>}
   */
  static _findGridPath(startPos, destPos, areaSquares = []) {
    const gridPx = canvas.grid.size || 100;
    const sqKey = (s) => `${Math.floor(s.x / gridPx)},${Math.floor(s.y / gridPx)}`;
    const startKey = sqKey(startPos);
    const destKey = sqKey(destPos);

    if (startKey === destKey) return [destPos];

    const areaSet = new Set(areaSquares.map(sqKey));
    areaSet.add(startKey);

    const directions = [
      { dx: gridPx, dy: 0 }, { dx: -gridPx, dy: 0 },
      { dx: 0, dy: gridPx }, { dx: 0, dy: -gridPx },
      { dx: gridPx, dy: gridPx }, { dx: -gridPx, dy: gridPx },
      { dx: gridPx, dy: -gridPx }, { dx: -gridPx, dy: -gridPx }
    ];

    const bfs = (restrictToArea) => {
      const queue = [{ pos: startPos, path: [] }];
      const visited = new Set([startKey]);

      while (queue.length > 0) {
        const { pos, path } = queue.shift();
        for (const dir of directions) {
          const next = { x: pos.x + dir.dx, y: pos.y + dir.dy };
          const key = sqKey(next);
          if (visited.has(key)) continue;
          if (restrictToArea && !areaSet.has(key)) continue;

          visited.add(key);
          const newPath = [...path, next];
          if (key === destKey) return newPath;
          queue.push({ pos: next, path: newPath });
        }
      }
      return null;
    };

    // First attempt BFS restricted inside areaSquares
    const areaPath = bfs(true);
    if (areaPath && areaPath.length > 0) return areaPath;

    // Fallback to standard grid BFS
    const fallbackPath = bfs(false);
    return fallbackPath || [destPos];
  }

  /**
   * Move token step-by-step along a path of grid squares, awaiting animation per step.
   * @param {Token} token
   * @param {Array<{x: number, y: number}>} pathSquares
   * @param {boolean} [animate=true]
   */
  static async _animateTokenAlongPath(token, pathSquares, animate = true) {
    if (!token || !pathSquares || pathSquares.length === 0) return;

    if (!animate) {
      const last = pathSquares[pathSquares.length - 1];
      await token.document.update({ x: last.x, y: last.y }, { animate: false });
      return;
    }

    globalThis._trespasserUndoSet ??= new Set();
    globalThis._trespasserUndoSet.add(token.document.id);

    try {
      for (const sq of pathSquares) {
        if (token.document.x === sq.x && token.document.y === sq.y) continue;
        await token.document.update({ x: sq.x, y: sq.y }, { animate: true });

        if (token.animationContexts?.size > 0) {
          const promises = Array.from(token.animationContexts.values()).map(ctx => ctx.promise);
          await Promise.allSettled(promises);
        } else if (token._animation) {
          await token._animation;
        } else {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    } finally {
      globalThis._trespasserUndoSet.delete(token.document.id);
    }
  }

  /**
   * 6. moveSource: Move the executing token
   * @protected
   */
  static async _moveSource(behavior, context, actor) {
    const params = behavior.params || {};
    const destinationMode = params.destinationMode || "distance";
    const movementType = params.movementType || "walk";

    const token = this._findToken(actor);
    if (!token) return true;

    /**
     * Set the token's movementAction to the desired type before moving,
     * then reset to previous/default ("walk") after the move completes.
     * @param {string|null} actionName
     * @param {Function} moveFn - Async function performing the actual position update(s).
     */
    const withMovementAction = async (actionName, moveFn) => {
      const currentAction = token.document.movementAction;
      const shouldChange = Boolean(actionName && currentAction !== actionName);
      if (shouldChange) {
        try {
          await canvas.scene.updateEmbeddedDocuments("Token", [
            { _id: token.document.id, movementAction: actionName }
          ]);
          canvas.tokens.recalculatePlannedMovementPaths();
        } catch (err) {
          console.warn("[BDeedBehaviorHandler] Could not update movementAction:", err);
        }
      }
      try {
        await moveFn();
      } finally {
        if (shouldChange) {
          try {
            await canvas.scene.updateEmbeddedDocuments("Token", [
              { _id: token.document.id, movementAction: currentAction || "walk" }
            ]);
            canvas.tokens.recalculatePlannedMovementPaths();
          } catch (err) {
            // Ignored
          }
        }
      }
    };

    // Map behavior movementType to Foundry's native movementAction names
    const actionName = movementType === "jump" ? "jump"
                     : movementType === "teleport" ? "blink"
                     : movementType === "walk" ? "walk"
                     : movementType;

    if (destinationMode === "selectedArea") {
      const targetArea = this._resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for character movement.");
        return false;
      }

      let destSq = null;

      if (targetArea.isPath === true) {
        destSq = targetArea.squares[targetArea.squares.length - 1];
      } else {
        ui.notifications.info("Choose a square within the selected area for movement destination.");
        const deedData = { targetType: "blast", targetSize: 1, range: 0 };

        while (!destSq) {
          const result = await TargetingHelper.placeTemplate(actor, token, deedData);
          if (!result || !result.squares || result.squares.length === 0) {
            ui.notifications.info("Movement cancelled.");
            return false;
          }

          const pickedSq = result.squares[0];
          const isValid = targetArea.squares.some(s => s.x === pickedSq.x && s.y === pickedSq.y);
          if (isValid) {
            destSq = pickedSq;
          } else {
            ui.notifications.warn("Please select a square inside the highlighted area.");
          }
        }
      }

      const startPos = { x: token.document.x, y: token.document.y };
      const destPos = { x: destSq.x, y: destSq.y };

      let pathSquares = [];
      if (targetArea.isPath === true) {
        const firstSq = targetArea.squares[0];
        const connectPath = this._findGridPath(startPos, firstSq);
        const prefix = (connectPath.length > 0 && connectPath[connectPath.length - 1].x === firstSq.x && connectPath[connectPath.length - 1].y === firstSq.y)
          ? connectPath.slice(0, -1)
          : [];
        pathSquares = [...prefix, ...targetArea.squares];
      } else {
        pathSquares = this._findGridPath(startPos, destPos, targetArea.squares);
      }

      await withMovementAction(actionName, async () => {
        await this._animateTokenAlongPath(token, pathSquares, movementType !== "teleport");
      });
      context.sourcePosition = { x: destPos.x, y: destPos.y };

      if (context.currentPhaseOutputs?.notes) {
        context.currentPhaseOutputs.notes.push(`Moved source (${movementType}) to selected area square`);
      }
      return true;
    }

    // destinationMode === "distance"
    const distance = parseInt(params.distance) || 1;

    // Prompt player to select destination square on canvas
    const { MovementOverlay } = await import("../canvas/movement-overlay.mjs");
    const destPos = await new Promise((resolve) => {
      const onComplete = (targetToken, destination) => {
        Hooks.off("trespasserVaultCancelled", onCancel);
        resolve(destination);
      };
      const onCancel = () => {
        Hooks.off("trespasserVaultComplete", onComplete);
        resolve(null);
      };
      Hooks.once("trespasserVaultComplete", onComplete);
      Hooks.once("trespasserVaultCancelled", onCancel);
      MovementOverlay.activateVaultMode(token, distance, { free: true, phaseAction: true, movementType: movementType });
    });

    if (!destPos) {
      ui.notifications.info("Source movement cancelled.");
      return false; // Cancel execution if player cancels movement
    }

    const startPos = { x: token.document.x, y: token.document.y };
    const pathSquares = this._findGridPath(startPos, destPos);

    await withMovementAction(actionName, async () => {
      await this._animateTokenAlongPath(token, pathSquares, movementType !== "teleport");
    });
    context.sourcePosition = { x: destPos.x, y: destPos.y };

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Moved source (${movementType}, ${distance} sq)`);
    }
    return true;
  }

  /**
   * 7. forceMoveTargets: Apply forced movement to validTargets.
   * Groups targets by their exact layered Impact bonus distance (baseDistance + targetImpactBonus).
   * @protected
   */
  static async _forceMoveTargets(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const type = params.type || "push";
    const baseDistance = parseInt(params.distance) || 1;
    const sourceToken = this._findToken(actor);

    const validTargets = this.getValidTargets(context, phaseKey);
    if (validTargets.length === 0) return true;

    // Group target tokens by their total calculated forced movement distance
    const distanceGroups = new Map();

    for (const targetToken of validTargets) {
      const targetChoices = context.sparkChoices?.perTarget?.get(targetToken.id);
      const targetImpactBonus = (targetChoices?.impact || 0) * 2;
      const dist = baseDistance + targetImpactBonus;

      if (!distanceGroups.has(dist)) distanceGroups.set(dist, []);
      distanceGroups.get(dist).push(targetToken);
    }

    for (const [dist, groupTargets] of distanceGroups.entries()) {
      await ForcedMovementHelper.executeForcedMovement(sourceToken, groupTargets, type, dist);
    }

    if (context.currentPhaseOutputs?.notes) {
      const summaries = [];
      for (const [dist, groupTargets] of distanceGroups.entries()) {
        summaries.push(`${groupTargets.length} target(s) moved ${dist} sq`);
      }
      context.currentPhaseOutputs.notes.push(
        `Forced movement (${type}): ${summaries.join("; ")}`
      );
    }
    return true;
  }

  /**
   * 8. clearTargets: Reset context.targets and canvas token targets
   * @protected
   */
  static async _clearTargets(context) {
    context.targets = [];
    if (game.user?.targets?.size > 0) {
      await game.user.updateTokenTargets([]);
    }
    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push("Cleared target list");
    }
    return true;
  }

  /**
   * 9. executeDeed: Execute another auxiliary deed document as a sub-routine.
   * Runs as a free sub-action (0 AP, 0 Focus, 0 Uses deduction) and presents its own phase chat cards.
   * Safeguarded against circular/recursive calls.
   * Clears canvas targets before and after execution so sub-deeds retain independent targets.
   * @protected
   */
  static async _executeDeed(behavior, context, actor) {
    const params = behavior.params || {};
    const deedUuid = params.deedUuid;
    if (!deedUuid) {
      ui.notifications.warn("No auxiliary Deed linked for executeDeed behavior.");
      return true;
    }

    let subDeedItem = await fromUuid(deedUuid);
    if (!subDeedItem && actor) {
      subDeedItem = actor.items?.get(deedUuid) || actor.items?.find(i => i.uuid === deedUuid || i.id === deedUuid);
    }

    if (!subDeedItem) {
      ui.notifications.warn(`Could not find linked Deed item (${deedUuid}).`);
      return true;
    }

    // Safeguard against circular calls / stack overflow
    const callStack = context.callStack || new Set();
    if (callStack.has(subDeedItem.id) || callStack.size >= 10) {
      ui.notifications.warn(`Circular deed execution detected: "${subDeedItem.name}" is already in the call stack.`);
      return true;
    }

    callStack.add(subDeedItem.id);

    // Clear canvas targets so sub-deed starts with clean target selection
    if (game.user?.targets?.size > 0) {
      await game.user.updateTokenTargets([]);
    }

    try {
      const { BDeedExecutor } = await import("./bdeed-executor.mjs");
      const subExecutor = new BDeedExecutor(subDeedItem, actor, {
        isSubDeed: true,
        callStack,
        sourcePosition: context.sourcePosition || null
      });
      await subExecutor.execute();
    } catch (err) {
      console.error("[BDeedBehaviorHandler] Error executing sub-deed:", err);
    } finally {
      callStack.delete(subDeedItem.id);
      if (game.user?.targets?.size > 0) {
        await game.user.updateTokenTargets([]);
      }
    }

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Executed auxiliary deed "${subDeedItem.name}"`);
    }

    return true;
  }
}
