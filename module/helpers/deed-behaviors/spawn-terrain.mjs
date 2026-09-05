import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TerrainHelper } from "../terrain-helper.mjs";
import { promptCanvasPlacement } from "./spawn-terrain-prompt.mjs";
import { ensureCasterLinkedEffect } from "./spawn-terrain-linked.mjs";
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
      await ensureCasterLinkedEffect(terrainItem, actor, options, finalIntensity, baseIntensity, addedPotency, behavior.id, context);
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
      const chosenPos = await promptCanvasPlacement(terrainItem, sourceToken, item);
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
}

export { promptCanvasPlacement, ensureCasterLinkedEffect };
