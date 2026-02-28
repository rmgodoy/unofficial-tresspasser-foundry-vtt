
/**
 * Item Sheet for Armor in the Trespasser TTRPG system.
 */
export class TrespasserArmorSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "armor", "item-sheet"],
      template: "systems/trespasser/templates/item/armor-sheet.hbs",
      width: 520,
      height: 480,
      scrollY: [".sheet-body"],
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    context.config = foundry.utils.mergeObject({
      placements: {
        "head": "Head",
        "body": "Chest/Body",
        "arms": "Arms",
        "legs": "Legs",
        "outer": "Outer",
        "shield": "Shield"
      }
    }, CONFIG.TRESPASSER);

    // Enrich HTML description
    // Enrich HTML description
    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Standardized removals
    html.find('.remove-effect').click(this._onRemoveLink.bind(this, 'effects'));

    // Standardized drag-and-drop
    const dropZones = html.find('.drop-zone');
    dropZones.on("dragover", (ev) => { ev.preventDefault(); return false; });
    dropZones.on("drop", this._onDropItem.bind(this));

    // Standardized intensity change
    html.find('.effect-intensity-input').change(this._onIntensityChange.bind(this));
  }

  async _onDropItem(event) {
    event.preventDefault();
    const dataText = event.originalEvent?.dataTransfer?.getData("text/plain");
    if (!dataText) return;

    let dropData;
    try {
      dropData = JSON.parse(dataText);
    } catch(e) { return; }

    if (dropData.type !== "Item") return;
    
    const targetEl = event.currentTarget;
    const targetType = targetEl.dataset.type; // Always "effects" for armor

    const sourceItem = await fromUuid(dropData.uuid);
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

    const currentArray = this.item.system[targetType] ? [...this.item.system[targetType]] : [];

    if (currentArray.some(e => e.uuid === sourceItem.uuid)) {
      ui.notifications.warn(`${sourceItem.name} is already linked.`);
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
    if (!el) return;
    
    const index = Number(el.dataset.index);
    const currentArray = [...(this.item.system[targetType] || [])];
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
    const targetEl = input.closest('.drop-zone');
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
