export class TerrainHelper {
  
  static TERRAIN_COLORS = {
    difficult_terrain: "#8B4513", 
    obstacle: "#696969",        
    wall: "#000000",            
    field: "#228B22",           
    light_cloud: "#D3D3D3",     
    heavy_cloud: "#708090"      
  };

  /**
   * Handle dropping a Terrain item onto the canvas.
   * @param {Item} terrainItem - The Terrain Item document.
   * @param {Object} dropPosition - {x, y} coordinates of the drop.
   */
  static async placeTerrainOnCanvas(terrainItem, dropPosition) {
    console.log("here 1")
    if (!canvas.ready || !terrainItem) return;
    console.log("here 2")
    const gridSize = canvas.grid.size;
    const sys = terrainItem.system;
    
    const widthSq = sys.width || 1;
    const heightSq = sys.height || 1;
    
    const w = widthSq * gridSize;
    const h = heightSq * gridSize;

    // If not dropped on an actor, calculate standard rectangle centered on mouse
    let shape = {
      type: "rectangle",
      x: Math.round((dropPosition.x - w / 2) / gridSize) * gridSize,
      y: Math.round((dropPosition.y - h / 2) / gridSize) * gridSize,
      width: w,
      height: h
    };

    let centerActorId = sys.centerActorId;
    let centerTokenId = "";
    
    if (sys.centerMode === "actor") {
      const tokens = canvas.tokens.placeables.filter(t => {
        return dropPosition.x >= t.x && dropPosition.x <= t.x + t.w &&
               dropPosition.y >= t.y && dropPosition.y <= t.y + t.h;
      });
      if (tokens.length > 0) {
        const token = tokens[0];
        centerActorId = token.actor?.id || "";
        centerTokenId = token.id;
        
        const tokenCenterX = token.x + (token.w / 2);
        const tokenCenterY = token.y + (token.h / 2);
        const tokenTx = Math.round((tokenCenterX - w / 2) / gridSize) * gridSize;
        const tokenTy = Math.round((tokenCenterY - h / 2) / gridSize) * gridSize;
        
        // When attaching to a token, use the native Emanation shape with radius 0 (sharp rectangle)
        // We set the base width/height to the terrain's dimensions so the size is exactly the terrain size.
        shape = {
          type: "emanation",
          radius: 0,
          hole: false,
          gridBased: false,
          base: {
            type: "token",
            x: tokenTx,
            y: tokenTy,
            width: sys.width || 1,
            height: sys.height || 1,
            shape: 4,
            hole: false
          }
        };
      } else {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoTokenOnCanvas"));
        return;
      }
    }

    const tx = shape.x ?? Math.floor(dropPosition.x / gridSize) * gridSize;
    const ty = shape.y ?? Math.floor(dropPosition.y / gridSize) * gridSize;

    const color = this.TERRAIN_COLORS[sys.category] || "#ffffff";

    const regionData = {
      name: terrainItem.name,
      shapes: [shape],
      color: color,
      flags: {
        trespasser: {
          terrain: terrainItem.toObject(),
          centerActorId: centerActorId,
          centerTokenId: centerTokenId
        }
      }
    };

    let drawingX = tx;
    let drawingY = ty;

    if (sys.centerMode === "actor" && centerTokenId) {
      const token = canvas.tokens.get(centerTokenId);
      if (token) {
        const tokenCenterX = token.x + (token.w / 2);
        const tokenCenterY = token.y + (token.h / 2);
        drawingX = Math.round((tokenCenterX - w / 2) / gridSize) * gridSize;
        drawingY = Math.round((tokenCenterY - h / 2) / gridSize) * gridSize;
        
        regionData.attachment = { token: token.document };
      }
    }

    const drawingData = {
      shape: {
        type: "r",
        width: w,
        height: h
      },
      x: drawingX,
      y: drawingY,
      fillType: sys.terrainImage ? 2 : 1, // 2: Pattern (image), 1: Solid
      fillColor: color,
      fillAlpha: 0.4,
      strokeWidth: 2,
      strokeColor: color,
      strokeAlpha: 0.8,
      texture: sys.terrainImage || "",
      text: terrainItem.name,
      fontSize: 24,
      textColor: "#ffffff",
      textAlpha: 0.8,
      flags: {
        trespasser: {
          isTerrainVisual: true
        }
      }
    };

    const createdRegions = await canvas.scene.createEmbeddedDocuments("Region", [regionData]);
    const region = createdRegions[0];

    drawingData.flags.trespasser.regionId = region.id;

    const createdDrawings = await canvas.scene.createEmbeddedDocuments("Drawing", [drawingData]);
    const drawing = createdDrawings[0];

    await region.update({ "flags.trespasser.drawingId": drawing.id });
  }

  /**
   * Open the custom terrain sheet for a dropped Region or Drawing.
   * @param {Document} document - The Region or Drawing document.
   */
  static async editTerrainRegion(document) {
    let region = document;
    if (document.documentName === "Drawing") {
      const regionId = document.flags?.trespasser?.regionId;
      if (!regionId) return;
      region = document.parent.regions.get(regionId);
      if (!region) return;
    }

    const itemData = region.flags?.trespasser?.terrain;
    if (!itemData) return;

    const tempItem = new Item.implementation(itemData, { parent: null });

    tempItem.update = async (updates, options) => {
      tempItem.updateSource(updates);
      const sys = tempItem.system;

      const gridSize = canvas.grid.size;
      const w = (sys.width || 1) * gridSize;
      const h = (sys.height || 1) * gridSize;
      const color = TerrainHelper.TERRAIN_COLORS[sys.category] || "#ffffff";

      const currentShape = region.shapes?.[0] || { x: 0, y: 0 };
      let tx = currentShape.x;
      let ty = currentShape.y;
      
      if (currentShape.type === "emanation" && currentShape.base) {
         tx = currentShape.base.x;
         ty = currentShape.base.y;
      }

      let newShape = {
        type: "rectangle",
        x: tx,
        y: ty,
        width: w,
        height: h
      };

      if (currentShape.type === "emanation") {
        newShape = {
          type: "emanation",
          radius: 0,
          hole: false,
          gridBased: false,
          base: {
            type: "token",
            x: tx,
            y: ty,
            width: sys.width || 1,
            height: sys.height || 1,
            shape: 4,
            hole: false
          }
        };
      }

      const regionUpdates = {
        _id: region.id,
        color: color,
        shapes: [newShape],
        "flags.trespasser.terrain": tempItem.toObject(),
        "flags.trespasser.centerActorId": sys.centerActorId
      };

      await region.parent.updateEmbeddedDocuments("Region", [regionUpdates]);
      tempItem.sheet.render(false);
    };

    tempItem.sheet.render(true);
  }
}

Hooks.on("dropCanvasData", (canvasWrapper, data) => {
  if (data.type === "Item") {
    const item = fromUuidSync(data.uuid);
    if (item && item.type === "terrain") {
      TerrainHelper.placeTerrainOnCanvas(item, { x: data.x, y: data.y });
      return false;
    }
  }
});


