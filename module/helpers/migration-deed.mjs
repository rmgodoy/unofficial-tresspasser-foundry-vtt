/**
 * migration-deed.mjs
 * World-level data migration converting legacy Deed items to the behavior-driven format.
 */

/**
 * Convert legacy Deed system data object to behavior-driven format.
 * @param {object} source - Raw system data object of a Deed item
 * @returns {object} Updated system data object
 */
export function convertOldDeedSystem(source) {
  const src = foundry.utils.deepClone(source || {});

  // If already migrated (has phases schema), return as-is
  if (src.phases && !src.effects) return src;

  // 1. Rename ability type (type -> abilityType)
  if (src.type && !src.abilityType) {
    src.abilityType = src.type;
    delete src.type;
  }

  // 2. Rename accuracy test (accuracyTest -> versus)
  if (src.accuracyTest && !src.versus) {
    if (src.accuracyTest === "Resist") src.versus = "Resist";
    else if (src.accuracyTest === "Guard") src.versus = "Guard";
    else src.versus = "10";
    delete src.accuracyTest;
  }

  // 3. Convert target parameters to selectTarget behavior on BEFORE phase
  const targetType = src.targetType || "creature";
  const targetCount = src.targetCount || 1;
  const targetSize = src.targetSize || 1;

  let selectTargetParams;
  if (targetType === "creature") {
    selectTargetParams = { targetMode: "creatures", targetCount };
  } else if (targetType === "personal") {
    selectTargetParams = { targetMode: "self" };
  } else {
    selectTargetParams = { targetMode: "squares", aoeType: targetType, aoeSize: targetSize };
  }

  const selectTargetBehavior = {
    id: foundry.utils.randomID(),
    type: "selectTarget",
    params: selectTargetParams
  };

  // 4. Convert effects -> phases
  src.phases = {};
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
    if (Array.isArray(oldPhase.appliedEffects) && oldPhase.appliedEffects.length > 0) {
      behaviors.push({
        id: foundry.utils.randomID(),
        type: "applyEffects",
        params: {
          effects: oldPhase.appliedEffects,
          appliesWeaponEffects: !!oldPhase.appliesWeaponEffects
        }
      });
    }

    // Forced movement behavior
    if (oldPhase.forcedMovement?.type) {
      behaviors.push({
        id: foundry.utils.randomID(),
        type: "forceMoveTargets",
        params: {
          type: oldPhase.forcedMovement.type,
          distance: oldPhase.forcedMovement.distance || 0
        }
      });
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

  delete src.effects;
  delete src.target;
  delete src.targetType;
  delete src.targetCount;
  delete src.targetSize;

  return src;
}

/**
 * Migrate all world Deeds (sidebar & actor-embedded) to behavior-driven format.
 */
export async function migrateWorldDeeds() {
  if (!game.user.isGM) return;

  const CURRENT_MIGRATION_VERSION = 1;
  const currentVersion = game.settings.get("trespasser", "deedMigrationVersion") || 0;
  if (currentVersion >= CURRENT_MIGRATION_VERSION) return;

  console.log("Trespasser | Starting Deed Data Model Migration to Behavior-Driven format...");

  // 1. Migrate Sidebar items
  for (const item of game.items) {
    if (item.type !== "deed") continue;
    const rawData = item.toObject();
    if (rawData.system?.effects) {
      const updatedSystem = convertOldDeedSystem(rawData.system);
      await item.update({ system: updatedSystem });
      console.log(`Trespasser | Migrated sidebar deed "${item.name}" (${item.id})`);
    }
  }

  // 2. Migrate Actor embedded items
  for (const actor of game.actors) {
    const deedUpdates = [];
    for (const item of actor.items) {
      if (item.type !== "deed") continue;
      const rawData = item.toObject();
      if (rawData.system?.effects) {
        const updatedSystem = convertOldDeedSystem(rawData.system);
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
