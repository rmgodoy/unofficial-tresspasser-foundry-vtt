/**
 * deed-socket-summon.mjs
 * GM-side handler for spawning summoned creature tokens on the canvas.
 */

/**
 * Creates tokens on canvas from an array of creature placements.
 * @param {Array<{actorUuid: string, x: number, y: number, elevation?: number}>} placements
 * @returns {Promise<string[]>} Array of created Token Document UUIDs
 */
export async function handleSummonCreatureTokens(placements) {
  if (!canvas.scene || !Array.isArray(placements) || placements.length === 0) return [];

  const tokenDataArray = [];

  for (const placement of placements) {
    const { actorUuid, x, y, elevation = 0 } = placement;
    if (!actorUuid) continue;

    let actor = await fromUuid(actorUuid);
    if (!actor) continue;

    // If compendium actor, import or link to world so it is available locally
    if (actor.pack) {
      const existingInWorld = game.actors?.find(a => a.name === actor.name && a._stats?.compendiumSource === actorUuid);
      if (existingInWorld) {
        actor = existingInWorld;
      } else {
        const actorData = actor.toObject();
        actorData._stats = actorData._stats || {};
        actorData._stats.compendiumSource = actorUuid;
        actor = await Actor.create(actorData);
      }
    }

    const tokenDoc = await actor.getTokenDocument(
      { x, y, elevation },
      { parent: canvas.scene }
    );
    tokenDataArray.push(tokenDoc.toObject());
  }

  if (tokenDataArray.length === 0) return [];

  const created = await canvas.scene.createEmbeddedDocuments("Token", tokenDataArray);
  return Array.isArray(created) ? created.map(t => t.uuid) : [created.uuid];
}
