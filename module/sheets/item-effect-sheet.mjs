import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item sheet for Trespasser Effect items.
 */
export class TrespasserEffectSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "effect"],
      template: "systems/trespasser/templates/item/effect-sheet.hbs",
      width: 520,
      height: 480,
      scrollY: [".sheet-body"],
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    // Add constants for the sheet
    context.config = {
      effectTypes: {
        "active": "TRESPASSER.Sheet.Effects.EffectTypes.Active",
        "passive": "TRESPASSER.Sheet.Effects.EffectTypes.Passive"
      },
      targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
      triggerWhen: TrespasserEffectsHelper.TRIGGER_LABELS,
      durationModes: TrespasserEffectsHelper.DURATION_LABELS
    };
    
    return context;
  }
  
  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Drag-and-drop
    const dropZones = html.find('.drop-zone');
    dropZones.on("dragover", this._onDragOver.bind(this));
    dropZones.on("drop", this._onDropItem.bind(this));

    // Remove buttons
    html.find('.counter-state-remove').click(this._onRemoveCounterState.bind(this));

    // Edit buttons
    html.find('.counter-state-edit').click(this._onEditCounterState.bind(this));
  }

  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  async _onDropItem(event) {
    event.preventDefault();
    const dataText = event.originalEvent?.dataTransfer?.getData("text/plain");
    if (!dataText) return;

    let dropData;
    try { dropData = JSON.parse(dataText); } catch(e) { return; }

    if (dropData.type !== "Item") return;
    
    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;
    
    // Validate types: Only effects or states can be counter states
    if (sourceItem.type !== "effect" && sourceItem.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropEffectsStatesOnly"));
      return;
    }

    const currentArray = this.item.system.counterStates ? [...this.item.system.counterStates] : [];

    // Avoid self-reference and duplicates
    if (sourceItem.uuid === this.item.uuid) return;
    if (currentArray.some(e => e.uuid === sourceItem.uuid)) {
       ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.AlreadyAdded", { name: sourceItem.name }));
       return;
    }

    currentArray.push({
      uuid: sourceItem.uuid,
      name: sourceItem.name,
      img: sourceItem.img,
      type: sourceItem.type
    });

    await this.item.update({ "system.counterStates": currentArray });
  }

  async _onRemoveCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const index = Number(el.dataset.index);
    const currentArray = [...this.item.system.counterStates];
    currentArray.splice(index, 1);
    await this.item.update({ "system.counterStates": currentArray });
  }

  async _onEditCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const uuid = el.dataset.uuid;
    const item = await fromUuid(uuid);
    if (item) item.sheet.render(true);
    else ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.ItemNotFound"));
  }
}
