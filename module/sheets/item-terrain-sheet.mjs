const { api, sheets } = foundry.applications;

export class TrespasserTerrainSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "terrain", "item-sheet"],
    position: { width: 560, height: 640 },
    actions: {
      switchTab:          TrespasserTerrainSheet.#onSwitchTab,
      addBehavior:        TrespasserTerrainSheet.#onAddBehavior,
      removeBehavior:     TrespasserTerrainSheet.#onRemoveBehavior,
      removeLinkedEffect: TrespasserTerrainSheet.#onRemoveLinkedEffect,
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
    behaviors: {
      template: "systems/trespasser/templates/item/terrain/behaviors.hbs",
      scrollable: ["", ".terrain-behaviors"]
    }
  };

  static TABS = {
    details: { id: "details", group: "primary", label: "TRESPASSER.Sheet.Tabs.Details", icon: "list" },
    behaviors: { id: "behaviors", group: "primary", label: "TRESPASSER.Sheet.Tabs.Behaviors", icon: "bolt" }
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

    const cat = item.system.category;
    context.displayRegionColor = item.system.regionColor || (game.trespasser?.TerrainHelper?.TERRAIN_COLORS?.[cat] || "#8B4513");

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
      },
      triggers: {
        onEnter: game.i18n.localize("TRESPASSER.Sheet.Terrain.Triggers.OnEnter"),
        onMove: game.i18n.localize("TRESPASSER.Sheet.Terrain.Triggers.OnMove"),
        onStartTurn: game.i18n.localize("TRESPASSER.Sheet.Terrain.Triggers.OnStartTurn"),
        onCreation: game.i18n.localize("TRESPASSER.Sheet.Terrain.Triggers.OnCreation"),
        whileInside: game.i18n.localize("TRESPASSER.Sheet.Terrain.Triggers.WhileInside")
      },
      actions: {
        applyEffect: game.i18n.localize("TRESPASSER.Sheet.Terrain.Actions.ApplyEffect"),
        forcedMovement: game.i18n.localize("TRESPASSER.Sheet.Terrain.Actions.ForcedMovement"),
        damage: game.i18n.localize("TRESPASSER.Sheet.Terrain.Actions.Damage"),
        script: game.i18n.localize("TRESPASSER.Sheet.Terrain.Actions.Script")
      },
      fmTypes: {
        "": "—",
        push: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Push"),
        pull: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Pull"),
        sweep: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Sweep"),
        shove: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Shove"),
        drag: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Drag")
      },
      fmDirections: {
        away_from_origin: game.i18n.localize("TRESPASSER.Sheet.Terrain.Directions.AwayFromOrigin"),
        along_terrain_path: game.i18n.localize("TRESPASSER.Sheet.Terrain.Directions.AlongTerrainPath"),
        toward_origin: game.i18n.localize("TRESPASSER.Sheet.Terrain.Directions.TowardOrigin"),
        caster_choice: game.i18n.localize("TRESPASSER.Sheet.Terrain.Directions.CasterChoice"),
        path_direction: game.i18n.localize("TRESPASSER.Sheet.Terrain.Directions.PathDirection")
      },
      interactActionTypes: {
        "": "—",
        moveTerrain: game.i18n.localize("TRESPASSER.Sheet.Terrain.InteractActions.MoveTerrain"),
        destroyTerrain: game.i18n.localize("TRESPASSER.Sheet.Terrain.InteractActions.DestroyTerrain"),
        script: game.i18n.localize("TRESPASSER.Sheet.Terrain.Actions.Script")
      },
      moveEffects: {
        "": "—",
        push: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Push"),
        shove: game.i18n.localize("TRESPASSER.Terms.ForcedMovement.Shove")
      }
    };

    context.showTerrainDamage = (cat === "field");
    context.showExtraMovementCost = (cat === "difficult_terrain" || cat === "field");
    context.showSlippery = (cat === "field");
    context.showDestructible = (cat === "obstacle");

    // Prepare behaviors with indices for display
    context.behaviors = (item.system.behaviors ?? []).map((b, i) => ({
      ...b, index: i,
      isApplyEffect: b.action === "applyEffect",
      isForcedMovement: b.action === "forcedMovement",
      isDamage: b.action === "damage",
      isScript: b.action === "script",
      isWhileInside: b.trigger === "whileInside"
    }));

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    // Drop zone for effect UUIDs on behavior rows
    const effectDropZones = this.element.querySelectorAll(".behavior-effect-drop");
    for (const zone of effectDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropBehaviorEffect.bind(this));
    }

    // Drop zone for linked effect on details tab
    const linkedEffectDropZones = this.element.querySelectorAll(".linked-effect-drop-zone");
    for (const zone of linkedEffectDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropLinkedEffect.bind(this));
    }

    const selectOnFocus = this.element.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }
  }

  /**
   * Handle dropping an effect/state item onto a behavior row's effect drop zone.
   */
  async #onDropBehaviorEffect(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.behaviorIndex);
    if (isNaN(index)) return;

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

    const behaviors = foundry.utils.deepClone(this.document.system.behaviors) || [];
    if (!behaviors[index]) return;

    behaviors[index].effectUuid = droppedItem.uuid;
    behaviors[index].effectName = droppedItem.name;
    behaviors[index].effectImg = droppedItem.img;

    await this.document.update({ "system.behaviors": behaviors });
  }

  /**
   * Handle dropping an effect/state item onto the Linked Effect drop zone.
   */
  async #onDropLinkedEffect(event) {
    event.preventDefault();
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

    await this.document.update({
      "system.linkedEffect": {
        uuid: droppedItem.uuid,
        name: droppedItem.name,
        img: droppedItem.img
      },
      "system.linkedEffectKey": droppedItem.uuid
    });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }

  static async #onAddBehavior(event, target) {
    const behaviors = foundry.utils.deepClone(this.document.system.behaviors) || [];
    behaviors.push({
      trigger: "onEnter",
      action: "applyEffect",
      effectUuid: "",
      effectName: "",
      effectImg: "",
      effectIntensity: "1",
      forcedMovementType: "",
      forcedMovementDistance: "0",
      forcedMovementDirection: "away_from_origin",
      damageFormula: "",
      script: "",
      onlyOnFirstEntry: true
    });
    await this.document.update({ "system.behaviors": behaviors });
  }

  static async #onRemoveBehavior(event, target) {
    const row = target.closest("[data-behavior-index]");
    if (!row) return;
    const index = parseInt(row.dataset.behaviorIndex);
    if (isNaN(index)) return;

    const behaviors = foundry.utils.deepClone(this.document.system.behaviors) || [];
    behaviors.splice(index, 1);
    await this.document.update({ "system.behaviors": behaviors });
  }

  static async #onRemoveLinkedEffect(event, target) {
    event.preventDefault();
    await this.document.update({
      "system.linkedEffect": { uuid: "", name: "", img: "" },
      "system.linkedEffectKey": ""
    });
  }
}
