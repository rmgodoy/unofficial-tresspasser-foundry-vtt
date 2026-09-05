import { getRegionColor } from "./terrain-behaviors.mjs";
import { syncWhileInsideEffectsForRegion } from "./terrain-effects-sync.mjs";

/**
 * Open the custom terrain sheet for a dropped Region or Drawing.
 * @param {Document} document - The Region or Drawing document.
 */
export async function editTerrainRegion(document) {
  let region = document;
  if (document.documentName === "Drawing" || document.documentName === "Tile") {
    const regionId = document.flags?.trespasser?.regionId;
    if (regionId) {
      region = document.parent?.regions?.get(regionId) || region;
    }
  }

  const itemData = region.flags?.trespasser?.terrain;
  if (!itemData) return;

  const itemDataCopy = foundry.utils.deepClone(itemData);
  if (!itemDataCopy.ownership) {
    itemDataCopy.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3 };
  }
  const tempItem = new Item.implementation(itemDataCopy, { parent: null });
  Object.defineProperty(tempItem, "isOwner", { value: true, writable: true });

  tempItem.update = async (updates, options) => {
    tempItem.updateSource(updates);
    const sys = tempItem.system;

    const gridSize = canvas.grid?.size || 100;
    const w = (sys.width || 1) * gridSize;
    const h = (sys.height || 1) * gridSize;
    const color = getRegionColor(tempItem);

    const pathSquares = region.flags?.trespasser?.pathSquares;
    let newShapes;

    if (pathSquares && Array.isArray(pathSquares) && pathSquares.length > 0) {
      newShapes = pathSquares.map(sq => ({
        type: "rectangle",
        x: sq.x * gridSize,
        y: sq.y * gridSize,
        width: gridSize,
        height: gridSize
      }));
    } else {
      const currentShape = region.shapes?.[0] || { x: 0, y: 0 };
      if (currentShape.type === "emanation" && currentShape.base) {
        const auraRadiusSq = Math.max(0, (Math.max(sys.width || 1, sys.height || 1) - 1) / 2);
        newShapes = [{
          type: "emanation",
          radius: auraRadiusSq,
          hole: false,
          gridBased: false,
          base: currentShape.base
        }];
      } else {
        const tx = currentShape.x ?? 0;
        const ty = currentShape.y ?? 0;
        newShapes = [{
          type: "rectangle",
          x: tx,
          y: ty,
          width: w,
          height: h
        }];
      }
    }

    const regionUpdates = {
      _id: region.id,
      name: tempItem.name,
      color: color,
      shapes: newShapes,
      "flags.trespasser.terrain": tempItem.toObject(),
      "flags.trespasser.centerActorId": sys.centerActorId
    };

    if (game.user.isGM) {
      await region.parent.updateEmbeddedDocuments("Region", [regionUpdates]);
      await syncWhileInsideEffectsForRegion(region);
    } else {
      const { emitDeedActionAndWait } = await import("../helpers/socket/deed-socket-handler.mjs");
      await emitDeedActionAndWait("updateTerrainRegion", {
        sceneId: region.parent?.id || canvas.scene?.id,
        regionId: region.id,
        updates: regionUpdates
      });
    }
    tempItem.sheet.render(false);
  };

  tempItem.sheet.render(true);
}
