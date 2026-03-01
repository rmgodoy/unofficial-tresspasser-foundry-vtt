import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { showItemInfoDialog }  from "../dialogs/item-info-dialog.mjs";

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
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }

  /**
   * Handle rolling a prevail check for an effect/state on a creature.
   *
   * DC = min(20, 10 + netSum) where netSum is the sum of all numeric modifiers
   * on the actor that share the same target attribute, when timing, and type.
   * On success, ALL matched effects are removed.
   *
   * @param {Event} event
   */
  async _onPrevailRoll(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".effect-row");
    const itemId = li.dataset.itemId;
    const effectItem = this.actor.items.get(itemId);
    if (!effectItem) return;

    const { dc, groupIds, groupNames } =
      TrespasserEffectsHelper.getPrevailGroup(this.actor, effectItem);

    const rollBonus = this.actor.system.combat?.roll_bonus ?? this.actor.system.roll_bonus ?? 0;

    // Check for advantage on the prevail roll
    const isAdv = TrespasserEffectsHelper.hasAdvantage(this.actor, "roll_bonus") ||
                  TrespasserEffectsHelper.hasAdvantage(this.actor, "accuracy");
    const formula = isAdv ? `2d20kh + ${rollBonus}` : `1d20 + ${rollBonus}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const success = roll.total >= dc;

    const groupLabel = groupIds.length > 1
      ? `<b>${groupNames}</b>`
      : `<b>${effectItem.name}</b>`;

    const flavor = success
      ? game.i18n.format("TRESPASSER.Chat.PrevailSuccess", { name: groupNames || effectItem.name, roll: roll.total, target: dc })
      : game.i18n.format("TRESPASSER.Chat.PrevailFailed",  { name: groupNames || effectItem.name, roll: roll.total, target: dc });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavor
    });

    if (success) {
      for (const id of groupIds) {
        const item = this.actor.items.get(id);
        if (item) await item.delete();
      }
    }
  }

  /**
   * Handle rolling a Deed from the creature sheet.
   * Delegates to the same logic mapped in Character Sheet.
   * Note: The logic expects _onDeedRoll and _postDeedPhase which are currently housed inside actor-character-sheet.mjs.
   * To keep things DRY we borrow the implementation or re-implement the core rolling block.
   */
  async _onDeedRoll(event) {
    event.preventDefault();
    const el = event.currentTarget.closest("[data-item-id]");
    if (!el) return;
    const itemId = el.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const targets = Array.from(game.user.targets);
    if (targets.length === 0) {
      ui.notifications.warn("No targets selected! Roll aborted.");
      return;
    }

    const attackerAccuracy = this.actor.system.combat?.accuracy || 0;
    const effects = item.system.effects || {};
    
    // 1. Start & Before Phases
    await this._postDeedPhase("Start", effects.start, this.actor, item);
    await this._postDeedPhase("Before", effects.before, this.actor, item);

    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;

      await TrespasserEffectsHelper.triggerEffects(targetActor, "targeted");

      const statKey = item.system.accuracyTest?.toLowerCase() || "guard";
      const targetStat = targetActor.system.combat[statKey] ?? 10;
      const isTargetCreature = targetActor.type === "creature";
      
      const offset = isTargetCreature ? -10 : 0;
      const rollFormula = `1d20 + ${targetStat} + ${offset}`;
      
      const defenseRoll = new foundry.dice.Roll(rollFormula);
      await defenseRoll.evaluate();

      const d20Result = defenseRoll.dice[0].results[0].result;
      const rollTotal = defenseRoll.total;
      const isHit = attackerAccuracy >= rollTotal;
      
      // Calculate Sparks and Shadows
      const diff = attackerAccuracy - rollTotal;
      let sparks = 0;
      let shadows = 0;

      if (isHit) {
        sparks = Math.floor(diff / 5);
        if (d20Result === 1) sparks += 1; // Defender Nat 1 is great for attacker
      } else {
        shadows = Math.floor(Math.abs(diff) / 5);
        if (d20Result === 20) shadows += 1; // Defender Nat 20 is terrible for attacker (Heroic Dodge)
      }

      let accFlavor = `<div class="trespasser-chat-card">
        <h3>${game.i18n.format("TRESPASSER.Chat.AccuracyVs", { item: item.name, target: targetActor.name })}</h3>
        <p>${game.i18n.format("TRESPASSER.Chat.AccVsDef", { accuracy: attackerAccuracy, total: rollTotal })}</p>
        <p style="font-size: 10px; color: var(--trp-text-dim);">Formula: ${defenseRoll.formula} (d20: ${d20Result})</p>
        <p class="${isHit ? 'hit-text' : 'miss-text'}" style="font-size: 18px; font-weight: bold; text-align: center;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Hit") : game.i18n.localize("TRESPASSER.Chat.Miss")}</p>
        
        <div class="metrics-row" style="display:flex; gap:15px; justify-content: center; margin-top: 10px; font-weight: bold;">
          <div class="spark-metric" style="color: #64b5f6;"><i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Sparks", { count: sparks })}</div>
          <div class="shadow-metric" style="color: #9575cd;"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</div>
        </div>
      </div>`;

      await defenseRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: accFlavor
      });

      if (isHit) {
        // Build options for phases if needed
        const phaseOptions = {
          titleSuffix: ` vs ${targetActor.name}`,
          sparks: sparks
        };

        await this._postDeedPhase("Base", effects.base, this.actor, item, phaseOptions);
        await this._postDeedPhase("Hit", effects.hit, this.actor, item, phaseOptions);
        
        if (sparks > 0) {
          await this._postDeedPhase("Spark", effects.spark, this.actor, item, {
            ...phaseOptions,
            title: `Spark (x${sparks})`
          });
        }
      }
    }

    // After & End Phases (once)
    await this._postDeedPhase("After", effects.after, this.actor, item);
    await this._postDeedPhase("End", effects.end, this.actor, item);
  }

  async _postDeedPhase(phaseName, phaseData, actor, item, options = {}) {
    if (!phaseData) return;
    
    let finalEffects = [...(phaseData.appliedEffects || [])];

    if (phaseData.appliesWeaponEffects) {
      const weapon = actor.items.find(i => i.type === "weapon" && i.system.equipped);
      if (weapon && weapon.system.effects) {
        finalEffects = finalEffects.concat(weapon.system.effects);
      }
    }

    const hasDamage = phaseData.damage && phaseData.damage.trim() !== "";
    const hasEffects = finalEffects.length > 0;
    const hasDescription = phaseData.description && phaseData.description.trim() !== "";
    const title = options.title || phaseName;

    if (!hasDamage && !hasEffects && !hasDescription && !options.introText) return;

    let html = `<div class="trespasser-chat-card phase-${phaseName.toLowerCase()}" style="padding: 4px;">`;
    html += `<h4 style="margin: 0; padding-bottom: 4px; border-bottom: 1px solid var(--trp-gold-dim); font-family: var(--trp-font-header); color: var(--trp-gold-bright); text-transform: uppercase;">${title}</h4>`;

    if (options.introText) {
      html += `<div style="font-size: 13px; font-style: italic; margin-top: 4px;">${options.introText}</div>`;
    }

    if (hasDescription) {
      html += `<div style="font-size: 12px; margin-top: 6px;">${phaseData.description}</div>`;
    }

    if (hasDamage) {
      try {
        let dmgExpr = phaseData.damage;
        const skillDie = actor.system.skill_die || "d4";
        dmgExpr = dmgExpr.replace(/<sd>/gi, skillDie);

        let weaponDie = "d4";
        const eqWeapon = actor.items.find(i => i.type === "weapon" && i.system.equipped);
        if (eqWeapon && eqWeapon.system.weaponDie) {
          weaponDie = eqWeapon.system.weaponDie;
        }
        dmgExpr = dmgExpr.replace(/<wd>/gi, weaponDie);

        // Add Damage Bonus from effects
        const damageBonus = actor.system.bonuses?.damage || 0;
        if (damageBonus !== 0) {
          dmgExpr = `(${dmgExpr}) + ${damageBonus}`;
        }

        const dmgRoll = new foundry.dice.Roll(dmgExpr);
        await dmgRoll.evaluate();
        
        html += `<div style="margin-top: 8px; background: rgba(0,0,0,0.4); border: 1px solid var(--trp-gold-dim); padding: 4px; border-radius: 4px;">`;
        html += `<div style="font-size: 11px; color: var(--trp-text-dim); text-transform: uppercase;">${game.i18n.localize("TRESPASSER.Item.Damage")}</div>`;
        html += `<div style="font-size: 18px; font-weight: bold; text-align: center;">${dmgRoll.total}</div>`;
        html += `<div style="font-size: 10px; color: var(--trp-text-dim); text-align: right;" title="${dmgRoll.formula}">${dmgRoll.formula}</div>`;
        html += `</div>`;
      } catch (err) {
        console.error("Trespasser | Error rolling damage:", err);
        html += `<div style="color: red; margin-top: 5px;">Invalid damage expression: ${phaseData.damage}</div>`;
      }
    }

    if (hasEffects) {
      html += `<div style="margin-top: 8px;">`;
      html += `<div style="font-size: 11px; color: var(--trp-text-dim); text-transform: uppercase; margin-bottom: 4px;">${game.i18n.localize("TRESPASSER.Combat.States")}</div>`;
      for (const eff of finalEffects) {
        const intensity = parseInt(eff.intensity) || 0;
        const nameLabel = intensity !== 0 ? `${eff.name} ${intensity}` : eff.name;
        html += `
          <div style="display: flex; align-items: center; background: rgba(0,0,0,0.5); border: 1px solid var(--trp-gold-dim); border-radius: 3px; padding: 2px 4px; margin-bottom: 2px;">
            <img src="${eff.img}" style="width: 20px; height: 20px; border: none; margin-right: 6px;" />
            <span style="font-size: 13px; flex: 1; font-family: var(--trp-font-primary); color: var(--trp-gold-light);">${nameLabel}</span>
            <a class="apply-effect-btn" data-uuid="${eff.uuid}" data-name="${eff.name}" data-intensity="${intensity || 1}" title="Apply to Targets" style="color: var(--trp-gold-bright); cursor: pointer; padding: 0 4px;">
              <i class="fas fa-play"></i> ${game.i18n.localize("TRESPASSER.Chat.Apply")}
            </a>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;
    await foundry.documents.BaseChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor: html
    });
  }

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
