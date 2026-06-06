/**
 * Character Sheet — Thin Coordinator
 *
 * All business logic lives in ./character/* handlers.
 * This file only wires Foundry's lifecycle hooks to those modules.
 */

import { addItemToActor } from "../helpers/item-transfer-helper.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";
import { TrespasserCallingDialog }     from "../dialogs/calling-dialog.mjs";
import { TrespasserCraftDialog }       from "../dialogs/craft-dialog.mjs";
import { showRestDialog }              from "../dialogs/rest-dialog.mjs";
import { showAmmoDialog }              from "../dialogs/ammo-dialog.mjs";
import { askAPDialog }               from "../dialogs/ap-dialog.mjs";
import { PlightPickerDialog }          from "../dialogs/plight-picker-dialog.mjs";
import { COMMON_PLIGHTS }              from "../config/plight-config.mjs";

import { getCharacterData, buildClockSegments } from "./character/get-data.mjs";
import { activateCharacterListeners }           from "./character/listeners.mjs";

import { onAttributeRoll, onCombatStatRoll, onSkillRoll } from "./character/handlers-rolls.mjs";
import { onDeedRoll, postDeedPhase, requestCDAndRoll, evaluateAndShowRoll } from "./character/handlers-deed.mjs";
import { onTalentRoll, onFeatureRoll, onIncantationRoll }                   from "./character/handlers-talent.mjs";
import { handleRestAction, recoverItemCost, spendRDAndRoll }                from "./character/handlers-rest.mjs";
import { onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck, onItemTransfer }  from "./character/handlers-items.mjs";
import { onPrevailRoll, onIntensityChange, onEffectRemove, onEffectInfo, onEffectEdit }   from "./character/handlers-effects.mjs";
import { onEquipRoll, getActiveWeapons, getAccuracyFromTarget }             from "./character/handlers-combat.mjs";
import { onInjuryClockClick, onToggleLight, onSpendRDHeader }               from "./character/handlers-misc.mjs";

const { api, sheets } = foundry.applications;

/**
 * Character Sheet class for Trespasser TTRPG.
 */
export class TrespasserCharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "actor", "character"],
    position: { width: 868, height: 720 },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true },
    dragDrop: [{ dragSelector: ".inventory-card, .item, .deed-slot", dropSelector: null }]
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/character-sheet.hbs",
      scrollable: [".tab-body.active", ".editor-container"]
    }
  };

  tabGroups = { primary: "character" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  // ── Foundry lifecycle ──────────────────────────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const charData = await getCharacterData(this, options);
    const merged = foundry.utils.mergeObject(context, charData);
    merged.tabs = this.tabGroups;
    return merged;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    console.log(`Trespasser | TrespasserCharacterSheet._onRender for ${this.actor.name}`);
    activateCharacterListeners(html, this);

    // Sync tabs
    const tabs = this.element.querySelectorAll('.sheet-tabs .item');
    tabs.forEach(t => {
      t.addEventListener('click', (ev) => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    // Re-render when targets change so transfer buttons show up
    if (!this._targetingHook) {
      this._targetingHook = Hooks.on("targetToken", (user, token, targeted) => {
        if (user.id === game.user.id) this.render();
      });
    }
  }

  /** @override */
  async close(options = {}) {
    if (this._targetingHook) {
      Hooks.off("targetToken", this._targetingHook);
      this._targetingHook = null;
    }
    return super.close(options);
  }

  /** @override */
  async _onDropItem(event, data) {
    // Allow transfers from other actors even if the user doesn't own the target.
    // Prevent cloning from sidebar/compendiums if the user doesn't own the target.
    if ( !this.actor.isOwner && (data.type !== "Item" || !data.actorId) ) return false;

    // Resolve the source item document
    let sourceItem = data.uuid ? await fromUuid(data.uuid) : null;
    if (!sourceItem && data.actorId && data.id) {
       const sourceActor = game.actors.get(data.actorId) || canvas.tokens.get(data.actorId)?.actor;
       sourceItem = sourceActor?.items.get(data.id);
    }

    // Determine if this is a cross-actor transfer
    // We check if the item has a parent and that parent is NOT the current actor.
    const isTransfer = sourceItem && sourceItem.parent && (sourceItem.parent !== this.actor);

    if (isTransfer) {
      // Trigger the unified transfer logic
      await onItemTransfer(null, this, { item: sourceItem, targetActor: this.actor });
      return false; // Prevent duplicate handling
    }

    // Special handling for Haven inventory transfers
    if (data.isHavenTransfer) {
      const sourceHaven = game.actors.get(data.actorId);
      if (!sourceHaven) return false;
      
      const entry = sourceHaven.system.inventory[data.havenIndex];
      if (!entry) return false;

      const itemData = foundry.utils.duplicate(entry.item);
      const qtyToTransfer = data.transferAll ? entry.quantity : 1;
      
      const success = await addItemToActor(this.actor, itemData, qtyToTransfer);
      console.log(`Trespasser | _onDropItem (Haven Transfer): Item added to character: ${success}`);

      if (success) {
        console.log(`Trespasser | _onDropItem (Haven Transfer): Emitting HAVEN_WITHDRAWAL socket for index ${data.havenIndex}`);
        // Notify through socket to update Haven (handles permissions)
        TrespasserSocket.emit("HAVEN_WITHDRAWAL", {
          havenUuid: sourceHaven.uuid,
          index: data.havenIndex,
          targetActorUuid: this.actor.uuid,
          transferAll: !!data.transferAll
        });
        
        ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Transfer.Complete", {
          item: entry.item.name,
          target: this.actor.name
        }));
      }
      
      return false;
    }

    const item = await Item.implementation.fromDropData(data);
    if (!item) return super._onDropItem(event, data);

    if (item.type === "calling") return TrespasserCallingDialog.wait(item, this.actor);
    if (item.type === "craft")   return TrespasserCraftDialog.wait(item, this.actor);
    if (item.type === "past_life") return this._applyPastLife(item);
    return super._onDropItem(event, data);
  }

  // ── Delegate methods (kept here so Foundry's .bind(this) chains work) ─────

  // ── Clock / Injury ─────────────────────────────────────────────────────────
  _buildClockSegments(total, filled)        { return buildClockSegments(total, filled); }
  async _onInjuryClockClick(event)          { return onInjuryClockClick(event, this); }

  // ── Rolls ──────────────────────────────────────────────────────────────────
  async _onAttributeRoll(event)             { return onAttributeRoll(event, this); }
  async _onCombatStatRoll(event)            { return onCombatStatRoll(event, this); }
  async _onSkillRoll(skillKey, isTrained)   { return onSkillRoll(skillKey, isTrained, this); }

  // ── Deeds ──────────────────────────────────────────────────────────────────
  async _onDeedRoll(event)                  { return onDeedRoll(event, this); }
  async _postDeedPhase(phaseName, phaseData, actor, item, options) {
    return postDeedPhase(phaseName, phaseData, actor, item, options, this);
  }
  async _requestCDAndRoll(roll, flavor)     { return requestCDAndRoll(roll, flavor, this); }
  async _evaluateAndShowRoll(roll, flavor, cd) { return evaluateAndShowRoll(roll, flavor, cd, this); }
  async _askAPDialog(availableAP)             { return askAPDialog(availableAP); }

  // ── Talents / Features / Incantations ─────────────────────────────────────
  async _onTalentRoll(event)                { return onTalentRoll(event, this); }
  async _onFeatureRoll(event)               { return onFeatureRoll(event, this); }
  async _onIncantationRoll(event)           { return onIncantationRoll(event, this); }

  // ── Rest ───────────────────────────────────────────────────────────────────
  async _onRestDialog(event) {
    event.preventDefault();
    return showRestDialog(this.actor, (type, data) => this._handleRestAction(type, data));
  }
  async _handleRestAction(type, data)       { return handleRestAction(type, data, this); }
  async _recoverItemCost(itemId, msgs)      { return recoverItemCost(itemId, msgs, this.actor); }
  async _spendRDAndRoll(count)              { return spendRDAndRoll(count, this); }
  async _onSpendRDHeader(event)             { return onSpendRDHeader(event, this); }

  // ── Items ──────────────────────────────────────────────────────────────────
  async _onItemCreate(event)                { return onItemCreate(event, this); }
  async _onItemConsume(event)               { return onItemConsume(event, this); }
  async _onDepletionRoll(event)             { return onDepletionRoll(event, this); }
  async _runDepletionCheck(item)            { return runDepletionCheck(item, this); }
  async _onItemTransfer(event)              { return onItemTransfer(event, this); }

  // ── Effects ────────────────────────────────────────────────────────────────
  async _onPrevailRoll(event)               { return onPrevailRoll(event, this); }
  async _onIntensityChange(event)           { return onIntensityChange(event, this); }
  async _onEffectRemove(event)              { return onEffectRemove(event, this); }
  async _onEffectInfo(event)                { return onEffectInfo(event, this); }
  async _onEffectEdit(event)                { return onEffectEdit(event, this); }
  async _onDurationChange(event)            { return onDurationChange(event, this); }

  async _onPlightAdd(event) {
    event.preventDefault();
    const plightId = await PlightPickerDialog.wait(this.actor);
    if (!plightId) return;

    if (plightId === "custom") {
      const created = await Item.implementation.create({
        name: game.i18n.localize("TRESPASSER.Plight.Custom.Name"),
        type: "plight",
        img: "systems/trespasser/assets/icons/effect.webp",
        system: {
          plightId: "",
          description: ""
        }
      }, { parent: this.actor });
      if (created) {
        created.sheet.render(true);
      }
    } else {
      const config = COMMON_PLIGHTS[plightId];
      if (config) {
        // Double check duplicate prevention
        const alreadyHas = this.actor.items.some(i => i.type === "plight" && i.system.plightId === plightId);
        if (alreadyHas) {
          ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: game.i18n.localize(config.label) }));
          return;
        }

        await Item.implementation.create({
          name: game.i18n.localize(config.label),
          type: "plight",
          img: "systems/trespasser/assets/icons/effect.webp",
          system: {
            plightId: plightId,
            description: game.i18n.localize(config.description)
          }
        }, { parent: this.actor });
      }
    }
  }

  async _onLastingStateAdd(event) {
    event.preventDefault();
    const type = "effect";
    const name = "New Lasting State";
    const system = {
      isLasting: true,
      isCombat: true
    };
    const created = await Item.implementation.create({ name, type, system }, { parent: this.actor });
    if (created) {
      created.sheet.render(true);
    }
  }

  // ── Combat / Equipment ─────────────────────────────────────────────────────
  async _onEquipRoll(event)                 { return onEquipRoll(event, this); }
  _getActiveWeapons()                       { return getActiveWeapons(this); }
  async _selectAmmoDialog(ammoItems, weapon){ return showAmmoDialog(ammoItems, weapon); }
  _getAccuracyFromTarget()                  { return getAccuracyFromTarget(); }

  // ── Light ──────────────────────────────────────────────────────────────────
  async _onToggleLight(event)               { return onToggleLight(event, this); }

  async _onCallingEdit(event) {
    event.preventDefault();
    const callingItem = this.actor.items.find(i => i.type === "calling");
    if (!callingItem) return ui.notifications.warn("No calling item found on this actor.");
    return TrespasserCallingDialog.wait(callingItem, this.actor);
  }

  async _onCallingDelete(event) {
    event.preventDefault();
    const callingItem = this.actor.items.find(i => i.type === "calling");
    if (!callingItem) return;

    const callingName = callingItem.name;

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.format("TRESPASSER.Dialog.Delete.CallingTitle", { name: callingName }) },
      content: `<p>${game.i18n.format("TRESPASSER.Dialog.Delete.CallingConfirm", { name: callingName })}</p>`,
      classes: ["trespasser", "dialog"],
      rejectClose: false
    });

    if (!confirm) return;

    // 1. Collect linked items
    const toDelete = this.actor.items
      .filter(it => it.flags.trespasser?.linkedSource === callingName || it.id === callingItem.id)
      .map(it => it.id);

    // 2. Identify skills to un-train
    const skillUpdates = {};
    if (callingItem.system.skills) {
      for (const skillKey of callingItem.system.skills) {
        skillUpdates[`system.skills.${skillKey}`] = false;
      }
    }

    // 3. Perform updates
    await this.actor.deleteEmbeddedDocuments("Item", toDelete);
    await this.actor.update({
      ...skillUpdates,
      "system.calling": ""
    });

    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Apply.CallingRemoved", { name: callingName, actor: this.actor.name }));
  }

  /**
   * Apply a Past Life template to the character.
   * @param {Item} pastLifeItem 
   */
  async _applyPastLife(pastLifeItem) {
    const actor = this.actor;
    const system = pastLifeItem.system;
    
    // 1. Prepare updates for actor
    const updates = {
      "system.past_life": pastLifeItem.name,
    };

    // 2. Sum attribute bonuses
    for (const [key, bonus] of Object.entries(system.attributes)) {
      const currentVal = actor.system.attributes[key] || 0;
      updates[`system.attributes.${key}`] = currentVal + (bonus || 0);
    }

    // 3. Mark skills as trained (true)
    for (const [key, trained] of Object.entries(system.skills)) {
      if (trained) {
        updates[`system.skills.${key}`] = true;
      }
    }

    // Apply actor updates
    await actor.update(updates);

    // 4. Create items from the Past Life template
    const itemsToCreate = [];
    for (const entry of system.items) {
      const sourceItem = await fromUuid(entry.uuid);
      if (sourceItem) {
        const itemData = sourceItem.toObject();
        delete itemData._id;
        // Optionally override quantity if specified in the template
        if (entry.quantity !== undefined) {
          itemData.system.quantity = entry.quantity;
        }
        itemsToCreate.push(itemData);
      }
    }

    if (itemsToCreate.length > 0) {
      await actor.createEmbeddedDocuments("Item", itemsToCreate);
    }

    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Apply.PastLife", {
      name: pastLifeItem.name,
      actor: actor.name
    }));
  }
}
