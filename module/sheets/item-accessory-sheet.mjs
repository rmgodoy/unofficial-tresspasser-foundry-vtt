/**
 * Item Sheet for Accessories in the Trespasser TTRPG system.
 */
export class TrespasserAccessorySheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "accessory", "item-sheet"],
      template: "systems/trespasser/templates/item/accessory-sheet.hbs",
      width: 520,
      height: 520,
      scrollY: [".sheet-body"],
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    context.config = foundry.utils.mergeObject({
      placements: {
        "ring": "TRESPASSER.Item.Accessory.Ring",
        "talisman": "TRESPASSER.Item.Accessory.Talisman",
        "amulet": "TRESPASSER.Item.Accessory.Amulet"
      }
    }, CONFIG.TRESPASSER);

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
    html.find('.remove-link').click(event => {
      const type = event.currentTarget.dataset.type;
      this._onRemoveLink(type, event);
    });

    // Standardized drag-and-drop
    const dropZones = html.find('.drop-zone');
    dropZones.on("dragover", (ev) => { ev.preventDefault(); return false; });
    dropZones.on("drop", this._onDropItem.bind(this));

    // Intensity change (for effects)
    html.find('.effect-intensity-input').change(this._onIntensityChange.bind(this));

    // Edit button (for effects)
    html.find('.effect-edit').click(this._onEffectEdit.bind(this));
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
    const targetType = targetEl.dataset.type; // "talents", "features", "deeds", "effects"

    const sourceItem = await fromUuid(dropData.uuid);
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

    const currentArray = this.item.system[targetType] ? [...this.item.system[targetType]] : [];

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

    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${targetType}`]: currentArray
    });

    if (this.item.actor && this.item.system.equipped) {
       await this.item.actor._applyLinkedItems([entry], { passiveOnly: targetType === "effects" });
    }
  }

  async _onRemoveLink(targetType, event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;
    
    const index = Number(el.dataset.index);
    const currentArray = [...(this.item.system[targetType] || [])];
    const removedItem = currentArray[index];
    currentArray.splice(index, 1);
    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${targetType}`]: currentArray
    });

    if (this.item.actor && this.item.system.equipped) {
       await this.item.actor._removeLinkedItems([removedItem], this.item.id);
    }
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el = input.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const value = parseInt(input.value) || 0;

    const currentArray = [...(this.item.system.effects || [])];
    if (currentArray[index]) {
      currentArray[index].intensity = value;
      await this.item.update({
        "system.description": this.item.system.description,
        "system.effects": currentArray
      });

      if (this.item.actor && this.item.system.equipped) {
         // Refresh the effect on the actor
         await this.item.actor._applyLinkedItems([currentArray[index]], { passiveOnly: true });
      }
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const targetType = "effects"; // Accessory only supports editing effects in-place
    const currentArray = [...(this.item.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);
    
    // Rename/Remove conflicting fields before passing to Item.implementation
    const docType = effectData.type || "effect";
    delete effectData.type;
    delete effectData.uuid;
    delete effectData.name;
    delete effectData.img;

    // Create a virtual Item document for the sheet to work on
    const tempItem = new Item.implementation({
      name: effectData.name || "Effect",
      type: docType,
      img: effectData.img,
      system: effectData
    }, { parent: this.item.parent });

    // Override update to sync back to the current item
    tempItem.update = async (updateData) => {
      const arr = [...(this.item.system[targetType] || [])];
      arr[index] = foundry.utils.mergeObject(arr[index], updateData.system || updateData);
      await this.item.update({
        "system.description": this.item.system.description,
        [`system.${targetType}`]: arr
      });

      if (this.item.actor && this.item.system.equipped) {
         // Refresh the effect on the actor
         await this.item.actor._applyLinkedItems([arr[index]], { passiveOnly: true });
      }
      return tempItem;
    };

    tempItem.sheet.render(true);
  }
}
