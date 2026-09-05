import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import {
  handleDropBehaviorEffect,
  handleDropLinkedEffect,
  addTerrainBehavior,
  removeTerrainBehavior,
  removeTerrainLinkedEffect,
  removeTerrainBehaviorEffect,
  toggleTerrainBehaviorEffectSync
} from "./terrain/terrain-behaviors-handler.mjs";

const { api, sheets } = foundry.applications;

export class TrespasserTerrainSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "terrain", "item-sheet"],
    position: { width: 560, height: 640 },
    actions: {
      switchTab:                TrespasserTerrainSheet.#onSwitchTab,
      addBehavior:              TrespasserTerrainSheet.#onAddBehavior,
      removeBehavior:           TrespasserTerrainSheet.#onRemoveBehavior,
      removeLinkedEffect:       TrespasserTerrainSheet.#onRemoveLinkedEffect,
      removeBehaviorEffect:     TrespasserTerrainSheet.#onRemoveBehaviorEffect,
      toggleBehaviorEffectSync: TrespasserTerrainSheet.#onToggleBehaviorEffectSync,
      openEffectDoc:            TrespasserTerrainSheet.#onOpenEffectDoc
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
        onExit: game.i18n.localize("TRESPASSER.Sheet.Terrain.Triggers.OnExit"),
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

    // Prepare Linked Effects List
    let linkedList = item.system.linkedEffects ? [...item.system.linkedEffects] : [];
    if (linkedList.length === 0 && item.system.linkedEffect?.uuid) {
      linkedList = [{
        uuid: item.system.linkedEffect.uuid,
        name: item.system.linkedEffect.name || "",
        img: item.system.linkedEffect.img || "",
        intensity: "1"
      }];
    }
    context.linkedEffectsList = linkedList;
    context.hasLinkedEffect = Boolean(linkedList.length > 0 || item.system.linkedEffect?.uuid || item.system.linkedEffectKey);

    // Prepare behaviors with formatted effects lists
    context.behaviors = (item.system.behaviors ?? []).map((b, i) => {
      let effList = [];
      if (b.effects && Array.isArray(b.effects) && b.effects.length > 0) {
        effList = b.effects.map(e => ({
          ...e,
          isSynced: Boolean(e.intensity && String(e.intensity).toLowerCase().includes("<int>"))
        }));
      } else if (b.effectUuid) {
        effList = [{
          uuid: b.effectUuid,
          name: b.effectName || "",
          img: b.effectImg || "",
          intensity: b.effectIntensity || "1",
          isSynced: Boolean(b.effectIntensity && String(b.effectIntensity).toLowerCase().includes("<int>"))
        }];
      }

      return {
        ...b,
        index: i,
        effectsList: effList,
        isApplyEffect: b.action === "applyEffect",
        isForcedMovement: b.action === "forcedMovement",
        isDamage: b.action === "damage",
        isScript: b.action === "script",
        isWhileInside: b.trigger === "whileInside"
      };
    });

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    // Drop zone for effect items on behavior rows
    const effectDropZones = this.element.querySelectorAll(".behavior-effect-drop");
    for (const zone of effectDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", (ev) => handleDropBehaviorEffect(this.document, ev));
    }

    // Drop zone for linked effect on details tab
    const linkedEffectDropZones = this.element.querySelectorAll(".linked-effect-drop-zone");
    for (const zone of linkedEffectDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", (ev) => handleDropLinkedEffect(this.document, ev));
    }

    const selectOnFocus = this.element.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }
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
    return addTerrainBehavior(this.document);
  }

  static async #onRemoveBehavior(event, target) {
    const row = target.closest("[data-behavior-index]");
    if (!row) return;
    const index = parseInt(row.dataset.behaviorIndex);
    return removeTerrainBehavior(this.document, index);
  }

  static async #onRemoveLinkedEffect(event, target) {
    event.preventDefault();
    const effectIndex = parseInt(target.dataset.effectIndex);
    return removeTerrainLinkedEffect(this.document, effectIndex);
  }

  static async #onRemoveBehaviorEffect(event, target) {
    event.preventDefault();
    const behaviorIndex = parseInt(target.dataset.behaviorIndex);
    const effectIndex = parseInt(target.dataset.effectIndex);
    return removeTerrainBehaviorEffect(this.document, behaviorIndex, effectIndex);
  }

  static async #onToggleBehaviorEffectSync(event, target) {
    event.preventDefault();
    const behaviorIndex = parseInt(target.dataset.behaviorIndex);
    const effectIndex = parseInt(target.dataset.effectIndex);
    return toggleTerrainBehaviorEffectSync(this.document, behaviorIndex, effectIndex);
  }

  static async #onOpenEffectDoc(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (uuid) {
      await TrespasserEffectsHelper.openEffectSheet(uuid);
    }
  }
}
