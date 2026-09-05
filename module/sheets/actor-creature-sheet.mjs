import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { askAPDialog } from "../dialogs/ap-dialog.mjs";
import { onDeedRoll, postDeedPhase } from "./character/handlers-deed.mjs";
import { onPrevailRoll, onIntensityChange, onEffectInfo } from "./character/handlers-effects.mjs";
import { TrespasserCombat } from "../documents/combat.mjs";
import { TrespasserCreatureConfigDialog } from "../dialogs/creature-config-dialog.mjs";
import { PASSIVE_STATES } from "../config/state-config.mjs";

import { prepareDeedDisplayData } from "../helpers/deed-display-helper.mjs";
import { EngagementHelper } from "../helpers/engagement-helper.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";

const { api, sheets } = foundry.applications;
import { TrespasserActorSheet } from "./base-sheet.mjs";

/**
 * Creature Sheet class for Trespasser TTRPG (V2)
 */
export class TrespasserCreatureSheet extends TrespasserActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "actor", "creature"],
    position: { width: 580, height: 600 },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true },
    actions: {
      configureCreature: TrespasserCreatureSheet._onConfigureCreature
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/creature-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (this.isEditable) {
      controls.unshift({
        icon: "fa-solid fa-wand-magic-sparkles",
        label: "TRESPASSER.Dialog.CreatureConfig.HeaderButton",
        action: "configureCreature"
      });
    }
    return controls;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.actor = actor;
    context.system = actor.system;
    context.flags = actor.flags;

    // Categorize effects using helper for the partial
    context.activeEffects = TrespasserEffectsHelper.getActorEffects(actor);
    context.durationModes = TrespasserEffectsHelper.DURATION_LABELS;
    
    // Prepare items for the sheet
    context.feats = actor.items.filter(i => i.type === "feature");
    context.features = context.feats; // legacy compatibility
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
      return prepareDeedDisplayData(d, sourceMapByUuid);
    });

    context.deedsGrouped = {
      light: allDeeds.filter(d => d.system.tier === "light"),
      heavy: allDeeds.filter(d => d.system.tier === "heavy"),
      mighty: allDeeds.filter(d => d.system.tier === "mighty"),
      special: allDeeds.filter(d => d.system.tier === "special")
    };
    context.deeds = allDeeds;

    const isEngaged = EngagementHelper.isActorEngaged(actor);
    context.passiveStates = Object.entries(PASSIVE_STATES)
      .map(([key, cfg]) => ({
        key,
        active: key === "engaged" ? isEngaged : (context.system.passiveStates?.[key] ?? false),
        icon: cfg.icon,
        label: cfg.label,
        description: cfg.description
      }))
      .filter(s => actor.type === "character" || s.key !== "encumbered");

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    if (!this.isEditable) return;

    // Item Management
    html.find('.item-create').on("click", this._onItemCreate.bind(this));
    html.find('.item-edit').on("click", this._onItemEdit.bind(this));
    html.find('.item-delete').on("click", this._onItemDelete.bind(this));
    
    // Rollable Deeds
    html.find('.deed-rollable').on("click", this._onDeedRoll.bind(this));
    html.find('.feature-name.rollable').on("click", this._onFeatureRoll.bind(this));
    
    // Effects Prevail/Remove/Intensity/Duration
    html.find(".effect-intensity-input").on("change", this._onIntensityChange.bind(this));
    html.find(".effect-prevail").on("click", this._onPrevailRoll.bind(this));
    html.find(".effect-info, .feature-info, .talent-info").on("click", this._onEffectInfo.bind(this));
    html.find(".effect-duration-input").on("change", this._onDurationChange.bind(this));
    html.find(".effect-remove").on("click", async (ev) => {
      const effectId = ev.currentTarget.closest(".combat-effect, .effect-row")?.dataset.itemId;
      if (effectId) {
        const effect = this.actor.items.get(effectId);
        if (effect) await effect.delete();
      }
    });

    // Generic item name click
    html.find(".item-name:not(.rollable)").on("click", (ev) => {
      const el = ev.currentTarget.closest("[data-item-id]");
      const item = this.actor.items.get(el.dataset.itemId);
      item?.sheet.render(true);
    });

    this.#bindItemDragHandlers();

    // Fallback drop handling: core's v14 sheet pipeline does not reliably
    // bind drop handlers to this sheet's markup, so accept item drops at
    // the root. The handled-stamp prevents double-processing if core also
    // routes the same event.
    if (!this.element._trespasserRootDropBound) {
      this.element._trespasserRootDropBound = true;
      this.element.addEventListener("dragover", ev => ev.preventDefault());
      this.element.addEventListener("drop", async ev => {
        if (ev._trespasserItemDropHandled) return;
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        if (data?.type !== "Item") return;
        const item = (await Item.implementation.fromDropData(data)) || (await resolveItem(data));
        if (!item || item.parent === this.actor) return;
        ev._trespasserItemDropHandled = true;
        if (!this.actor.isOwner) return;
        await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        // The creature sheet only displays some item types, so confirm the
        // drop in a notification regardless of what was added.
        ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Item.Added", {
          item: item.name, target: this.actor.name
        }));
      });
    }
  }

  /**
   * Make item rows draggable with standard Foundry drag data. Core's v14
   * sheet drag-drop rework no longer binds drag handlers to system markup,
   * so the sheet wires its own dragstart listeners.
   */
  #bindItemDragHandlers() {
    for (const el of this.element.querySelectorAll('[draggable="true"]')) {
      if (el._trespasserDragBound) continue;
      el._trespasserDragBound = true;
      el.addEventListener("dragstart", ev => {
        const id = el.dataset.itemId ?? el.closest("[data-item-id]")?.dataset.itemId;
        const item = id ? this.actor.items.get(id) : null;
        if (!item) return;
        ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    }
  }

  /** @override */
  async _onDropItem(event, dropped) {
    if (event._trespasserItemDropHandled) return false;
    event._trespasserItemDropHandled = true;
    if (!this.actor.isOwner) return false;
    return super._onDropItem(event, dropped);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const itemData = {
      name: game.i18n.format("TRESPASSER.Chat.Check.ResultVs", { total: "New", target: type.capitalize(), status: "" }).split(" — ")[0].trim(),
      type: type
    };
    return await foundry.documents.BaseItem.create(itemData, { parent: this.actor });
  }

  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest("[data-item-id]");
    const itemId = li?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      item.sheet.render(true);
    } else {
      console.warn(`Trespasser | Could not find item ${itemId} on actor ${this.actor.id}`);
    }
  }

  _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest("[data-item-id]");
    const item = this.actor.items.get(li.dataset.itemId);
    if (item) {
      item.delete();
    }
  }

  async _onIntensityChange(event) {
    return onIntensityChange(event, this);
  }

  async _onDurationChange(event) {
    const li = event.currentTarget.closest(".effect-row");
    if (!li) return;
    const itemId = li.dataset.itemId;
    const val = parseInt(event.currentTarget.value);
    if (isNaN(val)) return;
    const item = this.actor.items.get(itemId);
    if (item) await item.update({ "system.durationValue": val });
  }

  /**
   * Post enrichable feature to chat
   */
  async _onFeatureRoll(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    
    const li = event.currentTarget.closest("[data-item-id]");
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;

    const enrichedRef = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
      async: true,
      secrets: item.isOwner,
      relativeTo: item
    });

    const content = `
      <div class="trespasser-chat-card feature-card">
        <h3>Feature: ${item.name}</h3>
        <details>
          <summary style="cursor: pointer; color: var(--trp-gold-bright); font-family: var(--trp-font-header); font-size: var(--fs-11); margin-bottom: 5px;">
            <i class="fas fa-info-circle"></i> ${game.i18n.localize("TRESPASSER.Chat.Common.DescriptionExpand")}
          </summary>
          <div class="collapsible-content" style="background: var(--trp-bg-overlay); padding: 8px; border-radius: 4px; border: 1px solid var(--trp-border); margin-bottom: 10px; font-size: var(--fs-12);">
            ${enrichedRef}
          </div>
        </details>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }

  async _onPrevailRoll(event) {
    return onPrevailRoll(event, this);
  }

  /**
   * Handle rolling a Deed from the creature sheet.
   */
  async _onDeedRoll(event) { return onDeedRoll(event, this); }

  /**
   * Post standard deed phase to chat.
   */
  async _postDeedPhase(phaseName, phaseData, actor, item, options = {}) {
    return postDeedPhase(phaseName, phaseData, actor, item, options, this);
  }

  /** Creatures don't equip weapon items — return empty array. */
  _getActiveWeapons() { return []; }

  /** Delegate AP dialog to shared helper. */
  async _askAPDialog(availableAP) { return askAPDialog(availableAP); }

  /** Creatures don't have depletion mechanic — no-op. */
  async _runDepletionCheck(_item) {}

  /**
   * Open Creature Configuration and Stat Scaling Dialog.
   */
  static async _onConfigureCreature(event, button) {
    const sheet = this;
    await TrespasserCreatureConfigDialog.wait(sheet.actor);
  }

  async _onEffectInfo(event) {
    return onEffectInfo(event, this);
  }
}
