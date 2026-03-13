import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { showItemInfoDialog }  from "../dialogs/item-info-dialog.mjs";
import { askAPDialog } from "../dialogs/ap-dialog.mjs";
import { onDeedRoll, postDeedPhase } from "./character/handlers-deed.mjs";
import { TrespasserCombat } from "../documents/combat.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";

/**
 * Extend the basic ActorSheet with some very simple logic.
 * @extends {ActorSheet}
 */
export class TrespasserCreatureSheet extends foundry.appv1.sheets.ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "actor", "creature"],
      width: 580,
      height: 600,
      scrollY: [".sheet-body"],
      tabs: [] // Simple layout, no tabs
    });
  }

  /** @override */
  get template() {
    return `systems/trespasser/templates/actor/creature-sheet.hbs`;
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = context.actor.system;
    context.flags = this.actor.flags;

    // Categorize effects using helper for the partial
    context.activeEffects = TrespasserEffectsHelper.getActorEffects(this.actor);
    context.durationModes = TrespasserEffectsHelper.DURATION_LABELS;
    
    // Prepare items for the sheet
    context.feats = this.actor.items.filter(i => i.type === "feature");
    context.features = context.feats; // legacy compatibility if needed
    context.states = this.actor.items.filter(i => i.type === "state");
    context.effects = this.actor.items.filter(i => i.type === "effect");
    context.deeds = this.actor.items.filter(i => i.type === "deed");
    
    const sourceMapByUuid = {};
    for (const item of this.actor.items) {
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
    const allDeeds = this.actor.items.filter(i => i.type === "deed").map(d => {
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

      let bonusCost = deedData.system.bonusCost || 0;
      
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

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Item Management
    html.find('.item-create').click(this._onItemCreate.bind(this));
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    
    // Rollable Deeds
    html.find('.deed-rollable').click(this._onDeedRoll.bind(this));
    html.find('.feature-name.rollable').click(this._onFeatureRoll.bind(this));
    
    // Effects Prevail/Remove/Intensity
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

    // Generic item name click (Requirement 2)
    html.find(".item-name:not(.rollable)").on("click", (ev) => {
      const el = ev.currentTarget.closest("[data-item-id]");
      const item = this.actor.items.get(el.dataset.itemId);
      item?.sheet.render(true);
    });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const itemData = {
      name: game.i18n.format("TRESPASSER.Chat.ResultVs", { total: "New", target: type.capitalize(), status: "" }).split(" — ")[0].trim(),
      type: type
    };
    return await foundry.documents.BaseItem.create(itemData, {parent: this.actor});
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

  /**
   * Handle manually changing the intensity of an effect item.
   */
  async _onIntensityChange(event) {
    const li = event.currentTarget.closest(".effect-row");
    if (!li) return;
    const itemId = li.dataset.itemId;
    const val = parseInt(event.currentTarget.value);
    if (isNaN(val)) return;
    const item = this.actor.items.get(itemId);
    if (item) await item.update({ "system.intensity": val });
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
   * Post standard feature to chat (matching character sheet intent)
   */
  async _onFeatureRoll(event) {
    event.preventDefault();
    event.stopImmediatePropagation(); // Prevent other listeners on the same element from firing
    
    const li = event.currentTarget.closest("[data-item-id]");
    const item = this.actor.items.get(li.dataset.itemId);
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
          <summary style="cursor: pointer; color: var(--trp-gold-bright); font-family: var(--trp-font-header); font-size: var(--fs-11); margin-bottom: 5px;">
            <i class="fas fa-info-circle"></i> ${game.i18n.localize("TRESPASSER.Chat.DescriptionExpand")}
          </summary>
          <div class="collapsible-content" style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; border: 1px solid var(--trp-border); margin-bottom: 10px; font-size: var(--fs-12);">
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

  /**
   * Handle rolling a prevail check for an effect/state on a creature.
   *
   * @param {Event} event
   */
  async _onPrevailRoll(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".effect-row");
    const itemId = li.dataset.itemId;
    const effectItem = this.actor.items.get(itemId);
    if (!effectItem) return;

    let extraAP = 0;
    const combatant = TrespasserCombat.getPhaseCombatant(this.actor);
    
    if (combatant && this.actor.type === "creature") {
      const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
      const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      if (restrictAPF && availableAP < 1) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
        return;
      }

      let apSpent = 1;
      if (availableAP > 1) {
        apSpent = await askAPDialog(availableAP);
        if (apSpent === null) return;
      }
      
      extraAP = apSpent - 1;
      await combatant.setFlag("trespasser", "actionPoints", Math.max(0, availableAP - apSpent));
    }

    const intensity = effectItem.system.intensity || 0;
    const defaultCD = Math.min(20, 10 + intensity);
    const prevailStat = this.actor.type === "creature" 
      ? (this.actor.system.combat?.roll_bonus || 0) 
      : (this.actor.system.combat?.prevail || 0);
    const apBonus = extraAP * 2;

    const isAdv = TrespasserEffectsHelper.hasAdvantage(this.actor, "prevail");
    
    const diceFormula = isAdv ? "2d20kh" : "1d20";

    const result = await TrespasserRollDialog.wait({
      dice: diceFormula,
      showCD: true,
      cd: defaultCD,
      bonuses: [
        { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Prevail"), value: prevailStat },
        { label: game.i18n.localize("TRESPASSER.HUD.ExtraAP"), value: apBonus }
      ]
    }, { title: game.i18n.format("TRESPASSER.Chat.PrevailCheck", { name: effectItem.name }) });

    if (!result) return;

    await this.actor.rollPrevail(effectItem.id, extraAP, {
      modifier: result.modifier,
      cd: result.cd
    });
    await TrespasserCombat.recordHUDAction(this.actor, "prevail");
  }

  /**
   * Handle rolling a Deed from the creature sheet.
   * Delegates to the shared onDeedRoll handler for full consistency.
   */
  async _onDeedRoll(event) { return onDeedRoll(event, this); }

  /**
   * Post a deed phase to chat — delegates to the shared postDeedPhase.
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
   * Show info dialog for an effect.
   */
  async _onEffectInfo(event) {
    const li = event.currentTarget.closest("[data-item-id]");
    const itemId = li?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (item) showItemInfoDialog(item.uuid);
  }
}
