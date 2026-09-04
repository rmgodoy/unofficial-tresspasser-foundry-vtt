import { TrespasserActorSheet } from "./base-sheet.mjs";
import { getCompanionData } from "./companion/get-data.mjs";
import { activateCompanionListeners } from "./companion/listeners.mjs";
import { onCompanionStatRoll, onCompanionDamageRoll, onCompanionSpeedRoll } from "./companion/handlers-rolls.mjs";
import { onDeedRoll, postDeedPhase, requestCDAndRoll } from "./character/handlers-deed.mjs";
import { evaluateAndShowRoll } from "./character/handlers-rolls.mjs";
import { askAPDialog } from "../dialogs/ap-dialog.mjs";
import { getAccuracyFromTarget, getActiveWeapons } from "./character/handlers-combat.mjs";
import { onPrevailRoll, onIntensityChange, onEffectRemove, onEffectInfo, onEffectEdit } from "./character/handlers-effects.mjs";
import { onFeatureRoll } from "./character/handlers-talent.mjs";
import { onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck, onItemTransfer } from "./character/handlers-items.mjs";
import { onToggleLight } from "./character/handlers-misc.mjs";
import { CompanionFormulasDialog } from "../dialogs/companion-formulas-dialog.mjs";

/**
 * Companion Sheet class for Trespasser TTRPG.
 * Thin coordinator — all business logic lives in ./companion/* handlers.
 */
export class TrespasserCompanionSheet extends TrespasserActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "actor", "companion"],
    position: { width: 700, height: 620 },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true },
    dragDrop: [{ dragSelector: ".inventory-card, .item, .deed-slot", dropSelector: null }]
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/companion-sheet.hbs",
      scrollable: [".tab-body.active", ".editor-container"]
    }
  };

  tabGroups = { primary: "combat" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const compData = await getCompanionData(this, options);
    const merged = foundry.utils.mergeObject(context, compData);
    merged.tabs = this.tabGroups;
    return merged;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    activateCompanionListeners(html, this);

    // Sync tabs
    const tabs = this.element.querySelectorAll(".sheet-tabs .item");
    tabs.forEach(t => {
      t.addEventListener("click", (ev) => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    this.#bindItemDragHandlers();
  }

  /**
   * Bind drag handlers to items for Foundry V14.
   */
  #bindItemDragHandlers() {
    for (const el of this.element.querySelectorAll('[draggable="true"]')) {
      if (el._trespasserDragBound) continue;
      el._trespasserDragBound = true;
      el.addEventListener("dragstart", ev => {
        const id = el.dataset.itemId ?? el.closest("[data-item-id]")?.dataset.itemId;
        const item = id ? this.actor.items.get(id) : null;
        if (!item) return;
        ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    }
  }

  /** @override */
  async _onDropItem(event, dropped) {
    if (event._trespasserItemDropHandled) return false;
    event._trespasserItemDropHandled = true;

    const sourceItem = dropped instanceof Item
      ? dropped
      : await Item.implementation.fromDropData(dropped ?? {});

    const isTransfer = !!sourceItem?.parent && (sourceItem.parent !== this.actor);
    if (!this.actor.isOwner && !isTransfer) return false;

    if (isTransfer) {
      // Trigger the unified transfer logic
      await onItemTransfer(null, this, { item: sourceItem, targetActor: this.actor });
      return false; // Prevent duplicate handling
    }

    if (sourceItem && sourceItem.parent === this.actor) {
      return this.#onSortItem(event, sourceItem);
    }

    if (!sourceItem) return super._onDropItem(event, dropped);

    return super._onDropItem(event, dropped);
  }

  /**
   * Reorder items within sheet.
   */
  async #onSortItem(event, item) {
    const targetEl = event.target?.closest?.("[data-item-id]");
    const target = targetEl ? this.actor.items.get(targetEl.dataset.itemId) : null;
    if (!target || target.id === item.id) return false;

    const siblings = this.actor.items.filter(i => i.id !== item.id);
    const updates = foundry.utils.performIntegerSort(item, { target, siblings });
    return this.actor.updateEmbeddedDocuments("Item", updates.map(u => ({ _id: u.target.id, sort: u.update.sort })));
  }

  // ── Delegated actions & handlers ──────────────────────────────────────────

  async _onCompanionStatRoll(stat) {
    return onCompanionStatRoll(this.actor, stat, this);
  }

  async _onCompanionDamageRoll() {
    return onCompanionDamageRoll(this.actor, this);
  }

  async _onCompanionSpeedRoll() {
    return onCompanionSpeedRoll(this.actor);
  }

  async _onCompanionDeedUse(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item || item.type !== "deed") return;
    const fakeEvent = {
      preventDefault: () => {},
      currentTarget: { closest: () => ({ dataset: { itemId } }) }
    };
    return onDeedRoll.call(this, fakeEvent, this);
  }

  async _onDeedRoll(event) {
    return onDeedRoll.call(this, event, this);
  }

  async _postDeedPhase(phaseName, phaseData, actor, item, options) {
    return postDeedPhase(phaseName, phaseData, actor, item, options, this);
  }

  async _requestCDAndRoll(roll, flavor) {
    return requestCDAndRoll(roll, flavor, this);
  }

  async _evaluateAndShowRoll(roll, flavor, cd, options = {}) {
    return evaluateAndShowRoll(roll, flavor, cd, this, options);
  }

  async _askAPDialog(availableAP) {
    return askAPDialog(availableAP);
  }

  _getAccuracyFromTarget() {
    return getAccuracyFromTarget();
  }

  _getActiveWeapons() {
    return getActiveWeapons(this);
  }

  async _selectAmmoDialog(ammoItems, weapon) {
    return null;
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  async _onItemCreate(event) {
    return onItemCreate(event, this);
  }

  async _onItemConsume(event) {
    return onItemConsume(event, this);
  }

  async _onDepletionRoll(event) {
    return onDepletionRoll(event, this);
  }

  async _runDepletionCheck(item) {
    return runDepletionCheck(item, this);
  }

  async _onItemTransfer(event) {
    return onItemTransfer(event, this);
  }

  async _onToggleLight(event) {
    return onToggleLight(event, this);
  }

  // ── Effects ───────────────────────────────────────────────────────────────
  async _onPrevailRoll(event) {
    return onPrevailRoll(event, this);
  }

  async _onIntensityChange(event) {
    return onIntensityChange(event, this);
  }

  async _onEffectRemove(event) {
    return onEffectRemove(event, this);
  }

  async _onEffectInfo(event) {
    return onEffectInfo(event, this);
  }

  async _onEffectEdit(event) {
    return onEffectEdit(event, this);
  }

  // ── Features ──────────────────────────────────────────────────────────────
  async _onFeatureRoll(event) {
    return onFeatureRoll(event, this);
  }

  // ── GM Formula Configuration ──────────────────────────────────────────────
  async _onConfigureFormulas() {
    if (!game.user.isGM) return;
    return CompanionFormulasDialog.show(this.actor);
  }
}
