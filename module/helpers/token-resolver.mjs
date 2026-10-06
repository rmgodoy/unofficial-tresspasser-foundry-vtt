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
  const actor = game.actors?.get(options.sourceActorId) ?? null;
  // Sidebar actors without a placed (linked) token on the active scene are not live sources
  return hasPlacedToken(actor) ? actor : null;
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

/**
 * Linked token documents on the active scene that represent the given world actor.
 * @param {Actor} actor
 * @returns {TokenDocument[]}
 */
export function getLinkedSceneTokens(actor) {
  if (!actor || actor.isToken || !canvas?.scene?.tokens) return [];
  return canvas.scene.tokens.filter(t => t.actorId === actor.id && t.actorLink);
}

/**
 * Whether the actor is physically present on the active scene.
 * Synthetic (unlinked) actors must belong to the active scene; world actors need a linked token on it.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function hasPlacedToken(actor) {
  if (!actor) return false;
  if (actor.isToken) {
    const scene = actor.token?.parent;
    return Boolean(scene && scene === canvas?.scene && scene.tokens.has(actor.token.id));
  }
  return getLinkedSceneTokens(actor).length > 0;
}
