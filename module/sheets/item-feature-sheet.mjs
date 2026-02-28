/**
 * Item Sheet for Features.
 */
export class TrespasserFeatureSheet extends foundry.appv1.sheets.ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "feature"],
      width: 520,
      height: 600,
      scrollY: [".sheet-body"],
    });
  }

  get template() {
    return `systems/trespasser/templates/item/feature-sheet.hbs`;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    // Preparation for Handlebars
    context.linkedEffects = this.item.system.effects || [];
    context.linkedDeeds = this.item.system.deeds || [];

    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Remove buttons
    html.find('.effect-remove').click(this._onRemoveLink.bind(this, 'effects'));
    html.find('.deed-remove').click(this._onRemoveLink.bind(this, 'deeds'));

    // Drag-and-drop
    const dropZones = html.find('.drop-zone');
    dropZones.on("dragover", this._onDragOver.bind(this));
    dropZones.on("drop", this._onDropItem.bind(this));

    // Intensity change
    html.find('.effect-intensity-input').change(this._onIntensityChange.bind(this));
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
    
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // "effects" or "deeds"

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;
    
    // Validate types
    if (targetType === "deeds" && sourceItem.type !== "deed") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropDeedsOnly"));
      return;
    }
    if (targetType === "effects" && (sourceItem.type !== "effect" && sourceItem.type !== "state")) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropEffectsStatesOnly"));
      return;
    }

    const currentArray = this.item.system[targetType] ? [...this.item.system[targetType]] : [];

    // Avoid duplicates
    if (currentArray.some(e => e.name === sourceItem.name || e.uuid === sourceItem.uuid)) {
       ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.AlreadyAdded", { name: sourceItem.name }));
       return;
    }

    currentArray.push({
      uuid: sourceItem.uuid,
      type: sourceItem.type,
      name: sourceItem.name,
      img: sourceItem.img,
      intensity: sourceItem.system.intensity || 1
    });

    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${targetType}`]: currentArray
    });
  }

  async _onRemoveLink(targetType, event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const index = Number(el.dataset.index);
    const currentArray = [...this.item.system[targetType]];
    currentArray.splice(index, 1);
    await this.item.update({
      "system.description": this.item.system.description,
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
    const value = parseInt(input.value) || 1;

    const currentArray = [...(this.item.system[targetType] || [])];
    if (currentArray[index]) {
      currentArray[index].intensity = value;
      await this.item.update({
        "system.description": this.item.system.description,
        [`system.${targetType}`]: currentArray
      });
    }
  }
}
