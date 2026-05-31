const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item Sheet for Rations in the Trespasser TTRPG system.
 */
export class TrespasserRationsSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "rations", "item-sheet"],
    position: { width: 520, height: 480 },
    form: {
      handler: TrespasserRationsSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/rations-sheet.hbs",
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

    if (!this.isEditable) return;

    const html = this.element;

    // Make effects drop zones droppable
    html.querySelectorAll(".applied-effects-list").forEach(zone => {
      zone.addEventListener("drop", this._onDropEffect.bind(this));
      zone.addEventListener("dragover", ev => ev.preventDefault());
    });

    // Delete effect chip
    html.querySelectorAll(".effect-remove").forEach(btn => {
      btn.addEventListener("click", this._onRemoveEffect.bind(this));
    });

    // Intensity change
    html.querySelectorAll('.effect-intensity-input').forEach(input => {
      input.addEventListener('change', this._onIntensityChange.bind(this));
    });

    // Edit button
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener("click", this._onEffectEdit.bind(this));
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

  async _onDropEffect(event) {
    event.preventDefault();

    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;
    
    // Only allow Effect or State items
    if (item.type !== "effect" && item.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropRationsOnly"));
      return;
    }

    const currentEffects = foundry.utils.deepClone(this.document.system.effects) || [];
    
    currentEffects.push({
      uuid: item.uuid,
      type: item.type,
      name: item.name,
      img: item.img,
      intensity: item.system.intensity || 0
    });

    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    await this.document.update({
      "system.description": desc ?? this.document.system.description,
      "system.effects": currentEffects
    });
  }

  async _onRemoveEffect(event) {
    event.preventDefault();
    const el = event.currentTarget.closest(".effect-chip");
    if (!el) return;
    
    const index = parseInt(el.dataset.index);
    if (isNaN(index)) return;

    const currentEffects = foundry.utils.deepClone(this.document.system.effects) || [];
    currentEffects.splice(index, 1);

    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    await this.document.update({
      "system.description": desc ?? this.document.system.description,
      "system.effects": currentEffects
    });
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el = input.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const value = parseInt(input.value) || 0;

    const currentEffects = foundry.utils.deepClone(this.document.system.effects) || [];
    if (currentEffects[index]) {
      currentEffects[index].intensity = value;
      
      const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
      await this.document.update({
        "system.description": desc ?? this.document.system.description,
        "system.effects": currentEffects
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

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
