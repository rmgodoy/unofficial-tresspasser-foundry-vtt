/**
 * DeedResolver — Resolves cross-phase additive/replace semantics for deed phases.
 *
 * Before executing phase effects, the resolver computes the FINAL values that
 * should be applied (damage, effects, terrain, forced movement) by walking
 * through active phases in order and applying additive/replace rules:
 *
 *   - "additive" (default): this phase's value stacks on top of prior phases
 *   - "replace": this phase's value REPLACES all values from prior phases
 *
 * Phase Actions (movement, selfEffect, terrainSpawn within phaseActions[])
 * are NOT resolved here — they execute inline during phase processing.
 */

import { TargetingHelper } from "./targeting-helper.mjs";
import { MovementOverlay } from "../canvas/movement-overlay.mjs";

export class DeedResolver {

  /**
   * Determine which phases are active based on hit/miss/spark results.
   * @param {object} deedEffects - The deed's effects schema (effects.start, etc.)
   * @param {boolean} anyHit - Whether any target was hit
   * @param {number} maxSparks - Maximum sparks rolled
   * @param {boolean} isAttack - Whether the deed is an attack
   * @param {boolean} showSpark - Whether spark phase should fire
   * @returns {string[]} Ordered list of active phase keys
   */
  static getActivePhases(deedEffects, anyHit, maxSparks, isAttack, showSpark = false) {
    const phases = [];

    // Start and Before always fire (they execute before the roll)
    phases.push("start", "before");

    // Base always fires (miss AND hit) for attack deeds
    phases.push("base");

    // Hit and Spark only on success (or for support deeds)
    if (anyHit || !isAttack) {
      phases.push("hit");
      if (showSpark && maxSparks > 0) {
        phases.push("spark");
      }
    }

    // After and End always fire
    phases.push("after", "end");

    return phases;
  }

  /**
   * Compute the final resolved values for damage, effects, terrain,
   * and forced movement across all active phases, respecting additive/replace.
   *
   * @param {object} deedEffects - The deed's effects schema
   * @param {string[]} activePhases - Ordered list of phase keys to process
   * @returns {{ finalDamage: string, finalEffects: object[], finalTerrainSpawn: object|null, finalForcedMovement: object }}
   */
  static resolvePhases(deedEffects, activePhases) {
    let finalDamage = "";
    let finalEffects = [];
    let finalTerrainSpawn = null;
    let finalForcedMovement = { type: "", distance: 0, mode: "additive" };

    for (const phaseKey of activePhases) {
      const p = deedEffects?.[phaseKey];
      if (!p) continue;

      // ── Damage ─────────────────────────────────────────────────
      if (p.damage?.trim()) {
        if (p.damageMode === "replace") {
          finalDamage = p.damage;
        } else {
          finalDamage = finalDamage ? `${finalDamage} + ${p.damage}` : p.damage;
        }
      }

      // ── Effects ────────────────────────────────────────────────
      if (p.appliedEffects?.length > 0) {
        if (p.appliedEffectsMode === "replace") {
          finalEffects = [...p.appliedEffects.map(e => ({ ...e }))];
        } else {
          finalEffects.push(...p.appliedEffects.map(e => ({ ...e })));
        }
      }

      // ── Terrain Spawn ──────────────────────────────────────────
      if (p.terrainSpawn?.uuid) {
        if (p.terrainSpawnMode === "replace") {
          finalTerrainSpawn = { ...p.terrainSpawn };
        } else {
          // Terrain doesn't stack — latest non-empty wins
          finalTerrainSpawn = { ...p.terrainSpawn };
        }
      }

      // ── Forced Movement ────────────────────────────────────────
      if (p.forcedMovement?.type) {
        if (p.forcedMovement.mode === "replace") {
          finalForcedMovement = {
            type: p.forcedMovement.type,
            distance: p.forcedMovement.distance,
            mode: "replace"
          };
        } else {
          finalForcedMovement.distance += p.forcedMovement.distance;
          finalForcedMovement.type = p.forcedMovement.type;
        }
      }
    }

    return { finalDamage, finalEffects, finalTerrainSpawn, finalForcedMovement };
  }

  /**
   * Execute a single phase action inline.
   * Phase actions are ordered actions that execute BEFORE the phase's
   * damage/effects (e.g., "jump 6 close_path" before the accuracy roll).
   *
   * @param {object} action - A phaseAction entry from the deed schema
   * @param {Token} sourceToken - The caster's token
   * @param {Actor} actor - The caster actor
   * @param {object} context - Shared resolution context (stores pathSquares etc.)
   * @returns {Promise<void>}
   */
  static async executePhaseAction(action, sourceToken, actor, context = {}) {
    if (!action?.type) return;

    switch (action.type) {
      case "movement":
        await this.#executeMovementAction(action, sourceToken, actor, context);
        break;

      case "selfEffect":
        await this.#executeSelfEffectAction(action, actor);
        break;

      case "terrainSpawn":
        // Handled by the main phase processor using the terrainSpawn data
        // This is a marker that says "spawn terrain NOW in this phase"
        context.spawnTerrainNow = true;
        break;
    }
  }

  /**
   * Execute a movement phase action. Prompts the player to move using
   * the specified shape (straight/close_path/path).
   * @private
   */
  static async #executeMovementAction(action, sourceToken, actor, context) {
    const distance = action.movementDistance || 0;
    if (distance <= 0) return;

    const gridPx = canvas.grid.size;

    let destinationSquares = null;

    switch (action.movementShape) {
      case "close_path": {
        // Reuse TargetingHelper path placement (starts adjacent to token)
        ui.notifications.info(
          game.i18n.format("TRESPASSER.Notification.Combat.PlaceClosePath", { size: distance })
        );
        // Mock deed object: phase action paths are unrestricted by weapon range,
        // so we pass type: "versatile" and range: null to bypass getMaxRangeSq cleanly.
        const mockDeed = {
          type: "versatile",
          range: null,
          targetType: "close_path",
          targetSize: distance
        };
        const result = await TargetingHelper.placeTemplate(actor, sourceToken, mockDeed);
        if (!result) return; // Cancelled
        destinationSquares = result.squares;
        // Store path squares in context for `on_path` terrain placement
        context.pathSquares = result.squares;
        break;
      }

      case "path": {
        ui.notifications.info(
          game.i18n.format("TRESPASSER.Notification.Combat.PlacePath", { size: distance })
        );
        // Mock deed object: phase action paths are unrestricted by weapon range,
        // so we pass type: "versatile" and range: null to bypass getMaxRangeSq cleanly.
        const mockDeed = {
          type: "versatile",
          range: null,
          targetType: "path",
          targetSize: distance
        };
        const result = await TargetingHelper.placeTemplate(actor, sourceToken, mockDeed);
        if (!result) return;
        destinationSquares = result.squares;
        context.pathSquares = result.squares;
        break;
      }

      case "straight":
      default: {
        // Vault-style: show valid destinations and let player pick
        const jumpResult = await new Promise((resolve) => {
          MovementOverlay.activateVaultMode(sourceToken, distance, { free: true });
          // Listen for the vault completion
          Hooks.once("trespasserVaultComplete", (token, destination) => {
            resolve(destination);
          });
          // Also listen for cancellation
          Hooks.once("trespasserVaultCancelled", () => {
            resolve(null);
          });
        });
        if (!jumpResult) return;
        destinationSquares = [jumpResult];
        break;
      }
    }

    if (!destinationSquares || destinationSquares.length === 0) return;

    // Move the token to the final square of the path
    const finalSquare = destinationSquares[destinationSquares.length - 1];
    const tokenDoc = sourceToken.document ?? sourceToken;

    // Use the movementType to determine animation style
    const movementAction = action.movementType === "jump" ? "jump"
                         : action.movementType === "teleport" ? "teleport"
                         : undefined;

    await tokenDoc.update(
      { x: finalSquare.x, y: finalSquare.y },
      { movementAction, animate: true }
    );

    // Post chat message about the movement
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trespasser-chat-card">
        <p><strong>${actor.name}</strong> ${action.movementType || "moves"} ${distance} squares.</p>
      </div>`
    });
  }

  /**
   * Execute a selfEffect phase action — apply an effect to the caster.
   * @private
   */
  static async #executeSelfEffectAction(action, actor) {
    if (!action.effectUuid) return;

    const sourceEffect = await fromUuid(action.effectUuid);
    if (!sourceEffect) return;

    const effectData = sourceEffect.toObject();
    effectData.system.intensity = action.effectIntensity || 0;
    delete effectData._id;

    await Item.createDocuments([effectData], { parent: actor });
  }
}
