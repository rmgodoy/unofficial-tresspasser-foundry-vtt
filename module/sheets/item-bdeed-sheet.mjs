import { BEHAVIOR_TYPES } from "../data/item-bdeed.mjs";

const { api, sheets } = foundry.applications;

export class TrespasserBDeedSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  /**
   * Set of phase keys currently expanded in the accordion UI.
   * @type {Set<string>}
   */
  _expandedPhases = new Set(["base"]);

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "bdeed", "item-sheet"],
    position: { width: 620, height: 720 },
    actions: {
      switchTab:        TrespasserBDeedSheet.#onSwitchTab,
      togglePhase:      TrespasserBDeedSheet.#onTogglePhase,
      addBehavior:      TrespasserBDeedSheet.#onAddBehavior,
      removeBehavior:   TrespasserBDeedSheet.#onRemoveBehavior,
      moveBehaviorUp:   TrespasserBDeedSheet.#onMoveBehaviorUp,
      moveBehaviorDown: TrespasserBDeedSheet.#onMoveBehaviorDown,
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    header: {
      template: "systems/trespasser/templates/item/bdeed/header.hbs"
    },
    tabs: {
      template: "systems/trespasser/templates/item/bdeed/tabs.hbs"
    },
    details: {
      template: "systems/trespasser/templates/item/bdeed/details.hbs",
      scrollable: ["", ".bdeed-details"]
    },
    behaviors: {
      template: "systems/trespasser/templates/item/bdeed/behaviors.hbs",
      scrollable: ["", ".bdeed-behaviors"]
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
        label: game.i18n.localize(`TRESPASSER.Sheet.BDeed.Phase.${key.charAt(0).toUpperCase() + key.slice(1)}`),
        expanded: this._expandedPhases.has(key),
        description: phaseData.description ?? "",
        behaviors: rawBehaviors.map((b, i) => ({
          ...b,
          index: i,
          typeLabel: game.i18n.localize(`TRESPASSER.Sheet.BDeed.Behavior.Type.${b.type}`) || b.type,
          isFirst: i === 0,
          isLast: i === rawBehaviors.length - 1
        }))
      };
    });

    context.behaviorTypeChoices = BEHAVIOR_TYPES.map(t => ({
      value: t,
      label: game.i18n.localize(`TRESPASSER.Sheet.BDeed.Behavior.Type.${t}`) || t
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
      params: {}
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
}
