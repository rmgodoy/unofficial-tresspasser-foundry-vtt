export class MoveTerrainBehavior {
  /**
   * 5. moveTerrain: Move spawned terrain tiles on canvas
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, item) {
    const params = behavior.params || {};
    const mode = params.terrainSelectMode || "last_spawned";
    const distance = parseInt(params.distance) || 1;

    let targetTiles = [];
    if (mode === "last_spawned") {
      if (context.spawnedTerrains?.length > 0) {
        targetTiles = [context.spawnedTerrains[context.spawnedTerrains.length - 1]];
      }
    } else if (mode === "all_spawned") {
      targetTiles = context.spawnedTerrains || [];
    }

    if (targetTiles.length === 0) return true;

    const updates = targetTiles.map(tileDoc => {
      const gridPx = canvas.grid.size;
      return { _id: tileDoc.id, x: tileDoc.x + (distance * gridPx) };
    });

    if (game.user.isGM) {
      await canvas.scene?.updateEmbeddedDocuments("Tile", updates);
    } else {
      const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
      await emitDeedActionAndWait("moveTerrain", { updates });
    }

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Moved ${targetTiles.length} terrain tile(s) by ${distance} sq`);
    }
    return true;
  }
}
