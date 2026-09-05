/**
 * migration-deed.mjs
 * World-level data migration converting legacy Deed items to the behavior-driven format.
 */
import { migrateToGraph } from "./migration-graph.mjs";
export { migrateToGraph };

/**
 * Parse legacy free-text target string into targetType, targetCount, targetSize.
 * @param {string} str
 * @returns {{ targetType: string, targetCount: number, targetSize: number }}
 */
export function parseTargetString(str) {
  const s = (typeof str === "string" ? str : "").trim();
  const defaults = { targetType: "creature", targetCount: 1, targetSize: 1 };

  if (!s) return defaults;

  // Personal / Self
  if (/^(personal|self)$/i.test(s)) {
    return { targetType: "personal", targetCount: 1, targetSize: 1 };
  }

  // Melee Burst X or Melee Burst
  const meleeBurst = s.match(/^melee\s+burst(?:\s+(\d+))?/i);
  if (meleeBurst) {
    return { targetType: "melee_burst", targetCount: 1, targetSize: parseInt(meleeBurst[1] || "1") };
  }

  // Close Blast X
  const closeBlast = s.match(/^close\s+blast\s+(\d+)/i);
  if (closeBlast) {
    return { targetType: "close_blast", targetCount: 1, targetSize: parseInt(closeBlast[1]) };
  }

  // Close Path X
  const closePath = s.match(/^close\s+path\s+(\d+)/i);
  if (closePath) {
    return { targetType: "close_path", targetCount: 1, targetSize: parseInt(closePath[1]) };
  }

  // Blast X (including "Blast X in Throw Range")
  const blast = s.match(/^blast\s+(\d+)/i);
  if (blast) {
    return { targetType: "blast", targetCount: 1, targetSize: parseInt(blast[1]) };
  }

  // Burst X
  const burst = s.match(/^burst\s+(\d+)/i);
  if (burst) {
    return { targetType: "burst", targetCount: 1, targetSize: parseInt(burst[1]) };
  }

  // Path X
  const path = s.match(/^path\s+(\d+)/i);
  if (path) {
    return { targetType: "path", targetCount: 1, targetSize: parseInt(path[1]) };
  }

  // Aura X
  const aura = s.match(/^aura\s+(\d+)/i);
  if (aura) {
    return { targetType: "aura", targetCount: 1, targetSize: parseInt(aura[1]) };
  }

  // N Creature(s) or N Target(s) or N Enemy/Enemies or N Ally/Allies or N Adjacent Creature(s)
  const countMatch = s.match(/^(\d+)\s*(?:adjacent\s+)?(?:creature|target|enemy|enemies|ally|allies)/i);
  if (countMatch && countMatch[1]) {
    return { targetType: "creature", targetCount: parseInt(countMatch[1]), targetSize: 1 };
  }

  return defaults;
}

/**
 * Convert legacy Deed system data object to behavior-driven format.
 * @param {object} source - Raw system data object of a Deed item
 * @returns {object} Updated system data object
 */
export function convertOldDeedSystem(source) {
  const src = foundry.utils.deepClone(source || {});

  // 1. Rename ability type (type -> abilityType)
  if (src.type && src.type !== "deed") {
    src.abilityType = src.type;
    delete src.type;
  }

  // 2. Rename accuracy test (accuracyTest -> versus)
  if (src.accuracyTest && !src.versus) {
    if (src.accuracyTest === "Resist") src.versus = "Resist";
    else if (src.accuracyTest === "Guard") src.versus = "Guard";
    else src.versus = "10";
  }

  // 3. Determine targetType, targetCount, targetSize
  // ALWAYS prioritize parsing `src.target` string if present, as old schema defaulted targetType to "melee_burst"
  let targetType, targetCount, targetSize;
  if (typeof src.target === "string" && src.target.trim()) {
    const parsed = parseTargetString(src.target);
    targetType  = parsed.targetType;
    targetCount = parsed.targetCount;
    targetSize  = parsed.targetSize;
  } else if (src.target && typeof src.target === "object") {
    targetType  = src.target.type || "creature";
    targetCount = parseInt(src.target.count || src.targetCount) || 1;
    targetSize  = parseInt(src.target.size || src.targetSize) || 1;
  } else if (src.targetType && src.targetType !== "melee_burst") {
    targetType  = src.targetType;
    targetCount = parseInt(src.targetCount) || 1;
    targetSize  = parseInt(src.targetSize) || 1;
  } else {
    targetType  = "creature";
    targetCount = 1;
    targetSize  = 1;
  }

  let selectTargetParams;
  if (targetType === "creature") {
    selectTargetParams = { targetMode: "creatures", targetCount };
  } else if (targetType === "personal") {
    selectTargetParams = { targetMode: "self" };
  } else if (["blast", "close_blast", "burst", "melee_burst", "path", "close_path", "aura"].includes(targetType)) {
    selectTargetParams = { targetMode: "aoe", aoeType: targetType, aoeSize: targetSize };
  } else {
    selectTargetParams = { targetMode: "creatures", targetCount: 1 };
  }

  const selectTargetBehavior = {
    id: foundry.utils.randomID(),
    type: "selectTarget",
    params: selectTargetParams
  };

  // 4. Convert effects -> phases
  if (src.effects || !src.phases) {
    src.phases = src.phases || {};
    const oldEffects = src.effects || {};
    const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];

    for (const phaseKey of phaseKeys) {
      const oldPhase = oldEffects[phaseKey] || {};
      const behaviors = [];

      // selectTarget is always the first behavior on the BEFORE phase
      if (phaseKey === "before") {
        behaviors.push(selectTargetBehavior);
      }

      // Damage behavior
      if (oldPhase.damage && typeof oldPhase.damage === "string" && oldPhase.damage.trim()) {
        behaviors.push({
          id: foundry.utils.randomID(),
          type: "applyDamage",
          params: { expression: oldPhase.damage.trim() }
        });
      }

      // Applied effects behavior
      const hasAppliedEffects = Array.isArray(oldPhase.appliedEffects) && oldPhase.appliedEffects.length > 0;
      const appliesWeaponEffects = !!oldPhase.appliesWeaponEffects;
      if (hasAppliedEffects || appliesWeaponEffects) {
        behaviors.push({
          id: foundry.utils.randomID(),
          type: "applyEffects",
          params: {
            effects: hasAppliedEffects ? oldPhase.appliedEffects : [],
            appliesWeaponEffects
          }
        });
      }

      // Forced movement behavior
      let fmType = oldPhase.forcedMovement?.type;
      let fmDist = oldPhase.forcedMovement?.distance || 0;
      if (!fmType && oldPhase.description) {
        const fmM = oldPhase.description.match(/(?:^|[.;]\s*)(push|pull|sweep|shove|drag)\s+(\d+)/i);
        if (fmM) {
          fmType = fmM[1].toLowerCase();
          fmDist = parseInt(fmM[2]) || 1;
        }
      }
      if (fmType) {
        behaviors.push({
          id: foundry.utils.randomID(),
          type: "forceMoveTargets",
          params: {
            type: fmType,
            distance: fmDist
          }
        });
      }

      // Recovery behavior
      if (oldPhase.description) {
        const recM = oldPhase.description.match(/(?:^|[.;]\s*)(?:grant|make)\s+(?:a\s+)?recovery\s+(\d+)/i);
        if (recM) {
          behaviors.push({
            id: foundry.utils.randomID(),
            type: "grantRecovery",
            params: {
              intensity: parseInt(recM[1]) || 1
            }
          });
        }
      }

      // Terrain spawn behavior
      if (oldPhase.terrainSpawn?.uuid) {
        behaviors.push({
          id: foundry.utils.randomID(),
          type: "spawnTerrain",
          params: {
            terrainUuid: oldPhase.terrainSpawn.uuid,
            terrainName: oldPhase.terrainSpawn.name || "",
            terrainImg: oldPhase.terrainSpawn.img || "",
            placement: oldPhase.terrainSpawn.placement || "on_target"
          }
        });
      }

      src.phases[phaseKey] = {
        description: oldPhase.description || "",
        skipPhase: false,
        behaviors
      };
    }
  } else if (src.phases?.before?.behaviors && (src.target !== undefined || src.targetType !== undefined)) {
    // If phases already exists and legacy target fields are present in source, update selectTarget behavior params
    const rawBehaviors = src.phases.before.behaviors;
    const beforeBehaviors = Array.isArray(rawBehaviors)
      ? rawBehaviors
      : (typeof rawBehaviors === "object" && rawBehaviors !== null ? Object.values(rawBehaviors) : []);
    const firstB = beforeBehaviors.find(b => b?.type === "selectTarget");
    if (firstB) {
      firstB.params = selectTargetParams;
    }
  }

  // 5. Migrate to Graph format if not already done
  migrateToGraph(src);

  return src;
}

/**
 * Migrate all world Deeds (sidebar & actor-embedded) to behavior-driven format.
 * @param {object} [options]
 * @param {boolean} [options.force=false] - Force re-running migration even if already completed
 */
export async function migrateWorldDeeds(options = {}) {
  if (!game.user.isGM) return;

  const force = !!options.force;
  const CURRENT_MIGRATION_VERSION = 5;
  const currentVersion = game.settings.get("trespasser", "deedMigrationVersion") || 0;
  if (!force && currentVersion >= CURRENT_MIGRATION_VERSION) return;

  console.log("Trespasser | Starting Deed Data Model Migration to Behavior-Driven format...");

  // 1. Migrate Sidebar items
  for (const item of game.items) {
    if (item.type !== "deed") continue;
    const rawSystem = foundry.utils.deepClone(item._source?.system || item.toObject().system);
    const updatedSystem = migrateToGraph(convertOldDeedSystem(rawSystem));
    if (JSON.stringify(updatedSystem) !== JSON.stringify(rawSystem)) {
      await item.update({ system: updatedSystem });
      console.log(`Trespasser | Migrated sidebar deed "${item.name}" (${item.id})`);
    }
  }

  // 2. Migrate Actor embedded items
  for (const actor of game.actors) {
    const deedUpdates = [];
    for (const item of actor.items) {
      if (item.type !== "deed") continue;
      const rawSystem = foundry.utils.deepClone(item._source?.system || item.toObject().system);
      const updatedSystem = migrateToGraph(convertOldDeedSystem(rawSystem));
      if (JSON.stringify(updatedSystem) !== JSON.stringify(rawSystem)) {
        deedUpdates.push({
          _id: item.id,
          system: updatedSystem
        });
        console.log(`Trespasser | Migrated embedded deed "${item.name}" on actor "${actor.name}"`);
      }
    }
    if (deedUpdates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", deedUpdates);
    }
  }

  await game.settings.set("trespasser", "deedMigrationVersion", CURRENT_MIGRATION_VERSION);
  console.log("Trespasser | Deed Data Model Migration complete.");
}

/**
 * Migrate Deeds within a compendium pack to the behavior-driven format.
 * @param {string} [packId="trespasser.trespasser-content"]
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @returns {Promise<number>} Number of migrated deeds
 */
export async function migrateCompendiumDeeds(packId = "trespasser.trespasser-content", options = {}) {
  if (!game.user.isGM) return 0;
  const pack = game.packs.get(packId);
  if (!pack || pack.documentName !== "Item") {
    console.warn(`Trespasser | Compendium pack "${packId}" not found or is not an Item pack.`);
    return 0;
  }

  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });

  console.log(`Trespasser | Starting Compendium Deed Migration for "${packId}"...`);
  const documents = await pack.getDocuments();
  const updates = [];

  for (const item of documents) {
    if (item.type !== "deed") continue;
    const rawSystem = foundry.utils.deepClone(item._source?.system || item.toObject().system);
    const updatedSystem = migrateToGraph(convertOldDeedSystem(rawSystem));
    if (options.force || JSON.stringify(updatedSystem) !== JSON.stringify(rawSystem)) {
      updates.push({
        _id: item.id,
        system: updatedSystem
      });
      console.log(`Trespasser | Migrating compendium deed "${item.name}" (${item.id})`);
    }
  }

  if (updates.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Item.updateDocuments(chunk, { pack: pack.collection });
    }
    console.log(`Trespasser | Successfully migrated ${updates.length} deeds in "${packId}".`);
  } else {
    console.log(`Trespasser | No deeds in "${packId}" required migration.`);
  }

  if (wasLocked) await pack.configure({ locked: true });
  return updates.length;
}

