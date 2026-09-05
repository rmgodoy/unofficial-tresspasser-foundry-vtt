/**
 * ForcedMovementHelper — Manages push, pull, slide, and collision resolution for tokens.
 * Facade coordinating target ordering, collision detection, and path selection.
 */

import { MovementHelper } from "./movement-helper.mjs";
import { showTargetOrderPanel } from "../movement/target-ordering-panel.mjs";
import {
  testNativeWallCollision,
  checkCollisionAtSquare
} from "../movement/forced-movement-collision.mjs";
import {
  FORCED_MOVEMENT_TYPES,
  getValidSquares,
  selectForcedPath
} from "../movement/forced-movement-path.mjs";

export {
  FORCED_MOVEMENT_TYPES,
  showTargetOrderPanel,
  testNativeWallCollision,
  checkCollisionAtSquare,
  getValidSquares,
  selectForcedPath
};

export class ForcedMovementHelper {
  static TYPES = FORCED_MOVEMENT_TYPES;

  static async executeForcedMovement(sourceToken, targets, movementType, distance, options = {}) {
    return MovementHelper.withFreeMovement(async () => {
      if (!targets || targets.length === 0 || distance <= 0) return;

      if (!sourceToken && !options.direction && !options.terrainRegion) return;

      let orderedTargets = targets;
      if (targets.length > 1 && foundry.applications?.api?.ApplicationV2) {
        orderedTargets = await showTargetOrderPanel(targets);
      }

      if (!orderedTargets || orderedTargets.length === 0) return;

      for (const targetToken of orderedTargets) {
        let movingToken = targetToken;
        let referenceToken = sourceToken;

        if (movementType === this.TYPES.DRAG) {
          movingToken = sourceToken;
          referenceToken = targetToken;
        }

        const result = await selectForcedPath(movingToken, referenceToken, movementType, distance, options);
        if (result) {
          let otherToken = null;
          if (result.path.length > 0) {
            ui.notifications.info(`Path selected for ${movingToken.actor?.name || movingToken.name} with ${result.path.length} steps.`);
            
            const gridSize = canvas.scene.grid.size;
            
            const movingInitialX = Math.floor(movingToken.center.x / gridSize);
            const movingInitialY = Math.floor(movingToken.center.y / gridSize);
            
            const movingPath = result.path.map(sq => ({
              x: movingToken.document.x + ((sq.x - movingInitialX) * gridSize),
              y: movingToken.document.y + ((sq.y - movingInitialY) * gridSize)
            }));

            let compoundPath = null;

            if (movementType === this.TYPES.SHOVE || movementType === this.TYPES.DRAG) {
              otherToken = (movementType === this.TYPES.SHOVE) ? sourceToken : targetToken;
              
              compoundPath = result.path.map(sq => ({
                x: otherToken.document.x + ((sq.x - movingInitialX) * gridSize),
                y: otherToken.document.y + ((sq.y - movingInitialY) * gridSize)
              }));
            }

            result.movingPath = movingPath;
            if (compoundPath) result.compoundPath = compoundPath;
          }

          const ownsTarget = targetToken.isOwner;
          const ownsSource = !sourceToken || sourceToken.isOwner;

          if (ownsTarget && ownsSource) {
            if (result.path && result.path.length > 0) {
              await this.animateTokenAlongPath(movingToken, result.movingPath, otherToken, result.compoundPath);
            }
            await this.postCollisionDamage(targetToken, result.collisions, result.totalDamage);
          } else {
            const { emitDeedActionAndWait } = await import("./socket/deed-socket-handler.mjs");
            await emitDeedActionAndWait("forceMoveTokens", {
              movingTokenId: movingToken.id,
              movingPath: result.movingPath || [],
              otherTokenId: otherToken?.id || null,
              compoundPath: result.compoundPath || null,
              targetTokenId: targetToken.id,
              collisions: result.collisions || [],
              totalDamage: result.totalDamage || 0
            });
          }
        }
      }
    });
  }

  static async animateTokenAlongPath(movingToken, movingPath, otherToken = null, compoundPath = null) {
    if (!movingPath || movingPath.length === 0) return;

    for (let i = 0; i < movingPath.length; i++) {
      const updates = [{
        _id: movingToken.id,
        x: movingPath[i].x,
        y: movingPath[i].y
      }];

      if (otherToken && compoundPath && compoundPath[i]) {
        updates.push({
          _id: otherToken.id,
          x: compoundPath[i].x,
          y: compoundPath[i].y
        });
      }

      await canvas.scene.updateEmbeddedDocuments("Token", updates, { trespasserForcedMovement: true });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  static async postCollisionDamage(targetToken, collisions, totalDamage) {
    if (!collisions || collisions.length === 0 || totalDamage <= 0) return;

    const actor = targetToken.actor;
    if (!actor) return;

    if (typeof actor.applyDamage === "function") {
      await actor.applyDamage(totalDamage);
    } else {
      const newHp = Math.max(0, actor.system?.health - totalDamage);
      await actor.update({ "system.health": newHp });
    }

    const lines = collisions.map(c => {
      const dmgStr = game.i18n.format("TRESPASSER.Chat.Collision.Damage", { damage: c.damage }) || `${c.damage} Damage`;
      if (c.type === "wall") {
        const wallLabel = game.i18n.localize("TRESPASSER.Chat.Collision.Wall") || "Wall Collision";
        return `<li><span style="color:var(--trp-red, #c44);">⚡ ${dmgStr}</span> — ${wallLabel}</li>`;
      } else if (c.type === "obstacle") {
        const obstacleLabel = game.i18n.format("TRESPASSER.Chat.Collision.Obstacle", { name: c.region?.name || "Obstacle" }) || `Obstacle Collision (${c.region?.name || "Obstacle"})`;
        return `<li><span style="color:var(--trp-red, #c44);">⚡ ${dmgStr}</span> — ${obstacleLabel}</li>`;
      }
      return "";
    }).filter(Boolean);

    const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;
    const flavor = game.i18n.format("TRESPASSER.Chat.Collision.Flavor", { total: totalDamage }) || `💥 Forced Movement Collision (${totalDamage} Total Damage)`;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flavor
    });
  }
}
