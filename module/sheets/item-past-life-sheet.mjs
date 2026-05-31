const { api, sheets } = foundry.applications;

const ALL_SKILL_KEYS = [
  "acrobatics", "alchemy", "athletics", "crafting",
  "folklore", "letters", "magic", "nature",
  "perception", "speech", "stealth", "tinkering"
];

/**
 * Item Sheet for the Past Life item type.
 *
 * Features a tabbed interface:
 * 1. Attributes: Bonus to the 4 core attributes.
 * 2. Skills: Selectable skills to be marked as trained.
 * 3. Inventory: List of items (weapon, armor, or generic items) to be added to character.
 *
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserPastLifeSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "past-life", "item-sheet"],
    position: { width: 550, height: 650 },
    form: {
      handler: TrespasserPastLifeSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/past-life-sheet.hbs",
      scrollable: [".scrollable", ".sheet-body", ".tab.inventory", ".tab.skills", ".tab.attributes"]
    }
  };

  tabGroups = { primary: "attributes" };

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

    // Attributes context
    context.attributeLabels = {
      mighty:    game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty"),
      agility:   game.i18n.localize("TRESPASSER.Terms.Attribute.Agility"),
      intellect: game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect"),
      spirit:    game.i18n.localize("TRESPASSER.Terms.Attribute.Spirit")
    };

    // Skills context
    context.skillRows = ALL_SKILL_KEYS.map(key => ({
      key,
      label: game.i18n.localize(`TRESPASSER.Terms.Skill.${key.charAt(0).toUpperCase() + key.slice(1)}`),
      selected: !!system.skills[key],
    }));

    // Inventory items
    context.pastLifeItems = system.items || [];

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

    // Sync tabs
    const tabs = this.element.querySelectorAll('.sheet-tabs .item');
    tabs.forEach(t => {
      t.addEventListener('click', (ev) => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    if (!this.isEditable) return;

    // Skill toggles
    this.element.querySelectorAll(".past-life-skill-check").forEach(chk => {
      chk.addEventListener("change", this._onSkillToggle.bind(this));
    });

    // Inventory item removal
    this.element.querySelectorAll(".past-life-item-remove").forEach(btn => {
      btn.addEventListener("click", this._onRemoveItem.bind(this));
    });

    // Drag-and-drop for items
    const dropZone = this.element.querySelector(".past-life-drop-zone");
    if (dropZone) {
      dropZone.addEventListener("dragover", ev => { ev.preventDefault(); return false; });
      dropZone.addEventListener("drop", this._onDropItem.bind(this));
    }
  }

  async _onSkillToggle(event) {
    const key = event.currentTarget.dataset.skill;
    const checked = event.currentTarget.checked;

    // Preserve unsaved description edits
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    const updateData = { [`system.skills.${key}`]: checked };
    if (desc !== undefined) updateData["system.description"] = desc;

    await this.document.update(updateData);
  }

  async _onRemoveItem(event) {
    event.preventDefault();
    const index = Number(event.currentTarget.closest(".past-life-chip").dataset.index);
    const items = [...(this.document.system.items || [])];
    items.splice(index, 1);

    // Preserve unsaved description edits
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    const updateData = { "system.items": items };
    if (desc !== undefined) updateData["system.description"] = desc;

    await this.document.update(updateData);
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data.type !== "Item") return;

    const sourceItem = await fromUuid(data.uuid);
    if (!sourceItem) return;

    // Allowed types: item, weapon, armor
    const allowedTypes = ["item", "weapon", "armor"];
    if (!allowedTypes.includes(sourceItem.type)) {
      return ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.InvalidTypePossessions"));
    }

    const currentItems = [...(this.document.system.items || [])];
    // Check if UUID already exists to avoid duplicates
    if (currentItems.some(i => i.uuid === sourceItem.uuid)) {
      return ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
    }

    currentItems.push({
      uuid: sourceItem.uuid,
      name: sourceItem.name,
      img: sourceItem.img,
      type: sourceItem.type,
      quantity: sourceItem.system.quantity || 0
    });

    // Preserve unsaved description edits
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    const updateData = { "system.items": currentItems };
    if (desc !== undefined) updateData["system.description"] = desc;

    await this.document.update(updateData);
  }

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
