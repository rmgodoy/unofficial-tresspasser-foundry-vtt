const { api, sheets } = foundry.applications;

export class TrespasserBDeedSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "bdeed", "item-sheet"],
    position: { width: 620, height: 720 },
    actions: {
      switchTab: TrespasserBDeedSheet.#onSwitchTab,
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

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }
}
