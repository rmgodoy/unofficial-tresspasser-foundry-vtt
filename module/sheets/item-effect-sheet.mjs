const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item sheet for Trespasser Effect items.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserEffectSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "effect-sheet"],
    position: { width: 520, height: 600 },
    form: { 
      handler: TrespasserEffectSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/effect-sheet.hbs",
      scrollable: [".scrollable", ".sheet-content", "[data-scrollable='true']"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;
    
    if (!system.durationConditions) system.durationConditions = [];

    // Map default status effects.
    // Object.values handles both the v13 array and v14 object formats
    const statusEffects = Object.values(CONFIG.statusEffects)
      .map(effect => {
        const id = effect.id;
        const img = effect.img || effect.icon || effect.src || "";
        const name = effect.name || effect.label || id || "";
        const localizedName = game.i18n.localize(name);
        return { id, img, name: localizedName };
      })
      .filter(e => e.id && e.img)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Add constants for the sheet
    context.config = {
      effectTypes: {
        "on-trigger": "TRESPASSER.Sheet.Item.Details.EffectTypeChoices.OnTrigger",
        "continuous": "TRESPASSER.Sheet.Item.Details.EffectTypeChoices.Continuous"
      },
      targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
      triggerWhen: TrespasserEffectsHelper.TRIGGER_LABELS,
      durationModes: TrespasserEffectsHelper.DURATION_LABELS,
      statusEffects
    };

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

    // Drag-and-drop
    const dropZones = html.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
      zone.addEventListener("dragover", this._onDragOver.bind(this));
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Remove buttons
    html.querySelectorAll('.counter-state-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveCounterState.bind(this));
    });

    // Edit buttons
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEditCounterState.bind(this));
    });

    // --- Compound Duration ---
    html.querySelectorAll('.dur-add-condition').forEach(btn => {
      btn.addEventListener('click', this._onAddDurationCondition.bind(this));
    });
    html.querySelectorAll('.dur-remove-condition').forEach(btn => {
      btn.addEventListener('click', this._onRemoveDurationCondition.bind(this));
    });
    html.querySelectorAll('.dur-mode').forEach(select => {
      select.addEventListener('change', this._onDurationModeChange.bind(this));
    });
  }

  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data.type !== "Item") return;
    
    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;
    
    // Validate types: Only effects can be counter states
    if (sourceItem.type !== "effect") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsOnly"));
      return;
    }

    const currentArray = this.document.system.counterStates ? [...this.document.system.counterStates] : [];

    // Avoid self-reference and duplicates
    if (sourceItem.uuid === this.document.uuid) return;
    if (currentArray.some(e => e.uuid === sourceItem.uuid)) {
       ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
       return;
    }

    currentArray.push({
      uuid: sourceItem.uuid,
      name: sourceItem.name,
      img: sourceItem.img,
      type: sourceItem.type
    });

    await this.document.update({ "system.counterStates": currentArray });
  }

  async _onRemoveCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const index = Number(el.dataset.index);
    const currentArray = [...this.document.system.counterStates];
    currentArray.splice(index, 1);
    await this.document.update({ "system.counterStates": currentArray });
  }

  async _onEditCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const uuid = el.dataset.uuid;
    const item = await fromUuid(uuid);
    if (item) item.sheet.render(true);
    else ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.NotFound"));
  }

  async _onAddDurationCondition(event) {
    event.preventDefault();
    const conditions = foundry.utils.deepClone(this.document.system.durationConditions ?? []);
    conditions.push({ mode: "indefinite", value: 0 });
    await this.document.update({ "system.durationConditions": conditions });
  }

  async _onRemoveDurationCondition(event) {
    event.preventDefault();
    const idx = Number(event.currentTarget.dataset.index);
    const conditions = foundry.utils.deepClone(this.document.system.durationConditions ?? []);
    conditions.splice(idx, 1);
    await this.document.update({ "system.durationConditions": conditions });
  }

  _onDurationModeChange(event) {
    const row    = event.currentTarget.closest('.duration-condition-row');
    const mode   = event.currentTarget.value;
    const valInput = row.querySelector('.dur-value');
    if (valInput) {
      const needsVal = mode === "round" || mode === "trigger";
      valInput.style.display = needsVal ? "" : "none";
    }
  }

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
