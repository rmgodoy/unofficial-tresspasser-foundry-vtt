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
