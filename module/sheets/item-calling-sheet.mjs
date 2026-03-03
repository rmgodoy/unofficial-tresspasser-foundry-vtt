/**
 * Item Sheet for the Calling item type.
 *
 * Minimalist single-page sheet consistent with other Trespasser item sheets.
 * Supports drag-and-drop of Talent/Feature items and checkbox skill selection.
 */

// Full list of skill keys matching the Character data model
const ALL_SKILL_KEYS = [
  "acrobatics", "alchemy", "athletics", "crafting",
  "folklore", "letters", "magic", "nature",
  "perception", "speech", "stealth", "tinkering"
];

export class TrespasserCallingSheet extends foundry.appv1.sheets.ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "calling"],
      width: 580,
      height: 620,
      scrollY: [".sheet-body"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description", group: "primary" }],
    });
  }

  get template() {
    return "systems/trespasser/templates/item/calling-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;

    // Build skill rows: each has key, label, and whether it's selected in this Calling
    const selectedSkills = new Set(this.item.system.skills || []);
    context.skillRows = ALL_SKILL_KEYS.map(key => ({
      key,
      label: game.i18n.localize(`TRESPASSER.Sheet.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`),
      selected: selectedSkills.has(key),
    }));

    context.callingTalents      = this.item.system.talents     || [];
    context.callingFeatures     = this.item.system.features    || [];
    context.callingEnhancements = this.item.system.enhancements || [];
    context.progression         = this.item.system.progression  || [];

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

    // Skill checkbox toggles
    html.find(".calling-skill-check").on("change", this._onSkillToggle.bind(this));

    // Remove buttons for each list
    html.find(".calling-item-remove[data-list='talents']").on("click", ev => this._onRemoveEntry(ev, "talents"));
    html.find(".calling-item-remove[data-list='features']").on("click", ev => this._onRemoveEntry(ev, "features"));
    html.find(".calling-item-remove[data-list='enhancements']").on("click", ev => this._onRemoveEntry(ev, "enhancements"));

    // Progression Table Editing
    html.find(".prog-input").on("change", this._onProgressionChange.bind(this));
    html.find(".level-header").on("click", this._onToggleLevel.bind(this));

    // Drag-and-drop zones
    html.find(".calling-drop-zone").on("dragover", ev => { ev.preventDefault(); return false; });
    html.find(".calling-drop-zone").on("drop", this._onDropItem.bind(this));
  }

  async _onSkillToggle(event) {
    const key = event.currentTarget.dataset.skill;
    const checked = event.currentTarget.checked;
    const current = new Set(this.item.system.skills || []);

    if (checked) current.add(key);
    else current.delete(key);

    await this.item.update({
      "system.description": this.item.system.description,
      "system.skills": [...current]
    });
  }

  async _onRemoveEntry(event, listKey) {
    event.preventDefault();
    const el    = event.currentTarget.closest(".calling-chip");
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
    try { dropData = JSON.parse(dataText); } catch (e) { return; }
    if (dropData.type !== "Item") return;

    const listKey = event.currentTarget.dataset.list; // "talents" | "features" | "enhancements"
    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;

    // Validate allowed types per zone
    if (listKey === "talents" && sourceItem.type !== "talent") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Calling.DropTalentsOnly"));
    }
    if ((listKey === "features" || listKey === "enhancements") && sourceItem.type !== "feature") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Calling.DropFeaturesOnly"));
    }

    const currentArr = [...(this.item.system[listKey] || [])];
    if (currentArr.some(e => e.uuid === sourceItem.uuid || e.name === sourceItem.name)) {
      return ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.AlreadyAdded", { name: sourceItem.name }));
    }

    currentArr.push({ uuid: sourceItem.uuid, name: sourceItem.name, img: sourceItem.img });
    await this.item.update({
      "system.description": this.item.system.description,
      [`system.${listKey}`]: currentArr
    });
  }

  async _onProgressionChange(event) {
    const input = event.currentTarget;
    const level = parseInt(input.dataset.level);
    const field = input.dataset.field;
    let value = input.value;

    // Convert to number if applicable
    if (input.type === "number") value = parseInt(value);

    const progression = foundry.utils.deepClone(this.item.system.progression);
    if (progression[level]) {
      progression[level][field] = value;
      await this.item.update({ "system.progression": progression });
    }
  }

  _onToggleLevel(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const levelRow = header.closest(".progression-level");
    levelRow.classList.toggle("collapsed");
  }
}
