import {
  TRESPASSER_STATUS_EFFECTS,
  STATUS_EFFECT_COUNTERS,
  TOGGLE_ONLY_STATUS_EFFECTS,
  AIRBORNE_EFFECT_DATA,
  SUNKEN_EFFECT_DATA,
  IMMUNE_TO_DAMAGE_EFFECT_DATA,
  CANNOT_ACT_EFFECT_DATA,
  CANNOT_MOVE_EFFECT_DATA,
  COUNTS_AS_OBSTACLE_EFFECT_DATA
} from "../config/status-effects.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserEffectData } from "../data/item-effect.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

const SPECIAL_EFFECT_FALLBACKS = {
  airborne: AIRBORNE_EFFECT_DATA,
  sunken: SUNKEN_EFFECT_DATA,
  immuneToDamage: IMMUNE_TO_DAMAGE_EFFECT_DATA,
  cannotAct: CANNOT_ACT_EFFECT_DATA,
  cannotMove: CANNOT_MOVE_EFFECT_DATA,
  countsAsObstacle: COUNTS_AS_OBSTACLE_EFFECT_DATA
};

const STATUS_EFFECT_DEFAULTS = {
  accurate: { targetAttribute: "accuracy", modifier: "<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  inaccurate: { targetAttribute: "accuracy", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  fortified: { targetAttribute: "damage_received", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  frail: { targetAttribute: "damage_received", modifier: "<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  guarded: { targetAttribute: "guard", modifier: "<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  unguarded: { targetAttribute: "guard", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  hastened: { targetAttribute: "initiative", modifier: "<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  hindered: { targetAttribute: "initiative", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  mending: { targetAttribute: "health", modifier: "<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  afflicted: { targetAttribute: "health", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  strong: { targetAttribute: "damage_dealt", modifier: "<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  weak: { targetAttribute: "damage_dealt", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  swift: { targetAttribute: "speed", modifier: "<Int>", type: "continuous", isPrevailable: true },
  slow: { targetAttribute: "speed", modifier: "-<Int>", type: "continuous", isPrevailable: true },
  willful: { targetAttribute: "resist", modifier: "<Int>", type: "continuous", isPrevailable: true },
  weary: { targetAttribute: "resist", modifier: "-<Int>", type: "continuous", isPrevailable: true },
  bleeding: { targetAttribute: "health", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  blinded: { targetAttribute: "accuracy", modifier: "0", isCombat: true, type: "continuous", isPrevailable: true },
  burning: { targetAttribute: "health", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true },
  toppled: { targetAttribute: "guard", modifier: "-2", isCombat: true, type: "continuous", isPrevailable: true },
  staggered: { targetAttribute: "action_points", modifier: "-<Int>", isCombat: true, type: "continuous", isPrevailable: true }
};

/**
 * Handle custom status effect toggling on an actor.
 * Creates, updates, or deletes embedded Effect items and synchronizes token icons.
 *
 * @param {Actor} actor
 * @param {string|object} statusId
 * @param {object} [options]
 * @param {Function} [superToggleFn]
 * @returns {Promise<Item|ActiveEffect|boolean|void>}
 */
export async function toggleActorStatusEffect(actor, statusId, { active, overlay = false, intensity } = {}, superToggleFn = null) {
  const id = typeof statusId === "string" ? statusId : (statusId?.id || statusId?.compendiumId);
  const status = TRESPASSER_STATUS_EFFECTS.find(s =>
    s.id === id ||
    s.compendiumId === id ||
    s.img === id ||
    s.id === statusId ||
    s.compendiumId === statusId
  );

  if (!status) {
    if (typeof superToggleFn === "function") {
      return superToggleFn(statusId, { active, overlay });
    }
    return;
  }

  const localizedName = game.i18n.localize(status.name);

  // Check if actor already has an effect item matching this state
  const existingItem = actor.items.find(i =>
    i.type === "effect" && (
      TrespasserEffectsHelper.getMatchingCustomStatus(i)?.id === status.id ||
      i.getFlag(SYSTEM_ID, "statusEffectId") === status.id ||
      (status.id === "bloodied" && i.getFlag(SYSTEM_ID, "isBloodiedState")) ||
      (status.id === "tenacious" && i.getFlag(SYSTEM_ID, "isTenaciousState")) ||
      (status.id === "engaged" && i.getFlag(SYSTEM_ID, "isEngagedState")) ||
      (status.id === "encumbered" && i.getFlag(SYSTEM_ID, "isEncumberedState")) ||
      (status.id === "immuneToDamage" && i.getFlag(SYSTEM_ID, "immuneToDamage")) ||
      (status.id === "cannotAct" && i.getFlag(SYSTEM_ID, "cannotAct")) ||
      (status.id === "cannotMove" && i.getFlag(SYSTEM_ID, "cannotMove")) ||
      (status.id === "countsAsObstacle" && i.getFlag(SYSTEM_ID, "countsAsObstacle")) ||
      (status.compendiumId && (
        i.flags?.core?.sourceId?.includes(status.compendiumId) ||
        i._stats?.compendiumSource?.includes(status.compendiumId)
      )) ||
      (i.system?.statusIcon && i.system.statusIcon === status.img) ||
      (i.img && i.img === status.img) ||
      (i.name?.toLowerCase() === status.id.toLowerCase()) ||
      (localizedName && i.name?.toLowerCase() === localizedName.toLowerCase())
    )
  );

  const shouldAdd = active !== undefined ? Boolean(active) : !existingItem;

  if (shouldAdd) {
    if (existingItem) return existingItem;

    let itemData = null;
    const pack = game.packs?.get(`${SYSTEM_ID}.trespasser-content`);
    if (pack && status.compendiumId) {
      try {
        const doc = await pack.getDocument(status.compendiumId);
        if (doc) itemData = doc.toObject();
      } catch (_) {}
    }

    const counterId = STATUS_EFFECT_COUNTERS[status.id];
    const counterStatus = counterId ? TRESPASSER_STATUS_EFFECTS.find(s => s.id === counterId) : null;
    const fallbackCounterStates = counterStatus ? [{
      uuid: counterStatus.compendiumId ? `Item.${counterStatus.compendiumId}` : "",
      name: counterStatus.id.capitalize(),
      img: counterStatus.img,
      type: "effect"
    }] : [];

    const isToggleOnly = TOGGLE_ONLY_STATUS_EFFECTS.has(status.id.toLowerCase());
    const defaultIntensity = isToggleOnly ? 0 : 1;
    const initialIntensity = Math.round(Number(intensity !== undefined ? intensity : defaultIntensity) || 0);

    if (!itemData && SPECIAL_EFFECT_FALLBACKS[status.id]) {
      itemData = foundry.utils.deepClone(SPECIAL_EFFECT_FALLBACKS[status.id]);
    }

    if (!itemData) {
      const effectDef = STATUS_EFFECT_DEFAULTS[status.id.toLowerCase()] || {};
      const targetAttr = effectDef.targetAttribute || "health";
      const mod = effectDef.modifier || "0";
      const effType = effectDef.type || "continuous";
      const isPrev = effectDef.isPrevailable !== undefined ? effectDef.isPrevailable : !isToggleOnly;

      itemData = {
        name: localizedName || status.id.capitalize(),
        type: "effect",
        img: status.img,
        system: {
          description: "",
          type: effType,
          isCombat: true,
          isOnlyReminder: isToggleOnly,
          gmOnly: false,
          intensity: initialIntensity,
          targetAttribute: targetAttr,
          modifier: mod,
          conferredState: "",
          when: "immediate",
          duration: "indefinite",
          durationValue: 0,
          durationOperator: "OR",
          durationConditions: [],
          intensityIncrement: 0,
          counterStates: fallbackCounterStates,
          isPrevailable: isPrev,
          showTokenIcon: true,
          statusIcon: status.img,
          syncStatusIcon: false
        }
      };
    } else {
      if (localizedName) {
        itemData.name = localizedName;
      }
      itemData.system.intensity = initialIntensity;
      if (!itemData.system.counterStates || itemData.system.counterStates.length === 0) {
        itemData.system.counterStates = fallbackCounterStates;
      }
    }

    if (!itemData.system.behaviors || itemData.system.behaviors.length === 0) {
      TrespasserEffectData.migrateData(itemData.system);
    }

    delete itemData._id;
    delete itemData.folder;
    delete itemData.sort;
    delete itemData.ownership;
    delete itemData._key;
    itemData.flags = itemData.flags || {};
    itemData.flags[SYSTEM_ID] = itemData.flags[SYSTEM_ID] || {};
    itemData.flags[SYSTEM_ID].statusEffectId = status.id;
    if (status.compendiumId) {
      itemData.flags.core = itemData.flags.core || {};
      itemData.flags.core.sourceId = `Compendium.${SYSTEM_ID}.trespasser-content.Item.${status.compendiumId}`;
    }
    if (status.id === "bloodied") {
      itemData.flags[SYSTEM_ID].isBloodiedState = true;
    }
    if (status.id === "tenacious") {
      itemData.flags[SYSTEM_ID].isTenaciousState = true;
    }
    if (status.id === "engaged") {
      itemData.flags[SYSTEM_ID].isEngagedState = true;
    }
    if (status.id === "encumbered") {
      itemData.flags[SYSTEM_ID].isEncumberedState = true;
    }
    if (status.id === "immuneToDamage" || status.id === "cannotAct" || status.id === "cannotMove" || status.id === "countsAsObstacle") {
      itemData.flags[SYSTEM_ID][status.id] = true;
    }

    const created = await actor.createEmbeddedDocuments("Item", [itemData]);

    // Clean up any loose ActiveEffects not tied to an item
    const legacyAEs = actor.effects?.filter(ae => ae.statuses?.has(status.id) && !ae.getFlag(SYSTEM_ID, "sourceItem")) || [];
    if (legacyAEs.length > 0) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", legacyAEs.map(e => e.id));
    }

    if (status.id === "defeated" || status.id === CONFIG.specialStatusEffects?.DEFEATED) {
      const combatant = game.combat?.combatants?.find(c => c.actorId === actor.id || (actor.isToken && c.tokenId === actor.token?.id));
      if (combatant && !combatant.defeated) {
        await combatant.update({ defeated: true });
      }
      await TrespasserEffectsHelper.syncActorTenaciousItem(actor);
    }

    await TrespasserEffectsHelper.syncActorTokenEffects(actor);
    return created[0];
  }

  // Remove existing effect item and associated ActiveEffects
  if (existingItem) {
    await actor.deleteEmbeddedDocuments("Item", [existingItem.id]);
  }

  const matchingAEs = actor.effects?.filter(ae => ae.statuses?.has(status.id)) || [];
  if (matchingAEs.length > 0) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", matchingAEs.map(e => e.id));
  }

  if (status.id === "defeated" || status.id === CONFIG.specialStatusEffects?.DEFEATED) {
    const combatant = game.combat?.combatants?.find(c => c.actorId === actor.id || (actor.isToken && c.tokenId === actor.token?.id));
    if (combatant && combatant.defeated) {
      await combatant.update({ defeated: false });
    }
    await TrespasserEffectsHelper.syncActorTenaciousItem(actor);
  }

  await TrespasserEffectsHelper.syncActorTokenEffects(actor);
}
