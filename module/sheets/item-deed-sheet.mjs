/**
 * AppV2 Item Sheet for Deeds in the Trespasser TTRPG system.
 *
 * Split into three template PARTS:
 *   - header:     image, name, description
 *   - properties: tier, type, target, accuracy, focus costs
 *   - effects:    7 phase blocks with drop zones and effect chips
 */
const { api, sheets } = foundry.applications;

export class TrespasserDeedSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "deed", "item-sheet"],
    position: { width: 560, height: 640 },
    actions: {
      removeEffect: TrespasserDeedSheet.#onRemoveEffect,
      editEffect:   TrespasserDeedSheet.#onEditEffect,
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    header: {
      template: "systems/trespasser/templates/item/deed/header.hbs"
    },
    properties: {
      template: "systems/trespasser/templates/item/deed/properties.hbs"
    },
    effects: {
      template: "systems/trespasser/templates/item/deed/effects.hbs",
      scrollable: [".effects-body"]
    }
  };

  /* -------------------------------------------- */
  /* Context                                       */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    context.item = item;
    context.system = item.system;
    context.editable = this.isEditable;

    // Enrich the description HTML
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description ?? "",
      { async: true, relativeTo: item }
    );

    context.config = {
      tiers: {
        light:   game.i18n.localize("TRESPASSER.Item.DeedTierChoices.Light"),
        heavy:   game.i18n.localize("TRESPASSER.Item.DeedTierChoices.Heavy"),
        mighty:  game.i18n.localize("TRESPASSER.Item.DeedTierChoices.Mighty"),
        special: game.i18n.localize("TRESPASSER.Item.DeedTierChoices.Special")
      },
      actionTypes: {
        attack:  game.i18n.localize("TRESPASSER.Item.DeedActionTypeChoices.Attack"),
        support: game.i18n.localize("TRESPASSER.Item.DeedActionTypeChoices.Support")
      },
      types: {
        innate:    game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Innate"),
        melee:     game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Melee"),
        missile:   game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Missile"),
        spell:     game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Spell"),
        tool:      game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Tool"),
        unarmed:   game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Unarmed"),
        versatile: game.i18n.localize("TRESPASSER.Item.DeedTypeChoices.Versatile")
      },
      targetTypes: {
        creature:    game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.Creature"),
        personal:    game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.Personal"),
        blast:       game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.Blast"),
        close_blast: game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.CloseBlast"),
        burst:       game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.Burst"),
        melee_burst: game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.MeleeBurst"),
        path:        game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.Path"),
        close_path:  game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.ClosePath"),
        aura:        game.i18n.localize("TRESPASSER.Item.DeedTargetTypes.Aura")
      }
    };

    // Flags for conditional target fields in the template
    const tt = item.system.targetType;
    context.showTargetCount = (tt === "creature");
    context.showTargetSize  = ["blast", "close_blast", "burst", "path", "close_path", "aura"].includes(tt);

    // Build per-phase context for the effects template
    const phases = ["start", "before", "base", "hit", "spark", "after", "end"];
    context.phases = phases.map(key => ({
      key,
      label: game.i18n.localize(`TRESPASSER.Item.${key.charAt(0).toUpperCase() + key.slice(1)}`),
      data: item.system.effects?.[key] ?? {},
      effects: (item.system.effects?.[key]?.appliedEffects ?? []).map((e, i) => ({
        ...e, index: i
      }))
    }));

    return context;
  }

  /* -------------------------------------------- */
  /* Lifecycle                                     */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    // Register native drag-drop on effect drop zones
    const dropZones = this.element.querySelectorAll(".applied-effects-list");
    for (const zone of dropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", this.#onDropEffect.bind(this));
    }
  }

  /* -------------------------------------------- */
  /* Drop Handler (native events, not actions)     */
  /* -------------------------------------------- */

  async #onDropEffect(event) {
    event.preventDefault();
    const phase = event.currentTarget.dataset.phase;
    if (!phase) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if (data.type !== "Item") return;

    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem) return;

    // Only allow Effect items
    if (droppedItem.type !== "effect" && droppedItem.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropDeedsOnlyEffects"));
      return;
    }

    const currentEffects = foundry.utils.deepClone(
      this.document.system.effects[phase].appliedEffects
    ) || [];

    currentEffects.push({
      uuid: droppedItem.uuid,
      type: droppedItem.type,
      name: droppedItem.name,
      img: droppedItem.img,
      intensity: droppedItem.system.intensity || 0
    });

    await this.document.update({
      [`system.effects.${phase}.appliedEffects`]: currentEffects
    });
  }

  /* -------------------------------------------- */
  /* Action Handlers                               */
  /* -------------------------------------------- */

  /**
   * Remove an effect from a phase's appliedEffects array.
   */
  static async #onRemoveEffect(event, target) {
    const chip = target.closest(".effect-chip");
    const list = target.closest(".applied-effects-list");
    if (!chip || !list) return;

    const index = parseInt(chip.dataset.index);
    const phase = list.dataset.phase;
    if (isNaN(index) || !phase) return;

    const currentEffects = foundry.utils.deepClone(
      this.document.system.effects[phase].appliedEffects
    ) || [];
    currentEffects.splice(index, 1);

    await this.document.update({
      [`system.effects.${phase}.appliedEffects`]: currentEffects
    });
  }

  /**
   * Open a temporary effect item sheet for editing an embedded effect reference.
   */
  static async #onEditEffect(event, target) {
    const chip = target.closest(".effect-chip");
    const list = target.closest(".applied-effects-list");
    if (!chip || !list) return;

    const index = Number(chip.dataset.index);
    const phase = list.dataset.phase;
    if (isNaN(index) || !phase) return;

    const currentEffects = foundry.utils.deepClone(
      this.document.system.effects[phase].appliedEffects
    ) || [];
    const effectData = currentEffects[index];
    if (!effectData) return;

    // Build a temporary Item for the effect sheet to operate on
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
    }, { parent: this.document.parent });

    // Override update to write back into the deed's effect array
    const sheet = this;
    tempItem.update = async (updateData) => {
      const arr = foundry.utils.deepClone(
        sheet.document.system.effects[phase].appliedEffects
      ) || [];
      arr[index] = foundry.utils.mergeObject(arr[index], updateData.system || updateData);
      await sheet.document.update({
        [`system.effects.${phase}.appliedEffects`]: arr
      });
      return tempItem;
    };

    tempItem.sheet.render(true);
  }
}
