/**
 * Synchronizes actor effect states with active token status icons.
 */

const _syncTimers = new Map();
const _inFlightSyncs = new Set();
const _pendingReSyncs = new Set();

/**
 * Internal implementation of active status effect icon synchronization.
 * Cleans up duplicate ActiveEffects and creates/updates missing ones.
 * @param {Actor} actor
 */
export async function performSyncActorTokenEffects(actor) {
  if (!actor) return;

  const showEffects = game.settings.get("trespasser", "showStatusEffectsOnTokens") ?? true;
  // Get all active effect items on the actor that have a statusIcon selected or synced
  const effectItems = showEffects
    ? actor.items.filter(i => {
        if (i.type !== "effect") return false;
        const icon = (i.system?.syncStatusIcon !== false) ? (i.img || i.system?.statusIcon) : i.system?.statusIcon;
        return Boolean(icon);
      })
    : [];

  // Get all existing ActiveEffects on the actor that were created by our sync (have our sourceItem flag)
  const existingActiveEffects = actor.effects ? actor.effects.filter(ae => ae.getFlag("trespasser", "sourceItem")) : [];

  const itemsToKeep = new Set();
  const effectsToDelete = [];
  const effectsToCreate = [];
  const effectsToUpdate = [];

  // Group existing ActiveEffects by sourceItem to easily detect and clean up duplicates
  const aesBySource = new Map();
  for (const ae of existingActiveEffects) {
    const srcId = ae.getFlag("trespasser", "sourceItem");
    if (!aesBySource.has(srcId)) aesBySource.set(srcId, []);
    aesBySource.get(srcId).push(ae);
  }

  for (const item of effectItems) {
    const matchingAEs = aesBySource.get(item.id) || [];
    const ae = matchingAEs[0] || null;

    // If there are duplicate AEs for this same sourceItem, mark the extra ones for deletion immediately
    for (let i = 1; i < matchingAEs.length; i++) {
      effectsToDelete.push(matchingAEs[i].id);
    }

    const statusIconPath = (item.system?.syncStatusIcon !== false) ? (item.img || item.system?.statusIcon) : item.system?.statusIcon;
    if (!statusIconPath) {
      if (ae) effectsToDelete.push(ae.id);
      continue;
    }

    // Object.values handles both the v13 array and v14 object formats
    const matchingStatus = Object.values(CONFIG.statusEffects).find(se => {
      const img = se.img || se.icon || se.src;
      return img === statusIconPath;
    });
    const statusId = matchingStatus?.id || "effect";

    const effectData = {
      name: item.name,
      img: statusIconPath,
      statuses: [statusId],
      showIcon: 2,
      flags: {
        trespasser: {
          sourceItem: item.id
        }
      }
    };

    if (ae) {
      itemsToKeep.add(ae.id);
      const currentStatuses = Array.from(ae.statuses || []);
      const statusesChanged = currentStatuses.length !== 1 || currentStatuses[0] !== statusId;
      if (ae.name !== effectData.name || ae.img !== effectData.img || statusesChanged) {
        effectsToUpdate.push({
          _id: ae.id,
          name: effectData.name,
          img: effectData.img,
          statuses: [statusId]
        });
      }
    } else {
      effectsToCreate.push(effectData);
    }
  }

  // Identify ActiveEffects to delete
  for (const ae of existingActiveEffects) {
    if (!itemsToKeep.has(ae.id)) {
      effectsToDelete.push(ae.id);
    }
  }

  const uniqueDeleteIds = Array.from(new Set(effectsToDelete));

  // Perform database operations
  if (uniqueDeleteIds.length > 0) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", uniqueDeleteIds);
  }
  if (effectsToUpdate.length > 0) {
    await actor.updateEmbeddedDocuments("ActiveEffect", effectsToUpdate);
  }
  if (effectsToCreate.length > 0) {
    await actor.createEmbeddedDocuments("ActiveEffect", effectsToCreate);
  }
}

/**
 * Synchronizes the actor's active status effect icons with all its active tokens.
 * Debounced per actor to prevent race conditions when multiple effect items
 * are created, updated, or deleted in the same frame/operation.
 * @param {Actor} actor The actor document to sync tokens for
 */
export async function syncActorTokenEffects(actor) {
  if (!actor) return;
  const actorKey = actor.uuid || actor.id;
  if (!actorKey) return;

  if (_syncTimers.has(actorKey)) {
    clearTimeout(_syncTimers.get(actorKey));
  }

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      _syncTimers.delete(actorKey);

      if (_inFlightSyncs.has(actorKey)) {
        _pendingReSyncs.add(actorKey);
        resolve();
        return;
      }

      _inFlightSyncs.add(actorKey);
      try {
        await performSyncActorTokenEffects(actor);
      } catch (err) {
        console.error(`Trespasser | Failed to sync status icons for actor ${actor.name}:`, err);
      } finally {
        _inFlightSyncs.delete(actorKey);
        if (_pendingReSyncs.has(actorKey)) {
          _pendingReSyncs.delete(actorKey);
          syncActorTokenEffects(actor);
        }
        resolve();
      }
    }, 50);

    _syncTimers.set(actorKey, timer);
  });
}
