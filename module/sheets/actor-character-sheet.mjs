/**
 * Character Sheet — Thin Coordinator
 *
 * All business logic lives in ./character/* handlers.
 * This file only wires Foundry's lifecycle hooks to those modules.
 */

import { showCallingDialog }           from "../dialogs/calling-dialog.mjs";
import { showCraftDialog }             from "../dialogs/craft-dialog.mjs";
import { showRestDialog }              from "../dialogs/rest-dialog.mjs";
import { showAmmoDialog }              from "../dialogs/ammo-dialog.mjs";

import { getCharacterData, buildClockSegments } from "./character/get-data.mjs";
import { activateCharacterListeners }           from "./character/listeners.mjs";

import { onAttributeRoll, onCombatStatRoll, onSkillRoll } from "./character/handlers-rolls.mjs";
import { onDeedRoll, postDeedPhase, requestCDAndRoll, evaluateAndShowRoll } from "./character/handlers-deed.mjs";
import { onTalentRoll, onFeatureRoll, onIncantationRoll }                   from "./character/handlers-talent.mjs";
import { handleRestAction, recoverItemCost, spendRDAndRoll }                from "./character/handlers-rest.mjs";
import { onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck }  from "./character/handlers-items.mjs";
import { onPrevailRoll, onIntensityChange, onEffectRemove, onEffectInfo }   from "./character/handlers-effects.mjs";
import { onEquipRoll, getActiveWeapons, getAccuracyFromTarget }             from "./character/handlers-combat.mjs";
import { onInjuryClockClick, onToggleLight, onSpendRDHeader }               from "./character/handlers-misc.mjs";

/**
 * Character Sheet class for Trespasser TTRPG.
 */
export class TrespasserCharacterSheet extends foundry.appv1.sheets.ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:  ["trespasser", "sheet", "actor", "character"],
      template: "systems/trespasser/templates/actor/character-sheet.hbs",
      width:    780,
      height:   720,
      resizable: true,
      scrollY:  [".tab-body"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "character" }],
    });
  }

  // ── Foundry lifecycle ──────────────────────────────────────────────────────

  /** @override */
  async getData(options = {}) { return getCharacterData(this, options); }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    activateCharacterListeners(html, this);
  }

  /** @override */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return super._onDropItem(event, data);
    if (item.type === "calling") return showCallingDialog(item, this.actor);
    if (item.type === "craft")   return showCraftDialog(item, this.actor);
    return super._onDropItem(event, data);
  }

  // ── Delegate methods (kept here so Foundry's .bind(this) chains work) ─────

  // ── Clock / Injury ─────────────────────────────────────────────────────────
  _buildClockSegments(total, filled)        { return buildClockSegments(total, filled); }
  async _onInjuryClockClick(event)          { return onInjuryClockClick(event, this); }

  // ── Rolls ──────────────────────────────────────────────────────────────────
  async _onAttributeRoll(event)             { return onAttributeRoll(event, this); }
  async _onCombatStatRoll(event)            { return onCombatStatRoll(event, this); }
  async _onSkillRoll(skillKey, isTrained)   { return onSkillRoll(skillKey, isTrained, this); }

  // ── Deeds ──────────────────────────────────────────────────────────────────
  async _onDeedRoll(event)                  { return onDeedRoll(event, this); }
  async _postDeedPhase(phaseName, phaseData, actor, item, options) {
    return postDeedPhase(phaseName, phaseData, actor, item, options, this);
  }
  async _requestCDAndRoll(roll, flavor)     { return requestCDAndRoll(roll, flavor, this); }
  async _evaluateAndShowRoll(roll, flavor, cd) { return evaluateAndShowRoll(roll, flavor, cd, this); }

  // ── Talents / Features / Incantations ─────────────────────────────────────
  async _onTalentRoll(event)                { return onTalentRoll(event, this); }
  async _onFeatureRoll(event)               { return onFeatureRoll(event, this); }
  async _onIncantationRoll(event)           { return onIncantationRoll(event, this); }

  // ── Rest ───────────────────────────────────────────────────────────────────
  async _onRestDialog(event) {
    event.preventDefault();
    return showRestDialog(this.actor, (type, data) => this._handleRestAction(type, data));
  }
  async _handleRestAction(type, data)       { return handleRestAction(type, data, this); }
  async _recoverItemCost(itemId, msgs)      { return recoverItemCost(itemId, msgs, this.actor); }
  async _spendRDAndRoll(count)              { return spendRDAndRoll(count, this); }
  async _onSpendRDHeader(event)             { return onSpendRDHeader(event, this); }

  // ── Items ──────────────────────────────────────────────────────────────────
  async _onItemCreate(event)                { return onItemCreate(event, this); }
  async _onItemConsume(event)               { return onItemConsume(event, this); }
  async _onDepletionRoll(event)             { return onDepletionRoll(event, this); }
  async _runDepletionCheck(item)            { return runDepletionCheck(item, this); }

  // ── Effects ────────────────────────────────────────────────────────────────
  async _onPrevailRoll(event)               { return onPrevailRoll(event, this); }
  async _onIntensityChange(event)           { return onIntensityChange(event, this); }
  async _onEffectRemove(event)              { return onEffectRemove(event, this); }
  async _onEffectInfo(event)                { return onEffectInfo(event, this); }
  async _onDurationChange(event)            { return onDurationChange(event, this); }

  // ── Combat / Equipment ─────────────────────────────────────────────────────
  async _onEquipRoll(event)                 { return onEquipRoll(event, this); }
  _getActiveWeapons()                       { return getActiveWeapons(this); }
  async _selectAmmoDialog(ammoItems, weapon){ return showAmmoDialog(ammoItems, weapon); }
  _getAccuracyFromTarget()                  { return getAccuracyFromTarget(); }

  // ── Light ──────────────────────────────────────────────────────────────────
  async _onToggleLight(event)               { return onToggleLight(event, this); }
}
