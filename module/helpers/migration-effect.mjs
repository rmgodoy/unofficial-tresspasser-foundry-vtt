/**
 * migration-effect.mjs
 * Migration helper converting compendium Effect and State items to the TCA behavior format.
 */
import { TrespasserEffectData } from "../data/item-effect.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Migrate Effects within a compendium pack to the TCA behavior format.
 * @param {string} [packId]
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @returns {Promise<number>} Number of migrated effects
 */
export async function migrateCompendiumEffects(packId = null, options = {}) {
  if (!game.user.isGM) return 0;
  const effectivePackId = packId || `${SYSTEM_ID}.trespasser-content`;
  const pack = game.packs.get(effectivePackId) || (packId ? null : game.packs.get("trespasser.trespasser-content"));
  if (!pack || pack.documentName !== "Item") {
    console.warn(`Trespasser | Compendium pack "${effectivePackId}" not found or is not an Item pack.`);
    return 0;
  }

  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });

  console.log(`Trespasser | Starting Compendium Effect Migration for "${packId}"...`);
  const documents = await pack.getDocuments();
  const updates = [];

  for (const item of documents) {
    if (item.type !== "effect") continue;
    
    const persistentSource = item._source?.system || foundry.utils.deepClone(item.toObject().system);
    const rawToMigrate = foundry.utils.deepClone(persistentSource);
    delete rawToMigrate.behaviors;
    const migratedSystem = TrespasserEffectData.migrateData(rawToMigrate);

    const hasPersistentBehaviors = Array.isArray(persistentSource.behaviors) && persistentSource.behaviors.length > 0;

    if (options.force || !hasPersistentBehaviors) {
      updates.push({
        _id: item.id,
        system: migratedSystem
      });
      console.log(`Trespasser | Migrating compendium effect "${item.name}" (${item.id})`);
    }
  }

  if (updates.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Item.updateDocuments(chunk, { pack: pack.collection });
    }
    console.log(`Trespasser | Successfully migrated ${updates.length} effects in "${packId}".`);
  } else {
    console.log(`Trespasser | No effects in "${packId}" required migration.`);
  }

  if (wasLocked) await pack.configure({ locked: true });
  return updates.length;
}
