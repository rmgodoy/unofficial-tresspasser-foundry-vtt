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
  performSyncActorTokenEffects,
  syncActorBloodiedItem,
  getMatchingCustomStatus,
  refreshTokensForActor,
  getCombatTrackerEffects
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
  performSyncActorTokenEffects,
  syncActorBloodiedItem,
  getMatchingCustomStatus,
  refreshTokensForActor,
  getCombatTrackerEffects
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

  static replacePlaceholders(description, intensity, effect = null) {
    return replacePlaceholders(description, intensity, effect);
  }

  static evaluateModifier(modifierString, intensity, actor = null) {
    return evaluateModifier(modifierString, intensity, actor);
  }

  static async asyncStringReplace(str, regex, asyncFn) {
    return asyncStringReplace(str, regex, asyncFn);
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

  static getAttributeBonus(actor, attribute) {
    return getAttributeBonus(actor, attribute);
  }

  static hasAdvantage(actor, attribute) {
    return hasAdvantage(actor, attribute);
  }

  static evaluateAttributeBonus(actor, attribute, rollType = null) {
    return evaluateAttributeBonus(actor, attribute, rollType);
  }

  static evaluateDamageBonus(actor, deed = null) {
    return evaluateDamageBonus(actor, deed);
  }

  static async triggerEffects(actor, when, options = {}) {
    return triggerEffects(actor, when, options);
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

  static async syncActorBloodiedItem(actor) {
    return syncActorBloodiedItem(actor);
  }

  static getMatchingCustomStatus(item) {
    return getMatchingCustomStatus(item);
  }

  static refreshTokensForActor(actor) {
    return refreshTokensForActor(actor);
  }

  static getCombatTrackerEffects(actor) {
    return getCombatTrackerEffects(actor);
  }
}
