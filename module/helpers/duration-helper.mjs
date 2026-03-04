/**
 * Helper for compound effect duration evaluation and decrement.
 *
 * Effects may define an array of `durationConditions` (each with a `mode` and
 * optional `value`) combined by a `durationOperator` of "OR" or "AND":
 *
 *   OR  — the effect expires when ANY condition is satisfied.
 *   AND — the effect expires only when ALL conditions are satisfied.
 *
 * Supported modes:
 *   "indefinite" — never expires automatically.
 *   "combat"     — expires when there is no active combat.
 *   "rounds"     — expires when condition.value reaches 0.
 *   "triggers"   — expires when condition.value reaches 0.
 */
export class DurationHelper {
  /**
   * Returns the normalised conditions array for an item, falling back to the
   * legacy flat `duration` / `durationValue` fields for backward compatibility.
   *
   * @param {Item} item
   * @returns {Array<{mode: string, value: number}>}
   */
  static getConditions(item) {
    const sys = item.system;
    const conditions = sys.durationConditions;

    // New-style: array is present and has entries → use it directly.
    if (Array.isArray(conditions) && conditions.length > 0) return conditions;

    // Legacy fallback: construct a single-element array from the old fields.
    const legacyMode = sys.duration ?? "indefinite";
    return [{ mode: legacyMode, value: sys.durationValue ?? 0 }];
  }

  /**
   * Evaluates whether an effect should expire right now.
   *
   * @param {Item} item - The effect/state item.
   * @returns {boolean} `true` if the effect should be deleted.
   */
  static shouldExpire(item) {
    const conditions = this.getConditions(item);
    const operator   = item.system.durationOperator ?? "OR";

    if (!conditions.length) return false;

    const results = conditions.map(c => this._isConditionMet(c));

    return operator === "AND"
      ? results.every(r => r)
      : results.some(r => r);
  }

  /**
   * Decrements all conditions of a given event-type ("rounds" or "triggers")
   * and returns the updated conditions array.  The caller is responsible for
   * persisting the change via `item.update()`.
   *
   * @param {Item}   item  - The effect/state item.
   * @param {string} event - "rounds" or "triggers"
   * @returns {Array<{mode: string, value: number}>} The updated conditions array.
   */
  static decrementConditions(item, event) {
    const conditions = this.getConditions(item);
    return conditions.map(c => {
      if (c.mode !== event) return c;
      return { ...c, value: Math.max(0, (c.value ?? 0) - 1) };
    });
  }

  /**
   * Convenience: decrement and then immediately evaluate expiry.
   * Returns { shouldExpire, updatedConditions }.
   *
   * @param {Item}   item
   * @param {string} event  "rounds" | "triggers"
   * @returns {{ shouldExpire: boolean, updatedConditions: Array }}
   */
  static processEvent(item, event) {
    const updatedConditions = this.decrementConditions(item, event);
    const operator          = item.system.durationOperator ?? "OR";

    const results = updatedConditions.map(c => this._isConditionMet(c));
    const expire  = operator === "AND"
      ? results.every(r => r)
      : results.some(r => r);

    return { shouldExpire: expire, updatedConditions };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * @param {{ mode: string, value: number }} condition
   * @returns {boolean}
   */
  static _isConditionMet(condition) {
    switch (condition.mode) {
      case "indefinite": return false;
      case "combat":     return !game.combat;
      case "rounds":
      case "triggers":   return (condition.value ?? 0) <= 0;
      default:           return false;
    }
  }

  /**
   * Builds a human-readable summary of the conditions, e.g.
   *   "3 Rounds OR 1 Trigger" / "2 Rounds AND 1 Trigger" / "Whole Combat"
   *
   * @param {Item} item
   * @returns {string}
   */
  static formatSummary(item) {
    const conditions = this.getConditions(item);
    const operator   = item.system.durationOperator ?? "OR";

    const parts = conditions.map(c => {
      switch (c.mode) {
        case "indefinite": return game.i18n.localize("TRESPASSER.DurationLabels.Indefinite");
        case "combat":     return game.i18n.localize("TRESPASSER.DurationLabels.Combat");
        case "rounds":     return `${c.value ?? 0} ${game.i18n.localize("TRESPASSER.DurationLabels.Rounds")}`;
        case "triggers":   return `${c.value ?? 0} ${game.i18n.localize("TRESPASSER.DurationLabels.Triggers")}`;
        default:           return c.mode;
      }
    });

    if (parts.length === 1) return parts[0];

    const opLabel = operator === "AND"
      ? game.i18n.localize("TRESPASSER.DurationLabels.AND")
      : game.i18n.localize("TRESPASSER.DurationLabels.OR");

    return parts.join(` ${opLabel} `);
  }
}
