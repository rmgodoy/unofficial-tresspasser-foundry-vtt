const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item Sheet for Armor in the Trespasser TTRPG system.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserArmorSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "armor", "item-sheet"],
    position: { width: 520, height: 480 },
    form: {
      handler: TrespasserArmorSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/armor-sheet.hbs",
      scrollable: [".scrollable", ".sheet-body", "[data-scrollable='true']"]
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
    
    context.config = foundry.utils.mergeObject({
      placements: {
        "head": "TRESPASSER.Sheet.Character.Equipments.Head",
        "body": "TRESPASSER.Sheet.Character.Equipments.Body",
        "arms": "TRESPASSER.Sheet.Character.Equipments.Arms",
        "legs": "TRESPASSER.Sheet.Character.Equipments.Legs",
        "outer": "TRESPASSER.Sheet.Character.Equipments.Outer",
        "shield": "TRESPASSER.Sheet.Character.Equipments.Shield"
      }
    }, CONFIG.TRESPASSER);

    // Enrich HTML description
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    const html = this.element;

    // Standardized removals
    html.querySelectorAll('.remove-link').forEach(btn => {
      btn.addEventListener('click', event => {
        const type = event.currentTarget.dataset.type || event.currentTarget.closest('.drop-zone')?.dataset?.type;
        this._onRemoveLink(type, event);
      });
    });

    // Standardized drag-and-drop
    const dropZones = html.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
      zone.addEventListener("dragover", (ev) => { ev.preventDefault(); return false; });
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Standardized intensity change
    html.querySelectorAll('.effect-intensity-input').forEach(input => {
      input.addEventListener('change', this._onIntensityChange.bind(this));
    });

    // Standardized edit
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEffectEdit.bind(this));
    });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (!data || data.type !== "Item") return;
    
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // Always "effects" for armor

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    if (sourceItem.parent) {
      ui.notifications.warn("You can only link Items from the Items Sidebar Directory, not from an Actor.");
      return;
    }

    // Armour only accepts Effects/States
    if (sourceItem.type !== "effect" && sourceItem.type !== "state") {
        ui.notifications.warn("You can only drop Effects or States on Armor.");
        return;
    }

    const currentArray = this.document.system[targetType] ? [...this.document.system[targetType]] : [];

    if (currentArray.some(e => e.uuid === sourceItem.uuid)) {
      ui.notifications.warn(`${sourceItem.name} is already linked.`);
      return;
    }

    const entry = {
      uuid: sourceItem.uuid,
      type: sourceItem.type,
      name: sourceItem.name,
      img: sourceItem.img,
      intensity: sourceItem.system.intensity || 0
    };

    currentArray.push(entry);

    await this.document.update({
      "system.description": this.document.system.description,
      [`system.${targetType}`]: currentArray
    });
  }

  async _onRemoveLink(targetType, event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;
    
    const index = Number(el.dataset.index);
    const currentArray = [...(this.document.system[targetType] || [])];
    currentArray.splice(index, 1);
    await this.document.update({
      "system.description": this.document.system.description,
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
      await this.document.update({
        "system.description": this.document.system.description,
        [`system.${targetType}`]: currentArray
      });
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const targetType = "effects";
    const currentArray = [...(this.document.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);
    
    if (effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
