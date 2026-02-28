/**
 * Extend the basic ItemSheet with some very simple logic.
 * @extends {ItemSheet}
 */
export class TrespasserWeaponSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item"],
      width: 520,
      height: 480,
      scrollY: [".sheet-body"],
      tabs: [] // No tabs for weapons
    });
  }

  /** @override */
  get template() {
    return `systems/trespasser/templates/item/weapon-sheet.hbs`;
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    // Prepare linked references for the Handlebars template
    context.linkedEffects = this.item.system.effects || [];
    context.linkedEnhancements = this.item.system.enhancementEffects || [];
    context.linkedDeeds = this.item.system.extraDeeds || [];

    // Enrich HTML description
    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });
    
    context.config = CONFIG.TRESPASSER;

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Remove buttons
    html.find('.effect-remove').click(this._onRemoveLink.bind(this, 'effects'));
    html.find('.enhancement-remove').click(this._onRemoveLink.bind(this, 'enhancementEffects'));
    html.find('.deed-remove').click(this._onRemoveLink.bind(this, 'extraDeeds'));

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
    try {
      dropData = JSON.parse(dataText);
    } catch(e) {
      return;
    }

    if (dropData.type !== "Item") return;
    
    // Check which element was targeted 
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // "effects", "enhancementEffects", or "extraDeeds"

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;
    
    // Validate types implicitly
    if (targetType === "extraDeeds" && sourceItem.type !== "deed") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropDeedsOnly"));
      return;
    }
    if ((targetType === "effects" || targetType === "enhancementEffects") && 
        (sourceItem.type !== "effect" && sourceItem.type !== "state")) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropEffectsStatesOnly"));
      return;
    }

    const currentArray = this.item.system[targetType] ? [...this.item.system[targetType]] : [];

    // Avoid duplicates of the same effect/deed based on its name (not uuid because the original item could change)
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
