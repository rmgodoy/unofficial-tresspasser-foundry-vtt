import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { getRegionColor, executeBehavior, buildBehaviorContext, evaluateIntensityValue } from "./terrain-behaviors.mjs";
import { isPointInRegion } from "./terrain-geometry.mjs";
import { editTerrainRegion } from "./terrain-editor.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";

export { editTerrainRegion };

/**
 * Handle dropping a Terrain item onto the canvas.
 * @param {Item} terrainItem - The Terrain Item document.
 * @param {Object} dropPosition - {x, y} coordinates of the drop.
 * @param {Object} options - Additional flags like spawnedInCombat.
 */
export async function placeTerrainOnCanvas(terrainItem, dropPosition, options = {}) {
  if (!canvas.ready || !terrainItem) return;

  const gridSize = canvas.grid.size;
  const sys = terrainItem.system;
  
  const widthSq = sys.width || 1;
  const heightSq = sys.height || 1;
  
  const w = widthSq * gridSize;
  const h = heightSq * gridSize;

  let shapes = [];
  
  if (options.pathSquares && options.pathSquares.length > 0) {
    for (const sq of options.pathSquares) {
      shapes.push({
        type: "rectangle",
        x: sq.x * gridSize,
        y: sq.y * gridSize,
        width: gridSize,
        height: gridSize
      });
    }
  } else {
    shapes.push({
      type: "rectangle",
      x: Math.round((dropPosition.x - w / 2) / gridSize) * gridSize,
      y: Math.round((dropPosition.y - h / 2) / gridSize) * gridSize,
      width: w,
      height: h
    });
  }

  let centerActorId = sys.centerActorId;
  let centerTokenId = "";
  
  if (sys.centerMode === "actor") {
    const tokens = canvas.tokens.placeables.filter(t => {
      return dropPosition.x >= t.x && dropPosition.x <= t.x + t.w &&
             dropPosition.y >= t.y && dropPosition.y <= t.y + t.h;
    });
    if (tokens.length > 0) {
      const token = tokens[0];
      const tokenDoc = token.document ?? token;
      centerActorId = tokenDoc.actor?.id || "";
      centerTokenId = tokenDoc.id;
      
      const auraRadiusSq = Math.max(0, (Math.max(sys.width || 1, sys.height || 1) - 1) / 2);
      shapes = [{
        type: "emanation",
        radius: auraRadiusSq,
        hole: false,
        gridBased: false,
        base: {
          type: "token",
          uuid: tokenDoc.uuid
        }
      }];
    } else {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoTokenOnCanvas"));
      return;
    }
  }

  const linkedList = (sys?.linkedEffects && sys.linkedEffects.length > 0)
    ? sys.linkedEffects
    : (sys?.linkedEffect?.uuid ? [sys.linkedEffect] : []);

  if (options.casterActorId && linkedList.length > 0) {
    const casterActor = game.actors?.get(options.casterActorId);
    if (casterActor) {
      for (const linkedItem of linkedList) {
        const linkedUuid = linkedItem.uuid;
        if (!linkedUuid) continue;
        const hasLinked = casterActor.items.some(i =>
          i.type === "effect" && (
            i.flags?.trespasser?.sourceEffectUuid === linkedUuid ||
            i.flags?.trespasser?.linkedSource === linkedUuid ||
            i.uuid === linkedUuid ||
            (linkedItem.name && i.name === linkedItem.name)
          )
        );
        if (!hasLinked) {
          const sourceEff = await resolveItem(linkedItem, { type: "effect" });
          if (sourceEff) {
            const effData = sourceEff.toObject();
            delete effData._id;
            if (options.intensity !== undefined && options.intensity !== null && !isNaN(Number(options.intensity))) {
              effData.system.intensity = Number(options.intensity);
            } else if (linkedItem.intensity) {
              effData.system.intensity = evaluateIntensityValue(linkedItem.intensity, 1);
            }
            effData.flags = foundry.utils.mergeObject(effData.flags || {}, {
              trespasser: {
                sourceEffectUuid: sourceEff.uuid,
                linkedSource: sourceEff.uuid
              }
            });
            if (casterActor.isOwner || game.user.isGM) {
              const [created] = await casterActor.createEmbeddedDocuments("Item", [effData]);
              if (created && !options.linkedEffectId) options.linkedEffectId = created.id;
            }
          }
        }
      }
    }
  }

  const color = getRegionColor(terrainItem);

  const regionData = {
    name: terrainItem.name,
    shapes: shapes,
    color: color,
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    behaviors: [{
      type: "executeScript",
      name: "Terrain Tracking",
      system: {
        events: ["tokenEnter", "tokenExit"],
        source: `const tokenDoc = event.data.token || event.data;
if (event.name === "tokenEnter") Hooks.callAll("regionBehaviorTokenEnter", behavior, region, tokenDoc);
if (event.name === "tokenExit") Hooks.callAll("regionBehaviorTokenExit", behavior, region, tokenDoc);`
      }
    }],
    flags: {
      trespasser: {
        terrain: terrainItem.toObject(),
        centerActorId: centerActorId,
        centerTokenId: centerTokenId,
        spawnedInCombat: options.spawnedInCombat,
        linkedEffectId: options.linkedEffectId || terrainItem.system.linkedEffect?.uuid || terrainItem.system.linkedEffectKey || null,
        linkedEffectUuid: options.linkedEffectUuid || null,
        casterActorId: options.casterActorId || null,
        casterActorUuid: options.casterActorUuid || null,
        pathSquares: options.pathSquares || null,
        intensity: options.intensity ?? null
      }
    }
  };

  const createdRegions = await canvas.scene.createEmbeddedDocuments("Region", [regionData]);
  const createdRegion = createdRegions[0];
  if (createdRegion) {
    await onTerrainCreated(createdRegion, options);
  }
  return createdRegion;
}

/**
 * Spawn a terrain from a deed.
 * @param {Item} terrainItem 
 * @param {Object} spawnConfig 
 * @param {TokenDocument} sourceToken 
 * @param {TokenDocument[]} targets 
 * @param {Object} options 
 */
export async function spawnTerrainFromDeed(terrainItem, spawnConfig, sourceToken, targets, options = {}) {
  if (!canvas.ready || !terrainItem) return;
  const placement = spawnConfig.placement;
  if (!placement) return;

  let targetPositions = [];
  const gridSize = canvas.grid.size;

  let itemToSpawn = terrainItem;

  if (placement === "on_self") {
    targetPositions.push({ x: sourceToken.x + (sourceToken.w || gridSize)/2, y: sourceToken.y + (sourceToken.h || gridSize)/2 });
  } else if (placement === "on_target") {
    for (const t of targets) {
      if (t) targetPositions.push({ x: t.x + (t.w || gridSize)/2, y: t.y + (t.h || gridSize)/2 });
    }
  } else if (placement === "choose") {
    let selectedPos = null;
    let hoveredPos = null;
    const w = (terrainItem.system.width || 1) * gridSize;
    const h = (terrainItem.system.height || 1) * gridSize;
    const wSq = terrainItem.system.width || 1;
    const hSq = terrainItem.system.height || 1;
    const highlights = [];
    const layer = canvas.interface;

    const redrawTerrainPreview = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;

      const gfx = new PIXI.Graphics();

      if (selectedPos) {
        const placedSquares = [];
        for (let dx = 0; dx < wSq; dx++) {
          for (let dy = 0; dy < hSq; dy++) {
            placedSquares.push({ x: selectedPos.x + dx * gridSize, y: selectedPos.y + dy * gridSize });
          }
        }
        CanvasSelectionRenderer.drawPlacedOrigin(gfx, placedSquares, gridSize);
      }

      if (hoveredPos) {
        const isSame = selectedPos && hoveredPos.x === selectedPos.x && hoveredPos.y === selectedPos.y;
        if (!isSame) {
          const hoverSquares = [];
          for (let dx = 0; dx < wSq; dx++) {
            for (let dy = 0; dy < hSq; dy++) {
              hoverSquares.push({ x: hoveredPos.x + dx * gridSize, y: hoveredPos.y + dy * gridSize });
            }
          }
          CanvasSelectionRenderer.drawCandidateSquares(gfx, hoverSquares, gridSize);
        }
      }

      layer.addChild(gfx);
      highlights.push(gfx);
    };

    const cleanup = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;
    };

    const title = game.i18n.format("TRESPASSER.Notification.Combat.PlaceTerrain", { name: terrainItem.name });

    const positionResult = await CanvasInputSession.start({
      title,
      details: game.i18n.localize("TRESPASSER.HUD.AoE.BlastInstruction") || "Click to select terrain location.",
      icon: "fas fa-mountain",
      showConfirm: true,
      canConfirm: false,
      showUndo: false,
      canUndo: false,
      showCancel: true,
      onPointerMove: (ev) => {
        let lastCanvasPos;
        if (typeof ev.getLocalPosition === "function") {
          lastCanvasPos = ev.getLocalPosition(canvas.stage);
        } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
          lastCanvasPos = ev.data.getLocalPosition(canvas.stage);
        } else if (ev.interactionData && ev.interactionData.origin) {
          lastCanvasPos = ev.interactionData.origin;
        }
        if (!lastCanvasPos) return;

        const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
        const offsetX = snapped.x - Math.floor(wSq / 2) * gridSize;
        const offsetY = snapped.y - Math.floor(hSq / 2) * gridSize;
        hoveredPos = { x: offsetX, y: offsetY };
        redrawTerrainPreview();
      },
      onClick: (ev) => {
        let lastCanvasPos;
        if (typeof ev.getLocalPosition === "function") {
          lastCanvasPos = ev.getLocalPosition(canvas.stage);
        } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
          lastCanvasPos = ev.data.getLocalPosition(canvas.stage);
        } else if (ev.interactionData && ev.interactionData.origin) {
          lastCanvasPos = ev.interactionData.origin;
        }
        if (!lastCanvasPos) return;

        const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
        const offsetX = snapped.x - Math.floor(wSq / 2) * gridSize;
        const offsetY = snapped.y - Math.floor(hSq / 2) * gridSize;

        if (selectedPos && selectedPos.x === offsetX && selectedPos.y === offsetY) {
          cleanup();
          if (CanvasInputSession.activeSession) CanvasInputSession.activeSession.confirm();
          return;
        }

        selectedPos = { x: offsetX, y: offsetY };
        redrawTerrainPreview();

        if (CanvasInputSession.activeSession) {
          CanvasInputSession.activeSession.updateOverlay({ canConfirm: true });
        }
      },
      onConfirm: () => {
        cleanup();
        return selectedPos ? { x: selectedPos.x + w / 2, y: selectedPos.y + h / 2 } : null;
      },
      onCancel: () => {
        cleanup();
        return null;
      }
    });

    if (!positionResult) return;
    targetPositions.push(positionResult);
  } else if (placement === "aura") {
    itemToSpawn = terrainItem.clone({ "system.centerMode": "actor", "system.centerActorId": sourceToken.actor.id }, { keepId: true });
    targetPositions.push({ x: sourceToken.x + (sourceToken.w || gridSize)/2, y: sourceToken.y + (sourceToken.h || gridSize)/2 });
  }

  for (const pos of targetPositions) {
    await placeTerrainOnCanvas(itemToSpawn, pos, options);
  }
}

/**
 * Called immediately after a terrain region is created on canvas.
 * @param {RegionDocument} region
 * @param {Object} options
 */
export async function onTerrainCreated(region, options = {}) {
  if (!region) return;
  const terrainData = region.flags?.trespasser?.terrain;
  if (!terrainData) return;

  const sys = terrainData.system;
  const onCreationBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onCreation");
  if (onCreationBehaviors.length > 0) {
    const context = buildBehaviorContext(region);
    context.options = options;

    const scene = region.parent || canvas.scene;
    if (scene) {
      const gridSize = scene.grid?.size || 100;
      const tokensInRegion = (scene.tokens || []).filter(t => {
        if (!t.actor) return false;
        if (sys.centerMode === "actor" && sys.centerActorId === t.actor.id) return false;

        const tokenCenterX = t.x + ((t.width || 1) * gridSize / 2);
        const tokenCenterY = t.y + ((t.height || 1) * gridSize / 2);
        return isPointInRegion(tokenCenterX, tokenCenterY, region, gridSize);
      });

      for (const behavior of onCreationBehaviors) {
        if (behavior.action === "script") {
          const targetActor = tokensInRegion.length === 1 ? tokensInRegion[0].actor : null;
          await executeBehavior(behavior, targetActor, region, context);
        } else {
          if (tokensInRegion.length > 0) {
            for (const tokenDoc of tokensInRegion) {
              await executeBehavior(behavior, tokenDoc.actor, region, context);
            }
          } else {
            await executeBehavior(behavior, null, region, context);
          }
        }
      }
    }
  }
}
