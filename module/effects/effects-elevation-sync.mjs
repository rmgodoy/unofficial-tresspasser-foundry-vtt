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
  if (actor.isToken && actor.token) {
    tokens = [actor.token];
  } else if (typeof actor.getActiveTokens === "function") {
    tokens = actor.getActiveTokens(true, true) || [];
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

    const wasSunken = currentEffectElevation < 0;
    const isNowSunken = effectElevation < 0;

    if (currentElevation !== targetElevation || currentEffectElevation !== effectElevation) {
      await tokenDoc.update({
        elevation: targetElevation,
        [`flags.${SYSTEM_ID}.effectElevation`]: effectElevation
      });
    }

    // When creature surfaces, trigger onEnter behaviors and whileInside effects for containing terrain regions
    if (wasSunken && !isNowSunken) {
      const terrainHelper = game[SYSTEM_ID]?.TerrainHelper || game.trespasser?.TerrainHelper;
      if (terrainHelper?.onTokenSurfaced) {
        await terrainHelper.onTokenSurfaced(tokenDoc);
      } else {
        const { onTokenSurfaced } = await import("../terrain/terrain-movement.mjs");
        await onTokenSurfaced(tokenDoc);
      }
    }
  }
}

