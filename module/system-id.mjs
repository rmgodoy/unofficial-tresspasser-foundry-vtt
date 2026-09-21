/**
 * Canonical system identifier used for flag scopes, settings namespaces,
 * sheet registrations, socket events, and compendium lookups.
 *
 * In a beta release build, this value is updated by the release workflow
 * to match system.json ("trespasser-beta").
 */
export const SYSTEM_ID = "trespasser";

/**
 * Returns the active system identifier.
 * Prioritizes runtime `game.system.id` when Foundry is initialized,
 * falling back to the static `SYSTEM_ID` constant.
 * @returns {string}
 */
export function getSystemId() {
  return globalThis.game?.system?.id || SYSTEM_ID;
}

/**
 * Reads a system flag with dual-scope fallback ("trespasser" fallback if SYSTEM_ID is "trespasser-beta").
 * @param {object} doc
 * @param {string} key
 * @returns {*}
 */
export function getSystemFlag(doc, key) {
  if (!doc?.getFlag) return undefined;
  const activeId = getSystemId();
  const val = doc.getFlag(activeId, key);
  if (val !== undefined) return val;
  if (activeId !== "trespasser") {
    return doc.getFlag("trespasser", key);
  }
  return undefined;
}

/**
 * Sets a system flag using the active system ID.
 * @param {object} doc
 * @param {string} key
 * @param {*} value
 * @returns {Promise<*>}
 */
export async function setSystemFlag(doc, key, value) {
  if (!doc?.setFlag) return;
  return doc.setFlag(getSystemId(), key, value);
}

/**
 * Unsets a system flag using the active system ID.
 * @param {object} doc
 * @param {string} key
 * @returns {Promise<*>}
 */
export async function unsetSystemFlag(doc, key) {
  if (!doc?.unsetFlag) return;
  const activeId = getSystemId();
  await doc.unsetFlag(activeId, key);
  if (activeId !== "trespasser") {
    await doc.unsetFlag("trespasser", key);
  }
}
