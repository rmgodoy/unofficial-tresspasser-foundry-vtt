import { TrespasserActorSheet } from "./base-sheet.mjs";
import { prepareHavenContext }  from "./haven/haven-context.mjs";
import { setupHavenDropZones }  from "./haven/haven-drag-drop.mjs";
import {
  onRollAttribute,
  onRollSkill
} from "./haven/haven-rolls.mjs";
import {
  onProcessWeek,
  onUpkeepWeeksRest,
  onUpkeepPopulationCheck,
  onUpkeepEventCheck,
  onRemoveLeader,
  onOpenLeaderSheet,
  onAddChain,
  onRemoveChain,
  onToggleChain,
  onRemoveHirelingFromChain,
  onAddHirelingToChain,
  onAdjustInventoryQty,
  onDeleteInventoryItem,
  onWithdrawInventoryItem,
  onToggleHirelingActive,
  onOpenItemSheet,
  onDeleteItem,
  onAdjustBuildClock,
  onUpgradeBuilding,
  onAddProject,
  onRemoveProject,
  onEventClockClick,
  onProjectClockClick,
  onHavenSubmit
} from "./haven/haven-actions.mjs";

/**
 * Actor Sheet for Haven actors.
 * Implemented using ApplicationV2 (sheets.ActorSheetV2).
 */
export class TrespasserHavenSheet extends TrespasserActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "actor", "haven-sheet"],
    position: { width: 700, height: 800 },

    actions: {
      processWeek: TrespasserHavenSheet.#onProcessWeek,
      removeLeader: TrespasserHavenSheet.#onRemoveLeader,
      openLeaderSheet: TrespasserHavenSheet.#onOpenLeaderSheet,
      addChain: TrespasserHavenSheet.#onAddChain,
      removeChain: TrespasserHavenSheet.#onRemoveChain,
      toggleChain: TrespasserHavenSheet.#onToggleChain,
      removeHirelingFromChain: TrespasserHavenSheet.#onRemoveHirelingFromChain,
      toggleHirelingActive: TrespasserHavenSheet.#onToggleHirelingActive,
      openItemSheet: TrespasserHavenSheet.#onOpenItemSheet,
      deleteItem: TrespasserHavenSheet.#onDeleteItem,
      addHirelingToChain: TrespasserHavenSheet.#onAddHirelingToChain,
      adjustInventoryQty: TrespasserHavenSheet.#onAdjustInventoryQty,
      deleteInventoryItem: TrespasserHavenSheet.#onDeleteInventoryItem,
      withdrawInventoryItem: TrespasserHavenSheet.#onWithdrawInventoryItem,
      rollAttribute: TrespasserHavenSheet.#onRollAttribute,
      rollSkill: TrespasserHavenSheet.#onRollSkill,
      upkeepWeeksRest: TrespasserHavenSheet.#onUpkeepWeeksRest,
      upkeepPopulationCheck: TrespasserHavenSheet.#onUpkeepPopulationCheck,
      upkeepEventCheck: TrespasserHavenSheet.#onUpkeepEventCheck,
      adjustBuildClock: TrespasserHavenSheet.#onAdjustBuildClock,
      upgradeBuilding: TrespasserHavenSheet.#onUpgradeBuilding,
      editItem: TrespasserHavenSheet.#onOpenItemSheet,
      eventClockClick: TrespasserHavenSheet.#onEventClockClick,
      addProject: TrespasserHavenSheet.#onAddProject,
      removeProject: TrespasserHavenSheet.#onRemoveProject,
      projectClockClick: TrespasserHavenSheet.#onProjectClockClick
    },
    form: { 
      handler: TrespasserHavenSheet.#onSubmit,
      submitOnChange: true, 
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/haven-sheet.hbs",
      scrollable: [".scrollable", ".sheet-content", "[data-scrollable='true']"]
    }
  };

  tabGroups = { primary: "skills" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }
  
  /** @override */
  get isEditable() {
    if ( game.user.isGM ) return true;

    const allowAll = game.settings.get("trespasser", "allowAllPlayersHavenEdit");
    if ( allowAll ) return this.document.isOwner;

    const leaderId = this.document.system.leaderId;
    const leader = leaderId ? game.actors.get(leaderId) : null;
    if ( leader?.isOwner ) return true;

    return false;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const havenContext = await prepareHavenContext(this, options);
    return foundry.utils.mergeObject(context, havenContext);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    const tabs = html.querySelectorAll(".sheet-tabs .item");
    tabs.forEach(t => {
      t.addEventListener("click", () => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    const activeTab = html.querySelector(`.tab[data-tab="${this.tabGroups.primary}"]`);
    if (activeTab) activeTab.classList.add("active");

    setupHavenDropZones(this, html);
  }

  /** @override */
  async _onDropItem() {
    return false;
  }

  // --- Static Action Delegators ---

  static async #onProcessWeek(event, target) { return onProcessWeek(this, event, target); }
  static async #onUpkeepWeeksRest(event, target) { return onUpkeepWeeksRest(this, event, target); }
  static async #onUpkeepPopulationCheck(event, target) { return onUpkeepPopulationCheck(this, event, target); }
  static async #onUpkeepEventCheck(event, target) { return onUpkeepEventCheck(this, event, target); }
  static async #onRemoveLeader(event, target) { return onRemoveLeader(this, event, target); }
  static #onOpenLeaderSheet(event, target) { return onOpenLeaderSheet(this, event, target); }
  static async #onAddChain(event, target) { return onAddChain(this, event, target); }
  static async #onRemoveChain(event, target) { return onRemoveChain(this, event, target); }
  static async #onToggleChain(event, target) { return onToggleChain(this, event, target); }
  static async #onRemoveHirelingFromChain(event, target) { return onRemoveHirelingFromChain(this, event, target); }
  static async #onAddHirelingToChain(event, target) { return onAddHirelingToChain(this, event, target); }
  static async #onAdjustInventoryQty(event, target) { return onAdjustInventoryQty(this, event, target); }
  static async #onDeleteInventoryItem(event, target) { return onDeleteInventoryItem(this, event, target); }
  static async #onWithdrawInventoryItem(event, target) { return onWithdrawInventoryItem(this, event, target); }
  static async #onToggleHirelingActive(event, target) { return onToggleHirelingActive(this, event, target); }
  static #onOpenItemSheet(event, target) { return onOpenItemSheet(this, event, target); }
  static async #onDeleteItem(event, target) { return onDeleteItem(this, event, target); }
  static async #onRollAttribute(event, target) { return onRollAttribute(this, event, target); }
  static async #onRollSkill(event, target) { return onRollSkill(this, event, target); }
  static async #onAdjustBuildClock(event, target) { return onAdjustBuildClock(this, event, target); }
  static async #onUpgradeBuilding(event, target) { return onUpgradeBuilding(this, event, target); }
  static async #onAddProject(event, target) { return onAddProject(this, event, target); }
  static async #onRemoveProject(event, target) { return onRemoveProject(this, event, target); }
  static async #onEventClockClick(event, target) { return onEventClockClick(this, event, target); }
  static async #onProjectClockClick(event, target) { return onProjectClockClick(this, event, target); }
  static async #onSubmit(event, form, formData) { return onHavenSubmit(this, event, form, formData); }
}
