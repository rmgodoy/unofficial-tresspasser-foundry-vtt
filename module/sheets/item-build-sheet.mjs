const { api, sheets } = foundry.applications;

/**
 * Item Sheet for Building (Build) items.
 */
export class TrespasserBuildSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "build-sheet"],
    position: { width: 500, height: 500 },
    actions: {
      addBonus: TrespasserBuildSheet.#onAddBonus,
      removeBonus: TrespasserBuildSheet.#onRemoveBonus,
      addSkill: TrespasserBuildSheet.#onAddSkill,
      removeSkill: TrespasserBuildSheet.#onRemoveSkill
    },
    form: { 
      handler: TrespasserBuildSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/build-sheet.hbs"
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

    // Skills list for dropdown
    context.skills = {
      "": "TRESPASSER.General.None",
      "agriculture": "TRESPASSER.Haven.Skills.Agriculture",
      "construction": "TRESPASSER.Haven.Skills.Construction",
      "commerce": "TRESPASSER.Haven.Skills.Commerce",
      "cuisine": "TRESPASSER.Haven.Skills.Cuisine",
      "entertainment": "TRESPASSER.Haven.Skills.Entertainment",
      "espionage": "TRESPASSER.Haven.Skills.Espionage",
      "faith": "TRESPASSER.Haven.Skills.Faith",
      "hospitality": "TRESPASSER.Haven.Skills.Hospitality",
      "research": "TRESPASSER.Haven.Skills.Research",
      "seafaring": "TRESPASSER.Haven.Skills.Seafaring",
      "statecraft": "TRESPASSER.Haven.Skills.Statecraft",
      "warfare": "TRESPASSER.Haven.Skills.Warfare"
    };

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      { 
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    // Resolve upgrade path name
    context.upgradeName = "";
    if (system.upgradeTo) {
        const upgrade = await fromUuid(system.upgradeTo);
        context.upgradeName = upgrade?.name || "Unknown Building";
    }

    // Prep bonuses with localized labels
    context.preparedBonuses = (system.bonuses || []).map((b, i) => ({
        ...b,
        index: i,
        label: context.attributes[b.attribute]
    }));

    // Prep skills with labels
    context.preparedSkills = (system.skills || []).map((s, i) => ({
        key: s,
        index: i,
        label: context.skills[s]
    }));

    // Skills available to add (not already present)
    const skillList = Object.entries(context.skills)
        .filter(([key, _]) => key !== "" && !(system.skills || []).includes(key));
    
    context.availableSkills = skillList.length > 0 ? skillList.reduce((obj, [key, val]) => {
            obj[key] = val;
            return obj;
        }, {}) : null;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const html = this.element;
    const dropZone = html.querySelector('.upgrade-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', async (ev) => {
        dropZone.classList.remove('drag-over');
        const data = TextEditor.getDragEventData(ev);
        if (data.type !== "Item") return;
        const sourceItem = await fromUuid(data.uuid);
        if (sourceItem?.type !== "build") {
            ui.notifications.warn("You can only drop Building items here.");
            return;
        }
        await this.document.update({ "system.upgradeTo": data.uuid });
      });

      const removeBtn = dropZone.querySelector('.remove-upgrade');
      if (removeBtn) {
          removeBtn.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              await this.document.update({ "system.upgradeTo": "" });
          });
      }
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

  static async #onAddSkill(event, target) {
    const select = target.closest('.skill-adder').querySelector('select');
    const skill = select.value;
    if ( !skill ) return;
    
    const skills = [...(this.document.system.skills || [])];
    if ( !skills.includes(skill) ) {
        skills.push(skill);
        await this.document.update({ "system.skills": skills });
    }
  }

  static async #onRemoveSkill(event, target) {
    const index = parseInt(target.dataset.index);
    const skills = [...(this.document.system.skills || [])];
    skills.splice(index, 1);
    await this.document.update({ "system.skills": skills });
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await this.document.update(data);
  }
}
