/**
 * Compatibility helpers for supporting Foundry v13 and v14 with one
 * codebase. Delete this module (and inline the v14 paths) once v13
 * support is dropped.
 */

/** Whether the running Foundry core is generation 14 or later. */
export function isAtLeastV14() {
  return (game.release?.generation ?? 14) >= 14;
}

/**
 * Message-creation options controlling who sees a roll message.
 * v14 replaced the rollMode option with messageMode (new string values,
 * old option removed in v16); v13 only understands rollMode.
 * @param {"public"|"gm"|"blind"|"self"} mode
 * @returns {object} Options for Roll#toMessage or RollTable#draw.
 */
export function messageVisibility(mode) {
  if (isAtLeastV14()) return { messageMode: mode };
  return { rollMode: mode === "gm" ? "gmroll" : (mode === "blind" ? "blindroll" : (mode === "self" ? "selfroll" : "publicroll")) };
}

/**
 * Get current messageMode / rollMode options from user settings or parameter.
 * @param {string} [rawMode]
 * @returns {object} Options for Roll#toMessage
 */
export function getRollMessageMode(rawMode) {
  if (isAtLeastV14()) {
    const mode = rawMode || game.settings.get("core", "messageMode") || "public";
    let cleanMode = mode.replace(/roll$/, "");
    if (cleanMode === "" || cleanMode === "roll") cleanMode = "public";
    return { messageMode: cleanMode };
  }
  const mode = rawMode || game.settings.get("core", "rollMode") || "publicroll";
  return { rollMode: mode };
}
