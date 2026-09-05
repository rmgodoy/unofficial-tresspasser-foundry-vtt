import {
  isPointInRegion,
  isTokenInRegion,
  getTerrainRegionsContainingToken,
  getTerrainAtSquare,
  getGridPath
} from "../terrain/terrain-geometry.mjs";
import {
  TERRAIN_COLORS,
  getRegionColor,
  evaluateIntensityValue,
  resolveIntPlaceholder,
  getLinkedIntensity,
  buildBehaviorContext,
  applyEffect,
  handleSlipperyCheck,
  transformObstacleToRubble,
  executeBehavior
} from "../terrain/terrain-behaviors.mjs";
import {
  cleanupCombatTerrains,
  isRegionLinkedToEffect,
  onEffectDeleted,
  onEffectIntensityUpdated,
  syncWhileInsideEffectsForToken,
  syncWhileInsideEffectsForRegion,
  cleanupWhileInsideEffectsForRegion
} from "../terrain/terrain-effects-sync.mjs";
import {
  placeTerrainOnCanvas,
  editTerrainRegion,
  spawnTerrainFromDeed,
  onTerrainCreated
} from "../terrain/terrain-placement.mjs";
import {
  movementQueues,
  processTokenMovement,
  onTokenEnterTerrain,
  onTokenExitTerrain,
  onTokenStartTurnInTerrain,
  postMovementSummary
} from "../terrain/terrain-movement.mjs";

export class TerrainHelper {
  static TERRAIN_COLORS = TERRAIN_COLORS;
  static _movementQueues = movementQueues;

  static getRegionColor(terrainItemOrData) {
    return getRegionColor(terrainItemOrData);
  }

  static async placeTerrainOnCanvas(terrainItem, dropPosition, options = {}) {
    return placeTerrainOnCanvas(terrainItem, dropPosition, options);
  }

  static async editTerrainRegion(document) {
    return editTerrainRegion(document);
  }

  static async spawnTerrainFromDeed(terrainItem, spawnConfig, sourceToken, targets, options = {}) {
    return spawnTerrainFromDeed(terrainItem, spawnConfig, sourceToken, targets, options);
  }

  static async onTerrainCreated(region, options = {}) {
    return onTerrainCreated(region, options);
  }

  static async onTokenEnterTerrain(token, region) {
    return onTokenEnterTerrain(token, region);
  }

  static async onTokenExitTerrain(token, region) {
    return onTokenExitTerrain(token, region);
  }

  static async onTokenStartTurnInTerrain(tokenDoc, region) {
    return onTokenStartTurnInTerrain(tokenDoc, region);
  }

  static isTokenInRegion(tokenDoc, region, gridSize = 100) {
    return isTokenInRegion(tokenDoc, region, gridSize);
  }

  static getTerrainRegionsContainingToken(tokenDoc) {
    return getTerrainRegionsContainingToken(tokenDoc);
  }

  static getTerrainAtSquare(x, y, gridPx) {
    return getTerrainAtSquare(x, y, gridPx);
  }

  static async transformObstacleToRubble(region) {
    return transformObstacleToRubble(region);
  }

  static async processTokenMovement(tokenDoc, oldX, oldY, newX, newY, isJump = false) {
    return processTokenMovement(tokenDoc, oldX, oldY, newX, newY, isJump);
  }

  static async cleanupCombatTerrains() {
    return cleanupCombatTerrains();
  }

  static isRegionLinkedToEffect(region, effectItem) {
    return isRegionLinkedToEffect(region, effectItem);
  }

  static async onEffectDeleted(effectItem) {
    return onEffectDeleted(effectItem);
  }

  static async onEffectIntensityUpdated(effectItem, changes = {}) {
    return onEffectIntensityUpdated(effectItem, changes);
  }

  static async syncWhileInsideEffectsForToken(tokenDoc) {
    return syncWhileInsideEffectsForToken(tokenDoc);
  }

  static async syncWhileInsideEffectsForRegion(region) {
    return syncWhileInsideEffectsForRegion(region);
  }

  static async cleanupWhileInsideEffectsForRegion(regionId) {
    return cleanupWhileInsideEffectsForRegion(regionId);
  }

  static async executeBehavior(behavior, actor, terrainRegion, context = {}) {
    return executeBehavior(behavior, actor, terrainRegion, context);
  }

  static evaluateIntensityValue(str, defaultValue = 1) {
    return evaluateIntensityValue(str, defaultValue);
  }

  static resolveIntPlaceholder(str, terrainRegion) {
    return resolveIntPlaceholder(str, terrainRegion);
  }

  static getLinkedIntensity(terrainRegion) {
    return getLinkedIntensity(terrainRegion);
  }

  static isPointInRegion(px, py, region, gridSize = 100) {
    return isPointInRegion(px, py, region, gridSize);
  }
}

import { resolveItem } from "./item-resolver.mjs";

Hooks.on("dropCanvasData", (canvasWrapper, data) => {
  if (data.type === "Item") {
    const item = fromUuidSync(data.uuid);
    if (item && item.type === "terrain") {
      TerrainHelper.placeTerrainOnCanvas(item, { x: data.x, y: data.y });
      return false;
    }
    if (data.uuid) {
      resolveItem(data, { type: "terrain", notify: false }).then((resolved) => {
        if (resolved && resolved.type === "terrain") {
          TerrainHelper.placeTerrainOnCanvas(resolved, { x: data.x, y: data.y });
        }
      });
    }
  }
});
