/**
 * Companion Formula Evaluator
 * Parses GM-defined equations for companion attributes.
 */

/**
 * Build a variables map from a companion actor and its bound character.
 * @param {Actor} companionActor - The companion actor document
 * @param {Actor|null} boundCharacter - The bound character actor document (may be null)
 * @returns {Object} Map of variable names to numeric values
 * 
 * IMPORTANT: When boundCharacter is null (unbound companion), all c.* variables
 * resolve to 0. This is intentional — companions must work fully unbound.
 */
export function buildFormulaContext(companionActor, boundCharacter) {
  const cs = companionActor?.system ?? {};
  const bs = boundCharacter?.system;
  return {
    "lvl":         cs.level ?? 0,
    "c.lvl":       bs?.level ?? 0,
    "c.skill":     bs?.skill ?? 0,
    "c.mighty":    bs?.attributes?.mighty ?? 0,
    "c.agility":   bs?.attributes?.agility ?? 0,
    "c.intellect": bs?.attributes?.intellect ?? 0,
    "c.spirit":    bs?.attributes?.spirit ?? 0,
  };
}

/**
 * Evaluate a formula string with the given variable context.
 * @param {string} formula - e.g. "20+5*(<lvl>)" or "4+<c.skill>"
 * @param {Object} context - Map of variable names to values from buildFormulaContext()
 * @returns {number} The evaluated result, or 0 if the formula is invalid/empty
 */
export function evaluateFormula(formula, context = {}) {
  if (!formula || typeof formula !== "string") return 0;

  // Replace all <variable> placeholders with their numeric values
  let expression = formula;
  for (const [key, value] of Object.entries(context)) {
    const regex = new RegExp(`<${key.replace(".", "\\.")}>`, "g");
    expression = expression.replace(regex, String(value));
  }

  // Strip any remaining angle-bracket tokens (safety fallback)
  expression = expression.replace(/<[^>]*>/g, "0");

  // Only allow safe characters: digits, operators, parentheses, spaces, decimals
  if (!/^[\d\s+\-*/().]+$/.test(expression)) return 0;

  try {
    const fn = new Function(`"use strict"; return (${expression});`);
    const result = fn();
    return typeof result === "number" && isFinite(result) ? Math.floor(result) : 0;
  } catch {
    return 0;
  }
}
