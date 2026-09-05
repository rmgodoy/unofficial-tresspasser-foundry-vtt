import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import {
  hasLinkedEffect,
  parseIntensity,
  getActorEquippedWeapons,
  collectPotencyCandidates
} from "./potency-candidates.mjs";
import {
  registerAppliedEffect,
  updateAlreadyApplied
} from "./potency-applied.mjs";

/**
 * DeedPotencyHelper — Coordinates Potency spark distribution among Deed effects and terrains with linked effects.
 */
export class DeedPotencyHelper {

  /**
   * Check if a terrain document or UUID defines one or more linked effects.
   * @param {Item|string} terrainItemOrUuid
   * @returns {Promise<boolean>|boolean}
   */
  static async hasLinkedEffect(terrainItemOrUuid) {
    return hasLinkedEffect(terrainItemOrUuid);
  }

  /**
   * Safely parse an intensity value, supporting 0 as valid.
   * @param {any} val
   * @param {number} [fallback=0]
   * @returns {number}
   */
  static parseIntensity(val, fallback = 0) {
    return parseIntensity(val, fallback);
  }

  /**
   * Helper to get equipped weapons from an actor.
   * @param {Actor} actor
   * @returns {Item[]}
   */
  static getActorEquippedWeapons(actor) {
    return getActorEquippedWeapons(actor);
  }

  /**
   * Collect all eligible effect and terrain candidates for Potency allocation across the deed graph.
   * @param {object} context
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} [phaseKey=""]
   * @returns {Promise<Array<object>>}
   */
  static async collectPotencyCandidates(context, actor, item, phaseKey = "") {
    return collectPotencyCandidates(context, actor, item, phaseKey);
  }

  /**
   * Ensure that Potency allocations are prompted and computed across all candidates.
   * Caches results in context so it runs exactly once per deed execution.
   * @param {object} context
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} [phaseKey=""]
   */
  static async ensurePotencyAllocations(context, actor, item, phaseKey = "") {
    if (context.potencyAllocationsResolved) return;

    context.potencyAllocations = context.potencyAllocations || {
      terrainBonuses: new Map(),
      effectBonuses: new Map()
    };

    // If spark choices have not yet been evaluated (e.g. node runs before rollAccuracy),
    // do NOT mark resolved so that onSparksSelected will run after the roll.
    if (!context.sparkChoices) return;

    const targetChoicesMap = context.sparkChoices?.perTarget;
    const globalPotency = context.sparkChoices?.potencyBonus || 0;
    const hasAnyPotency = globalPotency > 0 || (targetChoicesMap && Array.from(targetChoicesMap.values()).some(c => (c?.potency || 0) > 0));

    if (!hasAnyPotency) {
      context.potencyAllocationsResolved = true;
      return;
    }

    const candidates = await this.collectPotencyCandidates(context, actor, item, phaseKey);

    // Ensure any terrain/effect already applied in context is present in candidates
    if (context.appliedDeedEffects?.length > 0) {
      for (const applied of context.appliedDeedEffects) {
        if (applied.type === "terrain" && !candidates.some(c => c.nodeId === applied.nodeId)) {
          const terrainLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.spawnTerrain") || "Terrain";
          candidates.push({
            type: "terrain",
            nodeId: applied.nodeId,
            uuid: applied.uuid,
            name: applied.terrainName,
            displayName: `${applied.terrainName} (${terrainLabel})`,
            img: applied.img || "icons/svg/mountain.svg",
            baseIntensity: applied.baseIntensity ?? 1,
            source: "terrain"
          });
        }
      }
    }

    if (candidates.length === 0) {
      context.potencyAllocationsResolved = true;
      return;
    }

    const { askPotencyDialog } = await import("../../dialogs/potency-dialog.mjs");
    let anyAllocated = false;

    if (targetChoicesMap && targetChoicesMap.size > 0) {
      for (const [tokenId, targetChoices] of targetChoicesMap.entries()) {
        const targetPotency = targetChoices?.potency || 0;
        if (targetPotency <= 0) continue;
        anyAllocated = true;

        const targetToken = canvas.tokens?.get(tokenId) || canvas.scene?.tokens?.get(tokenId);
        const tokenName = targetToken ? DeedBehaviorUtils.getTokenDisplayName(targetToken) : tokenId;

        let allocations = [];
        if (candidates.length > 1) {
          allocations = await askPotencyDialog(
            targetPotency,
            candidates.map(c => ({ name: c.displayName, intensity: c.baseIntensity, img: c.img })),
            tokenName
          );
          if (!allocations) {
            allocations = candidates.map((_, i) => (i === 0 ? targetPotency : 0));
          }
        } else {
          allocations = [targetPotency];
        }

        candidates.forEach((cand, idx) => {
          const bonus = allocations[idx] || 0;
          if (cand.type === "terrain") {
            const curr = context.potencyAllocations.terrainBonuses.get(cand.nodeId) || 0;
            context.potencyAllocations.terrainBonuses.set(cand.nodeId, curr + bonus);
          } else {
            const curr = context.potencyAllocations.effectBonuses.get(`${tokenId}_${cand.uuid}`) || 0;
            context.potencyAllocations.effectBonuses.set(`${tokenId}_${cand.uuid}`, curr + bonus);
          }
        });
      }
    }

    if (!anyAllocated && globalPotency > 0) {
      let allocations = [];
      if (candidates.length > 1) {
        allocations = await askPotencyDialog(
          globalPotency,
          candidates.map(c => ({ name: c.displayName, intensity: c.baseIntensity, img: c.img })),
          actor?.name || "Self"
        );
        if (!allocations) {
          allocations = candidates.map((_, i) => (i === 0 ? globalPotency : 0));
        }
      } else {
        allocations = [globalPotency];
      }

      candidates.forEach((cand, idx) => {
        const bonus = allocations[idx] || 0;
        if (cand.type === "terrain") {
          const curr = context.potencyAllocations.terrainBonuses.get(cand.nodeId) || 0;
          context.potencyAllocations.terrainBonuses.set(cand.nodeId, curr + bonus);
        } else {
          const curr = context.potencyAllocations.effectBonuses.get(`global_${cand.uuid}`) || 0;
          context.potencyAllocations.effectBonuses.set(`global_${cand.uuid}`, curr + bonus);
        }
      });
    }

    context.potencyAllocationsResolved = true;
    await this.updateAlreadyApplied(context);
  }

  /**
   * Register an applied effect or terrain in context so it can be retroactively updated if Potency is chosen later.
   * @param {object} context
   * @param {object} record
   */
  static registerAppliedEffect(context, record) {
    registerAppliedEffect(context, record);
  }

  /**
   * Retroactively updates effects and terrains that were created prior to Potency selection.
   * @param {object} context
   */
  static async updateAlreadyApplied(context) {
    return updateAlreadyApplied(context);
  }

  /**
   * Retrieve allocated potency bonus for a specific target and effect UUID.
   * @param {object} context
   * @param {string} targetId
   * @param {string} effectUuid
   * @returns {number}
   */
  static getEffectPotency(context, targetId, effectUuid) {
    return context.potencyAllocations?.effectBonuses?.get(`${targetId}_${effectUuid}`) ??
           context.potencyAllocations?.effectBonuses?.get(`global_${effectUuid}`) ?? 0;
  }

  /**
   * Retrieve allocated potency bonus for a terrain node ID.
   * @param {object} context
   * @param {string} nodeId
   * @returns {number}
   */
  static getTerrainPotency(context, nodeId) {
    return context.potencyAllocations?.terrainBonuses?.get(nodeId) ?? 0;
  }

  /**
   * Triggered immediately after sparks are selected in rollAccuracy.
   * @param {object} context
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} [phaseKey=""]
   */
  static async onSparksSelected(context, actor, item, phaseKey = "") {
    await this.ensurePotencyAllocations(context, actor, item, phaseKey);
  }
}

export {
  hasLinkedEffect,
  parseIntensity,
  getActorEquippedWeapons,
  collectPotencyCandidates,
  registerAppliedEffect,
  updateAlreadyApplied
};
