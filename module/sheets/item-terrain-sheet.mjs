const { api, sheets } = foundry.applications;

export class TrespasserTerrainSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "terrain", "item-sheet"],
    position: { width: 560, height: 640 },
    actions: {
      switchTab:    TrespasserTerrainSheet.#onSwitchTab,
      removeEffect: TrespasserTerrainSheet.#onRemoveEffect,
      editEffect:   TrespasserTerrainSheet.#onEditEffect,
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    header: {
      template: "systems/trespasser/templates/item/terrain/header.hbs"
    },
    tabs: {
      template: "systems/trespasser/templates/item/terrain/tabs.hbs"
    },
    details: {
      template: "systems/trespasser/templates/item/terrain/details.hbs",
      scrollable: ["", ".deed-details"]
    },
    effects: {
      template: "systems/trespasser/templates/item/terrain/effects.hbs",
      scrollable: ["", ".deed-effects"]
    }
  };

  static TABS = {
    details: { id: "details", group: "primary", label: "TRESPASSER.Sheet.Tabs.Details", icon: "list" },
    effects: { id: "effects", group: "primary", label: "TRESPASSER.Sheet.Tabs.Effects", icon: "bolt" }
  };

  tabGroups = { primary: "details" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Item.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

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
        cssClass: this.tabGroups[config.group] === id ? "active" : "",
        label: game.i18n.localize(config.label)
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
    const item = this.document;
    context.item = item;
    context.system = item.system;
    context.editable = this.isEditable;
    context.tabs = this._getTabs();

    context.config = {
      categories: {
        difficult_terrain: game.i18n.localize("TRESPASSER.Sheet.Terrain.Categories.DifficultTerrain"),
        obstacle: game.i18n.localize("TRESPASSER.Sheet.Terrain.Categories.Obstacle"),
        wall: game.i18n.localize("TRESPASSER.Sheet.Terrain.Categories.Wall"),
        field: game.i18n.localize("TRESPASSER.Sheet.Terrain.Categories.Field"),
        light_cloud: game.i18n.localize("TRESPASSER.Sheet.Terrain.Categories.LightCloud"),
        heavy_cloud: game.i18n.localize("TRESPASSER.Sheet.Terrain.Categories.HeavyCloud")
      },
      centerModes: {
        fixed: game.i18n.localize("TRESPASSER.Sheet.Terrain.CenterModes.Fixed"),
        actor: game.i18n.localize("TRESPASSER.Sheet.Terrain.CenterModes.Actor")
      }
    };

    const cat = item.system.category;
    context.showTerrainDamage = (cat === "field");
    context.showExtraMovementCost = (cat === "difficult_terrain" || cat === "field");
    context.showSlippery = (cat === "field");
    context.showDestructible = (cat === "obstacle");

    const phases = ["onEnter", "onMove", "onStartTurn"];
    context.phases = phases.map(key => ({
      key,
      label: game.i18n.localize(`TRESPASSER.Sheet.Terrain.Phases.${key}`),
      effects: (item.system[`${key}Effects`] ?? []).map((e, i) => ({
        ...e, index: i
      }))
    }));

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const dropZones = this.element.querySelectorAll(".applied-effects-list");
    for (const zone of dropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropEffect.bind(this));
    }
    
    const selectOnFocus = this.element.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }
  }

  async #onDropEffect(event) {
    event.preventDefault();
    const phase = event.currentTarget.dataset.phase;
    if (!phase) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (data.type !== "Item") return;

    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem) return;

    if (droppedItem.type !== "effect" && droppedItem.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnlyEffects"));
      return;
    }

    const currentEffects = foundry.utils.deepClone(
      this.document.system[`${phase}Effects`]
    ) || [];

    currentEffects.push({
      uuid: droppedItem.uuid,
      type: droppedItem.type,
      name: droppedItem.name,
      img: droppedItem.img,
      intensity: droppedItem.system.intensity || 0
    });

    await this.document.update({
      [`system.${phase}Effects`]: currentEffects
    });
  }

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }

  static async #onRemoveEffect(event, target) {
    const chip = target.closest(".effect-chip");
    const list = target.closest(".applied-effects-list");
    if (!chip || !list) return;

    const index = parseInt(chip.dataset.index);
    const phase = list.dataset.phase;
    if (isNaN(index) || !phase) return;

    const currentEffects = foundry.utils.deepClone(
      this.document.system[`${phase}Effects`]
    ) || [];
    currentEffects.splice(index, 1);

    await this.document.update({
      [`system.${phase}Effects`]: currentEffects
    });
  }

  static async #onEditEffect(event, target) {
    const chip = target.closest(".effect-chip");
    const list = target.closest(".applied-effects-list");
    if (!chip || !list) return;

    const index = Number(chip.dataset.index);
    const phase = list.dataset.phase;
    if (isNaN(index) || !phase) return;

    const currentEffects = foundry.utils.deepClone(
      this.document.system[`${phase}Effects`]
    ) || [];
    const effectData = currentEffects[index];
    if (!effectData) return;

    const docType = effectData.type || "effect";
    const clonedData = foundry.utils.deepClone(effectData);
    delete clonedData.type;
    delete clonedData.uuid;
    delete clonedData.name;
    delete clonedData.img;

    const tempItem = new Item.implementation({
      name: effectData.name || "Effect",
      type: docType,
      img: effectData.img,
      system: clonedData
    }, { parent: this.document.parent });

    const sheet = this;
    tempItem.update = async (updateData) => {
      const arr = foundry.utils.deepClone(
        sheet.document.system[`${phase}Effects`]
      ) || [];
      arr[index] = foundry.utils.mergeObject(arr[index], updateData.system || updateData);
      await sheet.document.update({
        [`system.${phase}Effects`]: arr
      });
      return tempItem;
    };

    tempItem.sheet.render(true);
  }
}
