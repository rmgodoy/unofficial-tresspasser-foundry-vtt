/**
 * Item Sheet for Deeds in the Trespasser TTRPG system.
 */
export class TrespasserDeedSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "deed", "item-sheet"],
      template: "systems/trespasser/templates/item/deed-sheet.hbs",
      width: 520,
      height: 600,
      scrollY: [".sheet-body"],
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    context.config = {
      tiers: {
        "light": "Light",
        "heavy": "Heavy",
        "mighty": "Mighty",
        "special": "Special"
      },
      actionTypes: {
        "attack": "Attack",
        "support": "Support"
      },
      types: {
         "innate": "Innate",
         "melee": "Melee",
         "missile": "Missile",
         "spell": "Spell",
         "tool": "Tool",
         "unarmed": "Unarmed",
         "versatile": "Versatile"
      },
      targets: {
        "1 Creature": "1 Creature",
        "Personal": "Personal",
        "Area": "Area"
      }
    };

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Make effects drop zones droppable
    html.find(".applied-effects-list").on("drop", this._onDropEffect.bind(this));
    
    // Prevent default dragover to allow dropping
    html.find(".applied-effects-list").on("dragover", ev => ev.preventDefault());

    // Delete effect chip
    html.find(".effect-delete").on("click", this._onRemoveEffect.bind(this));

    // Intensity change
    html.find('.effect-intensity-input').change(this._onIntensityChange.bind(this));

    // Edit button
    html.find('.effect-edit').click(this._onEffectEdit.bind(this));
  }

  async _onDropEffect(event) {
    event.preventDefault();
    const phase = event.currentTarget.dataset.phase;
    if (!phase) return;

    let data;
    try {
      data = JSON.parse(event.originalEvent.dataTransfer.getData("text/plain"));
    } catch (err) {
      return;
    }

    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;
    
    // Only allow Effect or State items
    if (item.type !== "effect" && item.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropDeedsOnlyEffects"));
      return;
    }

    const currentEffects = foundry.utils.deepClone(this.item.system.effects[phase].appliedEffects) || [];
    
    currentEffects.push({
      uuid: item.uuid,
      type: item.type,
      name: item.name,
      img: item.img,
      intensity: item.system.intensity || 0
    });

    await this.item.update({
      [`system.effects.${phase}.appliedEffects`]: currentEffects
    });
  }

  async _onRemoveEffect(event) {
    event.preventDefault();
    const el = event.currentTarget.closest(".effect-chip");
    const phaseEl = event.currentTarget.closest(".applied-effects-list");
    if (!el || !phaseEl) return;
    
    const index = parseInt(el.dataset.index);
    const phase = phaseEl.dataset.phase;
    
    if (isNaN(index) || !phase) return;

    const currentEffects = foundry.utils.deepClone(this.item.system.effects[phase].appliedEffects) || [];
    currentEffects.splice(index, 1);

    await this.item.update({
      [`system.effects.${phase}.appliedEffects`]: currentEffects
    });
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el = input.closest('.effect-chip');
    const phaseEl = input.closest('.applied-effects-list');
    if (!el || !phaseEl) return;

    const index = Number(el.dataset.index);
    const phase = phaseEl.dataset.phase;
    const value = parseInt(input.value) || 0;

    const currentEffects = foundry.utils.deepClone(this.item.system.effects[phase].appliedEffects) || [];
    if (currentEffects[index]) {
      currentEffects[index].intensity = value;
      await this.item.update({
        [`system.effects.${phase}.appliedEffects`]: currentEffects
      });
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const phaseEl = event.currentTarget.closest('.applied-effects-list');
    if (!el || !phaseEl) return;

    const index = Number(el.dataset.index);
    const phase = phaseEl.dataset.phase;
    if (isNaN(index) || !phase) return;

    const currentEffects = foundry.utils.deepClone(this.item.system.effects[phase].appliedEffects) || [];
    const effectData = currentEffects[index];
    if (!effectData) return;

    // Rename/Remove conflicting fields before passing to Item.implementation
    const docType = effectData.type || "effect";
    const clonedData = foundry.utils.deepClone(effectData);
    delete clonedData.type;
    delete clonedData.uuid;
    delete clonedData.name;
    delete clonedData.img;

    const tempItem = new Item.implementation({
      name: effectData.name || "Effect",
      type: docType,
      img: effectData.img,
      system: clonedData
    }, { parent: this.item.parent });

    tempItem.update = async (updateData) => {
      const arr = foundry.utils.deepClone(this.item.system.effects[phase].appliedEffects) || [];
      arr[index] = foundry.utils.mergeObject(arr[index], updateData.system || updateData);
      await this.item.update({
        [`system.effects.${phase}.appliedEffects`]: arr
      });
      return tempItem;
    };

    tempItem.sheet.render(true);
  }
}
