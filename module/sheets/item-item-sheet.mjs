const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Extend the basic ItemSheet with some very simple logic.
 */
export class TrespasserItemSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "item", "item-sheet"],
    position: { width: 520, height: 480 },
    form: {
      handler: TrespasserItemSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/item-sheet.hbs",
      scrollable: [".scrollable", ".sheet-body"]
    }
  };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Item.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;
    
    context.item = item;
    context.system = system;
    context.editable = this.isEditable;
    
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );
    
    context.config = CONFIG.TRESPASSER;

    // Provide localized options
    context.subTypeOptions = {
      tool: "TRESPASSER.Terms.ItemType.ItemSubTypes.Tool",
      resource: "TRESPASSER.Terms.ItemType.ItemSubTypes.Resource",
      light_source: "TRESPASSER.Terms.ItemType.ItemSubTypes.LightSource",
      miscellaneous: "TRESPASSER.Terms.ItemType.ItemSubTypes.Miscellaneous",
      bombs: "TRESPASSER.Terms.ItemType.ItemSubTypes.Bombs",
      oils: "TRESPASSER.Terms.ItemType.ItemSubTypes.Oils",
      powders: "TRESPASSER.Terms.ItemType.ItemSubTypes.Powders",
      potions: "TRESPASSER.Terms.ItemType.ItemSubTypes.Potions",
      scrolls: "TRESPASSER.Terms.ItemType.ItemSubTypes.Scrolls",
      esoteric: "TRESPASSER.Terms.ItemType.ItemSubTypes.Esoteric",
      artifacts: "TRESPASSER.Terms.ItemType.ItemSubTypes.Artifacts"
    };

    context.resourceTypeOptions = {
      ingredients: "TRESPASSER.Terms.ItemType.ItemSubTypes.Ingredients",
      materials: "TRESPASSER.Terms.ItemType.ItemSubTypes.Materials"
    };

    context.placementOptions = {
      hand: "TRESPASSER.Sheet.Character.Equipments.Hand",
      head: "TRESPASSER.Sheet.Character.Equipments.Head",
      body: "TRESPASSER.Sheet.Character.Equipments.Body",
      arms: "TRESPASSER.Sheet.Character.Equipments.Arms",
      legs: "TRESPASSER.Sheet.Character.Equipments.Legs",
      outer: "TRESPASSER.Sheet.Character.Equipments.Outer",
      shield: "TRESPASSER.Sheet.Character.Equipments.Shield"
    };

    context.tierOptions = {
      lesser: "TRESPASSER.Sheet.Item.Details.Tiers.Light",
      greater: "TRESPASSER.Sheet.Item.Details.Tiers.Heavy"
    };

    // Subtype visibility flags for the template
    const st = system.subType;
    context.isResource = st === "resource";
    context.isLightSource = st === "light_source";
    context.isConsumable = ["bombs", "oils", "powders", "potions"].includes(st);
    context.isScroll = st === "scrolls";
    context.isEsoteric = st === "esoteric";
    context.isArtifact = st === "artifacts";
    context.hasDamage = st === "bombs";

    // "Custom Attributes" exists if it's a special subtype
    context.hasCustomAttributes = context.isResource || context.isLightSource || 
                                  context.isConsumable || context.isScroll || 
                                  context.isEsoteric || context.isArtifact;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    const html = this.element;

    // Remove buttons based on component logic
    html.querySelectorAll('.remove-effect').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'effects'));
    });
    html.querySelectorAll('.remove-deed').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'deeds'));
    });
    html.querySelectorAll('.remove-incantation').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'incantations'));
    });
    html.querySelectorAll('.remove-talent').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'talents'));
    });
    html.querySelectorAll('.remove-feature').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'features'));
    });

    // Edit button for effects
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEffectEdit.bind(this));
    });

    // Drag-and-drop zones
    const dropZones = html.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
      zone.addEventListener("dragover", (ev) => { ev.preventDefault(); return false; });
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Intensity management for effects
    html.querySelectorAll('.effect-intensity-input').forEach(input => {
      input.addEventListener('change', this._onIntensityChange.bind(this));
    });

    // Intercept change events from prose-mirror in the capture phase to prevent synchronous submission crash
    this.element.addEventListener('change', ev => {
      const pm = ev.target.closest('prose-mirror');
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) {
            this.document.update({ "system.description": pm.value });
          }
        }, 0);
      }
    }, true);
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data.type !== "Item") return;
    
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // "effects", "deeds", etc.

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    if (sourceItem.parent) {
      ui.notifications.warn("You can only link Items from the Items Sidebar Directory, not from an Actor.");
      return;
    }

    // Validation
    if (targetType === "talents" && sourceItem.type !== "talent") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropTalentsOnly"));
      return;
    }
    if (targetType === "features" && sourceItem.type !== "feature") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropFeaturesOnly"));
      return;
    }
    if (targetType === "deeds" && sourceItem.type !== "deed") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnly"));
      return;
    }
    if (targetType === "incantations" && sourceItem.type !== "incantation") {
      ui.notifications.warn("Only Incantation items can be dropped here.");
      return;
    }
    if (targetType === "effects" && sourceItem.type !== "effect" && sourceItem.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsStatesOnly"));
      return;
    }

    const currentArray = this.document.system[targetType] ? [...this.document.system[targetType]] : [];

    if (currentArray.some(e => e.uuid === sourceItem.uuid)) {
      ui.notifications.warn(`${sourceItem.name} is already linked.`);
      return;
    }

    currentArray.push({
      uuid: sourceItem.uuid,
      type: sourceItem.type,
      name: sourceItem.name,
      img: sourceItem.img,
      intensity: sourceItem.system.intensity || 0
    });

    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    await this.document.update({
      "system.description": desc ?? this.document.system.description,
      [`system.${targetType}`]: currentArray
    });
  }

  async _onRemoveLink(targetType, event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip') || event.currentTarget.closest('.nested-item');
    if (!el) return;
    
    const index = el.dataset.index !== undefined ? Number(el.dataset.index) : 
                Array.from(el.parentNode.children).indexOf(el);

    const currentArray = [...(this.document.system[targetType] || [])];
    currentArray.splice(index, 1);

    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    await this.document.update({
      "system.description": desc ?? this.document.system.description,
      [`system.${targetType}`]: currentArray
    });
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el = input.closest('.effect-chip');
    const targetEl = input.closest('.drop-zone');
    if (!el || !targetEl) return;

    const index = Number(el.dataset.index);
    const targetType = targetEl.dataset.type;
    const value = parseInt(input.value) || 0;

    const currentArray = [...(this.document.system[targetType] || [])];
    if (currentArray[index]) {
      currentArray[index].intensity = value;

      const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
      await this.document.update({
        "system.description": desc ?? this.document.system.description,
        [`system.${targetType}`]: currentArray
      });
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const targetEl = event.currentTarget.closest('.drop-zone');
    if (!el || !targetEl) return;

    const index = Number(el.dataset.index);
    const targetType = targetEl.dataset.type;
    const currentArray = [...(this.document.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);

    if(effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
