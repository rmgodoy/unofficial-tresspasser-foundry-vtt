/**
 * Character Sheet — Thin Coordinator (AppV2)
 *
 * All business logic lives in ./character/* handlers.
 * This file wires V2 actions and lifecycle hooks to those modules.
 */

const { api, sheets } = foundry.applications;

import { showCallingDialog }           from "../dialogs/calling-dialog.mjs";
import { showCraftDialog }             from "../dialogs/craft-dialog.mjs";
import { showRestDialog }              from "../dialogs/rest-dialog.mjs";
import { showAmmoDialog }              from "../dialogs/ammo-dialog.mjs";
import { askAPDialog }                 from "../dialogs/ap-dialog.mjs";

import { getCharacterData, buildClockSegments } from "./character/get-data.mjs";

import { onAttributeRoll, onCombatStatRoll, onSkillRoll } from "./character/handlers-rolls.mjs";
import { onDeedRoll, postDeedPhase, requestCDAndRoll, evaluateAndShowRoll } from "./character/handlers-deed.mjs";
import { onTalentRoll, onFeatureRoll, onIncantationRoll }                   from "./character/handlers-talent.mjs";
import { handleRestAction, recoverItemCost, spendRDAndRoll }                from "./character/handlers-rest.mjs";
import { onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck }  from "./character/handlers-items.mjs";
import { onPrevailRoll, onIntensityChange, onDurationChange, onEffectRemove, onEffectInfo, onEffectEdit } from "./character/handlers-effects.mjs";
import { onEquipRoll, getActiveWeapons, getAccuracyFromTarget }             from "./character/handlers-combat.mjs";
import { onInjuryClockClick, onToggleLight, onSpendRDHeader }               from "./character/handlers-misc.mjs";

export class TrespasserCharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  /* -------------------------------------------- */
  /* Static Configuration                         */
  /* -------------------------------------------- */

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "actor", "character"],
    position: { width: 780, height: 720 },
    actions: {
      // Tab navigation
      switchTab:        TrespasserCharacterSheet.#onSwitchTab,
      // Rolls
      attributeRoll:    TrespasserCharacterSheet.#onAttributeRoll,
      combatStatRoll:   TrespasserCharacterSheet.#onCombatStatRoll,
      equipRoll:        TrespasserCharacterSheet.#onEquipRoll,
      skillRoll:        TrespasserCharacterSheet.#onSkillRoll,
      // Items
      itemCreate:       TrespasserCharacterSheet.#onItemCreate,
      itemEdit:         TrespasserCharacterSheet.#onItemEdit,
      itemDelete:       TrespasserCharacterSheet.#onItemDelete,
      itemEquip:        TrespasserCharacterSheet.#onItemEquip,
      itemUnequip:      TrespasserCharacterSheet.#onItemUnequip,
      itemConsume:      TrespasserCharacterSheet.#onItemConsume,
      depletionRoll:    TrespasserCharacterSheet.#onDepletionRoll,
      toggleLight:      TrespasserCharacterSheet.#onToggleLight,
      // Deeds / Talents / Features
      deedRoll:         TrespasserCharacterSheet.#onDeedRoll,
      talentRoll:       TrespasserCharacterSheet.#onTalentRoll,
      featureRoll:      TrespasserCharacterSheet.#onFeatureRoll,
      incantationRoll:  TrespasserCharacterSheet.#onIncantationRoll,
      // Effects
      prevailRoll:      TrespasserCharacterSheet.#onPrevailRoll,
      effectRemove:     TrespasserCharacterSheet.#onEffectRemove,
      effectInfo:       TrespasserCharacterSheet.#onEffectInfo,
      effectEdit:       TrespasserCharacterSheet.#onEffectEdit,
      // Misc
      restDialog:       TrespasserCharacterSheet.#onRestDialog,
      spendRD:          TrespasserCharacterSheet.#onSpendRD,
      callingEdit:      TrespasserCharacterSheet.#onCallingEdit,
      callingDelete:    TrespasserCharacterSheet.#onCallingDelete,
      keyAttribute:     TrespasserCharacterSheet.#onKeyAttribute,
      injuryClockClick: TrespasserCharacterSheet.#onInjuryClockClick,
      itemNameClick:    TrespasserCharacterSheet.#onItemNameClick
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    character: {
      template: "systems/trespasser/templates/actor/character-sheet.hbs",
      scrollable: [".tab-body"]
    }
  };

  static TABS = {
    character: { id: "character", group: "primary", label: "TRESPASSER.Sheet.Tabs.Character" },
    equipments: { id: "equipments", group: "primary", label: "TRESPASSER.Sheet.Tabs.Equipments" },
    inventory: { id: "inventory", group: "primary", label: "TRESPASSER.Sheet.Tabs.Inventory" },
    features: { id: "features", group: "primary", label: "TRESPASSER.Sheet.Tabs.Features" },
    combat: { id: "combat", group: "primary", label: "TRESPASSER.Sheet.Tabs.Combat" }
  };

  tabGroups = { primary: "character" };

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  _prepareTabs() {
    const tabs = {};
    for (const [id, config] of Object.entries(this.constructor.TABS)) {
      tabs[id] = {
        ...config,
        active: this.tabGroups[config.group] === id,
        cssClass: this.tabGroups[config.group] === id ? "active" : "",
        label: game.i18n.localize(config.label)
      };
    }
    return tabs;
  }

  async _prepareContext(options) {
    // getCharacterData builds the full context; pass it this sheet instance
    const context = await getCharacterData(this, options);
    context.editable = this.isEditable;
    context.tabs = this._prepareTabs();
    return context;
  }

  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    // Change events — cannot use data-action (click-only)
    for (const el of this.element.querySelectorAll(".effect-intensity-input")) {
      el.addEventListener("change", (ev) => onIntensityChange(ev, this));
    }
    for (const el of this.element.querySelectorAll(".effect-duration-input")) {
      el.addEventListener("change", (ev) => onDurationChange(ev, this));
    }
    for (const el of this.element.querySelectorAll(".weapon-mode-select")) {
      el.addEventListener("change", async (ev) => {
        await this.document.update({ "system.combat.weaponMode": ev.currentTarget.value });
        this.render();
      });
    }
    for (const el of this.element.querySelectorAll(".item-broken-toggle")) {
      el.addEventListener("change", async (ev) => {
        const li = ev.currentTarget.closest("[data-item-id]");
        const item = this.document.items.get(li.dataset.itemId);
        if (item) await item.update({ "system.broken": ev.currentTarget.checked });
      });
    }

    // Collapsible deed rows
    for (const el of this.element.querySelectorAll(".deed-row .deed-header")) {
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".deed-controls")) return;
        ev.currentTarget.closest(".deed-row").classList.toggle("expanded");
      });
    }
  }

  /* -------------------------------------------- */
  /* Tab Action                                   */
  /* -------------------------------------------- */

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }

  /* -------------------------------------------- */
  /* Roll Actions                                 */
  /* -------------------------------------------- */

  static async #onAttributeRoll(event, target) { return onAttributeRoll(event, this, target); }
  static async #onCombatStatRoll(event, target) { return onCombatStatRoll(event, this, target); }
  static async #onEquipRoll(event, target)      { return onEquipRoll(event, this, target); }

  static async #onSkillRoll(event, target) {
    const skillKey  = target.dataset.skill;
    const isTrained = this.document.system.skills[skillKey] ?? false;
    return onSkillRoll(skillKey, isTrained, this);
  }

  /* -------------------------------------------- */
  /* Item Actions                                 */
  /* -------------------------------------------- */

  static async #onItemCreate(event, target) { return onItemCreate(event, this, target); }

  static #onItemEdit(event, target) {
    event.preventDefault();
    const el = target.closest("[data-item-id]");
    const item = this.document.items.get(el?.dataset.itemId);
    item?.sheet.render(true);
  }

  static #onItemDelete(event, target) {
    event.preventDefault();
    const el = target.closest("[data-item-id]");
    const item = this.document.items.get(el?.dataset.itemId);
    item?.delete();
  }

  static #onItemEquip(event, target) {
    const li = target.closest(".inventory-card");
    this.document.equipItem(li.dataset.itemId);
  }

  static #onItemUnequip(event, target) {
    const itemId = target.dataset.itemId || target.closest(".inventory-card")?.dataset.itemId;
    if (itemId) this.document.unequipItem(itemId);
  }

  static async #onItemConsume(event, target) { return onItemConsume(event, this, target); }
  static async #onDepletionRoll(event, target) { return onDepletionRoll(event, this, target); }
  static async #onToggleLight(event, target) { return onToggleLight(event, this, target); }

  static #onItemNameClick(event, target) {
    const el = target.closest("[data-item-id]");
    const item = this.document.items.get(el?.dataset.itemId);
    item?.sheet.render(true);
  }

  /* -------------------------------------------- */
  /* Deed / Talent / Feature Actions              */
  /* -------------------------------------------- */

  static async #onDeedRoll(event, target)        { return onDeedRoll(event, this, target); }
  static async #onTalentRoll(event, target)      { return onTalentRoll(event, this, target); }
  static async #onFeatureRoll(event, target)     { return onFeatureRoll(event, this, target); }
  static async #onIncantationRoll(event, target) { return onIncantationRoll(event, this, target); }

  /* -------------------------------------------- */
  /* Effect Actions                               */
  /* -------------------------------------------- */

  static async #onPrevailRoll(event, target) { return onPrevailRoll(event, this, target); }

  static async #onEffectRemove(event, target) { return onEffectRemove(event, this, target); }
  static async #onEffectInfo(event, target)   { return onEffectInfo(event, this, target); }
  static async #onEffectEdit(event, target)   { return onEffectEdit(event, this, target); }

  /* -------------------------------------------- */
  /* Misc Actions                                 */
  /* -------------------------------------------- */

  static async #onRestDialog(event, target) {
    event.preventDefault();
    return showRestDialog(this.document, (type, data) => handleRestAction(type, data, this));
  }

  static async #onSpendRD(event, target) { return onSpendRDHeader(event, this); }

  static async #onCallingEdit(event, target) {
    event.preventDefault();
    const callingItem = this.document.items.find(i => i.type === "calling");
    if (!callingItem) return ui.notifications.warn("No calling item found on this actor.");
    return showCallingDialog(callingItem, this.document);
  }

  static async #onCallingDelete(event, target) {
    event.preventDefault();
    const callingItem = this.document.items.find(i => i.type === "calling");
    if (!callingItem) return;

    const callingName = callingItem.name;

    const confirm = await Dialog.confirm({
      title: game.i18n.format("TRESPASSER.CallingDialog.DeleteTitle", { name: callingName }),
      content: `<p>${game.i18n.format("TRESPASSER.CallingDialog.DeleteConfirm", { name: callingName })}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirm) return;

    const toDelete = this.document.items
      .filter(it => it.flags.trespasser?.linkedSource === callingName || it.id === callingItem.id)
      .map(it => it.id);

    const skillUpdates = {};
    if (callingItem.system.skills) {
      for (const skillKey of callingItem.system.skills) {
        skillUpdates[`system.skills.${skillKey}`] = false;
      }
    }

    await this.document.deleteEmbeddedDocuments("Item", toDelete);
    await this.document.update({
      ...skillUpdates,
      "system.calling": ""
    });

    ui.notifications.info(game.i18n.format("TRESPASSER.CallingDialog.Removed", { name: callingName, actor: this.document.name }));
  }

  static #onKeyAttribute(event, target) {
    event.preventDefault();
    const attr = target.dataset.attribute;
    this.document.update({ "system.key_attribute": attr });
  }

  static async #onInjuryClockClick(event, target) { return onInjuryClockClick(event, this, target); }

  /* -------------------------------------------- */
  /* Drag & Drop                                  */
  /* -------------------------------------------- */

  async _onDropItem(event, data) {
    if (!this.document.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return super._onDropItem(event, data);
    if (item.type === "calling") return showCallingDialog(item, this.document);
    if (item.type === "craft")   return showCraftDialog(item, this.document);
    if (item.type === "past_life") return this.#applyPastLife(item);
    return super._onDropItem(event, data);
  }

  /* -------------------------------------------- */
  /* Delegate methods for shared handlers         */
  /* -------------------------------------------- */

  _buildClockSegments(total, filled)             { return buildClockSegments(total, filled); }
  async _postDeedPhase(phaseName, phaseData, actor, item, options) {
    return postDeedPhase(phaseName, phaseData, actor, item, options, this);
  }
  async _requestCDAndRoll(roll, flavor)          { return requestCDAndRoll(roll, flavor, this); }
  async _evaluateAndShowRoll(roll, flavor, cd)   { return evaluateAndShowRoll(roll, flavor, cd, this); }
  async _askAPDialog(availableAP)                { return askAPDialog(availableAP); }
  async _runDepletionCheck(item)                 { return runDepletionCheck(item, this); }
  _getActiveWeapons()                            { return getActiveWeapons(this); }
  async _selectAmmoDialog(ammoItems, weapon)     { return showAmmoDialog(ammoItems, weapon); }
  _getAccuracyFromTarget()                       { return getAccuracyFromTarget(); }
  async _recoverItemCost(itemId, msgs)           { return recoverItemCost(itemId, msgs, this.document); }
  async _spendRDAndRoll(count)                   { return spendRDAndRoll(count, this); }

  // V2 compat alias — shared handlers reference sheet.actor
  get actor() { return this.document; }

  /* -------------------------------------------- */
  /* Private Helpers                              */
  /* -------------------------------------------- */

  async #applyPastLife(pastLifeItem) {
    const actor = this.document;
    const system = pastLifeItem.system;

    const updates = {
      "system.past_life": pastLifeItem.name,
    };

    for (const [key, bonus] of Object.entries(system.attributes)) {
      const currentVal = actor.system.attributes[key] || 0;
      updates[`system.attributes.${key}`] = currentVal + (bonus || 0);
    }

    for (const [key, trained] of Object.entries(system.skills)) {
      if (trained) {
        updates[`system.skills.${key}`] = true;
      }
    }

    await actor.update(updates);

    const itemsToCreate = [];
    for (const entry of system.items) {
      const sourceItem = await fromUuid(entry.uuid);
      if (sourceItem) {
        const itemData = sourceItem.toObject();
        delete itemData._id;
        if (entry.quantity !== undefined) {
          itemData.system.quantity = entry.quantity;
        }
        itemsToCreate.push(itemData);
      }
    }

    if (itemsToCreate.length > 0) {
      await actor.createEmbeddedDocuments("Item", itemsToCreate);
    }

    ui.notifications.info(game.i18n.format("TRESPASSER.PastLife.Applied", {
      name: pastLifeItem.name,
      actor: actor.name
    }));
  }
}
