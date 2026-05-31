const { api, sheets } = foundry.applications;

// Full list of skill keys matching the Character data model
const ALL_SKILL_KEYS = [
  "acrobatics", "alchemy", "athletics", "crafting",
  "folklore", "letters", "magic", "nature",
  "perception", "speech", "stealth", "tinkering"
];

/**
 * Item Sheet for the Calling item type.
 *
 * Minimalist single-page sheet consistent with other Trespasser item sheets.
 * Supports drag-and-drop of Talent/Feature items and checkbox skill selection.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserCallingSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "calling", "item-sheet"],
    position: { width: 580, height: 620 },
    form: {
      handler: TrespasserCallingSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/calling-sheet.hbs",
      scrollable: [".scrollable", ".sheet-body"]
    }
  };

  tabGroups = { primary: "description" };

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
    context.tabs = this.tabGroups;

    // Build skill rows: each has key, label, and whether it's selected in this Calling
    const selectedSkills = new Set(system.skills || []);
    context.skillRows = ALL_SKILL_KEYS.map(key => ({
      key,
      label: game.i18n.localize(`TRESPASSER.Terms.Skill.${key.charAt(0).toUpperCase() + key.slice(1)}`),
      selected: selectedSkills.has(key),
    }));

    context.callingTalents      = system.talents      || [];
    context.callingFeatures     = system.features     || [];
    context.callingEnhancements = system.enhancements || [];
    context.progression         = system.progression   || [];

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

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Sync tabs
    const tabs = this.element.querySelectorAll('.sheet-tabs .item');
    tabs.forEach(t => {
      t.addEventListener('click', (ev) => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    if (!this.isEditable) return;

    // Skill checkbox toggles
    this.element.querySelectorAll(".calling-skill-check").forEach(chk => {
      chk.addEventListener("change", this._onSkillToggle.bind(this));
    });

    // Remove buttons for each list
    this.element.querySelectorAll(".calling-chip .calling-item-remove").forEach(btn => {
      btn.addEventListener("click", ev => {
        const listKey = btn.dataset.list;
        this._onRemoveEntry(ev, listKey);
      });
    });

    // Progression Table Editing
    this.element.querySelectorAll(".prog-input").forEach(input => {
      input.addEventListener("change", this._onProgressionChange.bind(this));
    });

    // Level headers toggle
    this.element.querySelectorAll(".level-header").forEach(header => {
      header.addEventListener("click", this._onToggleLevel.bind(this));
    });

    // Drag-and-drop zones
    this.element.querySelectorAll(".calling-drop-zone").forEach(zone => {
      zone.addEventListener("dragover", ev => { ev.preventDefault(); return false; });
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });
  }

  async _onSkillToggle(event) {
    const key = event.currentTarget.dataset.skill;
    const checked = event.currentTarget.checked;
    const current = new Set(this.document.system.skills || []);

    if (checked) current.add(key);
    else current.delete(key);

    await this.document.update({
      "system.description": this.document.system.description,
      "system.skills": [...current]
    });
  }

  async _onRemoveEntry(event, listKey) {
    event.preventDefault();
    const el    = event.currentTarget.closest(".calling-chip");
    const index = Number(el.dataset.index);
    const arr   = [...(this.document.system[listKey] || [])];
    arr.splice(index, 1);
    await this.document.update({
      "system.description": this.document.system.description,
      [`system.${listKey}`]: arr
    });
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (!data || data.type !== "Item") return;

    const listKey = event.currentTarget.dataset.list; // "talents" | "features" | "enhancements"
    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    // Validate allowed types per zone
    if (listKey === "talents" && sourceItem.type !== "talent") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropTalentsOnly"));
    }
    if ((listKey === "features" || listKey === "enhancements") && sourceItem.type !== "feature") {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropFeaturesOnly"));
    }

    const currentArr = [...(this.document.system[listKey] || [])];
    if (currentArr.some(e => e.uuid === sourceItem.uuid || e.name === sourceItem.name)) {
      return ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
    }

    currentArr.push({ uuid: sourceItem.uuid, name: sourceItem.name, img: sourceItem.img });
    await this.document.update({
      "system.description": this.document.system.description,
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

    const progression = foundry.utils.deepClone(this.document.system.progression);
    if (progression[level]) {
      progression[level][field] = value;
      await this.document.update({ "system.progression": progression });
    }
  }

  _onToggleLevel(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const levelRow = header.closest(".progression-level");
    levelRow.classList.toggle("collapsed");
  }

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
