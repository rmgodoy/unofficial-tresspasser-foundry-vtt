const { api, sheets } = foundry.applications;

/**
 * Item Sheet for the Craft item type.
 * Minimalist single-page sheet, consistent with other Trespasser item sheets.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserCraftSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "craft", "item-sheet"],
    position: { width: 520, height: 580 },
    form: {
      handler: TrespasserCraftSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/craft-sheet.hbs",
      scrollable: [".scrollable", ".sheet-body"]
    }
  };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Item.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;

    context.craftDeeds    = system.deeds    || [];
    context.craftFeatures = system.features || [];

    // Key attribute choices for the <select>
    context.attrChoices = [
      { value: "mighty",    label: game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty") },
      { value: "agility",   label: game.i18n.localize("TRESPASSER.Terms.Attribute.Agility") },
      { value: "intellect", label: game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect") },
      { value: "spirit",    label: game.i18n.localize("TRESPASSER.Terms.Attribute.Spirit") },
    ];

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item,
      }
    );

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Intercept change events from prose-mirror and handle them asynchronously to prevent synchronous re-rendering crash
    this.element.addEventListener('change', ev => {
      const pm = ev.target.closest('prose-mirror');
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) {
            const desc = pm.value;
            this.document.update({ "system.description": desc });
          }
        }, 0);
      }
    }, true);

    // Intercept submit events from prose-mirror and handle them asynchronously
    this.element.addEventListener('submit', ev => {
      const pm = ev.submitter?.closest('prose-mirror');
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) {
            const desc = pm.value;
            this.document.update({ "system.description": desc });
          }
        }, 0);
      }
    }, true);

    if (!this.isEditable) return;

    // Remove buttons
    this.element.querySelectorAll(".craft-chip .craft-item-remove").forEach(btn => {
      btn.addEventListener("click", ev => {
        const listKey = btn.dataset.list;
        this._onRemoveEntry(ev, listKey);
      });
    });

    // Drop zones
    this.element.querySelectorAll(".craft-drop-zone").forEach(zone => {
      zone.addEventListener("dragover", ev => { ev.preventDefault(); return false; });
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });
  }

  async _onRemoveEntry(event, listKey) {
    event.preventDefault();
    const el    = event.currentTarget.closest(".craft-chip");
    const index = Number(el.dataset.index);
    const arr   = [...(this.document.system[listKey] || [])];
    arr.splice(index, 1);

    // Read the current description from DOM to ensure recent edits aren't lost
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;

    await this.document.update({
      "system.description": desc ?? this.document.system.description,
      [`system.${listKey}`]: arr
    });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const dropData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!dropData || dropData.type !== "Item") return;

    const listKey    = event.currentTarget.dataset.list; // "deeds" | "features"
    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;

    if (listKey === "deeds" && sourceItem.type !== "deed") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnly"));
    }
    if (listKey === "features" && sourceItem.type !== "feature") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropFeaturesOnly"));
    }

    const currentArr = [...(this.document.system[listKey] || [])];
    if (currentArr.some(e => e.uuid === sourceItem.uuid || e.name === sourceItem.name)) {
      return ui.notifications.warn(
        game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name })
      );
    }

    currentArr.push({ 
      uuid: sourceItem.uuid, 
      name: sourceItem.name, 
      img: sourceItem.img,
      tier: sourceItem.system.tier
    });

    // Read the current description from DOM to ensure recent edits aren't lost
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;

    await this.document.update({
      "system.description": desc ?? this.document.system.description,
      [`system.${listKey}`]: currentArr
    });
  }

  /**
   * Private static handler for form submission
   */
  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
