import { showItemInfoDialog } from "./item-info-dialog.mjs";

const ALL_SKILL_KEYS = [
  "acrobatics", "alchemy", "athletics", "crafting",
  "folklore", "letters", "magic", "nature",
  "perception", "speech", "stealth", "tinkering"
];

/**
 * Calling Selection Dialog using Handlebars and ApplicationV2.
 */
export class TrespasserCallingDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static async wait(callingItem, actor) {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (val) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };
      const dialog = new TrespasserCallingDialog(callingItem, actor, safeResolve);
      dialog.render(true);
    });
  }

  constructor(callingItem, actor, resolve, options={}) {
    super(options);
    this.callingItem = callingItem;
    this.actor = actor;
    this.resolve = resolve;
    this.options.window.title = game.i18n.format("TRESPASSER.Dialog.Calling.Title", { name: callingItem.name });

    this.collapsedLevels = new Set();
    const sys = callingItem.system;
    const numLevels = sys.progression?.length ?? 0;
    for (let i = 1; i < numLevels; i++) {
      this.collapsedLevels.add(i);
    }
  }

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "dialog", "calling-dialog-v2"],
    position: { width: 480, height: "auto" },
    window: {
      resizable: true,
      minimizable: false,
      title: ""
    },
    actions: {
      apply: TrespasserCallingDialog._onApply,
      cancel: TrespasserCallingDialog._onCancel,
      switchTab: TrespasserCallingDialog._onTabSelect,
      info: TrespasserCallingDialog._onInfoClick,
      toggleLevel: TrespasserCallingDialog._onToggleLevel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/calling-dialog.hbs"
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "skills", label: "TRESPASSER.Terms.Skill.Plural" },
        { id: "talents", label: "TRESPASSER.Terms.ItemType.Talents" },
        { id: "features", label: "TRESPASSER.Terms.ItemType.Features" },
        { id: "enhancements", label: "TRESPASSER.Terms.Enhancements" },
        { id: "progression", label: "TRESPASSER.Terms.Progression" }
      ],
      initial: "skills"
    }
  };

  tabGroups = {
    primary: "skills"
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.callingItem.system;

    const callingSkills = new Set(sys.skills || []);
    const currentSkills = this.actor.system.skills || {};
    const isCorrectCalling = this.actor.system.calling === this.callingItem.name;

    const skillRows = ALL_SKILL_KEYS
      .filter(k => callingSkills.has(k))
      .map((k, i) => ({
        key: k,
        label: game.i18n.localize(`TRESPASSER.Terms.Skill.${k.charAt(0).toUpperCase() + k.slice(1)}`),
        alreadyTrained: !!currentSkills[k],
        isFromThisCalling: isCorrectCalling && !!currentSkills[k],
        index: i
      }));

    const mapList = (list) => {
      return (list || []).map((entry, i) => {
        const isPicked = this.actor.items.some(it => 
          (it.name === entry.name || it.flags.trespasser?.linkedSourceUuid === entry.uuid) && 
          it.flags.trespasser?.linkedSource === this.callingItem.name
        );
        return {
          ...entry,
          isPicked,
          index: i
        };
      });
    };

    context.callingName = this.callingItem.name;
    context.description = sys.description;
    context.skills = skillRows;
    context.talents = mapList(sys.talents);
    context.features = mapList(sys.features);
    context.enhancements = mapList(sys.enhancements);
    context.progression = (sys.progression || []).map((p, i) => ({
      ...p,
      index: i,
      isCollapsed: this.collapsedLevels.has(i)
    }));

    context.tabGroups = this.tabGroups;

    // Prepare tab buttons context
    context.tabs = this.constructor.TABS.primary.tabs.map(tab => {
      tab.active = this.tabGroups.primary === tab.id;
      tab.cssClass = tab.active ? "active" : "";
      return tab;
    });

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Search input listener
    const searchInputs = html.querySelectorAll(".calling-dlg-search");
    searchInputs.forEach(input => {
      input.addEventListener("input", (ev) => {
        const query = ev.currentTarget.value.toLowerCase().trim();
        const tabId = ev.currentTarget.dataset.tab;
        
        if (tabId === "skills") {
          html.querySelectorAll(`.calling-dlg-pane[data-tab="skills"] .calling-dlg-chip`).forEach(chip => {
            const name = chip.querySelector(".calling-dlg-name")?.textContent?.toLowerCase() ?? "";
            chip.style.display = name.includes(query) ? "" : "none";
          });
        } else {
          html.querySelectorAll(`.calling-dlg-pane[data-tab="${tabId}"] .calling-dlg-chip-row`).forEach(row => {
            const name = row.querySelector(".calling-dlg-name")?.textContent?.toLowerCase() ?? "";
            row.style.display = name.includes(query) ? "" : "none";
          });
        }
      });
    });
  }

  /** @override */
  async close(options={}) {
    this.resolve(false);
    return super.close(options);
  }

  static async _onApply(event, button) {
    const dialog = this;
    const html = dialog.element;
    const callingName = dialog.callingItem.name;
    const sys = dialog.callingItem.system;
    const actor = dialog.actor;

    // 1. Manage Calling Item on Actor
    let actorCalling = actor.items.find(i => i.type === "calling");
    if (!actorCalling) {
      const callingData = dialog.callingItem.toObject();
      delete callingData._id;
      const created = await actor.createEmbeddedDocuments("Item", [callingData]);
      actorCalling = created[0];
    } else if (actorCalling.name !== callingName) {
      // Replace calling item if name differs (swapping callings)
      await actorCalling.delete();
      const callingData = dialog.callingItem.toObject();
      delete callingData._id;
      const created = await actor.createEmbeddedDocuments("Item", [callingData]);
      actorCalling = created[0];
    }

    // Prepare helper maps/sets
    const callingSkills = new Set(sys.skills || []);
    const currentSkills = actor.system.skills || {};
    const isCorrectCalling = actor.system.calling === callingName;

    const skillRows = ALL_SKILL_KEYS
      .filter(k => callingSkills.has(k))
      .map(k => ({
        key: k,
        alreadyTrained: !!currentSkills[k],
        isFromThisCalling: isCorrectCalling && !!currentSkills[k]
      }));

    // 2. Identify selected Skill keys
    const selectedSkillKeys = new Set();
    html.querySelectorAll(".calling-dlg-check[data-list='skills']:checked").forEach(el => {
      const row = skillRows[parseInt(el.dataset.index)];
      if (row) selectedSkillKeys.add(row.key);
    });

    // Identify which skills were from THIS calling to potentially un-train them if unchecked
    const oldSkillUpdates = {};
    skillRows.forEach(row => {
      if (row.isFromThisCalling && !selectedSkillKeys.has(row.key)) {
        oldSkillUpdates[`system.skills.${row.key}`] = false;
      }
    });

    const newSkillUpdates = {};
    selectedSkillKeys.forEach(key => {
      newSkillUpdates[`system.skills.${key}`] = true;
    });

    await actor.update({ ...oldSkillUpdates, ...newSkillUpdates, "system.calling": callingName });

    // 3. Talents / Features / Enhancements Picks
    const picks = [];
    for (const listKey of ["talents", "features", "enhancements"]) {
      html.querySelectorAll(`.calling-dlg-check[data-list='${listKey}']:checked`).forEach(el => {
        const entry = sys[listKey]?.[parseInt(el.dataset.index)];
        if (entry) picks.push(entry);
      });
    }

    // Find current actor items linked to this calling
    const linkedItems = actor.items.filter(it => it.flags.trespasser?.linkedSource === callingName);
    
    // Items to delete (unchecked)
    const toDelete = linkedItems.filter(li => !picks.some(p => p.name === li.name || p.uuid === li.flags.trespasser?.linkedSourceUuid)).map(li => li.id);
    if (toDelete.length > 0) await actor.deleteEmbeddedDocuments("Item", toDelete);

    // Items to create (newly checked)
    const toCreateData = [];
    for (const entry of picks) {
      const alreadyHas = linkedItems.some(li => li.name === entry.name || li.flags.trespasser?.linkedSourceUuid === entry.uuid);
      if (alreadyHas) continue;

      const sourceItem = await fromUuid(entry.uuid);
      if (!sourceItem) continue;
      
      const itemData = sourceItem.toObject();
      delete itemData._id;
      foundry.utils.setProperty(itemData, "flags.trespasser.linkedSource", callingName);
      foundry.utils.setProperty(itemData, "flags.trespasser.linkedSourceUuid", entry.uuid);
      toCreateData.push(itemData);
    }

    if (toCreateData.length > 0) {
      await actor.createEmbeddedDocuments("Item", toCreateData);
    }

    ui.notifications.info(
      game.i18n.format("TRESPASSER.Notification.Apply.Calling", { name: callingName, actor: actor.name })
    );

    dialog.resolve(true);
    dialog.close();
  }

  static _onCancel() {
    this.resolve(false);
    this.close();
  }

  static _onTabSelect(event, target) {
    event.preventDefault();
    this.tabGroups.primary = target.dataset.tab;
    this.render();
  }

  static async _onInfoClick(event, target) {
    event.preventDefault();
    event.stopPropagation();
    await showItemInfoDialog(target.dataset.uuid);
  }

  static _onToggleLevel(event, target) {
    event.preventDefault();
    const index = parseInt(target.dataset.level);
    if (this.collapsedLevels.has(index)) {
      this.collapsedLevels.delete(index);
    } else {
      this.collapsedLevels.add(index);
    }
    const levelRow = target.closest(".progression-level");
    levelRow.classList.toggle("collapsed");
  }
}

export async function showCallingDialog(callingItem, actor) {
  return TrespasserCallingDialog.wait(callingItem, actor);
}
