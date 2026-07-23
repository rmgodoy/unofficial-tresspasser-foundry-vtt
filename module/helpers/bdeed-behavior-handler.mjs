import { TargetingHelper } from "./targeting-helper.mjs";
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TerrainHelper } from "./terrain-helper.mjs";
import { ForcedMovementHelper } from "./forced-movement-helper.mjs";

/**
 * BDeedBehaviorHandler — Dispatcher executing actual game logic for all 9 behavior types.
 */
export class BDeedBehaviorHandler {

  /**
   * Dispatch a single behavior.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - BDeed item
   */
  static async dispatch(behavior, context, actor, item) {
    switch (behavior.type) {
      case "selectTarget":     return this._selectTarget(behavior, context, actor, item);
      case "applyDamage":      return this._applyDamage(behavior, context, actor);
      case "applyEffects":     return this._applyEffects(behavior, context, actor);
      case "modifyBehavior":   return; // Handled pre-pipeline by BDeedExecutor
      case "spawnTerrain":     return this._spawnTerrain(behavior, context, actor, item);
      case "moveTerrain":      return this._moveTerrain(behavior, context, item);
      case "moveSource":       return this._moveSource(behavior, context, actor);
      case "forceMoveTargets": return this._forceMoveTargets(behavior, context, actor);
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
   * 2. applyDamage: Evaluates expression as a roll formula, applies damage to hit target actors, and triggers token shake & floating damage text
   * @protected
   */
  static async _applyDamage(behavior, context, actor) {
    const params = behavior.params || {};
    let rawExpr = params.expression?.trim();
    if (!rawExpr) return true;

    // Filter target tokens: if accuracy check ran, ONLY hit targets receive damage
    let validTargets = context.targets || [];
    if (context.accuracyResults && context.accuracyResults.length > 0) {
      const hitTokenIds = new Set(
        context.accuracyResults.filter(r => r.isHit && r.tokenId).map(r => r.tokenId)
      );
      validTargets = validTargets.filter(t => hitTokenIds.has(t.id));
    }

    // If no targets were hit, do not perform damage roll or damage updates
    if (validTargets.length === 0 && context.accuracyResults && context.accuracyResults.length > 0) {
      return true;
    }

    // Resolve <sd> (Skill Die) and <wd> (Weapon Die) placeholders
    let expr = this.resolveFormulaPlaceholders(rawExpr, actor);

    // Apply Power spark bonus dice if selected
    const powerBonusDice = context.sparkChoices?.powerBonusDice || 0;
    if (powerBonusDice > 0) {
      const skillDie = actor?.system?.skill_die || "d6";
      expr = `${expr} + ${powerBonusDice}${skillDie}`;
    }

    const rollData = actor?.getRollData() || {};
    const roll = new Roll(expr, rollData);
    await roll.evaluate();

    const damageTotal = roll.total;

    for (const targetToken of validTargets) {
      const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;
      await targetActor.applyDamage(damageTotal);
    }

    const rollHtml = await roll.render();

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    context.currentPhaseOutputs.rolls.push(roll);
    context.currentPhaseOutputs.rollEntries.push(`
      <div class="damage-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: 12px; font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.localize("TRESPASSER.Sheet.Common.Damage") || "Damage"}: ${expr}${powerBonusDice > 0 ? " (Power Spark)" : ""}
        </h4>
        ${rollHtml}
      </div>
    `);

    return true;
  }

  /**
   * 3. applyEffects: Applies specified effects to context.targets (incorporating Potency spark bonus) and appends notes to current phase
   * @protected
   */
  static async _applyEffects(behavior, context, actor) {
    const params = behavior.params || {};
    const effects = params.effects || [];
    const potencyBonus = context.sparkChoices?.potencyBonus || 0;

    let validTargets = context.targets || [];
    if (context.accuracyResults && context.accuracyResults.length > 0) {
      const hitTokenIds = new Set(
        context.accuracyResults.filter(r => r.isHit && r.tokenId).map(r => r.tokenId)
      );
      validTargets = validTargets.filter(t => hitTokenIds.has(t.id));
    }

    if (validTargets.length === 0 && context.accuracyResults && context.accuracyResults.length > 0) {
      return true;
    }

    for (const eff of effects) {
      if (!eff.uuid) continue;
      const effectItem = await fromUuid(eff.uuid);
      if (!effectItem) continue;

      for (const targetToken of validTargets) {
        const targetActor = targetToken.actor || (targetToken instanceof Actor ? targetToken : null);
        if (!targetActor) continue;

        const itemData = effectItem.toObject();
        itemData.system = itemData.system || {};
        const baseIntensity = eff.intensity || 1;
        itemData.system.intensity = baseIntensity + potencyBonus;

        await targetActor.createEmbeddedDocuments("Item", [itemData]);
        if (context.currentPhaseOutputs?.notes) {
          context.currentPhaseOutputs.notes.push(`Applied effect "${effectItem.name}" (Intensity ${itemData.system.intensity}) to ${targetActor.name}`);
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
    } else if (placement === "on_target" && context.targets?.length > 0) {
      const firstTarget = context.targets[0];
      dropPos = { x: firstTarget.x ?? firstTarget.center?.x ?? 0, y: firstTarget.y ?? firstTarget.center?.y ?? 0 };
    }

    const createdDocs = await TerrainHelper.placeTerrainOnCanvas(terrainItem, dropPos, {
      flags: {
        trespasser: {
          spawnedByBDeedId: item.id,
          behaviorId: behavior.id
        }
      }
    });

    if (createdDocs) {
      context.spawnedTerrains.push({
        behaviorId: behavior.id,
        docs: createdDocs
      });
      if (context.currentPhaseOutputs?.notes) {
        context.currentPhaseOutputs.notes.push(`Spawned terrain "${terrainItem.name}"`);
      }
    }
    return true;
  }

  /**
   * 5. moveTerrain: Relocates terrain created by a previous spawnTerrain behavior
   * @protected
   */
  static async _moveTerrain(behavior, context, item) {
    const params = behavior.params || {};
    const targetBehaviorId = params.terrainBehaviorId;

    const regions = Array.from(canvas.regions?.placeables ?? []).filter(r =>
      r.document?.flags?.trespasser?.spawnedByBDeedId === item.id &&
      (!targetBehaviorId || r.document?.flags?.trespasser?.behaviorId === targetBehaviorId)
    );

    if (regions.length === 0) {
      ui.notifications.warn("No matching spawned terrain found on canvas to move.");
      return true;
    }

    const selectedRegion = regions[0];
    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Moved terrain "${selectedRegion.name || 'Terrain'}"`);
    }
    return true;
  }

  /**
   * 6. moveSource: Move the source actor token
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
   * 7. forceMoveTargets: Apply forced movement to context.targets (incorporating Impact spark bonus distance)
   * @protected
   */
  static async _forceMoveTargets(behavior, context, actor) {
    const params = behavior.params || {};
    const type = params.type || "push";
    const baseDistance = parseInt(params.distance) || 1;
    const impactBonus = context.sparkChoices?.impactBonus || 0;
    const totalDistance = baseDistance + impactBonus;

    const sourceToken = this._findToken(actor);

    let validTargets = context.targets || [];
    if (context.accuracyResults && context.accuracyResults.length > 0) {
      const hitTokenIds = new Set(
        context.accuracyResults.filter(r => r.isHit && r.tokenId).map(r => r.tokenId)
      );
      validTargets = validTargets.filter(t => hitTokenIds.has(t.id));
    }

    if (validTargets.length === 0) {
      return true;
    }

    await ForcedMovementHelper.executeForcedMovement(sourceToken, validTargets, type, totalDistance);
    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Forced movement (${type} ${totalDistance} sq${impactBonus > 0 ? ` [includes +${impactBonus} Impact]` : ''}) applied to target(s)`);
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
