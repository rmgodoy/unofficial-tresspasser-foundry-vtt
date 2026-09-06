import {
  TRESPASSER_STATUS_EFFECTS,
  BLOODIED_EFFECT_COMPENDIUM_ID,
  BLOODIED_EFFECT_DATA
} from "../config/status-effects.mjs";

const _syncTimers = new Map();
const _inFlightSyncs = new Set();
const _pendingReSyncs = new Set();
const _bloodiedSyncLocks = new Set();

/**
 * Resolves whether an actor's item represents one of the 27 custom Trespasser states.
 * @param {Item} item
 * @returns {object|null}
 */
export function getMatchingCustomStatus(item) {
  if (!item || item.type !== "effect") return null;

  const flagId = item.getFlag("trespasser", "statusEffectId");
  if (flagId) {
    const found = TRESPASSER_STATUS_EFFECTS.find(s => s.id === flagId);
    if (found) return found;
  }

  if (item.getFlag("trespasser", "isBloodiedState") || item.name === "Bloodied") {
    return TRESPASSER_STATUS_EFFECTS.find(s => s.id === "bloodied");
  }

  const sourceId = item.flags?.core?.sourceId || item._stats?.compendiumSource;
  if (sourceId) {
    const found = TRESPASSER_STATUS_EFFECTS.find(s => s.compendiumId && sourceId.includes(s.compendiumId));
    if (found) return found;
  }

  const icon = item.system?.statusIcon || item.img;
  if (icon) {
    const found = TRESPASSER_STATUS_EFFECTS.find(s => s.img === icon);
    if (found) return found;
  }

  const rawName = item.name?.trim().toLowerCase();
  const cleanName = item.name?.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
  if (rawName || cleanName) {
    const found = TRESPASSER_STATUS_EFFECTS.find(s => {
      const sId = s.id.toLowerCase();
      const locName = game.i18n?.localize(s.name)?.toLowerCase();
      return (rawName && (sId === rawName || locName === rawName)) ||
             (cleanName && (sId === cleanName || locName === cleanName));
    });
    if (found) return found;
  }

  return null;
}

/**
 * Checks whether an effect item matches a counter state definition.
 * Supports exact name, localized name, compendium UUID, sourceId, and statusEffectId.
 * @param {object|string} counterDef - Counter state definition {uuid, name} or string identifier
 * @param {Item} effectItem - Actor effect item document
 * @returns {boolean}
 */
export function isCounterEffectMatch(counterDef, effectItem) {
  if (!effectItem || effectItem.type !== "effect" || !counterDef) return false;

  const csName = (typeof counterDef === "string" ? counterDef : counterDef.name)?.trim().toLowerCase();
  const csUuid = typeof counterDef === "object" ? counterDef.uuid : null;

  const effName = effectItem.name?.trim().toLowerCase();
  if (csName && effName === csName) return true;

  if (csUuid) {
    const rawId = csUuid.replace(/^Item\./, "");
    if (effectItem.flags?.core?.sourceId?.includes(rawId) ||
        effectItem._stats?.compendiumSource === csUuid ||
        effectItem._stats?.compendiumSource === rawId ||
        effectItem.id === rawId) {
      return true;
    }
  }

  const customStatus = getMatchingCustomStatus(effectItem);
  if (customStatus) {
    if (csName && customStatus.id.toLowerCase() === csName) return true;
    if (csUuid && customStatus.compendiumId && csUuid.includes(customStatus.compendiumId)) return true;
    const locName = game.i18n?.localize(customStatus.name)?.toLowerCase();
    if (locName && csName && (locName === csName || csName === customStatus.name?.toLowerCase())) return true;
  }

  return false;
}

/**
 * Retrieves the list of active combat effects for an actor formatted for Combat Tracker display.
 * @param {Actor} actor
 * @returns {Array<{id: string, name: string, icon: string, intensity: number}>}
 */
export function getCombatTrackerEffects(actor) {
  if (!actor) return [];
  const effectsList = [];

  // 1. Combat effect items on the actor
  for (const item of actor.items) {
    if (item.type !== "effect" || !item.system?.isCombat) continue;
    if (item.system.gmOnly && !game.user.isGM) continue;
    const icon = (item.system.syncStatusIcon !== false)
      ? (item.img || item.system.statusIcon)
      : (item.system.statusIcon || item.img);
    if (icon) {
      effectsList.push({
        id: item.id,
        name: item.name,
        icon,
        intensity: item.system.intensity || 0
      });
    }
  }

  // 2. Standalone ActiveEffects explicitly enabled for token/tracker display (showIcon === 2)
  for (const eff of (actor.effects || [])) {
    if (eff.disabled || eff.isSuppressed || eff.showIcon !== 2) continue;
    const sourceItemId = eff.getFlag("trespasser", "sourceItem");
    if (sourceItemId && effectsList.some(e => e.id === sourceItemId)) continue;
    const icon = eff.img || eff.icon;
    if (icon && !effectsList.some(e => e.icon === icon)) {
      effectsList.push({
        id: eff.id,
        name: eff.name,
        icon,
        intensity: eff.getFlag("trespasser", "intensity") || 0
      });
    }
  }

  return effectsList;
}

/**
 * Synchronizes the compendium Bloodied effect item on the actor based on current health.
 * Creates the effect item if HP <= max_health / 2, removes it if HP > max_health / 2.
 * @param {Actor} actor
 */
export async function syncActorBloodiedItem(actor) {
  if (!actor) return;
  const health = actor.system?.health;
  const maxHealth = actor.system?.max_health;
  if (health === undefined || maxHealth === undefined || maxHealth <= 0) return;

  const actorKey = actor.uuid || actor.id;
  if (!actorKey || _bloodiedSyncLocks.has(actorKey)) return;
  _bloodiedSyncLocks.add(actorKey);

  try {
    const isBloodied = Boolean(actor.system?.passiveStates?.bloody ?? (health <= (maxHealth / 2)));
    const bloodiedItem = actor.items.find(i =>
      i.type === "effect" && (i.getFlag("trespasser", "isBloodiedState") === true || i.name === "Bloodied")
    );

    if (isBloodied && !bloodiedItem) {
      let itemData = null;
      const pack = game.packs?.get("trespasser.trespasser-content");
      if (pack) {
        try {
          const doc = await pack.getDocument(BLOODIED_EFFECT_COMPENDIUM_ID);
          if (doc) itemData = doc.toObject();
        } catch (_) {}
      }
      if (!itemData) {
        itemData = foundry.utils.deepClone(BLOODIED_EFFECT_DATA);
      }
      delete itemData._id;
      itemData.flags = itemData.flags || {};
      itemData.flags.trespasser = itemData.flags.trespasser || {};
      itemData.flags.trespasser.isBloodiedState = true;

      await actor.createEmbeddedDocuments("Item", [itemData]);
    } else if (!isBloodied && bloodiedItem && bloodiedItem.getFlag("trespasser", "isBloodiedState")) {
      await actor.deleteEmbeddedDocuments("Item", [bloodiedItem.id]);
    }
  } catch (err) {
    console.error(`Trespasser | Failed to sync bloodied item for actor ${actor.name}:`, err);
  } finally {
    _bloodiedSyncLocks.delete(actorKey);
  }
}

/**
 * Internal implementation of active status effect icon synchronization.
 * Cleans up duplicate ActiveEffects and creates/updates missing ones.
 * @param {Actor} actor
 */
export async function performSyncActorTokenEffects(actor) {
  if (!actor) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const showEffects = game.settings.get("trespasser", "showStatusEffectsOnTokens") ?? true;

  // Gather all effect items on the actor that have an icon
  const effectItems = actor.items.filter(i => {
    if (i.type !== "effect") return false;
    const icon = (i.system?.syncStatusIcon !== false) ? (i.img || i.system?.statusIcon) : (i.system?.statusIcon || i.img);
    return Boolean(icon);
  });

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

    const customStatus = getMatchingCustomStatus(item);
    const statusIconPath = (item.system?.syncStatusIcon !== false)
      ? (customStatus?.img || item.img || item.system?.statusIcon)
      : (item.system?.statusIcon || customStatus?.img || item.img);
    if (!statusIconPath) {
      if (ae) effectsToDelete.push(ae.id);
      continue;
    }

    // Object.values handles both the v13 array and v14 object formats
    const matchingStatus = customStatus || Object.values(CONFIG.statusEffects).find(se => {
      const img = se.img || se.icon || se.src;
      return img === statusIconPath;
    });
    const statusId = matchingStatus?.id || item.getFlag("trespasser", "statusEffectId") || item.id;
    // Leverage showIcon: 2 for combat effects meant for token display, 0 for hidden/non-combat
    const shouldShow = Boolean(showEffects && item.system?.isCombat && (!item.system?.gmOnly || game.user.isGM));
    const showIcon = shouldShow ? 2 : 0;

    const effectData = {
      name: item.name,
      img: statusIconPath,
      icon: statusIconPath,
      statuses: [statusId],
      showIcon,
      flags: {
        trespasser: {
          sourceItem: item.id,
          intensity: item.system?.intensity || 0
        }
      }
    };

    if (ae) {
      itemsToKeep.add(ae.id);
      const currentStatuses = Array.from(ae.statuses || []);
      const statusesChanged = currentStatuses.length !== 1 || currentStatuses[0] !== statusId;
      const showIconChanged = ae.showIcon !== showIcon;
      if (ae.name !== effectData.name || (ae.img !== effectData.img && ae.icon !== effectData.img) || statusesChanged || showIconChanged) {
        effectsToUpdate.push({
          _id: ae.id,
          name: effectData.name,
          img: effectData.img,
          icon: effectData.img,
          statuses: [statusId],
          showIcon,
          "flags.trespasser.intensity": effectData.flags.trespasser.intensity
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

  // Force all canvas tokens linked to this actor to redraw their effect icons.
  // In Foundry V14, ActiveEffect changes don't automatically trigger token visual refresh.
  refreshTokensForActor(actor);
}

/**
 * Forces all canvas token objects linked to the given actor to redraw their status effect icons.
 * @param {Actor} actor
 */
export function refreshTokensForActor(actor) {
  if (!canvas?.tokens?.placeables) return;

  for (const tokenObj of canvas.tokens.placeables) {
    const matches = actor.isToken
      ? (tokenObj.id === (actor.token?.id || actor.id))
      : (tokenObj.document.actorId === actor.id || tokenObj.actor?.id === actor.id);
    if (!matches) continue;

    if (tokenObj.renderFlags) {
      tokenObj.renderFlags.set({ refreshEffects: true, refresh: true });
    } else if (typeof tokenObj.drawEffects === "function") {
      tokenObj.drawEffects();
    }
  }

  // Also re-render the Token HUD if it's open for this actor
  if (canvas.tokens?.hud?.rendered) {
    const hudToken = canvas.tokens.hud.object;
    const matchesHud = actor.isToken
      ? (hudToken?.id === (actor.token?.id || actor.id))
      : (hudToken?.actor?.id === actor.id);
    if (matchesHud) {
      canvas.tokens.hud.render(true);
    }
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
