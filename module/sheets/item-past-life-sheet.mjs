/**
 * Item Sheet for the Past Life item type.
 *
 * Features a tabbed interface:
 * 1. Attributes: Bonus to the 4 core attributes.
 * 2. Skills: Selectable skills to be marked as trained.
 * 3. Inventory: List of items (weapon, armor, or generic items) to be added to character.
 */

const ALL_SKILL_KEYS = [
  "acrobatics", "alchemy", "athletics", "crafting",
  "folklore", "letters", "magic", "nature",
  "perception", "speech", "stealth", "tinkering"
];

export class TrespasserPastLifeSheet extends foundry.appv1.sheets.ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "past-life"],
      width: 550,
      height: 650,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      scrollY: [".sheet-body", ".tab.inventory", ".tab.skills", ".tab.attributes"],
    });
  }

  get template() {
    return "systems/trespasser/templates/item/past-life-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const system = this.item.system;
    context.system = system;

    // Attributes context
    context.attributeLabels = {
      mighty:    game.i18n.localize("TRESPASSER.Sheet.Attributes.Mighty"),
      agility:   game.i18n.localize("TRESPASSER.Sheet.Attributes.Agility"),
      intellect: game.i18n.localize("TRESPASSER.Sheet.Attributes.Intellect"),
      spirit:    game.i18n.localize("TRESPASSER.Sheet.Attributes.Spirit")
    };

    // Skills context
    context.skillRows = ALL_SKILL_KEYS.map(key => ({
      key,
      label: game.i18n.localize(`TRESPASSER.Sheet.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`),
      selected: !!system.skills[key],
    }));

    // Inventory items
    context.pastLifeItems = system.items || [];

    context.descriptionHTML = await TextEditor.enrichHTML(system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document,
    });

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Skill toggles
    html.find(".past-life-skill-check").on("change", this._onSkillToggle.bind(this));

    // Inventory item removal
    html.find(".past-life-item-remove").on("click", this._onRemoveItem.bind(this));

    // Drag-and-drop for items
    html.find(".past-life-drop-zone").on("dragover", ev => { ev.preventDefault(); return false; });
    html.find(".past-life-drop-zone").on("drop", this._onDropItem.bind(this));
  }

  async _onSkillToggle(event) {
    const key = event.currentTarget.dataset.skill;
    const checked = event.currentTarget.checked;
    await this.item.update({ [`system.skills.${key}`]: checked });
  }

  async _onRemoveItem(event) {
    event.preventDefault();
    const index = Number(event.currentTarget.closest(".past-life-chip").dataset.index);
    const items = [...(this.item.system.items || [])];
    items.splice(index, 1);
    await this.item.update({ "system.items": items });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const dataText = event.originalEvent?.dataTransfer?.getData("text/plain");
    if (!dataText) return;

    let dropData;
    try { dropData = JSON.parse(dataText); } catch (e) { return; }
    if (dropData.type !== "Item") return;

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;

    // Allowed types: item, weapon, armor
    const allowedTypes = ["item", "weapon", "armor"];
    if (!allowedTypes.includes(sourceItem.type)) {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.PastLife.InvalidItemType"));
    }

    const currentItems = [...(this.item.system.items || [])];
    // Check if UUID already exists to avoid duplicates
    if (currentItems.some(i => i.uuid === sourceItem.uuid)) {
      return ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.AlreadyAdded", { name: sourceItem.name }));
    }

    currentItems.push({
      uuid: sourceItem.uuid,
      name: sourceItem.name,
      img: sourceItem.img,
      type: sourceItem.type,
      quantity: sourceItem.system.quantity || 1
    });

    await this.item.update({ "system.items": currentItems });
  }
}
