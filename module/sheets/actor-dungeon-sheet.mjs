/**
 * Dungeon Actor Sheet for Trespasser RPG (Bridge Version)
 *
 * Self-contained AppV2 sheet for configuring dungeon properties, rooms,
 * and exploration state. Does not depend on any base classes from
 * either system — all tab management, context prep, and action handlers
 * are implemented directly.
 */

const { api, sheets } = foundry.applications;

export class TrespasserDungeonSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "dungeon"],
    position: { width: 1280, height: 1280 },
    actions: {
      switchTab: TrespasserDungeonSheet.#onSwitchTab,
      createRoom: TrespasserDungeonSheet.#onCreateRoom,
      editItem: TrespasserDungeonSheet.#onEditItem,
      deleteItem: TrespasserDungeonSheet.#onDeleteItem,
      toggleDiscovered: TrespasserDungeonSheet.#onToggleDiscovered,
      addTrait: TrespasserDungeonSheet.#onAddTrait,
      removeTrait: TrespasserDungeonSheet.#onRemoveTrait,
      resetAlarm: TrespasserDungeonSheet.#onResetAlarm,
      clearLog: TrespasserDungeonSheet.#onClearLog,
      removeEncounterTable: TrespasserDungeonSheet.#onRemoveEncounterTable,
      createEncounterTable: TrespasserDungeonSheet.#onCreateEncounterTable,
      rollEncounterTable: TrespasserDungeonSheet.#onRollEncounterTable
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    tabs: { template: "systems/trespasser/templates/dungeon/dungeon-tabs.hbs" },
    overview: { template: "systems/trespasser/templates/dungeon/dungeon-overview.hbs" },
    rooms: { template: "systems/trespasser/templates/dungeon/dungeon-rooms.hbs" },
    log: { template: "systems/trespasser/templates/dungeon/dungeon-log.hbs" },
    notes: { template: "systems/trespasser/templates/dungeon/dungeon-notes.hbs" }
  };

  static TABS = {
    overview: { id: "overview", group: "primary", label: "TRESPASSER.Dungeon.Tabs.Overview", icon: "dungeon" },
    rooms: { id: "rooms", group: "primary", label: "TRESPASSER.Dungeon.Tabs.Rooms", icon: "door-open" },
    log: { id: "log", group: "primary", label: "TRESPASSER.Dungeon.Tabs.Log", icon: "scroll" },
    notes: { id: "notes", group: "primary", label: "TRESPASSER.Dungeon.Tabs.Notes", icon: "book" }
  };

  tabGroups = { primary: "overview" };

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  /** @override - Prevent parent _prepareTabs errors with template.json systems */
  _prepareTabs(parts) {
    const tabs = {};
    for (const [id, config] of Object.entries(this.constructor.TABS)) {
      tabs[id] = {
        ...config,
        active: this.tabGroups[config.group] === id,
        cssClass: this.tabGroups[config.group] === id ? "active" : "",
        label: game.i18n.localize(config.label)
      };
    }
    return Object.values(tabs);
  }

  _getTabs() {
    const tabs = {};
    for (const [id, config] of Object.entries(this.constructor.TABS)) {
      tabs[id] = {
        ...config,
        active: this.tabGroups[config.group] === id,
        cssClass: this.tabGroups[config.group] === id ? "active" : ""
      };
    }
    return tabs;
  }

  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;
    context.tab = context.tabs[partId] ?? { active: partId === this.tabGroups.primary };
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.actor = actor;
    context.system = system;
    context.config = CONFIG.TRESPASSER;
    context.editable = this.isEditable;
    context.tabs = this._getTabs();

    // Dungeon config lookups
    const dungeonConfig = CONFIG.TRESPASSER.dungeon;

    // Hostility tier info
    const tier = dungeonConfig.hostilityTiers[system.hostilityTier] ?? dungeonConfig.hostilityTiers[1];
    context.hostilityLabel = game.i18n.localize(tier.label);
    context.hostilityDC = tier.dc;

    // Dropdown choices
    context.hostilityChoices = {};
    for (const [key, val] of Object.entries(dungeonConfig.hostilityTiers)) {
      context.hostilityChoices[key] = game.i18n.localize(val.label);
    }
    context.sizeChoices = {};
    for (const [key, val] of Object.entries(dungeonConfig.sizeCategories)) {
      context.sizeChoices[key] = game.i18n.localize(val);
    }
    context.formChoices = {};
    for (const [key, val] of Object.entries(dungeonConfig.forms)) {
      context.formChoices[key] = game.i18n.localize(val);
    }

    // Traits array
    context.traits = system.traits ?? [];

    // Rooms (sorted by sortOrder)
    const rooms = actor.items.filter(i => i.type === "room");
    rooms.sort((a, b) => (a.system.sortOrder ?? 0) - (b.system.sortOrder ?? 0));
    context.rooms = rooms.map(r => ({
      _id: r.id,
      name: r.name,
      discovered: r.system.discovered,
      connectionsCount: (r.system.connections ?? []).length,
      featuresCount: (r.system.features ?? []).length,
      hasHazards: !!r.system.hazards,
      hasLoot: !!r.system.loot
    }));

    // Current room display
    if (system.currentRoomId) {
      const currentRoom = actor.items.get(system.currentRoomId);
      context.currentRoomName = currentRoom?.name ?? "—";
    } else {
      context.currentRoomName = "—";
    }

    // Round log (reversed so newest first)
    context.roundLog = [...(system.roundLog ?? [])].reverse();

    // Encounter table name and entries
    context.encounterTableEntries = [];
    context.encounterTableFormula = "";
    context.encounterTableId = system.encounterTableId || "";
    if (system.encounterTableId) {
      const table = game.tables.get(system.encounterTableId);
      context.encounterTableName = table?.name ?? game.i18n.localize("TRESPASSER.Dungeon.UnknownTable");
      if (table) {
        context.encounterTableFormula = table.formula ?? "";
        const tableData = table.toObject();
        context.encounterTableEntries = (tableData.results ?? []).map(r => {
          const range = Array.isArray(r.range) ? r.range : [];
          const low = range[0];
          const high = range[1];
          let rangeStr = "";
          if (low !== undefined && high !== undefined) {
            rangeStr = low === high ? `${low}` : `${low}–${high}`;
          }
          return {
            diceRange: rangeStr,
            text: r.name || r.text || "—",
            img: r.img || null
          };
        });
      }
    } else {
      context.encounterTableName = "";
    }

    // Enriched description and notes
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      { async: true }
    );
    context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.notes ?? "",
      { async: true }
    );

    return context;
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }

  static async #onCreateRoom(event, target) {
    const rooms = this.actor.items.filter(i => i.type === "room");
    const nextOrder = rooms.length > 0 ? Math.max(...rooms.map(r => r.system.sortOrder ?? 0)) + 1 : 0;
    const name = game.i18n.format("TRESPASSER.NewItem", { type: game.i18n.localize("TYPES.Item.room") });
    await this.actor.createEmbeddedDocuments("Item", [{
      name,
      type: "room",
      "system.sortOrder": nextOrder
    }]);
  }

  static #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.DeleteItemTitle") },
      content: `<p>${game.i18n.format("TRESPASSER.DeleteItemContent", { name: item.name })}</p>`,
      yes: { callback: () => item.delete() }
    });
  }

  static async #onToggleDiscovered(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await item.update({ "system.discovered": !item.system.discovered });
  }

  static async #onAddTrait(event, target) {
    event.preventDefault();
    const input = this.element.querySelector('.dungeon-new-trait-input');
    const value = input?.value?.trim();
    if (!value) return;
    const traits = [...(this.actor.system.traits ?? []), value];
    await this.actor.update({ "system.traits": traits });
    if (input) input.value = "";
  }

  static async #onRemoveTrait(event, target) {
    const index = parseInt(target.dataset.index);
    const traits = [...(this.actor.system.traits ?? [])];
    traits.splice(index, 1);
    await this.actor.update({ "system.traits": traits });
  }

  static async #onResetAlarm(event, target) {
    await this.actor.update({ "system.alarm": 0 });
  }

  static async #onClearLog(event, target) {
    await this.actor.update({ "system.roundLog": [] });
  }

  static async #onRemoveEncounterTable(event, target) {
    await this.actor.update({ "system.encounterTableId": "" });
  }

  static async #onRollEncounterTable(event, target) {
    const tableId = this.actor.system.encounterTableId;
    if (!tableId) return;
    const table = game.tables.get(tableId);
    if (!table) return;
    await table.draw({ rollMode: CONST.DICE_ROLL_MODES.PRIVATE });
  }

  static async #onCreateEncounterTable(event, target) {
    const table = await RollTable.create({
      name: `${this.actor.name} ${game.i18n.localize("TRESPASSER.Dungeon.Encounters")}`,
      formula: "1d6"
    });
    await this.actor.update({ "system.encounterTableId": table.id });
    table.sheet.render(true);
  }

  /* -------------------------------------------- */
  /* Drag & Drop                                  */
  /* -------------------------------------------- */

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type === "RollTable") {
      if (!this.isEditable) return false;
      const table = await RollTable.implementation.fromDropData(data);
      if (!table) return false;
      await this.actor.update({ "system.encounterTableId": table.id });
      return;
    }
    return super._onDrop(event);
  }

  async _onDropItem(event, data) {
    if (!this.isEditable) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    // Only allow room items on dungeons
    if (item.type !== "room") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Dungeon.DropRoomsOnly"));
      return false;
    }

    if (item.parent === this.actor) return super._onDropItem(event, data);

    const itemData = item.toObject();
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
    return true;
  }
}
