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
      case "applyDamage":      return this._applyDamage(behavior, context, actor, item, phaseKey);
      case "applyEffects":     return this._applyEffects(behavior, context, actor, item, phaseKey);
      case "modifyBehavior":   return; // Handled pre-pipeline by BDeedExecutor
      case "spawnTerrain":     return this._spawnTerrain(behavior, context, actor, item);
      case "moveTerrain":      return this._moveTerrain(behavior, context, item);
      case "moveSource":       return this._moveSource(behavior, context, actor);
      case "forceMoveTargets": return this._forceMoveTargets(behavior, context, actor, item, phaseKey);
      case "clearTargets":     return this._clearTargets(context);
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

      const result = await TargetingHelper.placeTemplate(actor, token, deedData);
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
  }

  /**
   * 2. applyDamage: Evaluates expression as a roll formula, applies damage to hit target actors, and triggers token shake & floating damage text.
   * Layered Power spark bonus damage dice apply ONLY to targets whose spark count reached the layer where Power was selected.
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

    // 3. Roll power bonus dice if maxPowerDice > 0
    const powerDiceRolls = [0];
    const skillDie = actor?.system?.skill_die || "d6";
    let combinedRoll = baseRoll;

    if (maxPowerDice > 0) {
      const powerFormula = `${maxPowerDice}${skillDie}`;
      const powerRoll = new Roll(powerFormula, rollData);
      await powerRoll.evaluate();
      combinedRoll = new Roll(`${expr} + ${powerFormula}`, rollData);
      await combinedRoll.evaluate();

      const dieResults = powerRoll.dice[0]?.results?.map(r => r.result) || [];
      for (let k = 1; k <= maxPowerDice; k++) {
        powerDiceRolls[k] = dieResults.slice(0, k).reduce((a, b) => a + b, 0);
      }
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

      const powerBonusLabel = targetPowerCount > 0 ? ` <span style="font-size:10px; color:#e8c96b;">(+${targetPowerDmg} Power)</span>` : "";
      targetDamageLines.push(`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-top:4px; padding-top:3px; border-top:1px dotted var(--trp-border-light, #5c4f3a);">
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
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: 12px; font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
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
   * 6. moveSource: Move the executing token
   * @protected
   */
  static async _moveSource(behavior, context, actor) {
    const params = behavior.params || {};
    const movementType = params.movementType || "walk";
    const distance = parseInt(params.distance) || 1;

    const token = this._findToken(actor);
    if (!token) return true;

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Move source (${movementType}, ${distance} sq)`);
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
   * 8. clearTargets: Reset context.targets
   * @protected
   */
  static async _clearTargets(context) {
    context.targets = [];
    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push("Cleared target list");
    }
    return true;
  }
}
