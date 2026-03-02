/**
 * Extend the basic ItemSheet with some very simple logic.
 */
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

export class TrespasserItemSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item"],
      width: 520,
      height: 480,
      scrollY: [".sheet-body"],
      tabs: [] // Minimalist design (no tabs)
    });
  }

  /** @override */
  get template() {
    return `systems/trespasser/templates/item/item-sheet.hbs`;
  }

  /** @override */
  async getData(options) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.item.isOwner,
      relativeTo: this.item
    });
    
    context.config = CONFIG.TRESPASSER;

    // Provide localized options
    context.subTypeOptions = {
      tool: "TRESPASSER.Sheet.Items.ItemType.Tool",
      resource: "TRESPASSER.Sheet.Items.ItemType.Resource",
      light_source: "TRESPASSER.Sheet.Items.ItemType.LightSource",
      miscellaneous: "TRESPASSER.Sheet.Items.ItemType.Miscellaneous",
      bombs: "TRESPASSER.Sheet.Items.ItemType.Bombs",
      oils: "TRESPASSER.Sheet.Items.ItemType.Oils",
      powders: "TRESPASSER.Sheet.Items.ItemType.Powders",
      potions: "TRESPASSER.Sheet.Items.ItemType.Potions",
      scrolls: "TRESPASSER.Sheet.Items.ItemType.Scrolls",
      esoteric: "TRESPASSER.Sheet.Items.ItemType.Esoteric",
      artifacts: "TRESPASSER.Sheet.Items.ItemType.Artifacts"
    };

    context.resourceTypeOptions = {
      ingredients: "TRESPASSER.Sheet.Items.ResourceType.Ingredients",
      materials: "TRESPASSER.Sheet.Items.ResourceType.Materials"
    };

    context.placementOptions = {
      hand: "TRESPASSER.Sheet.Items.Equipments.Hand",
      head: "TRESPASSER.Sheet.Items.Equipments.Head",
      body: "TRESPASSER.Sheet.Items.Equipments.Body",
      arms: "TRESPASSER.Sheet.Items.Equipments.Arms",
      legs: "TRESPASSER.Sheet.Items.Equipments.Legs",
      outer: "TRESPASSER.Sheet.Items.Equipments.Outer",
      shield: "TRESPASSER.Sheet.Items.Equipments.Shield"
    };

    context.tierOptions = {
      lesser: "TRESPASSER.Sheet.Items.Tiers.Lesser",
      greater: "TRESPASSER.Sheet.Items.Tiers.Greater"
    };

    // Subtype visibility flags for the template
    const st = this.item.system.subType;
    context.isResource = st === "resource";
    context.isLightSource = st === "light_source";
    context.isConsumable = ["bombs", "oils", "powders", "potions"].includes(st);
    context.isScroll = st === "scrolls";
    context.isEsoteric = st === "esoteric";
    context.isArtifact = st === "artifacts";
    context.hasDamage = st === "bombs";

    // "Custom Attributes" exists if it's a special subtype or has any linked data
    const hasLinkedItems = 
      (context.system.effects?.length > 0) || 
      (context.system.deeds?.length > 0) || 
      (context.system.incantations?.length > 0) || 
      (context.system.talents?.length > 0) || 
      (context.system.features?.length > 0);
    
    context.hasCustomAttributes = context.isResource || context.isLightSource || 
                                  context.isConsumable || context.isScroll || 
                                  context.isEsoteric || context.isArtifact || 
                                  hasLinkedItems;

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Remove buttons based on component logic
    html.find('.remove-effect').click(this._onRemoveLink.bind(this, 'effects'));
    html.find('.effect-edit').click(this._onEffectEdit.bind(this));
    html.find('.remove-deed').click(this._onRemoveLink.bind(this, 'deeds'));
    html.find('.remove-incantation').click(this._onRemoveLink.bind(this, 'incantations'));
    html.find('.remove-talent').click(this._onRemoveLink.bind(this, 'talents'));
    html.find('.remove-feature').click(this._onRemoveLink.bind(this, 'features'));

    // Edit button for effects
    html.find('.effect-edit').click(this._onEffectEdit.bind(this));

    // Drag-and-drop zones
    const dropZones = html.find('.drop-zone');
    dropZones.on("dragover", (ev) => { ev.preventDefault(); return false; });
    dropZones.on("drop", this._onDropItem.bind(this));

    // Intensity management for effects
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
    const targetType = targetEl.dataset.type; // "effects", "deeds", etc.

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;

    if (sourceItem.parent) {
      ui.notifications.warn("You can only link Items from the Items Sidebar Directory, not from an Actor.");
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
      intensity: sourceItem.system.intensity || 0
    });

    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${targetType}`]: currentArray
    });
  }

  async _onRemoveLink(targetType, event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip') || event.currentTarget.closest('.nested-item');
    if (!el) return;
    
    const index = el.dataset.index !== undefined ? Number(el.dataset.index) : 
                Array.from(el.parentNode.children).indexOf(el);

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
    const value = parseInt(input.value) || 0;

    const currentArray = [...(this.item.system[targetType] || [])];
    if (currentArray[index]) {
      currentArray[index].intensity = value;
      await this.item.update({
        "system.description": this.item.system.description,
        [`system.${targetType}`]: currentArray
      });
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const targetEl = event.currentTarget.closest('.drop-zone');
    if (!el || !targetEl) return;

    const index = Number(el.dataset.index);
    const targetType = targetEl.dataset.type;
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
    }, { parent: this.item.parent }); // Parent can be actor or null

    // Override update to sync back to the current item
    tempItem.update = async (updateData) => {
      const arr = [...(this.item.system[targetType] || [])];
      arr[index] = foundry.utils.mergeObject(arr[index], updateData.system || updateData);
      await this.item.update({
        "system.description": this.item.system.description,
        [`system.${targetType}`]: arr
      });
      return tempItem;
    };

    tempItem.sheet.render(true);
  }
  /** @override */
  async _updateObject(event, formData) {
    const st = formData["system.subType"];
    const currentSt = this.item.system.subType;
    
    if (st && st !== currentSt) {
      const cleanData = {};
      
      // If it's a light source, force equippable to true
      if (st === "light_source") formData["system.equippable"] = true;

      // If it's no longer esoteric, clear incantations
      if (st !== "esoteric") cleanData["system.incantations"] = [];
      
      // If it's no longer scrolls or artifacts, clear deeds
      if (!["scrolls", "artifacts"].includes(st)) cleanData["system.deeds"] = [];
      
      // If it's no longer artifacts, clear talents and features
      if (st !== "artifacts") {
        cleanData["system.talents"] = [];
        cleanData["system.features"] = [];
      }

      // If it's no longer a consumable or artifact, clear effects (unless it's an artifact, they have effects too in template)
      if (!["bombs", "oils", "powders", "potions", "artifacts"].includes(st)) {
        cleanData["system.effects"] = [];
      }
      
      foundry.utils.mergeObject(formData, cleanData);
    }
    
    if (this.item.system.subType === "light_source") {
      formData["system.equippable"] = true;
    }

    return super._updateObject(event, formData);
  }
}
