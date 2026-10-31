import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import {
  hasLinkedEffect,
  parseIntensity,
  getActorEquippedWeapons,
  getReachableNodes,
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

  static async hasLinkedEffect(terrainItemOrUuid) {
    return hasLinkedEffect(terrainItemOrUuid);
  }

  static parseIntensity(val, fallback = 0) {
    return parseIntensity(val, fallback);
  }

  static getActorEquippedWeapons(actor) {
    return getActorEquippedWeapons(actor);
  }

  static async collectPotencyCandidates(context, actor, item, phaseKey = "", options = {}) {
    return collectPotencyCandidates(context, actor, item, phaseKey, options);
  }

  /**
   * Append any already-applied terrain/effect records not yet in candidates list.
   * @param {Array<object>} candidates
   * @param {object} context
   */
  static _mergeAppliedTerrainCandidates(candidates, context) {
    if (!context.appliedDeedEffects?.length) return;
    for (const applied of context.appliedDeedEffects) {
      if (applied.type === "terrain" && !candidates.some(c => c.nodeId === applied.nodeId)) {
        const terrainLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.spawnTerrain") || "Terrain";
        candidates.push({
          type: "terrain",
          nodeId: applied.nodeId,
          nodeIds: [applied.nodeId],
          uuid: applied.uuid,
          name: applied.terrainName,
          displayName: `${applied.terrainName} (${terrainLabel})`,
          img: applied.img || "icons/svg/mountain.svg",
          baseIntensity: applied.baseIntensity ?? 1,
          source: "terrain",
          isGlobal: true
        });
      }
    }
  }

  /**
   * Store allocated bonus for a candidate.
   * @param {object} context
   * @param {object} cand
   * @param {number} bonus
   * @param {string|null} tokenId - Target token ID, or null for global
   */
  static _storeCandidateBonus(context, cand, bonus, tokenId = null) {
    if (!bonus || bonus <= 0) return;
    const allocs = context.potencyAllocations;

    if (cand.type === "terrain") {
      const curr = allocs.terrainBonuses.get(cand.nodeId) || 0;
      allocs.terrainBonuses.set(cand.nodeId, Math.max(curr, bonus));
    } else if (cand.type === "recovery") {
      const curr = allocs.recoveryBonuses.get(cand.nodeId) || 0;
      allocs.recoveryBonuses.set(cand.nodeId, Math.max(curr, bonus));
    } else if (cand.type === "modifyEffects") {
      const key = (tokenId && !cand.isGlobal) ? `${tokenId}_${cand.nodeId}` : `global_${cand.nodeId}`;
      const curr = allocs.modifyBonuses.get(key) || 0;
      allocs.modifyBonuses.set(key, cand.isGlobal ? Math.max(curr, bonus) : (curr + bonus));
      if (cand.isGlobal) {
        const gKey = `global_${cand.nodeId}`;
        allocs.modifyBonuses.set(gKey, Math.max(allocs.modifyBonuses.get(gKey) || 0, bonus));
      }
    } else {
      const normName = (cand.name || "").toLowerCase().trim();
      if (tokenId && !cand.isGlobal) {
        if (cand.uuid) {
          const k = `${tokenId}_${cand.uuid}`;
          allocs.effectBonuses.set(k, (allocs.effectBonuses.get(k) || 0) + bonus);
        }
        if (normName) {
          const nk = `${tokenId}_name_${normName}`;
          allocs.effectBonuses.set(nk, (allocs.effectBonuses.get(nk) || 0) + bonus);
        }
      } else {
        if (cand.uuid) {
          const gk = `global_${cand.uuid}`;
          allocs.effectBonuses.set(gk, Math.max(allocs.effectBonuses.get(gk) || 0, bonus));
        }
        if (normName) {
          const gnk = `global_name_${normName}`;
          allocs.effectBonuses.set(gnk, Math.max(allocs.effectBonuses.get(gnk) || 0, bonus));
        }
      }
    }
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
      effectBonuses: new Map(),
      recoveryBonuses: new Map(),
      modifyBonuses: new Map()
    };

    if (!context.sparkChoices) return;

    const targetChoicesMap = context.sparkChoices?.perTarget;
    const maxTargetPotency = targetChoicesMap && targetChoicesMap.size > 0
      ? Math.max(0, ...Array.from(targetChoicesMap.values()).map(c => c?.potency || 0))
      : 0;
    const globalPotency = Math.max(context.sparkChoices?.potencyBonus || 0, maxTargetPotency);
    const hasAnyPotency = globalPotency > 0;

    if (!hasAnyPotency) {
      context.potencyAllocationsResolved = true;
      return;
    }

    const baseCandidates = await this.collectPotencyCandidates(context, actor, item, phaseKey);
    this._mergeAppliedTerrainCandidates(baseCandidates, context);

    const hasPerTargetCandidates = baseCandidates.some(c => !c.isGlobal);
    const { askPotencyDialog } = await import("../../dialogs/potency-dialog.mjs");
    let anyAllocated = false;

    // If the deed has per-target candidates (e.g. effects applied to enemy targets), allocate per target
    if (hasPerTargetCandidates && targetChoicesMap && targetChoicesMap.size > 0) {
      for (const [tokenId, targetChoices] of targetChoicesMap.entries()) {
        const targetPotency = targetChoices?.potency || 0;
        if (targetPotency <= 0) continue;

        const targetIsSpark = Boolean(targetChoices?.deed ?? context.isSpark);
        const targetCandidates = await this.collectPotencyCandidates(context, actor, item, phaseKey, {
          isHit: true,
          isSpark: targetIsSpark
        });
        this._mergeAppliedTerrainCandidates(targetCandidates, context);
        if (targetCandidates.length === 0) continue;

        anyAllocated = true;
        const targetToken = tokenId ? (canvas.tokens?.get(tokenId) || canvas.scene?.tokens?.get(tokenId)) : null;
        const tokenName = targetToken ? DeedBehaviorUtils.getTokenDisplayName(targetToken) : (actor?.name || "Target");

        let allocations = [];
        if (targetCandidates.length > 1) {
          allocations = await askPotencyDialog(
            targetPotency,
            targetCandidates.map(c => ({ name: c.displayName, intensity: c.baseIntensity, img: c.img })),
            tokenName
          );
          if (!allocations) {
            allocations = targetCandidates.map((_, i) => (i === 0 ? targetPotency : 0));
          }
        } else {
          allocations = [targetPotency];
        }

        targetCandidates.forEach((cand, idx) => {
          this._storeCandidateBonus(context, cand, allocations[idx] || 0, tokenId);
        });
      }
    }

    // If all candidates are global (e.g. Cloud of Pestilence terrain, recovery, or self-buff) or no target entries matched
    if (!anyAllocated && globalPotency > 0 && baseCandidates.length > 0) {
      let allocations = [];
      if (baseCandidates.length > 1) {
        allocations = await askPotencyDialog(
          globalPotency,
          baseCandidates.map(c => ({ name: c.displayName, intensity: c.baseIntensity, img: c.img })),
          actor?.name || "Self"
        );
        if (!allocations) {
          allocations = baseCandidates.map((_, i) => (i === 0 ? globalPotency : 0));
        }
      } else {
        allocations = [globalPotency];
      }

      baseCandidates.forEach((cand, idx) => {
        this._storeCandidateBonus(context, cand, allocations[idx] || 0, null);
      });
    }

    context.potencyAllocationsResolved = true;
    await this.updateAlreadyApplied(context);
  }

  static registerAppliedEffect(context, record) {
    registerAppliedEffect(context, record);
  }

  static async updateAlreadyApplied(context) {
    return updateAlreadyApplied(context);
  }

  /**
   * Read allocated potency bonus for a specific target and effect UUID/name without consuming it.
   * @param {object} context
   * @param {string} targetId
   * @param {string} effectUuid
   * @param {string} [effectName=""]
   * @returns {number}
   */
  static getEffectPotency(context, targetId, effectUuid, effectName = "") {
    const map = context.potencyAllocations?.effectBonuses;
    if (!map) return 0;
    const normName = (effectName || "").toLowerCase().trim();
    return (effectUuid && map.get(`${targetId}_${effectUuid}`)) ??
           (normName && map.get(`${targetId}_name_${normName}`)) ??
           (effectUuid && map.get(`global_${effectUuid}`)) ??
           (normName && map.get(`global_name_${normName}`)) ?? 0;
  }

  /**
   * Retrieve and consume allocated potency bonus for a specific target and effect UUID/name
   * so that multiple nodes applying the same aggregated effect only add the Potency bonus once.
   * @param {object} context
   * @param {string} targetId
   * @param {string} effectUuid
   * @param {string} [effectName=""]
   * @returns {number}
   */
  static consumeEffectPotency(context, targetId, effectUuid, effectName = "") {
    const map = context.potencyAllocations?.effectBonuses;
    if (!map) return 0;
    const normName = (effectName || "").toLowerCase().trim();

    const targetUuidKey = effectUuid ? `${targetId}_${effectUuid}` : null;
    const targetNameKey = normName ? `${targetId}_name_${normName}` : null;
    const globalUuidKey = effectUuid ? `global_${effectUuid}` : null;
    const globalNameKey = normName ? `global_name_${normName}` : null;

    if ((targetUuidKey && map.has(targetUuidKey)) || (targetNameKey && map.has(targetNameKey))) {
      const val = (targetUuidKey ? map.get(targetUuidKey) : 0) || (targetNameKey ? map.get(targetNameKey) : 0) || 0;
      if (targetUuidKey) map.set(targetUuidKey, 0);
      if (targetNameKey) map.set(targetNameKey, 0);
      return val;
    }

    if ((globalUuidKey && map.has(globalUuidKey)) || (globalNameKey && map.has(globalNameKey))) {
      const val = (globalUuidKey ? map.get(globalUuidKey) : 0) || (globalNameKey ? map.get(globalNameKey) : 0) || 0;
      if (globalUuidKey) map.set(globalUuidKey, 0);
      if (globalNameKey) map.set(globalNameKey, 0);
      return val;
    }

    return 0;
  }

  /**
   * Retrieve and consume allocated potency bonus for a modifyEffects node.
   * @param {object} context
   * @param {string} targetId
   * @param {string} nodeId
   * @returns {number}
   */
  static consumeModifyPotency(context, targetId, nodeId) {
    const map = context.potencyAllocations?.modifyBonuses;
    if (!map) return 0;
    const targetKey = `${targetId}_${nodeId}`;
    const globalKey = `global_${nodeId}`;
    if (map.has(targetKey)) {
      const val = map.get(targetKey) || 0;
      map.set(targetKey, 0);
      return val;
    }
    if (map.has(globalKey)) {
      const val = map.get(globalKey) || 0;
      map.set(globalKey, 0);
      return val;
    }
    return 0;
  }

  static getTerrainPotency(context, nodeId) {
    return context.potencyAllocations?.terrainBonuses?.get(nodeId) ?? 0;
  }

  static getRecoveryPotency(context, nodeId) {
    return context.potencyAllocations?.recoveryBonuses?.get(nodeId) ??
           (context.sparkChoices?.potencyBonus || 0);
  }

  static async onSparksSelected(context, actor, item, phaseKey = "") {
    await this.ensurePotencyAllocations(context, actor, item, phaseKey);
  }
}

export {
  hasLinkedEffect,
  parseIntensity,
  getActorEquippedWeapons,
  getReachableNodes,
  collectPotencyCandidates,
  registerAppliedEffect,
  updateAlreadyApplied
};
