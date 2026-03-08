/**
 * NPC Actor Sheet for Trespasser RPG
 *
 * AppV2 sheet — simple single-part layout (no tabs).
 * Handles features, combat effects, and deeds for NPC actors.
 */

const { api, sheets } = foundry.applications;

import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { showItemInfoDialog }      from "../dialogs/item-info-dialog.mjs";
import { askAPDialog }             from "../dialogs/ap-dialog.mjs";
import { onDeedRoll, postDeedPhase } from "./character/handlers-deed.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";

export class TrespasserNPCSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "actor", "npc"],
    position: { width: 580, height: 600 },
    actions: {
      itemCreate:    TrespasserNPCSheet.#onItemCreate,
      itemEdit:      TrespasserNPCSheet.#onItemEdit,
      itemDelete:    TrespasserNPCSheet.#onItemDelete,
      deedRoll:      TrespasserNPCSheet.#onDeedRoll,
      featureRoll:   TrespasserNPCSheet.#onFeatureRoll,
      prevailRoll:   TrespasserNPCSheet.#onPrevailRoll,
      effectInfo:    TrespasserNPCSheet.#onEffectInfo,
      effectEdit:    TrespasserNPCSheet.#onEffectEdit,
      effectRemove:  TrespasserNPCSheet.#onEffectRemove,
      itemNameClick: TrespasserNPCSheet.#onItemNameClick
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    npc: {
      template: "systems/trespasser/templates/actor/npc-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.actor = actor;
    context.system = actor.system;
    context.flags = actor.flags;
    context.editable = this.isEditable;

    // Categorize effects using helper for the partial
    context.activeEffects = TrespasserEffectsHelper.getActorEffects(actor);
    context.durationModes = TrespasserEffectsHelper.DURATION_LABELS;

    // Prepare items for the sheet
    context.feats = actor.items.filter(i => i.type === "feature");
    context.features = context.feats;
    context.states = actor.items.filter(i => i.type === "state");
    context.effects = actor.items.filter(i => i.type === "effect");
    context.deeds = actor.items.filter(i => i.type === "deed");

    const sourceMapByUuid = {};
    for (const item of actor.items) {
      if (item.type === "feature") {
        (item.system.deeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
        (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
      } else if (item.type === "weapon" && item.system.equipped) {
        (item.system.extraDeeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
        (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
        (item.system.enhancementEffects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
      } else if (item.type === "armor" && item.system.equipped) {
        (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
      }
    }

    // Group deeds by tier to match the unified component
    const allDeeds = actor.items.filter(i => i.type === "deed").map(d => {
      const deedData = d.toObject ? d.toObject(false) : d.toJSON();
      deedData.id = d.id;

      const tier = deedData.system.tier;

      let baseCost = deedData.system.focusCost;
      if (baseCost === null || baseCost === undefined) {
        if (tier === "heavy") baseCost = 2;
        else if (tier === "mighty") baseCost = 4;
        else baseCost = 0;
      }

      let costIncrease = deedData.system.focusIncrease;
      if (costIncrease === null || costIncrease === undefined) {
        if (tier === "heavy" || tier === "mighty") costIncrease = 1;
        else costIncrease = 0;
      }

      const bonusCost = deedData.system.bonusCost || 0;
      const uses = deedData.system.uses || 0;
      deedData.displayCost = baseCost + bonusCost;
      deedData.showCost = deedData.displayCost > 0;
      deedData.hasUses = costIncrease > 0;

      if (deedData.hasUses) {
        deedData.usesCheckboxes = Array.from({ length: 3 }, (_, i) => ({
          index: i + 1,
          checked: i < uses
        }));
      }

      const linkedSource = d.flags?.trespasser?.linkedSource;
      if (linkedSource && sourceMapByUuid[linkedSource]) {
        deedData.sourceName = sourceMapByUuid[linkedSource];
      }
      return deedData;
    });

    context.deedsGrouped = {
      light: allDeeds.filter(d => d.system.tier === "light"),
      heavy: allDeeds.filter(d => d.system.tier === "heavy"),
      mighty: allDeeds.filter(d => d.system.tier === "mighty"),
      special: allDeeds.filter(d => d.system.tier === "special")
    };
    context.deeds = allDeeds;

    return context;
  }

  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    // Change events cannot use data-action (click-only), register manually
    for (const el of this.element.querySelectorAll(".effect-intensity-input")) {
      el.addEventListener("change", this.#onIntensityChange.bind(this));
    }
    for (const el of this.element.querySelectorAll(".effect-duration-input")) {
      el.addEventListener("change", this.#onDurationChange.bind(this));
    }
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  static async #onItemCreate(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    const itemData = {
      name: `New ${type.capitalize()}`,
      type: type
    };
    return await foundry.documents.BaseItem.create(itemData, { parent: this.document });
  }

  static #onItemEdit(event, target) {
    event.preventDefault();
    const el = target.closest("[data-item-id]");
    const item = this.document.items.get(el?.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  static #onItemDelete(event, target) {
    event.preventDefault();
    const el = target.closest("[data-item-id]");
    const item = this.document.items.get(el?.dataset.itemId);
    if (item) item.delete();
  }

  static async #onDeedRoll(event, target) {
    return onDeedRoll(event, this, target);
  }

  static async #onFeatureRoll(event, target) {
    event.preventDefault();

    const li = target.closest("[data-item-id]");
    const item = this.document.items.get(li.dataset.itemId);
    if (!item) return;

    const enrichedRef = await TextEditor.enrichHTML(item.system.description, {
      async: true,
      secrets: item.isOwner,
      relativeTo: item
    });

    const content = `
      <div class="trespasser-chat-card feature-card">
        <h3>Feature: ${item.name}</h3>
        <details>
          <summary style="cursor: pointer; color: var(--trp-gold-bright); font-family: var(--trp-font-header); font-size: 11px; margin-bottom: 5px;">
            <i class="fas fa-info-circle"></i> ${game.i18n.localize("TRESPASSER.Chat.DescriptionExpand")}
          </summary>
          <div class="collapsible-content" style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; border: 1px solid var(--trp-border); margin-bottom: 10px; font-size: 12px;">
            ${enrichedRef}
          </div>
        </details>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: content
    });
  }

  static async #onPrevailRoll(event, target) {
    event.preventDefault();
    const li = target.closest(".effect-row");
    const effectItem = this.document.items.get(li.dataset.itemId);
    if (!effectItem) return;

    let extraAP = 0;
    const combatant = TrespasserCombat.getPhaseCombatant(this.document);

    if (combatant && this.document.type === "npc") {
      const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      if (availableAP < 1) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
        return;
      }

      let apSpent = 1;
      if (availableAP > 1) {
        apSpent = await askAPDialog(availableAP);
        if (apSpent === null) return;
      }

      extraAP = apSpent - 1;
      await combatant.setFlag("trespasser", "actionPoints", availableAP - apSpent);
    }

    await this.document.rollPrevail(effectItem.id, extraAP);
    await TrespasserCombat.recordHUDAction(this.document, "prevail");
  }

  static async #onEffectInfo(event, target) {
    const li = target.closest("[data-item-id]");
    const item = this.document.items.get(li?.dataset.itemId);
    if (item) showItemInfoDialog(item.uuid);
  }

  static #onEffectEdit(event, target) {
    const li = target.closest("[data-item-id]");
    const item = this.document.items.get(li?.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  static async #onEffectRemove(event, target) {
    const el = target.closest(".combat-effect, .effect-row");
    const item = this.document.items.get(el?.dataset.itemId);
    if (item) await item.delete();
  }

  static #onItemNameClick(event, target) {
    const el = target.closest("[data-item-id]");
    const item = this.document.items.get(el?.dataset.itemId);
    item?.sheet.render(true);
  }

  /* -------------------------------------------- */
  /* Instance change handlers (non-action)        */
  /* -------------------------------------------- */

  async #onIntensityChange(event) {
    const li = event.currentTarget.closest(".effect-row");
    if (!li) return;
    const val = parseInt(event.currentTarget.value);
    if (isNaN(val)) return;
    const item = this.document.items.get(li.dataset.itemId);
    if (item) await item.update({ "system.intensity": val });
  }

  async #onDurationChange(event) {
    const li = event.currentTarget.closest(".effect-row");
    if (!li) return;
    const val = parseInt(event.currentTarget.value);
    if (isNaN(val)) return;
    const item = this.document.items.get(li.dataset.itemId);
    if (item) await item.update({ "system.durationValue": val });
  }

  /* -------------------------------------------- */
  /* Delegate methods for shared deed handlers    */
  /* -------------------------------------------- */

  /** @see handlers-deed.mjs */
  async _postDeedPhase(phaseName, phaseData, actor, item, options = {}) {
    return postDeedPhase(phaseName, phaseData, actor, item, options, this);
  }

  /** NPCs don't equip weapon items — return empty array. */
  _getActiveWeapons() { return []; }

  /** Delegate AP dialog to shared helper. */
  async _askAPDialog(availableAP) { return askAPDialog(availableAP); }

  /** NPCs don't have depletion mechanic — no-op. */
  async _runDepletionCheck(_item) {}

  // V2 compat alias — shared handlers reference sheet.actor
  get actor() { return this.document; }
}
