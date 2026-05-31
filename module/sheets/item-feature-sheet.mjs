import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

const { api, sheets } = foundry.applications;

/**
 * Item Sheet for Features.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserFeatureSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "feature", "item-sheet"],
    position: { width: 520, height: 600 },
    form: {
      handler: TrespasserFeatureSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/feature-sheet.hbs",
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

    // Preparation for Handlebars
    context.linkedEffects = system.effects || [];
    context.linkedDeeds = system.deeds || [];

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
            const desc = pm.value;
            this.document.update({ "system.description": desc });
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
            const desc = pm.value;
            this.document.update({ "system.description": desc });
          }
        }, 0);
      }
    }, true);

    if (!this.isEditable) return;

    // Remove buttons
    this.element.querySelectorAll('.effect-remove').forEach(btn => {
      btn.addEventListener('click', ev => this._onRemoveLink('effects', ev));
    });
    this.element.querySelectorAll('.deed-remove').forEach(btn => {
      btn.addEventListener('click', ev => this._onRemoveLink('deeds', ev));
    });

    // Drag-and-drop
    this.element.querySelectorAll('.drop-zone').forEach(dropZone => {
      dropZone.addEventListener("dragover", ev => { ev.preventDefault(); return false; });
      dropZone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Intensity change
    this.element.querySelectorAll('.effect-intensity-input').forEach(input => {
      input.addEventListener("change", this._onIntensityChange.bind(this));
    });

    // Edit button
    this.element.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener("click", this._onEffectEdit.bind(this));
    });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const dropData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!dropData || dropData.type !== "Item") return;

    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // "effects" or "deeds"

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;

    // Validate types
    if (targetType === "deeds" && sourceItem.type !== "deed") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnly"));
      return;
    }
    if (targetType === "effects" && (sourceItem.type !== "effect" && sourceItem.type !== "state")) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsStatesOnly"));
      return;
    }

    const currentArray = this.document.system[targetType] ? [...this.document.system[targetType]] : [];

    // Avoid duplicates
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
    const index = Number(el.dataset.index);
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
    // Features support deeds and effects, but only effects can be edited in-place
    if (targetType !== 'effects') return;

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
