import "../helpers/region-sync-helper.mjs";

/**
 * Register region behavior event hooks for terrain entry and exit.
 */
export function registerRegionHooks() {
  Hooks.on("regionBehaviorTokenEnter", async (behavior, region, token) => {
    const tokenDoc = token.document ?? token;
    if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
    if (game.trespasser?.TerrainHelper) {
      await game.trespasser.TerrainHelper.onTokenEnterTerrain(tokenDoc, region);
    }
  });

  Hooks.on("regionBehaviorTokenExit", async (behavior, region, token) => {
    const tokenDoc = token.document ?? token;
    if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
    if (game.trespasser?.TerrainHelper) {
      await game.trespasser.TerrainHelper.onTokenExitTerrain(tokenDoc, region);
    }
  });
}
