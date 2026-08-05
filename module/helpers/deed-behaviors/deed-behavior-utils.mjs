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
}
