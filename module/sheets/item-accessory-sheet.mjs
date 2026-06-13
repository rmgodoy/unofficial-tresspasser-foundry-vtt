const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item Sheet for Accessories in the Trespasser TTRPG system.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserAccessorySheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "item", "accessory", "item-sheet"],
    position: { width: 520, height: 520 },
    form: {
      handler: TrespasserAccessorySheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/accessory-sheet.hbs",
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
        "ring": "TRESPASSER.Sheet.Character.Equipments.Ring",
        "talisman": "TRESPASSER.Sheet.Character.Equipments.Talisman",
        "amulet": "TRESPASSER.Sheet.Character.Equipments.Amulet"
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

    // Intensity change (for effects)
    html.querySelectorAll('.effect-intensity-input').forEach(input => {
      input.addEventListener('change', this._onIntensityChange.bind(this));
    });

    // Edit button (for effects)
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEffectEdit.bind(this));
    });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data.type !== "Item") return;
    
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // "talents", "features", "deeds", "effects"

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    if (sourceItem.parent) {
      ui.notifications.warn("You can only link Items from the Items Sidebar Directory, not from an Actor.");
      return;
    }

    // Validation
    if (targetType === "talents" && sourceItem.type !== "talent") {
      ui.notifications.warn("You can only drop Talents here.");
      return;
    }
    if (targetType === "features" && sourceItem.type !== "feature") {
      ui.notifications.warn("You can only drop Features here.");
      return;
    }
    if (targetType === "deeds" && sourceItem.type !== "deed") {
      ui.notifications.warn("You can only drop Deeds here.");
      return;
    }
    if (targetType === "effects" && sourceItem.type !== "effect" && sourceItem.type !== "state") {
      ui.notifications.warn("You can only drop Effects or States here.");
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
      img: sourceItem.img
    };

    if (targetType === "effects") {
      entry.intensity = sourceItem.system.intensity || 0;
    }

    currentArray.push(entry);

    await this.document.update({
      "system.description": this.document.system.description,
      [`system.${targetType}`]: currentArray
    });

    if (this.document.actor && this.document.system.equipped) {
       await this.document.actor._applyLinkedItems([entry], { continuousOnly: targetType === "effects" });
    }
  }

  async _onRemoveLink(targetType, event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;
    
    const index = Number(el.dataset.index);
    const currentArray = [...(this.document.system[targetType] || [])];
    const removedItem = currentArray[index];
    currentArray.splice(index, 1);
    await this.document.update({
      "system.description": this.document.system.description,
      [`system.${targetType}`]: currentArray
    });

    if (this.document.actor && this.document.system.equipped) {
       await this.document.actor._removeLinkedItems([removedItem], this.document.id);
    }
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el = input.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const value = parseInt(input.value) || 0;

    const currentArray = [...(this.document.system.effects || [])];
    if (currentArray[index]) {
      currentArray[index].intensity = value;
      await this.document.update({
        "system.description": this.document.system.description,
        "system.effects": currentArray
      });

      if (this.document.actor && this.document.system.equipped) {
         // Refresh the effect on the actor
         await this.document.actor._applyLinkedItems([currentArray[index]], { continuousOnly: true });
      }
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const targetType = "effects"; // Accessory only supports editing effects in-place
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
