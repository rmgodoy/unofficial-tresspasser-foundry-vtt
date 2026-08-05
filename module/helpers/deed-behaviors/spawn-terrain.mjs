import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { TerrainHelper } from "../terrain-helper.mjs";

export class SpawnTerrainBehavior {
  /**
   * 4. spawnTerrain: Places a terrain item on the canvas and tags canvas objects
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, actor, item) {
    const params = behavior.params || {};
    if (!params.terrainUuid) return true;

    const terrainItem = await fromUuid(params.terrainUuid);
    if (!terrainItem) return true;

    const placement = params.placement || "on_target";

    if (placement === "selected_area") {
      const targetArea = DeedBehaviorUtils.resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for terrain placement.");
        return false;
      }
      const gridPx = canvas.grid.size;
      let evalSquares = targetArea.squares;

      if (params.ignoreSourceSquare) {
        const sourceToken = DeedBehaviorUtils.findToken(actor);
        if (sourceToken) {
          const srcX = context.sourcePosition?.x ?? sourceToken.document?.x ?? sourceToken.x;
          const srcY = context.sourcePosition?.y ?? sourceToken.document?.y ?? sourceToken.y;
          const srcGx = Math.floor(srcX / gridPx);
          const srcGy = Math.floor(srcY / gridPx);

          evalSquares = evalSquares.filter(sq => {
            const sqGx = Math.floor(sq.x / gridPx);
            const sqGy = Math.floor(sq.y / gridPx);
            return !(sqGx === srcGx && sqGy === srcGy);
          });
        }
      }

      const gridSquares = evalSquares.map(sq => ({ x: Math.floor(sq.x / gridPx), y: Math.floor(sq.y / gridPx) }));
      let created = null;

      if (game.user.isGM) {
        created = await TerrainHelper.placeTerrainOnCanvas(terrainItem, { x: 0, y: 0 }, { pathSquares: gridSquares });
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        const createdUuids = await emitDeedActionAndWait("spawnTerrain", {
          useTerrainHelper: true,
          terrainUuid: terrainItem.uuid,
          dropPosition: { x: 0, y: 0 },
          options: { pathSquares: gridSquares }
        });
        if (createdUuids && createdUuids.length > 0) {
          created = [];
          for (const uuid of createdUuids) {
            const tileDoc = await fromUuid(uuid);
            if (tileDoc) created.push(tileDoc);
          }
        }
      }

      if (created) {
        if (!context.spawnedTerrains) context.spawnedTerrains = [];
        if (Array.isArray(created)) {
          context.spawnedTerrains.push(...created);
        } else {
          context.spawnedTerrains.push(created);
        }
      }
      if (context.currentPhaseOutputs?.notes) {
        context.currentPhaseOutputs.notes.push(`Spawned terrain "${terrainItem.name}" on selected area`);
      }
      return true;
    }

    let dropPos = { x: canvas.stage?.width / 2 || 0, y: canvas.stage?.height / 2 || 0 };
    const token = DeedBehaviorUtils.findToken(actor);

    if (placement === "on_self" && token) {
      dropPos = { x: token.x, y: token.y };
    } else if (placement === "on_target" && context.targets?.[0]) {
      const targetToken = context.targets[0];
      dropPos = { x: targetToken.x, y: targetToken.y };
    } else if (placement === "choose" && token) {
      const deedData = { targetType: "blast", targetSize: 1, range: item?.system?.range || 0 };
      const result = await TargetingHelper.placeTemplate(actor, token, deedData);
      if (result && result.squares?.[0]) {
        const sq = result.squares[0];
        dropPos = { x: sq.x * canvas.grid.size, y: sq.y * canvas.grid.size };
      }
    }

    const tileData = {
      texture: { src: terrainItem.img || "icons/svg/item-bag.svg" },
      width: canvas.grid.size,
      height: canvas.grid.size,
      x: dropPos.x,
      y: dropPos.y,
      flags: {
        trespasser: {
          isTerrain: true,
          terrainUuid: terrainItem.uuid,
          terrainName: terrainItem.name,
          sourceItemId: item?.id || null
        }
      }
    };

    if (!context.spawnedTerrains) context.spawnedTerrains = [];

    if (game.user.isGM) {
      const createdTiles = await canvas.scene?.createEmbeddedDocuments("Tile", [tileData]);
      if (createdTiles && createdTiles.length > 0) {
        context.spawnedTerrains.push(createdTiles[0]);
      }
    } else {
      const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
      const createdUuids = await emitDeedActionAndWait("spawnTerrain", {
        useTerrainHelper: false,
        tileDataArray: [tileData]
      });
      if (createdUuids && createdUuids.length > 0) {
        const tileDoc = await fromUuid(createdUuids[0]);
        if (tileDoc) context.spawnedTerrains.push(tileDoc);
      }
    }

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Spawned terrain "${terrainItem.name}" on canvas`);
    }
    return true;
  }
}
