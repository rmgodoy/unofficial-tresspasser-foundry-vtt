/**
 * Helpers to resolve live tokens and source actors, including unlinked (synthetic) tokens.
 */

/**
 * Resolves a canvas token or token document for an actor, including unlinked tokens.
 * @param {Actor} [actor]
 * @param {Token|TokenDocument|null} [preferred=null]
 * @returns {Token|TokenDocument|null}
 */
export function resolveActorToken(actor, preferred = null) {
  if (preferred) return preferred;
  if (!actor) return null;
  if (actor.isToken) return actor.token?.object || actor.token;
  return actor.getActiveTokens?.(false, false)?.[0]
    || actor.getActiveTokens?.()[0]
    || (canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id))
    || actor.token
    || null;
}

/**
 * Resolves the live source actor of a registered cross-actor middleware.
 * Token-bound registrations resolve to the token's (possibly synthetic) actor on the current scene
 * and yield null when that token no longer exists there.
 * @param {object} options - Middleware options (sourceActorId, sourceTokenId).
 * @returns {Actor|null}
 */
export function resolveSourceActor(options = {}) {
  if (options.sourceTokenId) {
    return canvas?.scene?.tokens?.get(options.sourceTokenId)?.actor ?? null;
  }
  return game.actors?.get(options.sourceActorId) ?? null;
}

/**
 * Unlinked token documents on the active scene that represent the given world actor.
 * @param {Actor} actor
 * @returns {TokenDocument[]}
 */
export function getUnlinkedSceneTokens(actor) {
  if (!actor || actor.isToken || !canvas?.scene?.tokens) return [];
  return canvas.scene.tokens.filter(t => t.actorId === actor.id && !t.actorLink);
}
