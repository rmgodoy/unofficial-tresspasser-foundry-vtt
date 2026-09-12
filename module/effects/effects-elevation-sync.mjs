import { SYSTEM_ID } from "../system-id.mjs";
import { getAttributeBonus } from "./effects-aggregate.mjs";

/**
 * Synchronizes the elevation of all active canvas tokens linked to an actor
 * based on the actor's active "elevation" effect modifiers.
 *
 * Base elevation is preserved:
 * baseElevation = currentElevation - currentEffectElevation
 * targetElevation = baseElevation + newEffectElevation
 *
 * @param {Actor} actor The actor document to sync token elevation for
 */
export async function syncActorTokenElevation(actor) {
  if (!actor) return;
  if (!actor.isOwner && !game.user?.isGM) return;

  // Calculate the total elevation modifier from all active effects as an integer
  const effectElevation = Math.round(Number(getAttributeBonus(actor, "elevation")) || 0);

  // Retrieve active token documents on the current scene
  let tokens = [];
  if (typeof actor.getActiveTokens === "function") {
    tokens = actor.getActiveTokens(false, true) || [];
  }
  if (tokens.length === 0 && actor.token) {
    tokens = [actor.token];
  }

  for (const tokenDoc of tokens) {
    if (!tokenDoc) continue;

    const canModify = tokenDoc.canUserModify
      ? tokenDoc.canUserModify(game.user, "update")
      : (tokenDoc.isOwner || game.user?.isGM);
    if (!canModify) continue;

    const currentEffectElevation = Math.round(Number(tokenDoc.getFlag(SYSTEM_ID, "effectElevation") ?? 0));
    const currentElevation = Math.round(Number(tokenDoc.elevation ?? 0));
    const baseElevation = currentElevation - currentEffectElevation;
    const targetElevation = Math.round(baseElevation + effectElevation);

    if (currentElevation !== targetElevation || currentEffectElevation !== effectElevation) {
      await tokenDoc.update({
        elevation: targetElevation,
        [`flags.${SYSTEM_ID}.effectElevation`]: effectElevation
      });
    }
  }
}
