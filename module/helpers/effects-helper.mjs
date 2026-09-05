/**
 * Helper class for managing Trespasser effects, states, and modifier parsing.
 * Modular facade coordinating effects constants, evaluation, aggregation, triggers, dialogs, and token sync.
 */

import {
  TRIGGER_WHEN,
  TRIGGER_LABELS,
  DURATION_MODES,
  DURATION_LABELS,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  TARGET_ATTRIBUTES
} from "../effects/effects-constants.mjs";

import {
  parseModifier,
  replacePlaceholders,
  evaluateModifier,
  asyncStringReplace
} from "../effects/effects-evaluator.mjs";

import {
  getActorEffects,
  getActiveMovementEffect,
  getMovementType,
  getAttributeBonus,
  hasAdvantage
} from "../effects/effects-aggregate.mjs";

import {
  updateFocus,
  updateActionPoints,
  updateCombatPhase,
  evaluateAttributeBonus,
  evaluateDamageBonus,
  triggerEffects,
  triggerImmediate,
  decrementRound
} from "../effects/effects-trigger.mjs";

import {
  applyEffectChat,
  applyOilDialog,
  openEffectSheet
} from "../effects/effects-dialogs.mjs";

import {
  syncActorTokenEffects,
  performSyncActorTokenEffects
} from "../effects/effects-token-sync.mjs";

export {
  TRIGGER_WHEN,
  TRIGGER_LABELS,
  DURATION_MODES,
  DURATION_LABELS,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  TARGET_ATTRIBUTES,
  parseModifier,
  replacePlaceholders,
  evaluateModifier,
  asyncStringReplace,
  getActorEffects,
  getActiveMovementEffect,
  getMovementType,
  getAttributeBonus,
  hasAdvantage,
  updateFocus,
  updateActionPoints,
  updateCombatPhase,
  evaluateAttributeBonus,
  evaluateDamageBonus,
  triggerEffects,
  triggerImmediate,
  decrementRound,
  applyEffectChat,
  applyOilDialog,
  openEffectSheet,
  syncActorTokenEffects,
  performSyncActorTokenEffects
};

export class TrespasserEffectsHelper {
  static TRIGGER_WHEN = TRIGGER_WHEN;
  static TRIGGER_LABELS = TRIGGER_LABELS;
  static DURATION_MODES = DURATION_MODES;
  static DURATION_LABELS = DURATION_LABELS;
  static MOVEMENT_TYPES = MOVEMENT_TYPES;
  static MOVEMENT_TYPE_LABELS = MOVEMENT_TYPE_LABELS;
  static TARGET_ATTRIBUTES = TARGET_ATTRIBUTES;

  static parseModifier(modifierString, intensity) {
    return parseModifier(modifierString, intensity);
  }

  static replacePlaceholders(formula, actor, weaponDie = "d4") {
    return replacePlaceholders(formula, actor, weaponDie);
  }

  static async evaluateModifier(modifierString, intensity, options = {}) {
    return evaluateModifier(modifierString, intensity, options);
  }

  static async _asyncStringReplace(str, regex, replacer) {
    return asyncStringReplace(str, regex, replacer);
  }

  static getActorEffects(actor) {
    return getActorEffects(actor);
  }

  static getActiveMovementEffect(actor) {
    return getActiveMovementEffect(actor);
  }

  static getMovementType(actor) {
    return getMovementType(actor);
  }

  static getAttributeBonus(actor, attributeKey, includeTiming = null) {
    return getAttributeBonus(actor, attributeKey, includeTiming);
  }

  static async evaluateAttributeBonus(actor, attributeKey, options = {}) {
    return evaluateAttributeBonus(actor, attributeKey, options);
  }

  static async evaluateDamageBonus(actor, attributeKey, weaponDie = "d4", options = {}) {
    return evaluateDamageBonus(actor, attributeKey, weaponDie, options);
  }

  static hasAdvantage(actor, attributeKey) {
    return hasAdvantage(actor, attributeKey);
  }

  static async triggerEffects(actor, timing, options = {}) {
    return triggerEffects(actor, timing, options);
  }

  static async triggerImmediate(actor, item) {
    return triggerImmediate(actor, item);
  }

  static async updateFocus(actor, modValue) {
    return updateFocus(actor, modValue);
  }

  static async updateActionPoints(actor, modValue) {
    return updateActionPoints(actor, modValue);
  }

  static async updateCombatPhase(actor, modValue) {
    return updateCombatPhase(actor, modValue);
  }

  static async decrementRound(actor) {
    return decrementRound(actor);
  }

  static async applyEffectChat(effects, actor, options = {}) {
    return applyEffectChat(effects, actor, options);
  }

  static async applyOilDialog(actor, oilItem) {
    return applyOilDialog(actor, oilItem);
  }

  static async openEffectSheet(uuid, callback) {
    return openEffectSheet(uuid, callback);
  }

  static async syncActorTokenEffects(actor) {
    return syncActorTokenEffects(actor);
  }

  static async _performSyncActorTokenEffects(actor) {
    return performSyncActorTokenEffects(actor);
  }
}
