/**
 * Character Sheet — Thin Coordinator
 *
 * All business logic lives in ./character/* handlers.
 * This file only wires Foundry's lifecycle hooks to those modules.
 */

import { showRestDialog }              from "../dialogs/rest-dialog.mjs";
import { showAmmoDialog }              from "../dialogs/ammo-dialog.mjs";
import { askAPDialog }                 from "../dialogs/ap-dialog.mjs";

import { getCharacterData, buildClockSegments } from "./character/get-data.mjs";
import { activateCharacterListeners }           from "./character/listeners.mjs";

import { onAttributeRoll, onCombatStatRoll, onSkillRoll, evaluateAndShowRoll } from "./character/handlers-rolls.mjs";
import { onDeedRoll, postDeedPhase, requestCDAndRoll } from "./character/handlers-deed.mjs";
import { onTalentRoll, onFeatureRoll, onIncantationRoll }                   from "./character/handlers-talent.mjs";
import { handleRestAction, recoverItemCost, spendRDAndRoll }                from "./character/handlers-rest.mjs";
import { onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck, onItemTransfer }  from "./character/handlers-items.mjs";
import { onPrevailRoll, onIntensityChange, onEffectRemove, onEffectInfo, onEffectEdit }   from "./character/handlers-effects.mjs";
import { onEquipRoll, getActiveWeapons, getAccuracyFromTarget }             from "./character/handlers-combat.mjs";
import { onInjuryClockClick, onToggleLight, onSpendRDHeader }               from "./character/handlers-misc.mjs";
import {
  onCallingEdit,
  onCallingDelete,
  onCraftEdit,
  onCraftDelete,
  applyPastLife,
  onPlightAdd,
  onLastingStateAdd
} from "./character/handlers-advancement.mjs";
import {
  bindItemDragHandlers,
  onDropHavenTransfer,
  onSortItem,
  handleDropItem
} from "./character/handlers-drag-drop.mjs";

import { TrespasserActorSheet } from "./base-sheet.mjs";

/**
 * Character Sheet class for Trespasser TTRPG.
 */
export class TrespasserCharacterSheet extends TrespasserActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "actor", "character"],
    position: { width: 868, height: 720 },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true },
    dragDrop: [{ dragSelector: ".inventory-card, .item, .deed-slot", dropSelector: null }]
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/character-sheet.hbs",
      scrollable: [".tab-body.active", ".editor-container"]
    }
  };

  tabGroups = { primary: "character" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  // ── Foundry lifecycle ──────────────────────────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const charData = await getCharacterData(this, options);
    Object.assign(context, charData);
    context.tabs = this.tabGroups;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    console.log(`Trespasser | TrespasserCharacterSheet._onRender for ${this.actor.name}`);
    activateCharacterListeners(html, this);

    // Sync tabs
    const tabs = this.element.querySelectorAll('.sheet-tabs .item');
    tabs.forEach(t => {
      t.addEventListener('click', (ev) => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    // Re-render when targets change so transfer buttons show up
    if (!this._targetingHook) {
      this._targetingHook = Hooks.on("targetToken", (user, token, targeted) => {
        if (user.id === game.user.id) this.render();
      });
    }

    this.#bindItemDragHandlers();
  }

  /** @override */
  async close(options = {}) {
    if (this._targetingHook) {
      Hooks.off("targetToken", this._targetingHook);
      this._targetingHook = null;
    }
    return super.close(options);
  }

  /**
   * Make item rows draggable with standard Foundry drag data.
   */
  #bindItemDragHandlers() {
    bindItemDragHandlers(this);
  }

  /** @override */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.isHavenTransfer) return this.#onDropHavenTransfer(data);
    return super._onDrop(event);
  }

  /**
   * Withdraw an item dragged from a Haven's inventory.
   * @param {object} data  The haven-transfer drag payload.
   */
  async #onDropHavenTransfer(data) {
    return onDropHavenTransfer(this, data);
  }

  /** @override */
  async _onDropItem(event, dropped) {
    return handleDropItem(this, event, dropped, (ev, dr) => super._onDropItem(ev, dr));
  }

  /**
   * Reorder an item dropped onto another row of the same sheet.
   */
  async #onSortItem(event, item) {
    return onSortItem(this, event, item);
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
  async _evaluateAndShowRoll(roll, flavor, cd, options={}) { return evaluateAndShowRoll(roll, flavor, cd, this, options); }
  async _askAPDialog(availableAP)             { return askAPDialog(availableAP); }

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
  async _onItemTransfer(event)              { return onItemTransfer(event, this); }

  // ── Effects ────────────────────────────────────────────────────────────────
  async _onPrevailRoll(event)               { return onPrevailRoll(event, this); }
  async _onIntensityChange(event)           { return onIntensityChange(event, this); }
  async _onEffectRemove(event)              { return onEffectRemove(event, this); }
  async _onEffectInfo(event)                { return onEffectInfo(event, this); }
  async _onEffectEdit(event)                { return onEffectEdit(event, this); }
  async _onDurationChange(event)            { return onDurationChange(event, this); }

  async _onPlightAdd(event) {
    return onPlightAdd(this, event);
  }

  async _onLastingStateAdd(event) {
    return onLastingStateAdd(this, event);
  }

  // ── Combat / Equipment ─────────────────────────────────────────────────────
  async _onEquipRoll(event)                 { return onEquipRoll(event, this); }
  _getActiveWeapons()                       { return getActiveWeapons(this); }
  async _selectAmmoDialog(ammoItems, weapon){ return showAmmoDialog(ammoItems, weapon); }
  _getAccuracyFromTarget()                  { return getAccuracyFromTarget(); }

  // ── Light ──────────────────────────────────────────────────────────────────
  async _onToggleLight(event)               { return onToggleLight(event, this); }

  async _onCallingEdit(event) {
    return onCallingEdit(this, event);
  }

  async _onCallingDelete(event) {
    return onCallingDelete(this, event);
  }

  async _onCraftEdit(event) {
    return onCraftEdit(this, event);
  }

  async _onCraftDelete(event) {
    return onCraftDelete(this, event);
  }

  async _applyPastLife(pastLifeItem) {
    return applyPastLife(this, pastLifeItem);
  }
}
