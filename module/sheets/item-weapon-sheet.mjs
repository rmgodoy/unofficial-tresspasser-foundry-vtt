const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item Sheet for Weapons in the Trespasser TTRPG system.
 */
export class TrespasserWeaponSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "weapon", "item-sheet"],
    position: { width: 520, height: 480 },
    form: {
      handler: TrespasserWeaponSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/weapon-sheet.hbs",
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

    // Prepare linked references for the Handlebars template
    context.linkedEffects = system.effects || [];
    context.linkedEnhancements = system.enhancementEffects || [];
    context.linkedDeeds = system.extraDeeds || [];

    // Enrich HTML description
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    context.config = CONFIG.TRESPASSER;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Intercept change events from prose-mirror and handle them asynchronously to prevent synchronous re-rendering crash
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

    // Intercept submit events from prose-mirror and handle them asynchronously
    this.element.addEventListener('submit', ev => {
      const pm = ev.submitter?.closest('prose-mirror');
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

    if (!this.isEditable) return;

    const html = this.element;

    // Remove buttons
    html.querySelectorAll('.effect-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'effects'));
    });
    html.querySelectorAll('.enhancement-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'enhancementEffects'));
    });
    html.querySelectorAll('.oil-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'oilEffects'));
    });
    html.querySelectorAll('.deed-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveLink.bind(this, 'extraDeeds'));
    });

    // Drag-and-drop
    html.querySelectorAll('.drop-zone').forEach(zone => {
      zone.addEventListener("dragover", this._onDragOver.bind(this));
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Intensity change
    html.querySelectorAll('.effect-intensity-input').forEach(input => {
      input.addEventListener('change', this._onIntensityChange.bind(this));
    });

    // Edit button
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEffectEdit.bind(this));
    });
  }

  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data.type !== "Item") return;

    // Check which element was targeted 
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // "effects", "enhancementEffects", "oilEffects", or "extraDeeds"
    if (!targetType) return;

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;
    
    // Validate types implicitly
    if (targetType === "extraDeeds" && sourceItem.type !== "deed") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnly"));
      return;
    }
    if ((targetType === "effects" || targetType === "enhancementEffects" || targetType === "oilEffects") && 
        (sourceItem.type !== "effect" && sourceItem.type !== "state")) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsStatesOnly"));
      return;
    }

    const currentArray = this.document.system[targetType] ? [...this.document.system[targetType]] : [];

    // Avoid duplicates of the same effect/deed based on its name (not uuid because the original item could change)
    if (currentArray.some(e => e.name === sourceItem.name || e.uuid === sourceItem.uuid)) {
       ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
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
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;
    const index = Number(el.dataset.index);
    if (isNaN(index)) return;

    const currentArray = [...this.document.system[targetType]];
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
    const targetEl = input.closest('.applied-effects-list');
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
    const targetEl = event.currentTarget.closest('.applied-effects-list');
    if (!el || !targetEl) return;

    const index = Number(el.dataset.index);
    const targetType = targetEl.dataset.type;
    const currentArray = [...(this.document.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);

    if (effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }

}
