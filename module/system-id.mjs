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
 * Works on both Document instances (with .getFlag()) and plain data objects (with .flags).
 * @param {object} doc
 * @param {string} key
 * @returns {*}
 */
export function getSystemFlag(doc, key) {
  if (!doc) return undefined;
  const activeId = getSystemId();
  if (typeof doc.getFlag === "function") {
    try {
      const val = doc.getFlag(activeId, key);
      if (val !== undefined) return val;
    } catch {}
  }
  const flags = doc.flags?.[activeId] || (activeId !== "trespasser" ? doc.flags?.trespasser : undefined) || doc.flags?.trespasser;
  return flags?.[key];
}

/**
 * Returns all system flags object with dual-scope fallback.
 * @param {object} doc
 * @returns {object}
 */
export function getSystemFlags(doc) {
  if (!doc) return {};
  const activeId = getSystemId();
  if (typeof doc.getFlag === "function") {
    try {
      const val = doc.getFlag(activeId);
      if (val && typeof val === "object") return val;
    } catch {}
  }
  return doc.flags?.[activeId] || (activeId !== "trespasser" ? doc.flags?.trespasser : null) || doc.flags?.trespasser || {};
}

/**
 * Sets a system flag using the active system ID.
 * Works on Document instances and plain objects.
 * @param {object} doc
 * @param {string} key
 * @param {*} value
 * @returns {Promise<*>}
 */
export async function setSystemFlag(doc, key, value) {
  if (!doc) return;
  const activeId = getSystemId();
  if (typeof doc.setFlag === "function") {
    return doc.setFlag(activeId, key, value);
  }
  doc.flags = doc.flags || {};
  doc.flags[activeId] = doc.flags[activeId] || {};
  doc.flags[activeId][key] = value;
}

/**
 * Unsets a system flag using the active system ID.
 * Works on Document instances and plain objects.
 * @param {object} doc
 * @param {string} key
 * @returns {Promise<*>}
 */
export async function unsetSystemFlag(doc, key) {
  if (!doc) return;
  const activeId = getSystemId();
  if (typeof doc.unsetFlag === "function") {
    try {
      await doc.unsetFlag(activeId, key);
    } catch {}
    if (activeId !== "trespasser" && doc.flags?.trespasser?.[key] !== undefined) {
      if (typeof doc.update === "function") {
        try {
          await doc.update({ [`flags.trespasser.-=${key}`]: null });
        } catch {}
      } else if (doc.flags?.trespasser) {
        delete doc.flags.trespasser[key];
      }
    }
    return;
  }
  if (doc.flags?.[activeId]) delete doc.flags[activeId][key];
  if (doc.flags?.trespasser) delete doc.flags.trespasser[key];
}

