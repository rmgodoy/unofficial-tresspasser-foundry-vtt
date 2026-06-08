/**
 * Region Actor Sheet for Trespasser RPG
 *
 * Self-contained AppV2 sheet for configuring region properties,
 * session state, and travel logs.
 */

const { api, sheets } = foundry.applications;

export class TrespasserRegionSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "region", "trespasser-sheet"],
    position: { width: 670, height: 760 },
    actions: {
      switchTab: TrespasserRegionSheet.#onSwitchTab,
      removeEncounterTable: TrespasserRegionSheet.#onRemoveEncounterTable,
      createEncounterTable: TrespasserRegionSheet.#onCreateEncounterTable,
      rollEncounterTable: TrespasserRegionSheet.#onRollEncounterTable,
      resetRegion: TrespasserRegionSheet.#onResetRegion
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    tabs:     { template: "systems/trespasser/templates/region/region-tabs.hbs" },
    overview: { template: "systems/trespasser/templates/region/region-overview.hbs" },
    log:      { template: "systems/trespasser/templates/region/region-log.hbs" },
    notes:    { template: "systems/trespasser/templates/region/region-notes.hbs" }
  };

  static TABS = {
    overview: { id: "overview", group: "primary", label: "TRESPASSER.Sheet.Tabs.Overview", icon: "mountain-sun" },
    log:      { id: "log",      group: "primary", label: "TRESPASSER.Sheet.Tabs.Log",      icon: "scroll" },
    notes:    { id: "notes",    group: "primary", label: "TRESPASSER.Sheet.Tabs.Notes",    icon: "book" }
  };

  tabGroups = { primary: "overview" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.Terms.ActorType.${this.document.type.charAt(0).toUpperCase() + this.document.type.slice(1)}`) || "Region";
    return `${typeLabel}: ${this.document.name}`;
  }

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

    // Lookups
    const dungeonConfig = CONFIG.TRESPASSER.dungeon;
    const travelConfig = CONFIG.TRESPASSER.travel;

    // Hostility tier info
    const tier = dungeonConfig.hostilityTiers[system.hostilityTier] ?? dungeonConfig.hostilityTiers[1];
    context.currentHostility = {
      label: game.i18n.localize(tier.label),
      dc: tier.dc
    };

    // Dropdown choices
    context.hostilityChoices = Object.entries(dungeonConfig.hostilityTiers).map(([key, val]) => ({
      value: Number(key),
      label: game.i18n.localize(val.label)
    }));
    context.terrainChoices = {};
    for (const [key, val] of Object.entries(travelConfig.terrainCosts)) {
      context.terrainChoices[key] = game.i18n.localize(val.label);
    }
    context.weatherChoices = {};
    for (const [key, val] of Object.entries(travelConfig.weatherModifiers)) {
      context.weatherChoices[key] = game.i18n.localize(val.label);
    }

    // Current period display label
    const period = travelConfig.periods[system.currentPeriod] ?? travelConfig.periods["morning"];
    context.currentPeriodLabel = game.i18n.localize(period.label);

    // Day log (reversed so newest first)
    context.dayLog = [...(system.dayLog ?? [])].reverse();

    // Encounter table name and entries
    context.encounterTableEntries = [];
    context.encounterTableFormula = "";
    context.encounterTableId = system.encounterTableId || "";
    if (system.encounterTableId) {
      const table = game.tables.get(system.encounterTableId);
      context.encounterTableName = table?.name ?? game.i18n.localize("TRESPASSER.Sheet.Dungeon.Exploration.UnknownTable");
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
      name: `${this.actor.name} ${game.i18n.localize("TRESPASSER.Sheet.Region.Encounters")}`,
      formula: "1d6"
    });
    await this.actor.update({ "system.encounterTableId": table.id });
    table.sheet.render(true);
  }

  static async #onResetRegion(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Dialog.Reset.RegionTitle") },
      content: `<p>${game.i18n.format("TRESPASSER.Dialog.Reset.RegionConfirm", { name: this.actor.name })}</p>`,
      yes: { label: game.i18n.localize("TRESPASSER.Global.Action.Reset"), icon: "fa-solid fa-trash" },
      no: { label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") }
    });
    if (!confirmed) return;

    await this.actor.update({
      "system.sessionState": "idle",
      "system.currentDay": 0,
      "system.currentPeriod": "morning",
      "system.travelPointsRemaining": CONFIG.TRESPASSER.travel?.travelPointsPerAdvance || 6,
      "system.onRoad": false,
      "system.isDisoriented": false,
      "system.dayLog": []
    });
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
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Region.NoEmbeddedItems") || "Regions cannot contain embedded items.");
    return false;
  }
}
