import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { ForcedMovementHelper } from "./forced-movement-helper.mjs";
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";

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
   * Get the display color for a terrain item or data, falling back to category default.
   * @param {Item|Object} terrainItemOrData 
   * @returns {string} Hex color string.
   */
  static getRegionColor(terrainItemOrData) {
    if (!terrainItemOrData) return "#8B4513";
    const sys = terrainItemOrData.system || terrainItemOrData;
    return sys.regionColor || this.TERRAIN_COLORS[sys.category] || "#8B4513";
  }

  /**
   * Handle dropping a Terrain item onto the canvas.
   * @param {Item} terrainItem - The Terrain Item document.
   * @param {Object} dropPosition - {x, y} coordinates of the drop.
   * @param {Object} options - Additional flags like spawnedInCombat.
   */
  static async placeTerrainOnCanvas(terrainItem, dropPosition, options = {}) {
    if (!canvas.ready || !terrainItem) return;

    const gridSize = canvas.grid.size;
    const sys = terrainItem.system;
    
    const widthSq = sys.width || 1;
    const heightSq = sys.height || 1;
    
    const w = widthSq * gridSize;
    const h = heightSq * gridSize;

    // If not dropped on an actor, calculate standard rectangle centered on mouse
    let shapes = [];
    
    if (options.pathSquares && options.pathSquares.length > 0) {
      // Path placement: one 1x1 shape per square
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
        
        // When attaching to a token, leverage native Foundry VTT Region Emanation shape
        // Using base: { type: "token", uuid: tokenDoc.uuid } so Foundry tracks the token automatically
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

    // Ensure caster actor has the configured linked effects
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
            const sourceEff = await fromUuid(linkedUuid);
            if (sourceEff) {
              const effData = sourceEff.toObject();
              delete effData._id;
              if (options.intensity !== undefined && options.intensity !== null && !isNaN(Number(options.intensity))) {
                effData.system.intensity = Number(options.intensity);
              } else if (linkedItem.intensity) {
                effData.system.intensity = this.evaluateIntensityValue(linkedItem.intensity, 1);
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

    const color = this.getRegionColor(terrainItem);

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
      await this.onTerrainCreated(createdRegion, options);
    }
    return createdRegion;
  }

  /**
   * Open the custom terrain sheet for a dropped Region or Drawing.
   * @param {Document} document - The Region or Drawing document.
   */
  static async editTerrainRegion(document) {
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
      const color = TerrainHelper.getRegionColor(tempItem);

      const pathSquares = region.flags?.trespasser?.pathSquares;
      let newShapes;

      if (pathSquares && Array.isArray(pathSquares) && pathSquares.length > 0) {
        // Preserve multi-square path placement
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
        await TerrainHelper.syncWhileInsideEffectsForRegion(region);
      } else {
        const { emitDeedActionAndWait } = await import("./socket/deed-socket-handler.mjs");
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

  /**
   * Spawn a terrain from a deed.
   * @param {Item} terrainItem 
   * @param {Object} spawnConfig 
   * @param {TokenDocument} sourceToken 
   * @param {TokenDocument[]} targets 
   * @param {Object} options 
   */
  static async spawnTerrainFromDeed(terrainItem, spawnConfig, sourceToken, targets, options = {}) {
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
      await this.placeTerrainOnCanvas(itemToSpawn, pos, options);
    }
  }

  // ── Event Processing ────────────────────────────────────────────────────────

  /**
   * Called immediately after a terrain region is created on canvas.
   * Executes behaviors with trigger "onCreation".
   * @param {RegionDocument} region - The created region document.
   * @param {Object} options - Options passed during creation.
   */
  static async onTerrainCreated(region, options = {}) {
    if (!region) return;
    const terrainData = region.flags?.trespasser?.terrain;
    if (!terrainData) return;

    const sys = terrainData.system;
    const onCreationBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onCreation");
    if (onCreationBehaviors.length > 0) {
      const context = this.#buildBehaviorContext(region);
      context.options = options;

      const scene = region.parent || canvas.scene;
      if (scene) {
        const gridSize = scene.grid?.size || 100;
        const tokensInRegion = (scene.tokens || []).filter(t => {
          if (!t.actor) return false;
          // Skip actor-centered terrain's center actor
          if (sys.centerMode === "actor" && sys.centerActorId === t.actor.id) return false;

          const tokenCenterX = t.x + ((t.width || 1) * gridSize / 2);
          const tokenCenterY = t.y + ((t.height || 1) * gridSize / 2);
          return TerrainHelper.isPointInRegion(tokenCenterX, tokenCenterY, region, gridSize);
        });

        for (const behavior of onCreationBehaviors) {
          if (behavior.action === "script") {
            const targetActor = tokensInRegion.length === 1 ? tokensInRegion[0].actor : null;
            await this.executeBehavior(behavior, targetActor, region, context);
          } else {
            if (tokensInRegion.length > 0) {
              for (const tokenDoc of tokensInRegion) {
                await this.executeBehavior(behavior, tokenDoc.actor, region, context);
              }
            } else {
              await this.executeBehavior(behavior, null, region, context);
            }
          }
        }
      }
    }
  }

  /**
   * Called when a token first enters a terrain region this turn.
   * Executes behaviors with trigger "onEnter".
   * @param {TokenDocument} token - The token or token document.
   * @param {RegionDocument} region - The region document.
   */
  static async onTokenEnterTerrain(token, region) {
    if (!token || !region) return;
    const terrainData = region.flags?.trespasser?.terrain;
    if (!terrainData) return;

    // Normalize: accept both Token placeables and TokenDocuments
    const tokenDoc = token.document ?? token;
    if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
    const actor = tokenDoc.actor;
    if (!actor) return;

    // Check if we already entered this region this turn
    const enteredThisTurn = tokenDoc.flags?.trespasser?.terrainEnteredThisTurn || {};
    if (enteredThisTurn[region.id]) return;

    // Mark this region as entered this turn
    await tokenDoc.setFlag("trespasser", `terrainEnteredThisTurn.${region.id}`, true);

    const sys = terrainData.system;

    // An actor-centered terrain should not affect the actor it is centered on
    if (sys.centerMode === "actor" && sys.centerActorId === actor.id) return;

    // Execute onEnter behaviors after movement animation finishes
    const onEnterBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onEnter");
    if (onEnterBehaviors.length > 0) {
      const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
      if (tokenPlaceable) {
        if (tokenPlaceable.animationContexts?.size > 0) {
          const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
          await Promise.allSettled(promises);
        } else if (tokenPlaceable._animation) {
          await tokenPlaceable._animation;
        }
      }

      const context = this.#buildBehaviorContext(region);
      for (const behavior of onEnterBehaviors) {
        await this.executeBehavior(behavior, actor, region, context);
      }
    }

    // Notify about difficult terrain movement cost
    if ((sys.category === "difficult_terrain" || sys.category === "field") && sys.extraMovementCost > 0) {
      ui.notifications.info(
        game.i18n.format("TRESPASSER.Notification.Terrain.DifficultTerrainCost", {
          cost: sys.extraMovementCost
        })
      );
    }
  }

  /**
   * Called when a token exits a terrain region.
   * Executes behaviors with trigger "onExit".
   * @param {TokenDocument} token - The token or token document.
   * @param {RegionDocument} region - The region document.
   */
  static async onTokenExitTerrain(token, region) {
    if (!token || !region) return;
    const terrainData = region.flags?.trespasser?.terrain;
    if (!terrainData) return;

    // Normalize: accept both Token placeables and TokenDocuments
    const tokenDoc = token.document ?? token;
    if (globalThis._trespasserUndoSet?.has(tokenDoc.id)) return;
    const actor = tokenDoc.actor;
    if (!actor) return;

    // Reset enteredThisTurn for this region when leaving so re-entering triggers onEnter again if applicable
    if (tokenDoc.flags?.trespasser?.terrainEnteredThisTurn?.[region.id]) {
      await tokenDoc.unsetFlag("trespasser", `terrainEnteredThisTurn.${region.id}`);
    }

    const sys = terrainData.system;

    // An actor-centered terrain should not affect the actor it is centered on
    if (sys.centerMode === "actor" && sys.centerActorId === actor.id) return;

    // Execute onExit behaviors after movement animation finishes
    const onExitBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onExit");
    if (onExitBehaviors.length > 0) {
      const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
      if (tokenPlaceable) {
        if (tokenPlaceable.animationContexts?.size > 0) {
          const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
          await Promise.allSettled(promises);
        } else if (tokenPlaceable._animation) {
          await tokenPlaceable._animation;
        }
      }

      const context = this.#buildBehaviorContext(region);
      for (const behavior of onExitBehaviors) {
        await this.executeBehavior(behavior, actor, region, context);
      }
    }
  }

  /**
   * Called at the start of a combat turn for a token that is inside a terrain region.
   * Executes behaviors with trigger "onStartTurn".
   * @param {TokenDocument} tokenDoc - The token document.
   * @param {RegionDocument} region - The terrain region.
   */
  static async onTokenStartTurnInTerrain(tokenDoc, region) {
    if (!tokenDoc || !region) return;
    const terrainData = region.flags?.trespasser?.terrain;
    if (!terrainData) return;

    const actor = tokenDoc.actor;
    if (!actor) return;

    const sys = terrainData.system;

    // An actor-centered terrain should not affect the actor it is centered on
    if (sys.centerMode === "actor" && sys.centerActorId === actor.id) return;

    // Execute onStartTurn behaviors
    const onStartBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onStartTurn");
    if (onStartBehaviors.length > 0) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: game.i18n.format("TRESPASSER.Notification.Terrain.StartTurnEffect", {
          name: tokenDoc.name,
          terrain: region.name
        }),
        flavor: `🌍 ${region.name}`
      });

      const context = this.#buildBehaviorContext(region);
      for (const behavior of onStartBehaviors) {
        await this.executeBehavior(behavior, actor, region, context);
      }
    }
  }

  // ── Terrain Queries ─────────────────────────────────────────────────────────

  /**
   * Check if any square occupied by a token is inside a region.
   * @param {TokenDocument} tokenDoc 
   * @param {RegionDocument} region 
   * @param {number} gridSize 
   * @returns {boolean}
   */
  static isTokenInRegion(tokenDoc, region, gridSize = 100) {
    if (!tokenDoc || !region) return false;
    const w = tokenDoc.width || 1;
    const h = tokenDoc.height || 1;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const px = tokenDoc.x + (dx + 0.5) * gridSize;
        const py = tokenDoc.y + (dy + 0.5) * gridSize;
        if (this.isPointInRegion(px, py, region, gridSize)) return true;
      }
    }
    return false;
  }

  /**
   * Get all terrain regions that contain a given token.
   * Uses Foundry's built-in region.tokens set when available, falls back to point-in-region.
   * @param {TokenDocument} tokenDoc - The token document.
   * @returns {RegionDocument[]} Array of terrain regions containing the token.
   */
  static getTerrainRegionsContainingToken(tokenDoc) {
    const scene = tokenDoc.parent || canvas.scene;
    if (!scene) return [];

    const gridSize = scene.grid?.size || 100;

    return scene.regions.filter(r => {
      const terrainData = r.flags?.trespasser?.terrain;
      if (!terrainData) return false;
      
      const sys = terrainData.system;
      // An actor-centered terrain should not affect the actor it is centered on
      if (sys.centerMode === "actor") {
        const centerTokenId = r.flags?.trespasser?.centerTokenId;
        if (centerTokenId ? centerTokenId === tokenDoc.id : sys.centerActorId === tokenDoc.actor?.id) return false;
      }

      return TerrainHelper.isTokenInRegion(tokenDoc, r, gridSize);
    });
  }

  /**
   * Get all terrain regions at a specific grid square.
   * @param {number} x - Grid X coordinate
   * @param {number} y - Grid Y coordinate
   * @param {number} gridPx - Grid size in pixels
   * @returns {RegionDocument[]}
   */
  static getTerrainAtSquare(x, y, gridPx) {
    if (!canvas.ready) return [];
    const px = (x + 0.5) * gridPx;
    const py = (y + 0.5) * gridPx;
    
    return canvas.scene.regions.filter(r => {
      const terrainData = r.flags?.trespasser?.terrain;
      if (!terrainData) return false;
      return TerrainHelper.isPointInRegion(px, py, r, gridPx);
    });
  }

  /**
   * Transform an obstacle into difficult terrain (rubble).
   * @param {RegionDocument} region - The region to transform.
   */
  static async transformObstacleToRubble(region) {
    if (!region || !canvas.scene) return;
    const terrainData = region.flags?.trespasser?.terrain;
    if (!terrainData || terrainData.system.category !== "obstacle") return;
    
    const sys = terrainData.system;
    if (!sys.destructible) return;

    // Update region flags to difficult terrain
    const newTerrainData = foundry.utils.deepClone(terrainData);
    newTerrainData.system.category = "difficult_terrain";
    const rubbleText = game.i18n.localize("TRESPASSER.Terrain.Rubble") || "Rubble";
    newTerrainData.name = `${terrainData.name} (${rubbleText})`;
    
    const color = this.TERRAIN_COLORS.difficult_terrain;
    const updates = {
      _id: region.id,
      name: newTerrainData.name,
      color: color,
      "flags.trespasser.terrain": newTerrainData
    };

    await canvas.scene.updateEmbeddedDocuments("Region", [updates]);
  }

  // ── Terrain Movement ────────────────────────────────────────────────────────
  static _movementQueues = new Map();

  /**
   * Enqueue a movement segment and debounce its processing.
   * This combines split token updates (e.g. from crossing region boundaries) into one path.
   * @param {TokenDocument} tokenDoc 
   * @param {number} oldX 
   * @param {number} oldY 
   * @param {number} newX 
   * @param {number} newY 
   */
  static async processTokenMovement(tokenDoc, oldX, oldY, newX, newY, isJump = false) {
    const scene = tokenDoc.parent;
    if (!scene || !canvas.ready) return;

    if (!this._movementQueues.has(tokenDoc.id)) {
      this._movementQueues.set(tokenDoc.id, []);
    }
    this._movementQueues.get(tokenDoc.id).push({ oldX, oldY, newX, newY, isJump });

    if (!this._debounceMovementProcess) {
      this._debounceMovementProcess = foundry.utils.debounce(() => this._processQueuedMovements(), 250);
    }
    this._debounceMovementProcess();
  }

  static async _processQueuedMovements() {
    for (const [tokenId, segments] of this._movementQueues.entries()) {
      if (segments.length === 0) continue;
      
      const tokenDoc = canvas.scene?.tokens.get(tokenId) || game.scenes.active?.tokens.get(tokenId);
      if (!tokenDoc) continue;

      await this._calculateBatchedMovement(tokenDoc, segments);
    }
    this._movementQueues.clear();
  }

  /**
   * Traces the full grid path across all accumulated segments,
   * then batches terrain damage per region and applies it in one update.
   * @param {TokenDocument} tokenDoc 
   * @param {Array<{oldX, oldY, newX, newY}>} segments 
   */
  static async _calculateBatchedMovement(tokenDoc, segments) {
    const scene = tokenDoc.parent || canvas.scene;
    if (!scene) return;

    const actor = tokenDoc.actor;
    if (!actor) return;

    const gridSize = scene.grid.size;
    const tokenW = (tokenDoc.width || 1) * gridSize;
    const tokenH = (tokenDoc.height || 1) * gridSize;

    const fullPath = [];

    // Check if the overall batched movement was a jump
    const isBatchedJump = segments.some(seg => seg.isJump);

    if (isBatchedJump) {
      // If it's a jump, ignore all intermediate routing entirely. 
      // Only the final destination of the very last segment matters!
      const lastSeg = segments[segments.length - 1];
      const newGridX = Math.floor((lastSeg.newX + tokenW / 2) / gridSize);
      const newGridY = Math.floor((lastSeg.newY + tokenH / 2) / gridSize);
      fullPath.push({ x: newGridX, y: newGridY });
    } else {
      // Walk: Combine all segments into one long path of squares
      for (const seg of segments) {
        const oldGridX = Math.floor((seg.oldX + tokenW / 2) / gridSize);
        const oldGridY = Math.floor((seg.oldY + tokenH / 2) / gridSize);
        const newGridX = Math.floor((seg.newX + tokenW / 2) / gridSize);
        const newGridY = Math.floor((seg.newY + tokenH / 2) / gridSize);
        
        const segPath = this.#getGridPath(oldGridX, oldGridY, newGridX, newGridY);
        segPath.shift(); // Remove starting square of each segment
        
        // Ensure we don't duplicate identical squares if segments overlap at junction
        for (const sq of segPath) {
          if (!fullPath.some(existing => existing.x === sq.x && existing.y === sq.y)) {
            fullPath.push(sq);
          }
        }
      }
    }
    
    if (fullPath.length === 0) return;

    // Load current per-turn tracking state into memory to avoid per-square setFlag calls
    const visitedState = foundry.utils.deepClone(
      tokenDoc.flags?.trespasser?.terrainSquaresVisitedThisTurn || {}
    );
    let slipperyChecked = tokenDoc.flags?.trespasser?.slipperyCheckedThisTurn || false;

    // Accumulators
    const terrainDamageMap = new Map(); // regionId → { damage, name }
    const effectsToApply = [];          // { eff, terrainName }
    let slipperyCheckRegion = null;     // first slippery region encountered

    // Walk each square in the path
    for (const square of fullPath) {
      const squareKey = `${square.x},${square.y}`;
      const squareCenterX = (square.x + 0.5) * gridSize;
      const squareCenterY = (square.y + 0.5) * gridSize;

      for (const region of scene.regions) {
        const terrainData = region.flags?.trespasser?.terrain;
        if (!terrainData) continue;
        if (!TerrainHelper.isPointInRegion(squareCenterX, squareCenterY, region, gridSize)) continue;

        const sys = terrainData.system;

        // An actor-centered terrain should not affect the actor it is centered on
        if (sys.centerMode === "actor" && sys.centerActorId === actor.id) continue;

        // Check if already visited this square this turn
        if (!visitedState[region.id]) visitedState[region.id] = [];
        if (visitedState[region.id].includes(squareKey)) continue;
        visitedState[region.id].push(squareKey);

        // Accumulate terrain damage
        if (sys.terrainDamage > 0) {
          if (!terrainDamageMap.has(region.id)) {
            terrainDamageMap.set(region.id, { damage: 0, name: region.name });
          }
          terrainDamageMap.get(region.id).damage += sys.terrainDamage;
        }

        // Slippery check — capture first occurrence (once per turn)
        if (sys.category === "field" && sys.slippery && !slipperyChecked && !slipperyCheckRegion) {
          slipperyChecked = true;
          slipperyCheckRegion = region;
        }

        // Collect onMove behaviors
        const onMoveBehaviors = (sys.behaviors || []).filter(b => b.trigger === "onMove");
        for (const behavior of onMoveBehaviors) {
          if (behavior.action === "applyEffect") {
            const effList = (behavior.effects && behavior.effects.length > 0)
              ? behavior.effects
              : (behavior.effectUuid ? [{ uuid: behavior.effectUuid, name: behavior.effectName, img: behavior.effectImg, intensity: behavior.effectIntensity }] : []);

            for (const eff of effList) {
              if (!eff.uuid) continue;
              const rawIntensity = this.resolveIntPlaceholder(eff.intensity || "1", region);
              const intensity = this.evaluateIntensityValue(rawIntensity, 1);
              effectsToApply.push({
                eff: {
                  uuid: eff.uuid,
                  name: eff.name,
                  img: eff.img,
                  intensity: intensity
                },
                terrainName: region.name
              });
            }
          } else {
            // Non-effect behaviors execute inline
            const context = this.#buildBehaviorContext(region);
            await this.executeBehavior(behavior, actor, region, context);
          }
        }
      }
    }

    // Batch-update tracking flags in one call
    const flagUpdates = {
      "flags.trespasser.terrainSquaresVisitedThisTurn": visitedState
    };
    if (slipperyChecked && !tokenDoc.flags?.trespasser?.slipperyCheckedThisTurn) {
      flagUpdates["flags.trespasser.slipperyCheckedThisTurn"] = true;
    }
    await tokenDoc.update(flagUpdates);

    // Group effects by UUID and sum their intensities
    const groupedEffects = new Map(); // uuid → { eff, totalIntensity, terrainNames }
    for (const { eff, terrainName } of effectsToApply) {
      const effInt = (eff.intensity !== undefined && eff.intensity !== null && !isNaN(Number(eff.intensity))) ? Number(eff.intensity) : 0;
      if (groupedEffects.has(eff.uuid)) {
        const existing = groupedEffects.get(eff.uuid);
        existing.totalIntensity += effInt;
        existing.terrainNames.add(terrainName);
      } else {
        groupedEffects.set(eff.uuid, {
          eff,
          totalIntensity: effInt,
          terrainNames: new Set([terrainName])
        });
      }
    }

    if (terrainDamageMap.size > 0 || groupedEffects.size > 0 || slipperyCheckRegion) {
      // Wait for token movement animation to finish on canvas before applying damage and effects
      const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
      if (tokenPlaceable) {
        if (tokenPlaceable.animationContexts?.size > 0) {
          const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
          await Promise.allSettled(promises);
        } else if (tokenPlaceable._animation) {
          await tokenPlaceable._animation;
        }
      }

      // Batch-create effect items on the actor with summed intensities
      for (const [uuid, data] of groupedEffects) {
        const sourceEffect = await fromUuid(uuid);
        if (!sourceEffect) continue;
        const effectData = sourceEffect.toObject();
        effectData.system.intensity = data.totalIntensity;
        delete effectData._id;
        await Item.createDocuments([effectData], { parent: actor });
      }

      // Apply accumulated terrain damage — one HP update at end of movement
      let totalDamage = 0;
      if (terrainDamageMap.size > 0) {
        for (const [, data] of terrainDamageMap) {
          totalDamage += data.damage;
        }
        if (typeof actor.applyDamage === "function") {
          await actor.applyDamage(totalDamage);
        } else {
          const newHp = Math.max(0, (actor.system.health ?? 0) - totalDamage);
          await actor.update({ "system.health": newHp });
        }
      }

      // Build and post ONE combined summary chat message
      if (terrainDamageMap.size > 0 || groupedEffects.size > 0) {
        await this.#postMovementSummary(tokenDoc, actor, terrainDamageMap, groupedEffects);
      }

      // Handle slippery check (after summary, since the prompt is interactive)
      if (slipperyCheckRegion) {
        await this.#handleSlipperyCheck(tokenDoc, actor, slipperyCheckRegion);
      }
    }

    // ALWAYS synchronize whileInside effects for this moving token (e.g. removes effects when exiting)
    await this.syncWhileInsideEffectsForToken(tokenDoc);

    // If this token has an aura terrain attached, synchronize all tokens on the scene
    const auraRegions = scene.regions.filter(r => {
      const t = r.flags?.trespasser?.terrain;
      if (t?.system?.centerMode !== "actor") return false;
      const centerTokenId = r.flags?.trespasser?.centerTokenId;
      return centerTokenId ? centerTokenId === tokenDoc.id : (t.system.centerActorId === actor.id || r.flags?.trespasser?.centerActorId === actor.id);
    });
    if (auraRegions.length > 0) {
      for (const auraRegion of auraRegions) {
        await this.syncWhileInsideEffectsForRegion(auraRegion);
      }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /**
   * Clean up regions spawned in combat when combat ends.
   */
  static async cleanupCombatTerrains() {
    if (!game.user.isGM) return;
    const scenes = game.scenes?.contents || [];
    for (const scene of scenes) {
      const regionsToDelete = scene.regions
        .filter(r => {
          const flags = r.flags?.trespasser || {};
          return flags.spawnedInCombat === true && !flags.linkedEffectId && scene.regions.has(r.id);
        })
        .map(r => r.id);
      
      if (regionsToDelete.length > 0) {
        try {
          await scene.deleteEmbeddedDocuments("Region", regionsToDelete);
        } catch (err) {
          console.warn("Trespasser | Combat terrain cleanup skipped:", err);
        }
      }
    }
  }

  /**
   * Checks whether a terrain region is linked to a specific effect item.
   * @param {RegionDocument} region 
   * @param {Item} effectItem 
   * @returns {boolean}
   */
  static isRegionLinkedToEffect(region, effectItem) {
    if (!region || !effectItem) return false;
    if (effectItem.flags?.trespasser?.whileInside) return false;
    const flags = region.flags?.trespasser;
    if (!flags) return false;

    const linkedId = flags.linkedEffectId;
    const linkedUuid = flags.linkedEffectUuid;
    const terrainLinkedEffects = flags.terrain?.system?.linkedEffects || [];
    const terrainLinkedUuid = flags.terrain?.system?.linkedEffect?.uuid;
    const terrainLinkedKey = flags.terrain?.system?.linkedEffectKey;
    const terrainLinkedName = flags.terrain?.system?.linkedEffect?.name;

    const effectId = effectItem.id;
    const effectUuid = effectItem.uuid;
    const effectName = effectItem.name;
    const sourceUuid = effectItem.flags?.trespasser?.sourceEffectUuid || effectItem.flags?.trespasser?.linkedSource;

    const casterActorId = flags.casterActorId || flags.centerActorId || flags.terrain?.system?.centerActorId;
    const casterActorUuid = flags.casterActorUuid;

    // If region has a specific casterActorId, verify it matches effect's parent if both exist
    if (casterActorId && effectItem.parent?.id && effectItem.parent.id !== casterActorId && effectItem.parent?.uuid !== casterActorUuid) {
      return false;
    }

    // Check direct ID or UUID matches
    if (linkedId && (linkedId === effectId || linkedId === effectUuid || (sourceUuid && linkedId === sourceUuid))) return true;
    if (linkedUuid && (linkedUuid === effectId || linkedUuid === effectUuid || (sourceUuid && linkedUuid === sourceUuid))) return true;
    if (terrainLinkedUuid && (terrainLinkedUuid === effectId || terrainLinkedUuid === effectUuid || (sourceUuid && terrainLinkedUuid === sourceUuid))) return true;
    if (terrainLinkedKey && (terrainLinkedKey === effectId || terrainLinkedKey === effectUuid || (sourceUuid && terrainLinkedKey === sourceUuid))) return true;

    const clean = (s) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim().toLowerCase();
    const effClean = clean(effectName);

    if (terrainLinkedName) {
      const lClean = clean(terrainLinkedName);
      if (effClean === lClean || (lClean.length > 3 && (effClean.includes(lClean) || lClean.includes(effClean)))) return true;
    }

    for (const le of terrainLinkedEffects) {
      if (le.uuid && (le.uuid === effectId || le.uuid === effectUuid || (sourceUuid && le.uuid === sourceUuid))) return true;
      if (le.name) {
        const leClean = clean(le.name);
        if (effClean === leClean || (leClean.length > 3 && (effClean.includes(leClean) || leClean.includes(effClean)))) return true;
      }
    }

    return false;
  }

  /**
   * Clean up regions linked to an effect when it is deleted.
   * @param {Item} effectItem 
   */
  static async onEffectDeleted(effectItem) {
    if (!effectItem || !game.user.isGM || effectItem.flags?.trespasser?.whileInside) return;
    const scenes = game.scenes?.contents || [];
    for (const scene of scenes) {
      const regionsToDelete = scene.regions
        .filter(r => scene.regions.has(r.id) && this.isRegionLinkedToEffect(r, effectItem))
        .map(r => r.id);
      
      const validIds = regionsToDelete.filter(id => scene.regions.has(id));
      if (validIds.length > 0) {
        try {
          await scene.deleteEmbeddedDocuments("Region", validIds);
        } catch (err) {
          console.warn("Trespasser | Region deletion skipped:", err);
        }
      }
    }
  }

  /**
   * Called when an effect item's intensity changes on an actor.
   * Propagates intensity updates to all linked terrain regions and active whileInside effects.
   * @param {Item} effectItem 
   * @param {object} [changes] 
   */
  static async onEffectIntensityUpdated(effectItem, changes = {}) {
    if (!effectItem || effectItem.type !== "effect" || effectItem.flags?.trespasser?.whileInside) return;

    const scenes = game.scenes?.contents || [];
    for (const scene of scenes) {
      const linkedRegions = scene.regions.filter(r => this.isRegionLinkedToEffect(r, effectItem));
      for (const region of linkedRegions) {
        await this.syncWhileInsideEffectsForRegion(region);
      }
    }
  }

  // ── While Inside Effect Synchronization ─────────────────────────────────────

  static _syncWhileInsideLocks = new Set();
  static _pendingWhileInsideSync = new Set();

  /**
   * Synchronize "whileInside" behavior effects on an actor based on the terrain regions
   * currently containing their token.
   * @param {TokenDocument} tokenDoc 
   */
  static async syncWhileInsideEffectsForToken(tokenDoc) {
    if (!tokenDoc || !tokenDoc.actor) return;
    const actor = tokenDoc.actor;
    if (!actor.isOwner && !game.user.isGM) return;
    const scene = tokenDoc.parent || canvas.scene;
    if (!scene) return;

    const lockKey = actor.uuid || (actor.isToken ? tokenDoc.id : actor.id);
    if (this._syncWhileInsideLocks.has(lockKey)) {
      this._pendingWhileInsideSync.add(lockKey);
      return;
    }
    this._syncWhileInsideLocks.add(lockKey);

    try {
      const containingRegions = this.getTerrainRegionsContainingToken(tokenDoc);
      const desiredEffects = [];

      for (const region of containingRegions) {
        const terrainData = region.flags?.trespasser?.terrain;
        if (!terrainData) continue;
        const sys = terrainData.system;
        const centerTokenId = region.flags?.trespasser?.centerTokenId;
        if (sys.centerMode === "actor") {
          if (centerTokenId ? centerTokenId === tokenDoc.id : sys.centerActorId === actor.id) continue;
        }

        const whileInsideBehaviors = (sys.behaviors || []).filter(b => b.trigger === "whileInside" && b.action === "applyEffect");
        for (const behavior of whileInsideBehaviors) {
          const effList = (behavior.effects && behavior.effects.length > 0)
            ? behavior.effects
            : (behavior.effectUuid ? [{ uuid: behavior.effectUuid, name: behavior.effectName, img: behavior.effectImg, intensity: behavior.effectIntensity }] : []);

          for (const eff of effList) {
            if (!eff.uuid) continue;
            // Prevent duplicate desired entries from the same region
            if (desiredEffects.some(d => d.regionId === region.id && d.effectUuid === eff.uuid)) continue;

            const rawIntensity = this.resolveIntPlaceholder(eff.intensity || "1", region);
            const intensity = this.evaluateIntensityValue(rawIntensity, 1);
            desiredEffects.push({
              regionId: region.id,
              effectUuid: eff.uuid,
              name: eff.name,
              img: eff.img,
              intensity: intensity,
              intensityFormula: eff.intensity || "1"
            });
          }
        }
      }

      // Find existing whileInside effects on the actor
      const existingEffects = actor.items.filter(i => i.type === "effect" && i.flags?.trespasser?.whileInside === true);

      // Remove effects that are no longer desired (token left the region)
      const toDelete = [];
      for (const eff of existingEffects) {
        const regionId = eff.flags?.trespasser?.sourceRegionId;
        const sourceUuid = eff.flags?.trespasser?.sourceEffectUuid;
        const stillDesired = desiredEffects.some(d => d.regionId === regionId && d.effectUuid === sourceUuid);
        if (!stillDesired) {
          toDelete.push(eff.id);
        }
      }
      if (toDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", toDelete);
      }

      // Add missing desired effects OR update intensity if changed
      const toUpdate = [];
      for (const desired of desiredEffects) {
        const existing = existingEffects.find(e =>
          !toDelete.includes(e.id) &&
          e.flags?.trespasser?.sourceRegionId === desired.regionId &&
          (e.flags?.trespasser?.sourceEffectUuid === desired.effectUuid || e.flags?.trespasser?.linkedSource === desired.effectUuid || e.uuid === desired.effectUuid)
        );
        if (!existing) {
          const sourceEffect = await fromUuid(desired.effectUuid);
          if (!sourceEffect) continue;
          const effectData = sourceEffect.toObject();
          effectData.system.intensity = desired.intensity;
          effectData.flags = effectData.flags || {};
          effectData.flags.trespasser = Object.assign(effectData.flags.trespasser || {}, {
            whileInside: true,
            sourceRegionId: desired.regionId,
            sourceEffectUuid: desired.effectUuid,
            sourceIntensityFormula: desired.intensityFormula
          });
          delete effectData._id;
          await Item.createDocuments([effectData], { parent: actor });
        } else if (existing.system.intensity !== desired.intensity) {
          toUpdate.push({
            _id: existing.id,
            "system.intensity": desired.intensity
          });
        }
      }
      if (toUpdate.length > 0) {
        await actor.updateEmbeddedDocuments("Item", toUpdate);
      }
    } finally {
      this._syncWhileInsideLocks.delete(lockKey);
      if (this._pendingWhileInsideSync.has(lockKey)) {
        this._pendingWhileInsideSync.delete(lockKey);
        const freshTokenDoc = scene.tokens?.get(tokenDoc.id) || tokenDoc;
        this.syncWhileInsideEffectsForToken(freshTokenDoc);
      }
    }
  }

  /**
   * Synchronize "whileInside" effects for all tokens in a region's scene.
   * @param {RegionDocument} region 
   */
  static async syncWhileInsideEffectsForRegion(region) {
    if (!region) return;
    const scene = region.parent;
    if (!scene) return;
    for (const tokenDoc of scene.tokens) {
      if (tokenDoc.actor) {
        await this.syncWhileInsideEffectsForToken(tokenDoc);
      }
    }
  }

  /**
   * Remove all "whileInside" effects originating from a deleted region from all actors.
   * @param {string} regionId 
   */
  static async cleanupWhileInsideEffectsForRegion(regionId) {
    if (!regionId || !game.user.isGM) return;
    const processedActorUuids = new Set();

    const cleanActor = async (actor) => {
      const actorKey = actor.uuid || (actor.isToken ? `${actor.token?.id || actor.parent?.id}_${actor.id}` : actor.id);
      if (!actorKey || processedActorUuids.has(actorKey)) return;
      processedActorUuids.add(actorKey);

      this._syncWhileInsideLocks.delete(actorKey);
      this._pendingWhileInsideSync.delete(actorKey);

      const effectsToDelete = actor.items.filter(i =>
        i.type === "effect" &&
        i.flags?.trespasser?.whileInside === true &&
        i.flags?.trespasser?.sourceRegionId === regionId
      ).map(i => i.id);

      if (effectsToDelete.length > 0) {
        const finalValid = effectsToDelete.filter(id => actor.items.has(id));
        if (finalValid.length > 0) {
          try {
            await actor.deleteEmbeddedDocuments("Item", finalValid);
          } catch (err) {
            console.warn("Trespasser | While-inside effect deletion skipped:", err);
          }
        }
      }
    };

    // 1. Process all tokens across all scenes (covers unlinked synthetic actors per token, and placed linked actors)
    const scenes = game.scenes?.contents || [];
    for (const scene of scenes) {
      for (const tokenDoc of scene.tokens) {
        if (tokenDoc.actor) {
          await cleanActor(tokenDoc.actor);
        }
      }
    }

    // 2. Process all world actors (covers linked actors without placed tokens or placed on unrendered scenes)
    for (const actor of (game.actors?.contents || [])) {
      await cleanActor(actor);
    }
  }

  // ── Behavior Execution ──────────────────────────────────────────────────────

  /**
   * Execute a single terrain behavior action.
   * @param {object} behavior - A behavior entry from the terrain's behaviors array.
   * @param {Actor} actor - The affected actor.
   * @param {RegionDocument} terrainRegion - The terrain region document.
   * @param {object} context - Execution context { casterActor, linkedIntensity, pathSquares }.
   */
  static async executeBehavior(behavior, actor, terrainRegion, context = {}) {
    const { casterActor, linkedIntensity } = context;

    switch (behavior.action) {
      case "applyEffect": {
        if (!actor) return;
        const effList = (behavior.effects && behavior.effects.length > 0)
          ? behavior.effects
          : (behavior.effectUuid ? [{ uuid: behavior.effectUuid, name: behavior.effectName, img: behavior.effectImg, intensity: behavior.effectIntensity }] : []);

        if (effList.length === 0) return;

        const toCreate = [];
        for (const eff of effList) {
          if (!eff.uuid) continue;
          const sourceEffect = await fromUuid(eff.uuid);
          if (!sourceEffect) continue;
          const effectData = sourceEffect.toObject();
          const rawIntensity = this.resolveIntPlaceholder(eff.intensity || "1", terrainRegion);
          const intensity = this.evaluateIntensityValue(rawIntensity, 0);
          effectData.system.intensity = intensity;
          effectData.flags = effectData.flags || {};
          effectData.flags.trespasser = Object.assign(effectData.flags.trespasser || {}, {
            sourceRegionId: terrainRegion.id,
            sourceEffectUuid: eff.uuid,
            sourceIntensityFormula: eff.intensity || "1",
            sourceLinkedEffectUuid: terrainRegion.flags?.trespasser?.linkedEffectId || terrainRegion.flags?.trespasser?.terrain?.system?.linkedEffect?.uuid || null
          });
          delete effectData._id;
          toCreate.push(effectData);
        }

        if (toCreate.length > 0) {
          await Item.createDocuments(toCreate, { parent: actor });
          const effectNames = toCreate.map(e => e.name).join(", ");
          ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: game.i18n.format("TRESPASSER.Notification.Terrain.EffectApplied", {
              name: actor.name,
              effect: effectNames,
              terrain: terrainRegion.name
            }),
            flavor: `🌍 ${terrainRegion.name}`
          });
        }
        break;
      }

      case "forcedMovement": {
        const distStr = this.resolveIntPlaceholder(behavior.forcedMovementDistance, terrainRegion);
        const distance = this.evaluateIntensityValue(distStr, 0);
        if (distance <= 0) return;

        const token = actor.token?.object ||
          canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
        if (!token) return;

        // Execute the forced movement with direction mode
        await ForcedMovementHelper.executeForcedMovement(
          null, [token],
          behavior.forcedMovementType, distance,
          {
            direction: behavior.forcedMovementDirection,
            terrainRegion,
            pathSquares: terrainRegion.flags?.trespasser?.pathSquares
          }
        );
        break;
      }

      case "damage": {
        if (!actor) return;
        let formula = this.resolveIntPlaceholder(behavior.damageFormula, terrainRegion);
        // Resolve <sd>, <wd> placeholders
        const resolveActor = casterActor || actor;
        formula = TrespasserEffectsHelper.replacePlaceholders(formula, resolveActor);
        if (!formula) return;

        const roll = new foundry.dice.Roll(formula);
        await roll.evaluate();

        // Apply damage to actor via actor.applyDamage (updates health and triggers shake + floating text)
        if (typeof actor.applyDamage === "function") {
          await actor.applyDamage(roll.total);
        } else {
          const currentHp = actor.system.health ?? 0;
          const newHp = Math.max(0, currentHp - roll.total);
          await actor.update({ "system.health": newHp });
        }

        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `🌍 ${terrainRegion.name} — ${game.i18n.localize("TRESPASSER.Sheet.Terrain.Fields.TerrainDamage")}`
        });
        break;
      }

      case "script": {
        if (behavior.script) {
          try {
            const fn = new Function("actor", "terrain", "region", "context", behavior.script);
            await fn(actor, terrainRegion.flags?.trespasser?.terrain, terrainRegion, context);
          } catch (e) {
            console.error("Trespasser | Terrain script error", e);
          }
        }
        break;
      }
    }
  }

  /**
   * Safely evaluates an intensity string or formula to a numeric integer.
   * @param {string|number} str
   * @param {number} [defaultValue=1]
   * @returns {number}
   */
  static evaluateIntensityValue(str, defaultValue = 1) {
    if (typeof str === "number") return Math.max(0, Math.round(str));
    if (!str || typeof str !== "string") return defaultValue;
    const cleaned = str.trim();
    if (/^-?\d+$/.test(cleaned)) return Math.max(0, parseInt(cleaned, 10));
    try {
      if (/^[0-9+\-*/().\s,maxmin]+$/i.test(cleaned)) {
        const roll = new foundry.dice.Roll(cleaned);
        if (roll.isDeterministic) {
          roll.evaluateSync();
          return Math.max(0, Math.round(roll.total));
        }
      }
    } catch (e) {
      console.warn("Trespasser | Failed to evaluate intensity expression:", cleaned, e);
    }
    return Math.max(0, parseInt(cleaned, 10) || defaultValue);
  }

  /**
   * Resolve the <Int> placeholder in a string using the terrain's linked effect intensity.
   * @param {string} str - The string potentially containing "<Int>".
   * @param {RegionDocument} terrainRegion - The terrain region document.
   * @returns {string} The resolved string.
   */
  static resolveIntPlaceholder(str, terrainRegion) {
    if (!str || typeof str !== "string") return str || "0";
    if (!str.includes("<Int>") && !str.includes("<int>")) return str;

    const intensity = this.getLinkedIntensity(terrainRegion);
    return str.replace(/<Int>/gi, String(intensity));
  }

  /**
   * Get the dynamic intensity from the terrain's linked effect on the caster.
   * @param {RegionDocument} terrainRegion - The terrain region document.
   * @returns {number} The current intensity of the linked effect, or 0.
   */
  static getLinkedIntensity(terrainRegion) {
    const flags = terrainRegion.flags?.trespasser;
    if (!flags) return 0;

    const terrainSys = flags.terrain?.system;
    const linkedKey = flags.linkedEffectId || terrainSys?.linkedEffect?.uuid || terrainSys?.linkedEffectKey;
    const linkedUuid = flags.linkedEffectUuid;
    const linkedName = terrainSys?.linkedEffect?.name;
    const casterActorId = flags.casterActorId || flags.centerActorId || terrainSys?.centerActorId;
    const casterActorUuid = flags.casterActorUuid;

    const clean = (s) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim().toLowerCase();

    // 1. Direct document lookup if linkedUuid or linkedKey is an embedded item UUID
    for (const key of [linkedUuid, linkedKey]) {
      if (key) {
        try {
          const directDoc = fromUuidSync(key);
          if (directDoc && directDoc.type === "effect") {
            const intVal = Number(directDoc.system?.intensity);
            return isNaN(intVal) ? 0 : intVal;
          }
        } catch {}
      }
    }

    // Helper to test if an effect item on an actor is the matching linked effect
    const isMatchingEffect = (i) => {
      if (i.type !== "effect") return false;
      if (linkedKey && (i.id === linkedKey || i.uuid === linkedKey || i.flags?.trespasser?.sourceEffectUuid === linkedKey || i.flags?.trespasser?.linkedSource === linkedKey)) return true;
      if (linkedUuid && (i.id === linkedUuid || i.uuid === linkedUuid || i.flags?.trespasser?.sourceEffectUuid === linkedUuid || i.flags?.trespasser?.linkedSource === linkedUuid)) return true;

      const iClean = clean(i.name);
      if (linkedName) {
        const lClean = clean(linkedName);
        if (iClean === lClean || (lClean.length > 3 && (iClean.includes(lClean) || lClean.includes(iClean)))) return true;
      }

      if (terrainSys?.linkedEffects?.length > 0) {
        for (const le of terrainSys.linkedEffects) {
          if (le.uuid && (i.id === le.uuid || i.uuid === le.uuid || i.flags?.trespasser?.sourceEffectUuid === le.uuid || i.flags?.trespasser?.linkedSource === le.uuid)) return true;
          if (le.name) {
            const leClean = clean(le.name);
            if (iClean === leClean || (leClean.length > 3 && (iClean.includes(leClean) || leClean.includes(iClean)))) return true;
          }
        }
      }
      return false;
    };

    // 2. Resolve caster actor
    let casterActor = null;
    if (casterActorUuid) {
      try {
        const doc = fromUuidSync(casterActorUuid);
        casterActor = doc?.actor || (doc?.documentName === "Actor" ? doc : null);
      } catch {}
    }
    if (!casterActor && casterActorId) {
      casterActor = game.actors?.get(casterActorId) || canvas.tokens?.get(casterActorId)?.actor || canvas.scene?.tokens?.get(casterActorId)?.actor;
    }

    if (casterActor) {
      const effect = casterActor.items.find(isMatchingEffect);
      if (effect) {
        const intVal = Number(effect.system?.intensity);
        return isNaN(intVal) ? 0 : intVal;
      }
    }

    // 3. Search all scene tokens and game actors as fallback
    const candidates = [];
    if (canvas.scene?.tokens) {
      for (const t of canvas.scene.tokens) {
        if (t.actor && !candidates.includes(t.actor)) candidates.push(t.actor);
      }
    }
    for (const a of (game.actors || [])) {
      if (!candidates.includes(a)) candidates.push(a);
    }

    for (const actor of candidates) {
      const effect = actor.items.find(isMatchingEffect);
      if (effect) {
        const intVal = Number(effect.system?.intensity);
        return isNaN(intVal) ? 0 : intVal;
      }
    }

    return 0;
  }

  /**
   * Build the behavior execution context from a terrain region's flags.
   * @param {RegionDocument} region
   * @returns {object}
   * @private
   */
  static #buildBehaviorContext(region) {
    const flags = region.flags?.trespasser || {};
    const casterActorId = flags.casterActorId;
    return {
      casterActor: casterActorId ? game.actors.get(casterActorId) : null,
      linkedIntensity: this.getLinkedIntensity(region),
      pathSquares: flags.pathSquares || []
    };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Post a single combined chat message summarizing all terrain damage and effects
   * from a token's movement through terrain regions.
   * @param {TokenDocument} tokenDoc - The token document.
   * @param {Actor} actor - The actor.
   * @param {Map} terrainDamageMap - regionId → { damage, name }.
   * @param {Map} groupedEffects - uuid → { eff, totalIntensity, terrainNames }.
   */
  static async #postMovementSummary(tokenDoc, actor, terrainDamageMap, groupedEffects) {
    const lines = [];

    // Terrain damage lines
    for (const [, data] of terrainDamageMap) {
      lines.push(`<li><span style="color:var(--trp-red, #c44);">⚡ ${data.damage} ${game.i18n.localize("TRESPASSER.Sheet.Terrain.Fields.TerrainDamage")}</span> — ${data.name}</li>`);
    }

    // Effect lines with summed intensity
    for (const [, data] of groupedEffects) {
      const img = data.eff.img ? `<img src="${data.eff.img}" width="16" height="16" style="border:none; vertical-align:middle; margin-right:4px;">` : "";
      const terrains = [...data.terrainNames].join(", ");
      lines.push(`<li>${img}<strong>${data.eff.name}</strong> (${data.totalIntensity}) — ${terrains}</li>`);
    }

    const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flavor: `🌍 ${game.i18n.format("TRESPASSER.Notification.Terrain.MovementSummary", { name: tokenDoc.name })}`
    });
  }

  /**
   * Apply an effect from the terrain's effect array to an actor.
   * @param {Actor} actor - The target actor.
   * @param {Object} eff - The effect data {uuid, type, name, img, intensity}.
   * @param {string} terrainName - The terrain region name for chat messages.
   */
  static async #applyEffect(actor, eff, terrainName) {
    const sourceEffect = await fromUuid(eff.uuid);
    if (!sourceEffect) return;

    const effectData = sourceEffect.toObject();
    effectData.system.intensity = (eff.intensity !== undefined && eff.intensity !== null && eff.intensity !== "" && !isNaN(Number(eff.intensity)))
      ? Number(eff.intensity)
      : (sourceEffect.system?.intensity ?? 0);
    delete effectData._id;
    await Item.createDocuments([effectData], { parent: actor });

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("TRESPASSER.Notification.Terrain.EffectApplied", {
        name: actor.name,
        effect: eff.name,
        terrain: terrainName
      }),
      flavor: `🌍 ${terrainName}`
    });
  }

  /**
   * Handle the slippery terrain check for a token.
   * Prompts an AGILITY | ACROBATICS vs 10 check using TrespasserRollDialog.
   * Posts result to chat only (toppled to be defined later).
   * @param {TokenDocument} tokenDoc 
   * @param {Actor} actor 
   * @param {RegionDocument} region 
   */
  static async #handleSlipperyCheck(tokenDoc, actor, region) {
    // Attributes are plain NumberFields: actor.system.attributes.agility = 3
    const agilityBase = actor.system.attributes?.agility ?? 0;
    // Effect/permanent bonuses from the derived bonuses field
    const agilityBonus = actor.system.bonuses?.agility ?? 0;
    const totalAgility = agilityBase + agilityBonus;

    // Skills are BooleanFields: actor.system.skills.acrobatics = true/false
    // When trained, the skill bonus is actor.system.skill (the proficiency bonus)
    const isAcrobaticsTrained = actor.system.skills?.acrobatics === true;
    const acrobaticsBonus = isAcrobaticsTrained ? (actor.system.skill ?? 0) : 0;

    const totalBonus = totalAgility + acrobaticsBonus;

    // Prompt the player with the roll dialog
    const result = await TrespasserRollDialog.wait({
      dice: "1d20",
      bonuses: [
        { label: game.i18n.localize("TRESPASSER.Terms.Attribute.Agility"), value: totalAgility },
        { label: game.i18n.localize("TRESPASSER.Terms.Skill.Acrobatics"), value: acrobaticsBonus }
      ],
      showCD: true,
      cd: 10
    }, {
      title: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperyPrompt", { name: tokenDoc.name })
    });

    // If user cancelled the dialog, skip the check
    if (!result) return;

    const modifier = result.modifier || 0;
    const cd = result.cd || 10;

    // Roll
    const roll = new foundry.dice.Roll(`1d20 + ${totalBonus} + ${modifier}`);
    await roll.evaluate();

    const total = roll.total;
    const success = total >= cd;

    // Post roll to chat
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperyPrompt", { name: tokenDoc.name })
    });

    // Post result to chat
    if (success) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperySuccess", {
          name: tokenDoc.name,
          total: total
        }),
        flavor: `🧊 ${region.name}`
      });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperyFail", {
          name: tokenDoc.name,
          total: total
        }),
        flavor: `🧊 ${region.name}`
      });
    }
  }

  /**
   * Trace a grid path between two grid coordinates using Bresenham's line algorithm.
   * Returns all grid cells along the straight line from start to end (inclusive).
   * @param {number} x0 - Start grid X.
   * @param {number} y0 - Start grid Y.
   * @param {number} x1 - End grid X.
   * @param {number} y1 - End grid Y.
   * @returns {{x: number, y: number}[]} Array of grid coordinates.
   */
  static #getGridPath(x0, y0, x1, y1) {
    const path = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;
    while (true) {
      path.push({ x: cx, y: cy });
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
    return path;
  }

  /**
   * Check if a point is inside a region's shapes.
   * @param {number} px - Point X coordinate (canvas pixels).
   * @param {number} py - Point Y coordinate (canvas pixels).
   * @param {RegionDocument} region - The region document.
   * @param {number} gridSize - The grid square size in pixels.
   * @returns {boolean}
   */
  static isPointInRegion(px, py, region, gridSize = 100) {
    if (!region) return false;
    const doc = region.document ?? region;
    if (typeof doc.testPoint === "function") {
      try {
        const result = doc.testPoint({ x: px, y: py }, doc.elevation ?? 0);
        if (result) return true;
      } catch {}
    }

    // Check stored pathSquares flag if present
    const flags = doc.flags?.trespasser || {};
    if (flags.pathSquares && Array.isArray(flags.pathSquares) && flags.pathSquares.length > 0) {
      const gX = Math.floor(px / gridSize);
      const gY = Math.floor(py / gridSize);
      if (flags.pathSquares.some(sq => sq.x === gX && sq.y === gY)) {
        return true;
      }
    }

    const shapes = doc.shapes || [];
    for (const shape of shapes) {
      if (shape.type === "rectangle") {
        if (px >= shape.x && px <= shape.x + shape.width &&
            py >= shape.y && py <= shape.y + shape.height) {
          return true;
        }
      } else if (shape.type === "emanation" && shape.base) {
        let baseX = 0, baseY = 0, baseW = gridSize, baseH = gridSize;
        if (shape.base.uuid) {
          try {
            const tokenDoc = fromUuidSync(shape.base.uuid) || (canvas.tokens?.get(shape.base.uuid.split(".").pop())?.document);
            if (tokenDoc) {
              baseX = tokenDoc.x;
              baseY = tokenDoc.y;
              baseW = (tokenDoc.width || 1) * gridSize;
              baseH = (tokenDoc.height || 1) * gridSize;
            }
          } catch {}
        } else {
          baseX = shape.base.x ?? 0;
          baseY = shape.base.y ?? 0;
          baseW = (shape.base.width || 1) * gridSize;
          baseH = (shape.base.height || 1) * gridSize;
        }
        const radius = (shape.radius || 0) * gridSize;
        if (px >= baseX - radius && px <= baseX + baseW + radius &&
            py >= baseY - radius && py <= baseY + baseH + radius) {
          return true;
        }
      } else if (shape.type === "circle" || shape.type === "ellipse") {
        const rx = (shape.radiusX ?? shape.radius ?? 0);
        const ry = (shape.radiusY ?? shape.radius ?? 0);
        if (rx > 0 && ry > 0) {
          const dx = (px - shape.x) / rx;
          const dy = (py - shape.y) / ry;
          if ((dx * dx + dy * dy) <= 1) return true;
        }
      } else if (shape.type === "polygon" && Array.isArray(shape.points) && shape.points.length >= 6) {
        const pts = shape.points;
        let inside = false;
        for (let i = 0, j = pts.length - 2; i < pts.length; i += 2) {
          const xi = pts[i], yi = pts[i + 1];
          const xj = pts[j], yj = pts[j + 1];
          const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
          j = i;
        }
        if (inside) return true;
      }
    }
    return false;
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
