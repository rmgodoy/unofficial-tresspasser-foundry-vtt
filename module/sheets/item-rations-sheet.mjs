import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item Sheet for Rations in the Trespasser TTRPG system.
 */
export class TrespasserRationsSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "rations", "item-sheet"],
      template: "systems/trespasser/templates/item/rations-sheet.hbs",
      width: 520,
      height: 480,
      scrollY: [".sheet-body"],
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
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

    // Make effects drop zones droppable
    html.find(".applied-effects-list").on("drop", this._onDropEffect.bind(this));
    
    // Prevent default dragover to allow dropping
    html.find(".applied-effects-list").on("dragover", ev => ev.preventDefault());

    // Delete effect chip
    html.find(".effect-remove").on("click", this._onRemoveEffect.bind(this));

    // Intensity change
    html.find('.effect-intensity-input').change(this._onIntensityChange.bind(this));

    // Edit button
    html.find('.effect-edit').on("click", this._onEffectEdit.bind(this));
  }

  async _onDropEffect(event) {
    event.preventDefault();

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
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropRationsOnly"));
      return;
    }

    const currentEffects = foundry.utils.deepClone(this.item.system.effects) || [];
    
    currentEffects.push({
      uuid: item.uuid,
      type: item.type,
      name: item.name,
      img: item.img,
      intensity: item.system.intensity || 0
    });

    await this.item.update({
      "system.effects": currentEffects
    });
  }

  async _onRemoveEffect(event) {
    event.preventDefault();
    const el = event.currentTarget.closest(".effect-chip");
    if (!el) return;
    
    const index = parseInt(el.dataset.index);
    if (isNaN(index)) return;

    const currentEffects = foundry.utils.deepClone(this.item.system.effects) || [];
    currentEffects.splice(index, 1);

    await this.item.update({
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

    const currentEffects = this.item.system.effects || [];
    if (currentEffects[index]) {
      currentEffects[index].intensity = value;
      await this.item.update({
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
    const currentArray = [...(this.item.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);

    if (effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }
}
