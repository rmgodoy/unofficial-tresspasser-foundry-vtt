import { getTerrainRegionsContainingToken } from "./terrain-geometry.mjs";
import { resolveIntPlaceholder, evaluateIntensityValue } from "./terrain-behaviors.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";

const _syncWhileInsideLocks = new Set();
const _pendingWhileInsideSync = new Set();

/**
 * Clean up regions spawned in combat when combat ends.
 */
export async function cleanupCombatTerrains() {
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
export function isRegionLinkedToEffect(region, effectItem) {
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

  if (casterActorId && effectItem.parent?.id && effectItem.parent.id !== casterActorId && effectItem.parent?.uuid !== casterActorUuid) {
    return false;
  }

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
export async function onEffectDeleted(effectItem) {
  if (!effectItem || !game.user.isGM || effectItem.flags?.trespasser?.whileInside) return;
  const scenes = game.scenes?.contents || [];
  for (const scene of scenes) {
    const regionsToDelete = scene.regions
      .filter(r => scene.regions.has(r.id) && isRegionLinkedToEffect(r, effectItem))
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
 * @param {Item} effectItem 
 * @param {object} [changes] 
 */
export async function onEffectIntensityUpdated(effectItem, changes = {}) {
  if (!effectItem || effectItem.type !== "effect" || effectItem.flags?.trespasser?.whileInside) return;

  const scenes = game.scenes?.contents || [];
  for (const scene of scenes) {
    const linkedRegions = scene.regions.filter(r => isRegionLinkedToEffect(r, effectItem));
    for (const region of linkedRegions) {
      await syncWhileInsideEffectsForRegion(region);
    }
  }
}

/**
 * Synchronize "whileInside" behavior effects on an actor based on the terrain regions
 * currently containing their token.
 * @param {TokenDocument} tokenDoc 
 */
export async function syncWhileInsideEffectsForToken(tokenDoc) {
  if (!tokenDoc || !tokenDoc.actor) return;
  const actor = tokenDoc.actor;
  if (!actor.isOwner && !game.user.isGM) return;
  const scene = tokenDoc.parent || canvas.scene;
  if (!scene) return;

  const lockKey = actor.uuid || (actor.isToken ? tokenDoc.id : actor.id);
  if (_syncWhileInsideLocks.has(lockKey)) {
    _pendingWhileInsideSync.add(lockKey);
    return;
  }
  _syncWhileInsideLocks.add(lockKey);

  try {
    const containingRegions = getTerrainRegionsContainingToken(tokenDoc);
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
          if (desiredEffects.some(d => d.regionId === region.id && d.effectUuid === eff.uuid)) continue;

          const rawIntensity = resolveIntPlaceholder(eff.intensity || "1", region);
          const intensity = evaluateIntensityValue(rawIntensity, 1);
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

    const existingEffects = actor.items.filter(i => i.type === "effect" && i.flags?.trespasser?.whileInside === true);

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

    const toUpdate = [];
    for (const desired of desiredEffects) {
      const existing = existingEffects.find(e =>
        !toDelete.includes(e.id) &&
        e.flags?.trespasser?.sourceRegionId === desired.regionId &&
        (e.flags?.trespasser?.sourceEffectUuid === desired.effectUuid || e.flags?.trespasser?.linkedSource === desired.effectUuid || e.uuid === desired.effectUuid)
      );
      if (!existing) {
        const sourceEffect = await resolveItem(desired.effectUuid, { type: "effect" });
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
    _syncWhileInsideLocks.delete(lockKey);
    if (_pendingWhileInsideSync.has(lockKey)) {
      _pendingWhileInsideSync.delete(lockKey);
      const freshTokenDoc = scene.tokens?.get(tokenDoc.id) || tokenDoc;
      syncWhileInsideEffectsForToken(freshTokenDoc);
    }
  }
}

/**
 * Synchronize "whileInside" effects for all tokens in a region's scene.
 * @param {RegionDocument} region 
 */
export async function syncWhileInsideEffectsForRegion(region) {
  if (!region) return;
  const scene = region.parent;
  if (!scene) return;
  for (const tokenDoc of scene.tokens) {
    if (tokenDoc.actor) {
      await syncWhileInsideEffectsForToken(tokenDoc);
    }
  }
}

/**
 * Remove all "whileInside" effects originating from a deleted region from all actors.
 * @param {string} regionId 
 */
export async function cleanupWhileInsideEffectsForRegion(regionId) {
  if (!regionId || !game.user.isGM) return;
  const processedActorUuids = new Set();

  const cleanActor = async (actor) => {
    const actorKey = actor.uuid || (actor.isToken ? `${actor.token?.id || actor.parent?.id}_${actor.id}` : actor.id);
    if (!actorKey || processedActorUuids.has(actorKey)) return;
    processedActorUuids.add(actorKey);

    _syncWhileInsideLocks.delete(actorKey);
    _pendingWhileInsideSync.delete(actorKey);

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

  const scenes = game.scenes?.contents || [];
  for (const scene of scenes) {
    for (const tokenDoc of scene.tokens) {
      if (tokenDoc.actor) {
        await cleanActor(tokenDoc.actor);
      }
    }
  }

  for (const actor of (game.actors?.contents || [])) {
    await cleanActor(actor);
  }
}
