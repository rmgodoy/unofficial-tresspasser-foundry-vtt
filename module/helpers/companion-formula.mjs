/**
 * Companion Formula Evaluator
 * Parses GM-defined equations for companion attributes, level, and damage die.
 */

/**
 * Build a variables map from a companion actor and its bound character.
 * @param {Actor} companionActor - The companion actor document
 * @param {Actor|null} boundCharacter - The bound character actor document (may be null)
 * @returns {Object} Map of variable names to numeric/string values
 * 
 * IMPORTANT: When boundCharacter is null (unbound companion), all c.* variables
 * resolve to default values (0 or "d6"). Companions must work fully unbound.
 */
export function buildFormulaContext(companionActor, boundCharacter) {
  const cs = companionActor?.system ?? {};
  const bs = boundCharacter?.system;
  const cLevel = bs?.level ?? 0;
  const myLevel = cs.level ?? 0;
  return {
    "lvl":         myLevel,
    "level":       myLevel,
    "c.lvl":       cLevel,
    "c.level":     cLevel,
    "c.skill":     bs?.skill ?? 0,
    "c.skill_die": bs?.skill_die ?? "d6",
    "c.mighty":    bs?.attributes?.mighty ?? 0,
    "c.agility":   bs?.attributes?.agility ?? 0,
    "c.intellect": bs?.attributes?.intellect ?? 0,
    "c.spirit":    bs?.attributes?.spirit ?? 0,
  };
}

/**
 * Synchronize all companion actors bound to a given character actor.
 * Re-runs data preparation and triggers a sheet re-render for open companion sheets.
 * @param {Actor} characterActor
 */
export function syncBoundCompanions(characterActor) {
  if (!characterActor || characterActor.type !== "character") return;

  // 1. World companions
  const worldCompanions = game.actors?.filter(a => a.type === "companion" && a.system.boundCharacterId === characterActor.id) ?? [];
  for (const comp of worldCompanions) {
    comp.prepareData();
    comp.sheet?.render(false);
  }

  // 2. Active scene token companions
  if (canvas?.ready && canvas.tokens?.placeables) {
    for (const token of canvas.tokens.placeables) {
      const tokenActor = token.actor;
      if (tokenActor && tokenActor.type === "companion" && tokenActor.system.boundCharacterId === characterActor.id) {
        tokenActor.prepareData();
        tokenActor.sheet?.render(false);
      }
    }
  }
}

/**
 * Evaluate a numeric formula string with the given variable context.
 * @param {string} formula - e.g. "20+5*(<lvl>)" or "4+<c.skill>" or "<c.lvl>"
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

/**
 * Evaluate a die formula string with the given variable context.
 * Supports static dice ("d6", "1d8"), variable placeholders ("<c.skill_die>", "<lvl>d6"), etc.
 * @param {string} formula - e.g. "<c.skill_die>", "d6", "<lvl>d6"
 * @param {Object} context - Map of variable names to values
 * @returns {string} Evaluated die formula e.g. "d6", "1d8", "2d6"
 */
export function evaluateDieFormula(formula, context = {}) {
  if (!formula || typeof formula !== "string") return "d6";

  let expression = formula.trim();

  // Replace all <variable> placeholders
  for (const [key, value] of Object.entries(context)) {
    const regex = new RegExp(`<${key.replace(".", "\\.")}>`, "g");
    expression = expression.replace(regex, String(value));
  }

  // Strip any remaining angle-bracket tokens
  expression = expression.replace(/<[^>]*>/g, "").trim();

  if (!expression) return "d6";

  // If purely a number like "6" or "8", format as "d6" or "d8"
  if (/^\d+$/.test(expression)) {
    return `d${expression}`;
  }

  return expression;
}
