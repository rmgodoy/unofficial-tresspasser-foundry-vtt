const { api, sheets } = foundry.applications;

/**
 * Item Sheet for Stronghold items.
 */
export class TrespasserStrongholdSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "stronghold-sheet"],
    position: { width: 500, height: 750 },
    actions: {
      addBonus: TrespasserStrongholdSheet.#onAddBonus,
      removeBonus: TrespasserStrongholdSheet.#onRemoveBonus,
      removeFeature: TrespasserStrongholdSheet.#onRemoveFeature,
      addAction: TrespasserStrongholdSheet.#onAddAction,
      removeAction: TrespasserStrongholdSheet.#onRemoveAction,
      removeOwner: TrespasserStrongholdSheet.#onRemoveOwner
    },
    form: { 
      handler: TrespasserStrongholdSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/stronghold-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;

    // Attributes list for dropdown
    context.attributes = {
      "military": "TRESPASSER.Haven.Attributes.Military",
      "efficiency": "TRESPASSER.Haven.Attributes.Efficiency",
      "resources": "TRESPASSER.Haven.Attributes.Resources",
      "expertise": "TRESPASSER.Haven.Attributes.Expertise",
      "allegiance": "TRESPASSER.Haven.Attributes.Allegiance",
      "appeal": "TRESPASSER.Haven.Attributes.Appeal"
    };

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      { 
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    // Resolve owner name
    context.ownerName = "";
    if (system.ownerId) {
        const owner = game.actors.get(system.ownerId);
        context.ownerName = owner?.name || "Unknown Character";
    }

    // Prep bonuses with localized labels
    context.preparedBonuses = (system.bonuses || []).map((b, i) => ({
        ...b,
        index: i,
        label: context.attributes[b.attribute]
    }));

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const html = this.element;
    
    // Owner drop zone
    const ownerZone = html.querySelector('.owner-drop-zone');
    if (ownerZone) {
      ownerZone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ownerZone.classList.add('drag-over');
      });
      ownerZone.addEventListener('dragleave', () => ownerZone.classList.remove('drag-over'));
      ownerZone.addEventListener('drop', async (ev) => {
        ownerZone.classList.remove('drag-over');
        const data = TextEditor.getDragEventData(ev);
        if (data.type !== "Actor") return;
        const sourceActor = await fromUuid(data.uuid);
        if (sourceActor?.type !== "character") {
            ui.notifications.warn("Only characters can own strongholds.");
            return;
        }
        await this.document.update({ "system.ownerId": sourceActor.id });
      });
    }

    // Features drop zone
    const featuresZone = html.querySelector('.features-drop-zone');
    if (featuresZone) {
      featuresZone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        featuresZone.classList.add('drag-over');
      });
      featuresZone.addEventListener('dragleave', () => featuresZone.classList.remove('drag-over'));
      featuresZone.addEventListener('drop', async (ev) => {
        featuresZone.classList.remove('drag-over');
        const data = TextEditor.getDragEventData(ev);
        if (data.type !== "Item") return;
        const sourceItem = await fromUuid(data.uuid);
        if (sourceItem?.type !== "feature") {
            ui.notifications.warn("Only Features can be added here.");
            return;
        }
        
        const features = [...(this.document.system.features || [])];
        if (features.some(f => f.uuid === data.uuid)) return;

        features.push({
            uuid: data.uuid,
            name: sourceItem.name,
            img: sourceItem.img,
            type: sourceItem.type
        });
        await this.document.update({ "system.features": features });
      });
    }
  }

  static async #onAddBonus(event, target) {
    const bonuses = [...(this.document.system.bonuses || [])];
    bonuses.push({ attribute: "military", value: 1 });
    await this.document.update({ "system.bonuses": bonuses });
  }

  static async #onRemoveBonus(event, target) {
    const index = parseInt(target.dataset.index);
    const bonuses = [...(this.document.system.bonuses || [])];
    bonuses.splice(index, 1);
    await this.document.update({ "system.bonuses": bonuses });
  }

  static async #onRemoveFeature(event, target) {
    const index = parseInt(target.dataset.index);
    const features = [...(this.document.system.features || [])];
    features.splice(index, 1);
    await this.document.update({ "system.features": features });
  }

  static async #onAddAction(event, target) {
    const actions = [...(this.document.system.havenActions || [])];
    actions.push("New Haven Action");
    await this.document.update({ "system.havenActions": actions });
  }

  static async #onRemoveAction(event, target) {
    const index = parseInt(target.dataset.index);
    const actions = [...(this.document.system.havenActions || [])];
    actions.splice(index, 1);
    await this.document.update({ "system.havenActions": actions });
  }

  static async #onRemoveOwner(event, target) {
    await this.document.update({ "system.ownerId": "" });
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    // Handle array updates from form if necessary, but expandObject should handle it
    await this.document.update(data);
  }
}
