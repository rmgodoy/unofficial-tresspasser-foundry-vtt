import { TrespasserActorSheet } from "./base-sheet.mjs";
import { getCompanionData } from "./companion/get-data.mjs";
import { activateCompanionListeners } from "./companion/listeners.mjs";

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

  tabGroups = { primary: "companion" };

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

    if (!sourceItem) return super._onDropItem(event, dropped);

    if (sourceItem.parent === this.actor) {
      return this.#onSortItem(event, sourceItem);
    }

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

  // ── Delegated actions (wired in Task 5 or when roll handlers are called) ───

  async _onCompanionStatRoll(stat) {
    // Task 5 will provide dedicated handlers; fallback to basic roll
    const statVal = this.actor.system.combat?.[stat] ?? 0;
    const statLabel = game.i18n.localize(`TRESPASSER.Sheet.Companion.${stat.charAt(0).toUpperCase() + stat.slice(1)}`) || stat;
    const roll = new foundry.dice.Roll(`1d20 + ${statVal}`);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} — ${statLabel}`
    });
  }

  async _onCompanionDamageRoll() {
    const die = this.actor.system.damageDie || "d6";
    const bonus = this.actor.system.bonuses?.damage ?? 0;
    const formula = bonus !== 0 ? `${die} + ${bonus}` : die;
    const roll = new foundry.dice.Roll(formula);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} — ${game.i18n.localize("TRESPASSER.Sheet.Companion.DamageDie") || "Damage Die"}`
    });
  }

  async _onCompanionDeedUse(itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} — ${item.name}`,
      content: `<div class="trespasser-chat-card"><p>${item.system.description || item.name}</p></div>`
    });
  }
}
