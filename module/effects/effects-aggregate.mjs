import { DurationHelper } from "../helpers/duration-helper.mjs";
import { parseModifier, replacePlaceholders } from "./effects-evaluator.mjs";
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from "./effects-constants.mjs";

/**
 * Aggregates all active effects (Combat and Non-Combat) from an actor.
 * @param {Actor} actor 
 * @returns {{ combat: Array, nonCombat: Array }}
 */
export function getActorEffects(actor) {
  const effects = {
    combat: [],
    nonCombat: []
  };

  if (!actor) return effects;

  const sourceMapByUuid = {};
  for (const item of actor.items) {
    if (item.type === "feature") {
      (item.system.deeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
      (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    } else if (item.type === "weapon" && item.system.equipped) {
      (item.system.extraDeeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
      (item.system.enhancementEffects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    } else if (item.type === "armor" && item.system.equipped) {
      (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    }
  }

  for (const item of actor.items) {
    const equippableTypes = ["weapon", "armor", "accessory", "item"];
    const isEquippable = equippableTypes.includes(item.type);

    // Passive/Built-in effects from equipped items
    if (item.type !== "weapon" && item.system.equipped && Array.isArray(item.system.effects)) {
      item.system.effects.forEach((eff, index) => {
        if (isEquippable && (eff.type === "continuous" || eff.when === "immediate" || !eff.when)) return;

        const property = "effects";
        const effData = {
          id: `${item.id}-${property}-${index}`,
          name: eff.name ? `${item.name}: ${eff.name}` : `${item.name} (${eff.type || "effect"})`,
          intensity: eff.intensity || 0,
          modifier: parseModifier(eff.modifier, eff.intensity || 0),
          target: eff.target,
          isCombat: eff.isCombat,
          isOnlyReminder: !!eff.isOnlyReminder,
          gmOnly: !!eff.gmOnly,
          type: eff.type,
          description: eff.description || "",
          source: item.name,
          itemId: item.id,
          item: item,
          when: eff.when,
          duration: eff.duration || "indefinite",
          durationValue: eff.durationValue || 0,
          durationConditions: eff.durationConditions || [],
          durationOperator: eff.durationOperator || "OR",
          durationSummary: null,
          intensityIncrement: eff.intensityIncrement || 0,
          property,
          index,
          isPrevailable: !!eff.isPrevailable,
          synthetic: true,
          hiddenOnSheet: isEquippable
        };
        if (eff.isCombat) effects.combat.push(effData);
        else effects.nonCombat.push(effData);
      });
    }

    // Synthetic enhancement effects from equipped weapons
    if (item.type === "weapon" && item.system.equipped && Array.isArray(item.system.enhancementEffects)) {
      item.system.enhancementEffects.forEach((eff, index) => {
        if (eff.type === "continuous" || eff.when === "immediate" || !eff.when) return;

        const property = "enhancementEffects";
        const effData = {
          id: `${item.id}-${property}-${index}`,
          name: eff.name ? `${item.name}: ${eff.name}` : `${item.name} (${eff.type || "effect"})`,
          intensity: eff.intensity || 0,
          modifier: parseModifier(eff.modifier, eff.intensity || 0),
          target: eff.target,
          isCombat: eff.isCombat,
          isOnlyReminder: !!eff.isOnlyReminder,
          gmOnly: !!eff.gmOnly,
          type: eff.type,
          description: eff.description || "",
          source: item.name,
          itemId: item.id,
          item: item,
          when: eff.when,
          duration: eff.duration || "indefinite",
          durationValue: eff.durationValue || 0,
          durationConditions: eff.durationConditions || [],
          durationOperator: eff.durationOperator || "OR",
          durationSummary: null,
          intensityIncrement: eff.intensityIncrement || 0,
          property,
          index,
          isPrevailable: !!eff.isPrevailable,
          synthetic: true,
          hiddenOnSheet: isEquippable
        };
        if (eff.isCombat) effects.combat.push(effData);
        else effects.nonCombat.push(effData);
      });
    }

    // Standalone Effect items currently on the actor
    if (item.type === "effect") {
      const linkedUuid  = item.flags?.trespasser?.linkedSource;
      const fromInjury  = item.flags?.trespasser?.fromInjury === true;
      const injuryId    = item.flags?.trespasser?.injuryId;

      let sourceName = null;
      if (fromInjury && injuryId) {
        const injuryItem = actor.items.get(injuryId);
        sourceName = injuryItem ? injuryItem.name : null;
      } else if (linkedUuid) {
        sourceName = sourceMapByUuid[linkedUuid] ?? null;
      }

      const effData = {
        id: item.id,
        name: item.name,
        intensity: item.system.intensity || 0,
        modifier: parseModifier(item.system.modifier, item.system.intensity || 0),
        target: item.system.targetAttribute,
        isCombat: item.system.isCombat,
        isOnlyReminder: item.system.isOnlyReminder,
        type: item.system.type,
        movementType: item.system.movementType || "walk",
        movementTypeLabel: MOVEMENT_TYPE_LABELS[item.system.movementType || "walk"]
          ? game.i18n.localize(MOVEMENT_TYPE_LABELS[item.system.movementType || "walk"])
          : (item.system.movementType || "walk"),
        description: item.system.description,
        source: item.name,
        sourceName,
        when: item.system.when,
        duration: item.system.duration || "indefinite",
        durationValue: item.system.durationValue || 0,
        durationConditions: item.system.durationConditions || [],
        durationOperator: item.system.durationOperator || "OR",
        durationSummary: DurationHelper.formatSummary(item),
        intensityIncrement: item.system.intensityIncrement || 0,
        isPrevailable: !!item.system.isPrevailable,
        isLasting: !!item.system.isLasting,
        gmOnly: !!item.system.gmOnly,
        item: item,
        fromInjury
      };

      if (effData.isCombat) {
        effects.combat.push(effData);
      } else {
        effects.nonCombat.push(effData);
      }
    }
  }

  effects.combat.sort((a, b) => a.name.localeCompare(b.name));
  effects.nonCombat.sort((a, b) => a.name.localeCompare(b.name));

  return effects;
}

/**
 * Retrieves the active movement effect item from an actor, if any.
 * Prioritizes active combat effects during combat, then non-combat effects.
 * @param {Actor} actor
 * @returns {Item|null}
 */
export function getActiveMovementEffect(actor) {
  if (!actor) return null;
  const effects = getActorEffects(actor);
  const inCombat = !!(game.combat && game.combat.active && game.combat.started);
  const list = inCombat
    ? [...effects.combat, ...effects.nonCombat]
    : [...effects.nonCombat, ...effects.combat];

  for (const eff of list) {
    if (eff.type === "movement" && eff.item) {
      return eff.item;
    }
  }
  return null;
}

/**
 * Retrieves the effective movement type for an actor based on active movement effects.
 * Defaults to "walk" if no movement effect is active.
 * @param {Actor} actor
 * @returns {"walk"|"teleport"|"jump"}
 */
export function getMovementType(actor) {
  const effect = getActiveMovementEffect(actor);
  if (effect) {
    const type = (effect.system.movementType || "").toLowerCase();
    if (Object.values(MOVEMENT_TYPES).includes(type)) {
      return type;
    }
  }
  return "walk";
}

/**
 * Calculates the total numeric bonus for a specific attribute from all active effects.
 * @param {Actor} actor 
 * @param {string} attributeKey 
 * @param {string} [includeTiming] Optional timing to include (e.g. "use")
 * @returns {number}
 */
export function getAttributeBonus(actor, attributeKey, includeTiming = null) {
  if (!actor) return 0;
  const effects = getActorEffects(actor);
  const allEffects = [...effects.combat, ...effects.nonCombat];
  
  let total = 0;
  for (const eff of allEffects) {
    if (eff.target !== attributeKey) continue;

    if (eff.type === "on-trigger" && eff.when && eff.when !== "immediate" && eff.when !== includeTiming) continue;
    
    const resolvedMod = replacePlaceholders(eff.modifier.toString(), actor);
    const modStr = resolvedMod.replace("+", "").trim();
    const value = parseFloat(modStr);
    if (!isNaN(value)) {
      total += value;
    }
  }
  return total;
}

/**
 * Checks if any active effect provides advantage ('adv') for a specific attribute.
 * @param {Actor} actor 
 * @param {string} attributeKey 
 * @returns {boolean}
 */
export function hasAdvantage(actor, attributeKey) {
  if (!actor) return false;
  const effects = getActorEffects(actor);
  const allEffects = [...effects.combat, ...effects.nonCombat];
  
  for (const eff of allEffects) {
    if (eff.target !== attributeKey) continue;
    if (eff.modifier.toString().toLowerCase() === "adv") return true;
  }
  return false;
}
