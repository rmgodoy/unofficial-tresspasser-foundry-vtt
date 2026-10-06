import { DurationHelper } from "../helpers/duration-helper.mjs";
import { parseModifier, replacePlaceholders } from "./effects-evaluator.mjs";
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from "./effects-constants.mjs";
import { SYSTEM_ID, getSystemFlag, getSystemFlags } from "../system-id.mjs";

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
      const linkedUuid  = getSystemFlag(item, "linkedSource");
      const fromInjury  = getSystemFlag(item, "fromInjury") === true;
      const injuryId    = getSystemFlag(item, "injuryId");

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
 * Retrieves the breakdown of all active effects targeting a specific attribute/stat.
 * Single source of truth for attribute effect resolution.
 * @param {Actor} actor 
 * @param {string} attributeKey 
 * @param {string} [includeTiming] Optional timing to include (e.g. "use")
 * @returns {Array<object>} List of matching effect breakdown items
 */
export function getAttributeEffects(actor, attributeKey, includeTiming = null) {
  if (!actor || !attributeKey) return [];
  const targetNorm = normalizeTargetAttribute(attributeKey);
  const effects = getActorEffects(actor);
  const allEffects = [...effects.combat, ...effects.nonCombat];
  
  const results = [];
  const handledItemIds = new Set();

  // 1. Process TCA blocks from items with behaviors
  for (const item of actor.items) {
    const behaviors = item.system?.behaviors;
    if (!Array.isArray(behaviors) || behaviors.length === 0) continue;

    for (const block of behaviors) {
      if (block.action !== "modify_attribute") continue;

      const rawAttr = block.params?.attribute || item.system?.targetAttribute;
      if (!rawAttr || normalizeTargetAttribute(rawAttr) !== targetNorm) continue;

      const trigger = block.trigger || item.system?.when || (item.system?.type === "continuous" ? "continuous" : "immediate");
      const matchesTiming = trigger === "continuous" ||
        trigger === "immediate" ||
        (includeTiming && trigger === includeTiming) ||
        (includeTiming === "use" && (trigger === "continuous" || trigger === "immediate" || trigger === "use"));
      if (!matchesTiming) continue;

      const rawModifier = block.params?.modifier ?? item.system?.modifier ?? "0";
      const rawMod = parseModifier(rawModifier, item.system?.intensity || 0);
      const resolvedMod = replacePlaceholders(rawMod, actor);
      const modStr = resolvedMod.replace(/\s+/g, "").replace("+", "").trim();
      const parsed = targetNorm === "elevation" ? parseInt(modStr, 10) : parseFloat(modStr);
      const numericValue = !isNaN(parsed) ? (targetNorm === "elevation" ? Math.round(parsed) : parsed) : 0;
      const isAdv = String(rawModifier).toLowerCase() === "adv";

      results.push({
        id: `${item.id}-tca-${block.id || foundry.utils.randomID(4)}`,
        name: item.name,
        value: numericValue,
        modifierStr: String(rawModifier),
        isAdv,
        description: item.system?.description || "",
        source: item.name,
        checked: true
      });
      handledItemIds.add(item.id);
    }
  }

  // 2. Process all effects from getActorEffects that weren't handled as TCA blocks
  for (const eff of allEffects) {
    if (eff.item?.id && handledItemIds.has(eff.item.id)) continue;
    if (!eff.target || normalizeTargetAttribute(eff.target) !== targetNorm) continue;

    if (eff.type === "on-trigger" && eff.when && eff.when !== "immediate" && eff.when !== includeTiming) continue;
    
    const rawMod = eff.modifier !== undefined && eff.modifier !== null ? eff.modifier.toString() : "0";
    const isAdv = rawMod.toLowerCase() === "adv";
    const resolvedMod = replacePlaceholders(rawMod, actor);
    const modStr = resolvedMod.replace(/\s+/g, "").replace("+", "").trim();
    const parsed = targetNorm === "elevation" ? parseInt(modStr, 10) : parseFloat(modStr);
    const numericValue = !isNaN(parsed) ? (targetNorm === "elevation" ? Math.round(parsed) : parsed) : 0;

    results.push({
      id: eff.id,
      name: eff.name,
      value: numericValue,
      modifierStr: rawMod,
      isAdv,
      description: eff.description || "",
      source: eff.sourceName || eff.source || "",
      checked: true
    });
  }

  if (results.length > 0) {
    console.log(`%c[Effects Aggregate | getAttributeEffects]%c Actor "${actor.name}": Attribute "${attributeKey}" (timing: ${includeTiming}) -> ${results.length} modifiers`, "color: #61afef;", "color: inherit;", results);
  }

  return results;
}

/**
 * Constructs the standardized Effect Bonus entry for roll dialogs.
 * @param {Actor} actor 
 * @param {string} attributeKey 
 * @param {string} [includeTiming="use"]
 * @returns {object}
 */
export function buildEffectBonusEntry(actor, attributeKey, includeTiming = "use") {
  const children = getAttributeEffects(actor, attributeKey, includeTiming);
  const totalValue = children.reduce((sum, eff) => sum + (eff.value || 0), 0);
  return {
    id: "effectBonus",
    key: "effectBonus",
    label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus",
    value: totalValue,
    isAccordion: true,
    children
  };
}

/**
 * Calculates the total numeric bonus for a specific attribute from all active effects.
 * @param {Actor} actor 
 * @param {string} attributeKey 
 * @param {string} [includeTiming] Optional timing to include (e.g. "use")
 * @returns {number}
 */
export function getAttributeBonus(actor, attributeKey, includeTiming = null) {
  const effects = getAttributeEffects(actor, attributeKey, includeTiming);
  const total = effects.reduce((sum, eff) => sum + (eff.value || 0), 0);
  return attributeKey === "elevation" ? Math.round(total) : total;
}

/**
 * Checks if any active effect provides advantage ('adv') for a specific attribute.
 * @param {Actor} actor 
 * @param {string} attributeKey 
 * @returns {boolean}
 */
export function hasAdvantage(actor, attributeKey) {
  if (!actor || !attributeKey) return false;
  const effects = getAttributeEffects(actor, attributeKey, "use");
  return effects.some(eff => eff.isAdv);
}

/**
 * Normalizes target attribute string for damage and healing modifiers.
 * @param {string} target
 * @returns {string}
 */
export function normalizeTargetAttribute(target) {
  if (!target) return "";
  let s = String(target).toLowerCase().replace(/^(system\.)?(combat\.|attributes\.)/, "").replace(/-/g, "_").trim();
  if (s === "hp") s = "health";
  if (s === "max_hp" || s === "maxhealth") s = "max_health";
  if (s === "speedbonus") s = "speed_bonus";
  if (s === "damage_dealt" || s === "damage_given" || s === "dmg_dealt" || s === "dmg_given") return "damage_given";
  if (s === "damage_received" || s === "dmg_received") return "damage_received";
  if (s === "heal_given") return "heal_given";
  if (s === "heal_received") return "heal_received";
  if (s === "slot_capacity" || s === "slots" || s === "inventory_slots" || s === "inventorymax" || s === "max_slots") return "inventory_max";
  return s;
}

/**
 * Retrieve raw string modifiers for an actor matching a targetType (e.g. "damage_given", "damage_received").
 * @param {Actor} actor
 * @param {string} targetType
 * @returns {string[]}
 */
export function getActorRelevantModifiers(actor, targetType) {
  if (!actor) return [];
  const targetNorm = normalizeTargetAttribute(targetType);
  let allEffects = [];
  try {
    const { combat = [], nonCombat = [] } = getActorEffects(actor) || {};
    allEffects = [...combat, ...nonCombat];
  } catch (err) {
    console.warn("Trespasser | Failed to getActorEffects for outcome preview", err);
  }

  const modifiers = [];
  const handledItemIds = new Set();

  for (const item of actor.items) {
    const behaviors = item.system?.behaviors;
    if (!Array.isArray(behaviors) || behaviors.length === 0) continue;
    for (const block of behaviors) {
      const trigger = block.trigger || item.system?.when || (item.system?.type === "continuous" ? "continuous" : "immediate");
      if (trigger !== "continuous" && trigger !== "immediate") continue;
      if (block.action !== "modify_attribute") continue;
      const rawAttr = block.params?.attribute || item.system?.targetAttribute;
      if (normalizeTargetAttribute(rawAttr) === targetNorm) {
        const rawMod = parseModifier(block.params?.modifier || item.system?.modifier || "0", item.system?.intensity || 0);
        const cleanMod = String(rawMod).trim();
        if (cleanMod && cleanMod !== "0") {
          modifiers.push(cleanMod);
        }
        handledItemIds.add(item.id);
      }
    }
  }

  for (const eff of allEffects) {
    if (eff.item?.id && handledItemIds.has(eff.item.id)) continue;
    if (eff.isOnlyReminder) continue;
    const normTarget = normalizeTargetAttribute(eff.target);
    if (normTarget === targetNorm) {
      const mod = eff.modifier ? String(eff.modifier).trim() : "";
      if (mod && mod !== "0") {
        modifiers.push(mod);
      }
    }
  }

  return modifiers;
}

/**
 * Appends modifiers cleanly to a list of base formula expressions.
 * @param {string[]} baseList
 * @param {string[]} modifierList
 * @returns {string[]}
 */
export function combineModifierFormulas(baseList, modifierList) {
  if (!baseList || baseList.length === 0) return [];
  if (!modifierList || modifierList.length === 0) return [...baseList];

  let result = baseList.join(" + ").trim();
  for (const mod of modifierList) {
    const cleanMod = String(mod).trim();
    if (!cleanMod || cleanMod === "0") continue;
    if (cleanMod.startsWith("+")) {
      result += ` + ${cleanMod.substring(1).trim()}`;
    } else if (cleanMod.startsWith("-")) {
      result += ` - ${cleanMod.substring(1).trim()}`;
    } else {
      result += ` + ${cleanMod}`;
    }
  }
  return [result];
}

/**
 * Checks whether an actor has a specific flag or effect active.
 * Checks actor flags, embedded effect items, and status effects.
 * @param {Actor} actor
 * @param {string} flagKey - e.g. "immuneToDamage", "cannotAct", "cannotMove", "countsAsObstacle"
 * @returns {boolean}
 */
export function hasActorFlagOrEffect(actor, flagKey) {
  if (!actor || !flagKey) return false;

  // 1. Direct document flag on actor
  if (getSystemFlag(actor, flagKey)) {
    return true;
  }

  // 2. Active status effects on Actor (Foundry statuses set or ActiveEffects)
  if (actor.statuses?.has?.(flagKey) || actor.statuses?.has?.(flagKey.toLowerCase())) {
    return true;
  }

  // 3. Embedded Effect items on actor
  if (actor.items) {
    const lowerKey = flagKey.toLowerCase();
    for (const item of actor.items) {
      if (item.type !== "effect" && item.type !== "state") continue;

      const itemFlags = getSystemFlags(item);
      if (itemFlags[flagKey] || itemFlags[lowerKey]) return true;
      if (itemFlags.statusEffectId && itemFlags.statusEffectId.toLowerCase() === lowerKey) return true;

      const itemName = item.name?.toLowerCase()?.trim();
      if (itemName === lowerKey) return true;
    }
  }

  return false;
}


