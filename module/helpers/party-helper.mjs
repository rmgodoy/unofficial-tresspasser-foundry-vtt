/**
 * Helper class for Party-related logic.
 */
export class TrespasserPartyHelper {
  
  /**
   * Get the active Party actor for the world.
   * If an active party is set in settings and exists, returns it.
   * Otherwise, falls back to the first party it finds.
   * @returns {Actor|null}
   */
  static getActiveParty() {
    const activeId = game.settings.get("trespasser", "activePartyId");
    
    if (activeId) {
      const party = game.actors.get(activeId);
      if (party && party.type === "party") {
        return party;
      }
    }

    // Fallback: Just get the first party found
    return game.actors.find(a => a.type === "party") || null;
  }

  /**
   * Sets the given party actor as the active one.
   * @param {string} actorId 
   */
  static async setActiveParty(actorId) {
    if (!game.user.isGM) return;
    const actor = game.actors.get(actorId);
    if (!actor || actor.type !== "party") return;
    
    await game.settings.set("trespasser", "activePartyId", actorId);
  }
}
