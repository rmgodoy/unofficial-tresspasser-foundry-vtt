import { TerrainHelper } from "./terrain-helper.mjs";

// --- Sync Hooks ---

Hooks.on("updateRegion", (region, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (options.terrainSync) return;
  if (!region.flags?.trespasser?.terrain) return;

  const drawingId = region.flags.trespasser.drawingId;
  if (!drawingId) return;

  const updates = { _id: drawingId };
  let needsUpdate = false;

  const shape = region.shapes?.[0];
  if (shape && shape.type === "rectangle") {
    if (changes.shapes) {
      updates.x = shape.x;
      updates.y = shape.y;
      updates.shape = { type: "r", width: shape.width, height: shape.height };
      needsUpdate = true;
    }
  }

  if (changes.color) {
    updates.fillColor = changes.color;
    updates.strokeColor = changes.color;
    needsUpdate = true;
  }

  if (changes.flags?.trespasser?.terrain) {
    const sys = region.flags.trespasser.terrain.system;
    updates.texture = sys?.terrainImage || "";
    updates.fillType = updates.texture ? 2 : 1;
    needsUpdate = true;
  }

  if (needsUpdate) {
    region.parent.updateEmbeddedDocuments("Drawing", [updates], { terrainSync: true });
  }
});

Hooks.on("updateDrawing", (drawing, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (options.terrainSync) return;
  if (!drawing.flags?.trespasser?.isTerrainVisual) return;

  const regionId = drawing.flags.trespasser.regionId;
  if (!regionId) return;

  const region = drawing.parent.regions.get(regionId);
  if (!region) return;

  const shape = region.shapes?.[0] || { type: "rectangle", x: drawing.x, y: drawing.y, width: drawing.shape.width, height: drawing.shape.height };

  const updates = { _id: regionId };
  let needsUpdate = false;

  if (changes.x !== undefined || changes.y !== undefined || changes.shape) {
    const newShape = foundry.utils.mergeObject(shape, {
      x: changes.x ?? drawing.x,
      y: changes.y ?? drawing.y,
      width: changes.shape?.width ?? drawing.shape.width,
      height: changes.shape?.height ?? drawing.shape.height
    });
    updates.shapes = [newShape];
    needsUpdate = true;
  }

  if (needsUpdate) {
    drawing.parent.updateEmbeddedDocuments("Region", [updates], { terrainSync: true });
  }
});

Hooks.on("deleteRegion", (region, options, userId) => {
  if (game.user.id !== userId) return;
  if (options.terrainSync) return;
  const drawingId = region.flags?.trespasser?.drawingId;
  if (drawingId && region.parent.drawings.has(drawingId)) {
    region.parent.deleteEmbeddedDocuments("Drawing", [drawingId], { terrainSync: true });
  }
});

Hooks.on("deleteDrawing", (drawing, options, userId) => {
  if (game.user.id !== userId) return;
  if (options.terrainSync) return;
  const regionId = drawing.flags?.trespasser?.regionId;
  if (regionId && drawing.parent.regions.has(regionId)) {
    drawing.parent.deleteEmbeddedDocuments("Region", [regionId], { terrainSync: true });
  }
});

Hooks.on("renderRegionConfig", (app, html, data) => {
  console.log("renderRegionConfig")
  const region = app.document;
  if (region.flags?.trespasser?.terrain) {
    app.close({ force: true });
    TerrainHelper.editTerrainRegion(region);
  }
});

Hooks.on("renderDrawingConfig", (app, html, data) => {
  console.log("renderDrawingConfig")
  const drawing = app.document;
  if (drawing.flags?.trespasser?.isTerrainVisual) {
    app.close({ force: true });
    TerrainHelper.editTerrainRegion(drawing);
  }
});

Hooks.on("updateToken", (tokenDocument, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (changes.x === undefined && changes.y === undefined) return;

  const scene = tokenDocument.parent;
  if (!scene) return;

  const drawingUpdates = [];
  const regionUpdates = [];

  for (const region of scene.regions) {
    if (region.flags?.trespasser?.centerTokenId === tokenDocument.id) {
      const drawingId = region.flags.trespasser.drawingId;
      if (drawingId) {
        const sys = region.flags.trespasser.terrain.system;
        const gridSize = scene.grid.size;
        const w = (sys.width || 1) * gridSize;
        const h = (sys.height || 1) * gridSize;
        
        const tokenX = changes.x ?? tokenDocument.x;
        const tokenY = changes.y ?? tokenDocument.y;
        const tokenWidth = (tokenDocument.width || 1) * gridSize;
        const tokenHeight = (tokenDocument.height || 1) * gridSize;
        
        const tokenCenterX = tokenX + (tokenWidth / 2);
        const tokenCenterY = tokenY + (tokenHeight / 2);
        
        const tx = Math.round((tokenCenterX - w / 2) / gridSize) * gridSize;
        const ty = Math.round((tokenCenterY - h / 2) / gridSize) * gridSize;
        
        drawingUpdates.push({
           _id: drawingId,
           x: tx,
           y: ty
        });
      }
    }
  }

  if (drawingUpdates.length > 0) {
    scene.updateEmbeddedDocuments("Drawing", drawingUpdates, { terrainSync: true });
  }
});
