const { api, sheets } = foundry.applications;

/**
 * Item Sheet for Hireling items.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserHirelingSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "hireling-sheet"],
    position: { width: 520, height: 600 },
    actions: {
      removeHirelingItem: TrespasserHirelingSheet.#onRemoveHirelingItem
    },
    form: { 
      handler: TrespasserHirelingSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/hireling-sheet.hbs"
    }
  };

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      { 
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    return context;
  }

  /* -------------------------------------------- */
  /* Event Listeners                              */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    // Handle quantity changes for nested items manually since they are in a list
    const html = this.element;
    html.querySelectorAll('.hireling-item-qty').forEach(input => {
      input.addEventListener('change', this.#onUpdateHirelingItemQty.bind(this));
    });

    // Setup drag and drop for lists
    const dropZones = html.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
      zone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (ev) => {
        zone.classList.remove('drag-over');
        this.#onDropItemToList(ev);
      });
    });
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  /**
   * Remove an item from the consume or produce list.
   */
  static async #onRemoveHirelingItem(event, target) {
    const list = target.dataset.list; // "consume" or "produce"
    const index = parseInt(target.dataset.index);
    if (!list || isNaN(index)) return;

    const currentArray = [...(this.document.system[list] || [])];
    currentArray.splice(index, 1);
    
    await this.document.update({ [`system.${list}`]: currentArray });
  }

  /**
   * Update quantity of a specific item in the list.
   */
  async #onUpdateHirelingItemQty(event) {
    const input = event.currentTarget;
    const chip = input.closest('.hireling-item-chip');
    if (!chip) return;

    const list = chip.dataset.list;
    const index = parseInt(chip.dataset.index);
    const qty = parseInt(input.value) || 0;

    const currentArray = [...(this.document.system[list] || [])];
    if (currentArray[index]) {
      // Use duplicate to ensure we're not modifying original objects if they are proxies
      const updatedItem = foundry.utils.duplicate(currentArray[index]);
      updatedItem.system.quantity = qty;
      currentArray[index] = updatedItem;
      await this.document.update({ [`system.${list}`]: currentArray });
    }
  }

  /**
   * Handle dropping an item onto a list drop-zone.
   */
  async #onDropItemToList(event) {
    event.preventDefault();
    const dropZone = event.currentTarget;
    const targetList = dropZone.dataset.type; // "consume" or "produce"
    if (!targetList) return;

    const data = TextEditor.getDragEventData(event);
    if (data.type !== "Item") return;

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    // We store the full serialized data (toObject)
    const itemData = sourceItem.toObject();
    
    const currentArray = [...(this.document.system[targetList] || [])];
    currentArray.push(itemData);

    await this.document.update({ [`system.${targetList}`]: currentArray });
  }

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.document.update(data);
  }
}
