import { BEHAVIOR_TYPES } from "../data/item-deed.mjs";
import { TrespasserItemSheet } from "./base-sheet.mjs";

const { api, sheets } = foundry.applications;

export const DEFAULT_PARAMS = {
  selectTarget: {
    targetMode: "creatures",
    disposition: "any",
    targetCount: 1,
    aoeType: "blast",
    aoeSize: 1,
    areaRelation: "inside",
    ignoreSelf: false
  },
  selectArea: {
    targetMode: "squares",
    targetCount: 1,
    aoeType: "blast",
    aoeSize: 1
  },
  roll: {
    expression: "",
    rollBehaviorId: "",
    usePowerSparks: false
  },
  applyDamage: {
    expression: "",
    rollBehaviorId: "",
    distribute: false
  },
  healTarget: { expression: "", rollBehaviorId: "", distribute: false },
  grantRecovery: { intensity: 1 },
  applyEffects: {
    effects: [],
    appliesWeaponEffects: false
  },
  modifyBehavior: {
    targetBehaviorId: "",
    property: "damage",
    modifier: ""
  },
  spawnTerrain: {
    terrainUuid: "",
    terrainName: "",
    terrainImg: "",
    placement: "on_target",
    ignoreSourceSquare: false
  },
  moveTerrain: {
    terrainBehaviorId: ""
  },
  moveSource: {
    destinationMode: "distance",
    movementType: "walk",
    distance: 1
  },
  forceMoveTargets: {
    type: "push",
    distance: 1
  },
  clearTargets: {},
  executeDeed: {
    deedUuid: "",
    deedName: "",
    deedImg: ""
  }
};

export class TrespasserDeedSheet extends TrespasserItemSheet {

  /**
   * Set of phase keys currently expanded in the accordion UI.
   * @type {Set<string>}
   */
  _expandedPhases = new Set(["base"]);

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "deed", "item-sheet"],
    position: { width: 620, height: 720 },
    actions: {
      switchTab:             TrespasserDeedSheet.#onSwitchTab,
      togglePhase:           TrespasserDeedSheet.#onTogglePhase,
      addBehavior:           TrespasserDeedSheet.#onAddBehavior,
      removeBehavior:        TrespasserDeedSheet.#onRemoveBehavior,
      moveBehaviorUp:        TrespasserDeedSheet.#onMoveBehaviorUp,
      moveBehaviorDown:      TrespasserDeedSheet.#onMoveBehaviorDown,
      removeBehaviorEffect:  TrespasserDeedSheet.#onRemoveBehaviorEffect,
      copyBehaviorId:        TrespasserDeedSheet.#onCopyBehaviorId
    },
    form: {
      handler: TrespasserDeedSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    header: {
      template: "systems/trespasser/templates/item/deed/header.hbs"
    },
    tabs: {
      template: "systems/trespasser/templates/item/deed/tabs.hbs"
    },
    details: {
      template: "systems/trespasser/templates/item/deed/details.hbs",
      scrollable: ["", ".deed-details"]
    },
    behaviors: {
      template: "systems/trespasser/templates/item/deed/behaviors.hbs",
      scrollable: ["", ".deed-behaviors"]
    }
  };

  static TABS = {
    details: { id: "details", group: "primary", label: "TRESPASSER.Sheet.Tabs.Details", icon: "list" },
    behaviors: { id: "behaviors", group: "primary", label: "TRESPASSER.Sheet.Tabs.Behaviors", icon: "bolt" }
  };

  tabGroups = { primary: "details" };

  /** @override */
  get title() {
    return `${game.i18n.localize("TYPES.Item.deed")}: ${this.document.name}`;
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
      tiers: {
        light: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Light"),
        heavy: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Heavy"),
        mighty: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Mighty"),
        special: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Special")
      },
      actionTypes: {
        attack: game.i18n.localize("TRESPASSER.Sheet.Item.Details.ActionTypeChoices.Attack"),
        support: game.i18n.localize("TRESPASSER.Sheet.Item.Details.ActionTypeChoices.Support")
      },
      abilityTypes: {
        innate: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Innate"),
        melee: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Melee"),
        missile: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Missile"),
        spell: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Spell"),
        tool: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Tool"),
        unarmed: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Unarmed"),
        versatile: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Versatile")
      },
      versusChoices: {
        Guard: game.i18n.localize("TRESPASSER.Sheet.Combat.Guard"),
        Resist: game.i18n.localize("TRESPASSER.Sheet.Combat.Resist"),
        "10": "10"
      }
    };

    const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];
    context.phases = phaseKeys.map(key => {
      const phaseData = item.system.phases?.[key] ?? { description: "", behaviors: [] };
      const rawBehaviors = phaseData.behaviors ?? [];
      return {
        key,
        label: game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${key.charAt(0).toUpperCase() + key.slice(1)}`),
        expanded: this._expandedPhases.has(key),
        description: phaseData.description ?? "",
        skipPhase: phaseData.skipPhase ?? false,
        behaviors: rawBehaviors.map((b, i) => {
          const mergedParams = { ...(DEFAULT_PARAMS[b.type] ?? {}), ...(b.params ?? {}) };
          if (mergedParams.effects && !Array.isArray(mergedParams.effects)) {
            mergedParams.effects = Object.values(mergedParams.effects);
          }
          return {
            ...b,
            params: mergedParams,
            index: i,
            typeLabel: game.i18n.localize(`TRESPASSER.Sheet.Deed.Behavior.Type.${b.type}`) || b.type,
            isFirst: i === 0,
            isLast: i === rawBehaviors.length - 1
          };
        })
      };
    });

    context.behaviorTypeChoices = BEHAVIOR_TYPES.map(t => ({
      value: t,
      label: game.i18n.localize(`TRESPASSER.Sheet.Deed.Behavior.Type.${t}`) || t
    }));

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const selectOnFocus = this.element.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }

    const effectDropZones = this.element.querySelectorAll(".behavior-effect-drop");
    for (const zone of effectDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropBehaviorEffect.bind(this));
    }

    const terrainDropZones = this.element.querySelectorAll(".behavior-terrain-drop");
    for (const zone of terrainDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropBehaviorTerrain.bind(this));
    }

    const deedDropZones = this.element.querySelectorAll(".behavior-deed-drop");
    for (const zone of deedDropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropBehaviorDeed.bind(this));
    }
  }

  async #onDropBehaviorEffect(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    const phaseKey = zone.dataset.phase;
    const behaviorId = zone.dataset.behaviorId;
    if (!phaseKey || !behaviorId) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (data.type !== "Item") return;
    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem) return;

    if (droppedItem.type !== "effect" && droppedItem.type !== "state" && droppedItem.type !== "plight") {
      ui.notifications.warn("Dropped item must be an Effect, State, or Plight.");
      return;
    }

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    const behavior = phasesData[phaseKey]?.behaviors?.find(b => b.id === behaviorId);
    if (!behavior) return;

    behavior.params = behavior.params || {};
    behavior.params.effects = behavior.params.effects || [];
    behavior.params.effects.push({
      uuid: droppedItem.uuid,
      name: droppedItem.name,
      img: droppedItem.img,
      intensity: 1
    });

    await this.document.update({ "system.phases": phasesData });
  }

  async #onDropBehaviorTerrain(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    const phaseKey = zone.dataset.phase;
    const behaviorId = zone.dataset.behaviorId;
    if (!phaseKey || !behaviorId) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (data.type !== "Item") return;
    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem) return;

    if (droppedItem.type !== "terrain") {
      ui.notifications.warn("Dropped item must be a Terrain item.");
      return;
    }

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    const behavior = phasesData[phaseKey]?.behaviors?.find(b => b.id === behaviorId);
    if (!behavior) return;

    behavior.params = behavior.params || {};
    behavior.params.terrainUuid = droppedItem.uuid;
    behavior.params.terrainName = droppedItem.name;
    behavior.params.terrainImg = droppedItem.img;

    await this.document.update({ "system.phases": phasesData });
  }

  async #onDropBehaviorDeed(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    const phaseKey = zone.dataset.phase;
    const behaviorId = zone.dataset.behaviorId;
    if (!phaseKey || !behaviorId) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (data.type !== "Item") return;
    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem) return;

    if (droppedItem.type !== "deed") {
      ui.notifications.warn("Dropped item must be a Deed item.");
      return;
    }

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    const behavior = phasesData[phaseKey]?.behaviors?.find(b => b.id === behaviorId);
    if (!behavior) return;

    behavior.params = behavior.params || {};
    behavior.params.deedUuid = droppedItem.uuid;
    behavior.params.deedName = droppedItem.name;
    behavior.params.deedImg = droppedItem.img;

    await this.document.update({ "system.phases": phasesData });
  }

  // ── Form Submission Handler ──────────────────────────────────────────────────

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }

  // ── Action Handlers ──────────────────────────────────────────────────────────

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }

  static #onTogglePhase(event, target) {
    event.preventDefault();
    const phase = target.dataset.phase;
    if (!phase) return;
    if (this._expandedPhases.has(phase)) {
      this._expandedPhases.delete(phase);
    } else {
      this._expandedPhases.add(phase);
    }
    this.render();
  }

  static async #onAddBehavior(event, target) {
    event.preventDefault();
    const phaseKey = target.dataset.phase;
    if (!phaseKey) return;

    const selectEl = target.closest(".add-behavior-row")?.querySelector(".add-behavior-select");
    const type = selectEl ? selectEl.value : BEHAVIOR_TYPES[0];

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    if (!phasesData[phaseKey]) phasesData[phaseKey] = { description: "", behaviors: [] };
    phasesData[phaseKey].behaviors = phasesData[phaseKey].behaviors ?? [];
    phasesData[phaseKey].behaviors.push({
      id: foundry.utils.randomID(),
      type: type,
      params: foundry.utils.deepClone(DEFAULT_PARAMS[type] ?? {})
    });

    await this.document.update({ "system.phases": phasesData });
  }

  static async #onRemoveBehavior(event, target) {
    event.preventDefault();
    const phaseKey = target.dataset.phase;
    const behaviorId = target.dataset.behaviorId;
    if (!phaseKey || !behaviorId) return;

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    if (phasesData[phaseKey]?.behaviors) {
      phasesData[phaseKey].behaviors = phasesData[phaseKey].behaviors.filter(b => b.id !== behaviorId);
      await this.document.update({ "system.phases": phasesData });
    }
  }

  static async #onMoveBehaviorUp(event, target) {
    event.preventDefault();
    const phaseKey = target.dataset.phase;
    const behaviorId = target.dataset.behaviorId;
    if (!phaseKey || !behaviorId) return;

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    const behaviors = phasesData[phaseKey]?.behaviors;
    if (!behaviors) return;

    const idx = behaviors.findIndex(b => b.id === behaviorId);
    if (idx > 0) {
      const temp = behaviors[idx];
      behaviors[idx] = behaviors[idx - 1];
      behaviors[idx - 1] = temp;
      await this.document.update({ "system.phases": phasesData });
    }
  }

  static async #onMoveBehaviorDown(event, target) {
    event.preventDefault();
    const phaseKey = target.dataset.phase;
    const behaviorId = target.dataset.behaviorId;
    if (!phaseKey || !behaviorId) return;

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    const behaviors = phasesData[phaseKey]?.behaviors;
    if (!behaviors) return;

    const idx = behaviors.findIndex(b => b.id === behaviorId);
    if (idx >= 0 && idx < behaviors.length - 1) {
      const temp = behaviors[idx];
      behaviors[idx] = behaviors[idx + 1];
      behaviors[idx + 1] = temp;
      await this.document.update({ "system.phases": phasesData });
    }
  }

  static async #onRemoveBehaviorEffect(event, target) {
    event.preventDefault();
    const phaseKey = target.dataset.phase;
    const behaviorId = target.dataset.behaviorId;
    const effectIndex = parseInt(target.dataset.effectIndex);
    if (!phaseKey || !behaviorId || isNaN(effectIndex)) return;

    const phasesData = foundry.utils.deepClone(this.document.system.phases);
    const behavior = phasesData[phaseKey]?.behaviors?.find(b => b.id === behaviorId);
    if (behavior?.params?.effects) {
      behavior.params.effects.splice(effectIndex, 1);
      await this.document.update({ "system.phases": phasesData });
    }
  }

  static async #onCopyBehaviorId(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const id = target.dataset.behaviorId;
    if (!id) return;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(id);
    } else if (game.clipboard?.copyPlainText) {
      game.clipboard.copyPlainText(id);
    }

    ui.notifications.info(`Copied behavior ID "${id}" to clipboard.`);
  }
}
