/**
 * Item Sheet for the Craft item type.
 * Minimalist single-page sheet, consistent with other Trespasser item sheets.
 */
export class TrespasserCraftSheet extends foundry.appv1.sheets.ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "craft"],
      width: 520,
      height: 580,
      scrollY: [".sheet-body"],
    });
  }

  get template() {
    return "systems/trespasser/templates/item/craft-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;

    context.craftDeeds    = this.item.system.deeds    || [];
    context.craftFeatures = this.item.system.features || [];

    // Key attribute choices for the <select>
    context.attrChoices = [
      { value: "mighty",    label: game.i18n.localize("TRESPASSER.Sheet.Attributes.Mighty") },
      { value: "agility",   label: game.i18n.localize("TRESPASSER.Sheet.Attributes.Agility") },
      { value: "intellect", label: game.i18n.localize("TRESPASSER.Sheet.Attributes.Intellect") },
      { value: "spirit",    label: game.i18n.localize("TRESPASSER.Sheet.Attributes.Spirit") },
    ];

    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document,
    });

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Remove buttons
    html.find(".craft-item-remove[data-list='deeds']").on("click",    ev => this._onRemoveEntry(ev, "deeds"));
    html.find(".craft-item-remove[data-list='features']").on("click", ev => this._onRemoveEntry(ev, "features"));

    // Drop zones
    html.find(".craft-drop-zone").on("dragover", ev => { ev.preventDefault(); return false; });
    html.find(".craft-drop-zone").on("drop", this._onDropItem.bind(this));
  }

  async _onRemoveEntry(event, listKey) {
    event.preventDefault();
    const el    = event.currentTarget.closest(".craft-chip");
    const index = Number(el.dataset.index);
    const arr   = [...(this.item.system[listKey] || [])];
    arr.splice(index, 1);
    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${listKey}`]: arr
    });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const dataText = event.originalEvent?.dataTransfer?.getData("text/plain");
    if (!dataText) return;

    let dropData;
    try { dropData = JSON.parse(dataText); } catch { return; }
    if (dropData.type !== "Item") return;

    const listKey    = event.currentTarget.dataset.list; // "deeds" | "features"
    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;

    if (listKey === "deeds" && sourceItem.type !== "deed") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Craft.DropDeedsOnly"));
    }
    if (listKey === "features" && sourceItem.type !== "feature") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Craft.DropFeaturesOnly"));
    }

    const currentArr = [...(this.item.system[listKey] || [])];
    if (currentArr.some(e => e.uuid === sourceItem.uuid || e.name === sourceItem.name)) {
      return ui.notifications.warn(
        game.i18n.format("TRESPASSER.Notifications.AlreadyAdded", { name: sourceItem.name })
      );
    }

    currentArr.push({ uuid: sourceItem.uuid, name: sourceItem.name, img: sourceItem.img });
    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${listKey}`]: currentArr
    });
  }
}
