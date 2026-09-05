import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { TerrainHelper } from "../terrain-helper.mjs";
import { CanvasInputSession } from "../../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../../canvas/canvas-selection-renderer.mjs";
import { RangeHelper } from "../range-helper.mjs";
import { resolveItem } from "../item-resolver.mjs";

export class SpawnTerrainBehavior {
  /**
   * 4. spawnTerrain: Places a terrain item on the canvas as a Region and tags context objects
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    if (!params.terrainUuid) return true;

    const terrainItem = await resolveItem(params.terrainUuid, { type: "terrain" });
    if (!terrainItem) return true;

    const { DeedPotencyHelper } = await import("./potency-helper.mjs");
    await DeedPotencyHelper.ensurePotencyAllocations(context, actor, item, phaseKey);
    const addedPotency = DeedPotencyHelper.getTerrainPotency(context, behavior.id);

    const defaultTerrainInt = DeedPotencyHelper.parseIntensity(terrainItem.system?.linkedEffects?.[0]?.intensity, 1);
    const baseIntensity = DeedPotencyHelper.parseIntensity(params.intensity, defaultTerrainInt);
    const finalIntensity = baseIntensity + addedPotency;

    const placement = params.placement || "on_target";
    const gridSize = canvas.grid?.size || 100;
    const options = {
      spawnedInCombat: Boolean(game.combat),
      casterActorId: actor?.id || null,
      casterActorUuid: actor?.uuid || null,
      sourceItemId: item?.id || null,
      intensity: finalIntensity,
      linkedEffectId: null,
      linkedEffectUuid: null
    };

    // 1. Grant Linked Effects to Caster if configured
    const hasLinked = await DeedPotencyHelper.hasLinkedEffect(terrainItem);
    if (hasLinked && actor) {
      await this.#ensureCasterLinkedEffect(terrainItem, actor, options, finalIntensity, baseIntensity, addedPotency, behavior.id, context);
    }

    const targetPositions = [];

    if (placement === "selected_area") {
      const targetArea = DeedBehaviorUtils.resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoAreaSelected") || "No selected area found for terrain placement.");
        return false;
      }
      let evalSquares = targetArea.squares;

      if (params.ignoreSourceSquare) {
        const sourceToken = DeedBehaviorUtils.findToken(actor);
        if (sourceToken) {
          const srcX = context.sourcePosition?.x ?? sourceToken.document?.x ?? sourceToken.x;
          const srcY = context.sourcePosition?.y ?? sourceToken.document?.y ?? sourceToken.y;
          const srcGx = Math.floor(srcX / gridSize);
          const srcGy = Math.floor(srcY / gridSize);

          evalSquares = evalSquares.filter(sq => {
            const sqGx = Math.floor(sq.x / gridSize);
            const sqGy = Math.floor(sq.y / gridSize);
            return !(sqGx === srcGx && sqGy === srcGy);
          });
        }
      }

      options.pathSquares = evalSquares.map(sq => ({ x: Math.floor(sq.x / gridSize), y: Math.floor(sq.y / gridSize) }));
      targetPositions.push({ x: 0, y: 0 });
    } else if (placement === "on_self") {
      const sourceToken = DeedBehaviorUtils.findToken(actor);
      if (sourceToken) {
        targetPositions.push({
          x: sourceToken.center?.x ?? (sourceToken.x + ((sourceToken.w || gridSize) / 2)),
          y: sourceToken.center?.y ?? (sourceToken.y + ((sourceToken.h || gridSize) / 2))
        });
      }
    } else if (placement === "on_target") {
      const targets = context.targets || [];
      if (targets.length > 0) {
        for (const t of targets) {
          if (t) {
            targetPositions.push({
              x: t.center?.x ?? (t.x + ((t.w || gridSize) / 2)),
              y: t.center?.y ?? (t.y + ((t.h || gridSize) / 2))
            });
          }
        }
      } else {
        const token = DeedBehaviorUtils.findToken(actor);
        if (token) {
          targetPositions.push({
            x: token.center?.x ?? (token.x + ((token.w || gridSize) / 2)),
            y: token.center?.y ?? (token.y + ((token.h || gridSize) / 2))
          });
        }
      }
    } else if (placement === "choose") {
      const sourceToken = DeedBehaviorUtils.findToken(actor);
      const chosenPos = await this.#promptCanvasPlacement(terrainItem, sourceToken, item);
      if (!chosenPos) {
        ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.TerrainPlacementCancelled") || "Terrain placement cancelled.");
        return false;
      }
      targetPositions.push(chosenPos);
    }

    if (targetPositions.length === 0) {
      return false;
    }

    if (!context.spawnedTerrains) context.spawnedTerrains = [];

    for (const dropPosition of targetPositions) {
      let created = null;
      if (game.user.isGM) {
        created = await TerrainHelper.placeTerrainOnCanvas(terrainItem, dropPosition, options);
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        const createdUuids = await emitDeedActionAndWait("spawnTerrain", {
          useTerrainHelper: true,
          terrainUuid: terrainItem.uuid,
          dropPosition: dropPosition,
          options: options
        });
        if (createdUuids && createdUuids.length > 0) {
          created = [];
          for (const uuid of createdUuids) {
            const doc = await fromUuid(uuid);
            if (doc) created.push(doc);
          }
        }
      }

      if (created) {
        if (Array.isArray(created)) {
          context.spawnedTerrains.push(...created);
        } else {
          context.spawnedTerrains.push(created);
        }
      }
    }

    if (context.currentPhaseOutputs?.notes) {
      if (hasLinked) {
        context.currentPhaseOutputs.notes.push(
          game.i18n.format("TRESPASSER.Chat.Terrain.SpawnedWithIntensity", {
            terrain: terrainItem.name,
            intensity: finalIntensity
          })
        );
      } else {
        context.currentPhaseOutputs.notes.push(
          game.i18n.format("TRESPASSER.Chat.Terrain.Spawned", {
            terrain: terrainItem.name
          })
        );
      }
    }
    return true;
  }

  /**
   * Prompts the user to select the terrain placement on the canvas using CanvasInputSession.
   * @param {Item} terrainItem
   * @param {Token} sourceToken
   * @param {Item} deedItem
   * @returns {Promise<{x: number, y: number}|null>}
   * @private
   */
  static async #promptCanvasPlacement(terrainItem, sourceToken, deedItem) {
    if (!canvas.ready || !terrainItem) return null;

    const gridSize = canvas.grid.size;
    const wSq = terrainItem.system.width || 1;
    const hSq = terrainItem.system.height || 1;
    const wPx = wSq * gridSize;
    const hPx = hSq * gridSize;
    const range = deedItem ? (RangeHelper.getDeedRange(sourceToken, deedItem, sourceToken?.actor) ?? deedItem.system?.range ?? 0) : 0;

    let selectedPos = null;
    let hoveredPos = null;
    const highlights = [];
    const layer = canvas.interface;

    const redrawTerrainPreview = () => {
      for (const gfx of highlights) {
        layer.removeChild(gfx);
        gfx.destroy();
      }
      highlights.length = 0;

      const gfx = new PIXI.Graphics();

      if (sourceToken && range > 0) {
        CanvasSelectionRenderer.drawRangePerimeter(gfx, sourceToken, range, gridSize);
      }

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
      for (const gfx of highlights) {
        layer.removeChild(gfx);
        gfx.destroy();
      }
      highlights.length = 0;
    };

    const title = game.i18n.format("TRESPASSER.Notification.Combat.PlaceTerrain", { name: terrainItem.name })
      || `Place ${terrainItem.name}`;

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

        // Check range if applicable
        if (range > 0 && sourceToken) {
          const testSquares = [];
          for (let dx = 0; dx < wSq; dx++) {
            for (let dy = 0; dy < hSq; dy++) {
              testSquares.push({ x: offsetX + dx * gridSize, y: offsetY + dy * gridSize });
            }
          }
          const tokenSquares = TargetingHelper.getTokenOccupiedSquares?.(sourceToken, gridSize) || [{ x: sourceToken.x, y: sourceToken.y }];
          let minDist = Infinity;
          for (const ts of testSquares) {
            for (const tks of tokenSquares) {
              const d = Math.max(Math.abs(ts.x - tks.x), Math.abs(ts.y - tks.y)) / gridSize;
              if (d < minDist) minDist = d;
            }
          }
          if (minDist > range) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
              name: terrainItem.name,
              range: range,
              distance: minDist
            }) || `Out of range (${minDist} > ${range}).`);
            const enforceRange = game.settings.get?.("trespasser", "enforceAttackRange");
            if (enforceRange) return;
          }
        }

        // Double click / second click on same pos -> auto confirm
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
        return selectedPos ? { x: selectedPos.x + wPx / 2, y: selectedPos.y + hPx / 2 } : null;
      },
      onCancel: () => {
        cleanup();
        return null;
      }
    });

    return positionResult;
  }

  /**
   * Ensure the caster actor possesses the linked effect(s) configured on the terrain.
   * @param {Item} terrainItem
   * @param {Actor} actor
   * @param {object} options
   * @private
   */
  static async #ensureCasterLinkedEffect(terrainItem, actor, options, finalIntensity, baseIntensity, addedPotency, behaviorId, context) {
    const linkedList = (terrainItem.system?.linkedEffects && terrainItem.system.linkedEffects.length > 0)
      ? terrainItem.system.linkedEffects
      : (terrainItem.system?.linkedEffect?.uuid ? [terrainItem.system.linkedEffect] : []);

    const clean = (s) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase();

    for (const linkedItem of linkedList) {
      const linkedUuid = linkedItem.uuid;
      if (!linkedUuid && !linkedItem.name) continue;

      const existing = actor.items.find(i => {
        if (i.type !== "effect") return false;
        if (linkedUuid && (i.flags?.trespasser?.sourceEffectUuid === linkedUuid || i.flags?.trespasser?.linkedSource === linkedUuid || i.uuid === linkedUuid || i.id === linkedUuid)) return true;
        if (linkedItem.name && (clean(i.name) === clean(linkedItem.name) || clean(i.name).includes(clean(linkedItem.name)) || clean(linkedItem.name).includes(clean(i.name)))) return true;
        return false;
      });

      let linkedDocId = existing?.id || null;

      if (existing) {
        if (!options.linkedEffectId) options.linkedEffectId = existing.id;
        if (!options.linkedEffectUuid) options.linkedEffectUuid = existing.uuid;
        if (existing.system?.intensity !== finalIntensity) {
          if (actor.isOwner) {
            await existing.update({ "system.intensity": finalIntensity });
          } else {
            const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
            await emitDeedActionAndWait("applyEffects", {
              actorId: actor.id,
              itemDataArray: [{ _id: existing.id, "system.intensity": finalIntensity }]
            });
          }
        }
      } else {
        const sourceEffect = linkedUuid ? await resolveItem(linkedItem, { type: "effect" }) : null;
        if (!sourceEffect) continue;

        const effectData = sourceEffect.toObject();
        delete effectData._id;
        effectData.system = effectData.system || {};
        effectData.system.intensity = finalIntensity;
        effectData.flags = foundry.utils.mergeObject(effectData.flags || {}, {
          trespasser: {
            sourceEffectUuid: sourceEffect.uuid,
            linkedSource: sourceEffect.uuid
          }
        });

        if (actor.isOwner) {
          const [created] = await actor.createEmbeddedDocuments("Item", [effectData]);
          if (created) {
            linkedDocId = created.id;
            if (!options.linkedEffectId) options.linkedEffectId = created.id;
            if (!options.linkedEffectUuid) options.linkedEffectUuid = created.uuid;
          }
        } else {
          const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
          const res = await emitDeedActionAndWait("applyEffects", {
            actorId: actor.id,
            itemDataArray: [effectData]
          });
          if (Array.isArray(res) && res[0]) {
            linkedDocId = res[0];
            options.linkedEffectId = res[0];
          }
        }
      }

      // Register with DeedPotencyHelper so retroactive updates can find it
      const { DeedPotencyHelper } = await import("./potency-helper.mjs");
      DeedPotencyHelper.registerAppliedEffect(context, {
        type: "terrain",
        actor: actor,
        nodeId: behaviorId,
        itemId: linkedDocId,
        uuid: linkedUuid,
        baseIntensity: baseIntensity,
        addedPotency: addedPotency,
        finalIntensity: finalIntensity,
        terrainName: terrainItem.name,
        img: terrainItem.img || "icons/svg/mountain.svg"
      });
    }
  }
}

