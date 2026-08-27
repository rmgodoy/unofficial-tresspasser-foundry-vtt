import { TrespasserEffectsHelper } from "../effects-helper.mjs";

/**
 * DeedBehaviorUtils — Shared helper utilities used across deed behavior implementations.
 */
export class DeedBehaviorUtils {

  /**
   * Helper to resolve the targeted area from runtime context.
   * Checks for specific areaBehaviorId match, falling back to context.area (latest).
   * @param {object} context
   * @param {object} [params]
   * @returns {object|null}
   */
  static resolveArea(context, params = {}) {
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

    const layerName = "deedSelectArea";
    if (canvas.grid?.addHighlightLayer && canvas.grid?.highlightPosition) {
      try {
        canvas.grid.addHighlightLayer(layerName);
        for (const sq of context.area.squares) {
          canvas.grid.highlightPosition(layerName, { x: sq.x, y: sq.y, color: 0x3399ff, border: 0x0066cc });
        }
      } catch (err) {
        console.warn("[DeedBehaviorUtils] Could not draw area highlight:", err);
      }
    }
  }

  /**
   * Clear canvas grid highlights for selected area.
   * @param {object} context
   */
  static clearAreaHighlight(context) {
    const layerName = "deedSelectArea";
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
   * @param {Actor} actor
   * @returns {Token|null}
   */
  static findToken(actor) {
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

      const accuracyMap = new Map();
      for (const r of context.accuracyResults) {
        if (r.tokenId) accuracyMap.set(r.tokenId, r);
      }

      validTargets = validTargets.filter(t => {
        const id = t.id || t.document?.id;
        const res = accuracyMap.get(id);
        // If target was evaluated in accuracy results, enforce hit & spark rules
        if (res) {
          if (!res.isHit) return false;
          if (isSparkPhase && res.sparks < requiredSparks) return false;
          return true;
        }
        // If target was NOT evaluated in accuracy results (e.g. selected by subsequent selectTarget or non-attack behavior), keep it
        return true;
      });
    }
    return validTargets;
  }

  /**
   * Helper to replace <sd> (Skill Die), <wd> (Weapon Die), and <sb> (Skill Bonus) placeholders in roll formulas.
   * @param {string} expr - e.g. "2d6 + 1<sd> + <wd>"
   * @param {Actor} [actor]
   * @returns {string}
   */
  static resolveFormulaPlaceholders(expr, actor) {
    if (!expr) return "";

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

    return TrespasserEffectsHelper.replacePlaceholders(expr, actor, weaponDie);
  }

  /**
   * Evaluates a roll expression, either standalone or referencing an earlier evaluated roll.
   * If refRoll is provided, applies mathematical operations (e.g. "/ 2", "* 2", "- 5", "+ 3"),
   * new dice expressions (e.g. "1d6", "<sd>"), or explicit reference formulas (e.g. "@roll / 2 + 1d6").
   *
   * @param {object} options
   * @param {string} [options.expression] - The formula or modifier expression
   * @param {Roll} [options.refRoll] - The referenced evaluated Roll instance, if any
   * @param {Actor} [options.actor] - Source actor for resolving placeholders and rollData
   * @param {object} [options.rollData] - Additional roll data
   * @param {string} [options.fallbackLabel] - Localized label fallback if expression is empty
   * @returns {Promise<{ roll: Roll|null, total: number, rollLabel: string }>}
   */
  static async evaluateRollExpression({ expression = "", refRoll = null, actor = null, rollData = null, fallbackLabel = "" } = {}) {
    const rawExpr = (expression || "").trim();
    const data = { ...(actor?.getRollData() || {}), ...(rollData || {}) };

    // Case 1: Referenced Roll exists
    if (refRoll) {
      if (!rawExpr) {
        const label = fallbackLabel || game.i18n.localize("TRESPASSER.Sheet.Deed.Params.ReferencedRoll") || "Referenced Roll";
        return {
          roll: refRoll,
          total: Math.max(0, Math.floor(refRoll.total)),
          rollLabel: `${refRoll.total} (${label})`
        };
      }

      const modExpr = this.resolveFormulaPlaceholders(rawExpr, actor).trim();
      if (!modExpr) {
        const label = fallbackLabel || game.i18n.localize("TRESPASSER.Sheet.Deed.Params.ReferencedRoll") || "Referenced Roll";
        return {
          roll: refRoll,
          total: Math.max(0, Math.floor(refRoll.total)),
          rollLabel: `${refRoll.total} (${label})`
        };
      }

      // Check if expression references roll explicitly
      let processedExpr = modExpr
        .replace(/(?<![@$.\w])(?:ref|roll)(?![(\w])/gi, "@roll")
        .replace(/@ref|\$roll/gi, "@roll");

      let finalFormula = "";
      let rollLabel = "";

      const hasExplicitRef = /@roll/i.test(processedExpr);
      if (hasExplicitRef) {
        finalFormula = processedExpr;
        rollLabel = `${modExpr.replace(/@roll|@ref|\$roll/gi, refRoll.total)}`;
      } else {
        const startsWithOp = /^[\/*+-]/.test(processedExpr);
        if (startsWithOp) {
          finalFormula = `@roll ${processedExpr}`;
          rollLabel = `${refRoll.total} ${modExpr}`;
        } else {
          finalFormula = `@roll + ${processedExpr}`;
          rollLabel = `${refRoll.total} + ${modExpr}`;
        }
      }

      const evalData = { ...data, roll: refRoll.total, ref: refRoll.total };
      const roll = new Roll(finalFormula, evalData);
      await roll.evaluate();

      const total = Math.max(0, Math.floor(roll.total));
      rollLabel = `${rollLabel} = ${total}`;

      return {
        roll,
        total,
        rollLabel
      };
    }

    // Case 2: Standalone Roll (no reference)
    if (!rawExpr) {
      return { roll: null, total: 0, rollLabel: "" };
    }

    const expr = this.resolveFormulaPlaceholders(rawExpr, actor);
    const roll = new Roll(expr, data);
    await roll.evaluate();

    const total = Math.max(0, Math.floor(roll.total));
    return {
      roll,
      total,
      rollLabel: expr
    };
  }
}

