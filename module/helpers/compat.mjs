/**
 * Compatibility helpers for supporting Foundry v13 and v14 with one
 * codebase. Delete this module (and inline the v14 paths) once v13
 * support is dropped.
 */

/** Whether the running Foundry core is generation 14 or later. */
export function isAtLeastV14() {
  return game.release.generation >= 14;
}

/**
 * Message-creation options controlling who sees a roll message.
 * v14 replaced the rollMode option with messageMode (new string values,
 * old option removed in v16); v13 only understands rollMode.
 * @param {"public"|"gm"} mode
 * @returns {object} Options for Roll#toMessage or RollTable#draw.
 */
export function messageVisibility(mode) {
  if (isAtLeastV14()) return { messageMode: mode };
  return { rollMode: mode === "gm" ? "gmroll" : "publicroll" };
}
