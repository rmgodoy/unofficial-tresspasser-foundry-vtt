/**
 * Helper class for managing Trespasser effects, states, and modifier parsing.
 */
export class TrespasserEffectsHelper {
  /**
   * Constant for effect trigger timings.
   */
  static TRIGGER_WHEN = {
    START_ROUND: "start-of-round",
    START_TURN: "start-of-turn",
    END_TURN: "end-of-turn",
    END_ROUND: "end-of-round",
    ON_MOVE: "on-move",
    USE: "use",
    IMMEDIATE: "immediate"
  };

  /**
   * Labels for effect trigger timings.
   */
  static TRIGGER_LABELS = {
    "start-of-round": "TRESPASSER.TriggerLabels.StartOfRound",
    "start-of-turn": "TRESPASSER.TriggerLabels.StartOfTurn",
    "end-of-turn": "TRESPASSER.TriggerLabels.EndOfTurn",
    "end-of-round": "TRESPASSER.TriggerLabels.EndOfRound",
    "on-move": "TRESPASSER.TriggerLabels.OnMove",
    "use": "TRESPASSER.TriggerLabels.Use",
    "immediate": "TRESPASSER.TriggerLabels.Immediate"
  };

  /**
   * Constant for target attributes.
   */
  static TARGET_ATTRIBUTES = {
    "mighty": "TRESPASSER.Sheet.Attributes.Mighty",
    "agility": "TRESPASSER.Sheet.Attributes.Agility",
    "intellect": "TRESPASSER.Sheet.Attributes.Intellect",
    "spirit": "TRESPASSER.Sheet.Attributes.Spirit",
    "initiative": "TRESPASSER.Sheet.Combat.Initiative",
    "accuracy": "TRESPASSER.Sheet.Combat.Accuracy",
    "guard": "TRESPASSER.Sheet.Combat.Guard",
    "resist": "TRESPASSER.Sheet.Combat.Resist",
    "prevail": "TRESPASSER.Sheet.Combat.Prevail",
    "tenacity": "TRESPASSER.Sheet.Combat.Tenacity",
    "speed": "TRESPASSER.Sheet.Combat.Speed",
    "armor": "TRESPASSER.Sheet.Equipments.Armor",
    "health": "TRESPASSER.Sheet.Effects.CurrentHealth",
    "max_health": "TRESPASSER.Sheet.Effects.MaxHealth",
    "damage_dealt": "TRESPASSER.Item.DamageDealt",
    "damage_received": "TRESPASSER.Item.DamageReceived"
  };

  /**
   * Replaces the <Int> placeholder in a string with the provided intensity value.
   * @param {string} modifierString 
   * @param {number} intensity 
   * @returns {string}
   */
  static parseModifier(modifierString, intensity) {
    if (!modifierString) return "0";
    return modifierString.toString().replace(/<Int>/g, intensity.toString());
  }

  /**
   * Evaluates a modifier string, replacing <Int> and rolling any dice formulas.
   * @param {string} modifierString 
   * @param {number} intensity 
   * @param {Object} [options] 
   * @param {Actor} [options.actor] Optional actor for roll data
   * @param {boolean} [options.toMessage] Whether to post the roll to chat
   * @returns {Promise<number>}
   */
  static async evaluateModifier(modifierString, intensity, { actor = null, toMessage = false, weaponDie = null } = {}) {
    let parsed = this.parseModifier(modifierString, intensity);

    // Resolve <sd> (skill die) and <wd> (weapon die) tokens dynamically
    if (actor) {
      const skillDie = actor.system?.skill_die || "d6";
      parsed = parsed.replace(/<sd>/gi, skillDie);
    } else {
      parsed = parsed.replace(/<sd>/gi, "d6"); // safe fallback
    }
    const wd = weaponDie || "d4";
    parsed = parsed.replace(/<wd>/gi, wd);
    
    // Check if it looks like a dice formula (has 'd' and numbers)
    const isFormula = /[0-9]*d[0-9]+/.test(parsed);
    
    if (!isFormula) {
      return parseFloat(parsed) || 0;
    }

    // It's a formula, roll it
    const roll = new foundry.dice.Roll(parsed, actor?.getRollData() || {});
    await roll.evaluate();
    
    if (toMessage) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: game.i18n.localize("TRESPASSER.Trigger.EffectEvaluation")
      });
    }
    
    return roll.total;
  }

  /**
   * Aggregates all active effects (Combat and Non-Combat) from an actor.
   * @param {Actor} actor 
   * @returns {Object} { combat: Array, nonCombat: Array, passive: Array }
   */
  static getActorEffects(actor) {
    const effects = {
      combat: [],
      nonCombat: [],
      passive: []
    };

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

    // 1. Gather effects from items (e.g., Armor effects)
    for (const item of actor.items) {
      // Passive/Built-in effects from equipped items
      if (item.system.equipped && Array.isArray(item.system.effects)) {
        for (const eff of item.system.effects) {
          const effData = {
            id: `${item.id}-${effects.combat.length + effects.nonCombat.length}`, // Synthetic ID
            name: `${item.name} (${eff.type || "effect"})`,
            intensity: eff.intensity || 0,
            modifier: this.parseModifier(eff.modifier, eff.intensity || 0),
            target: eff.target,
            isCombat: eff.isCombat,
            type: eff.type,
            source: item.name,
            itemId: item.id,
            when: eff.when
          };

          if (eff.isCombat) {
            effects.combat.push(effData);
          } else {
            effects.nonCombat.push(effData);
          }
        }
      }

      // Standalone Effect/State items currently on the actor
      if (item.type === "effect" || item.type === "state") {
        const linkedUuid  = item.flags?.trespasser?.linkedSource;
        const fromInjury  = item.flags?.trespasser?.fromInjury === true;
        const injuryId    = item.flags?.trespasser?.injuryId;

        // Resolve source name: injury name takes priority, then the UUID source map
        let sourceName = null;
        if (fromInjury && injuryId) {
          const injuryItem = actor.items.get(injuryId);
          sourceName = injuryItem ? injuryItem.name : null;
        } else if (linkedUuid) {
          sourceName = sourceMapByUuid[linkedUuid] ?? null;
        }

        const effData = {
          id: item.id,
          name: item.name,
          intensity: item.system.intensity || 0,
          modifier: this.parseModifier(item.system.modifier, item.system.intensity || 0),
          target: item.system.targetAttribute,
          isCombat: item.system.isCombat,
          type: item.system.type,
          source: item.name,
          sourceName,
          when: item.system.when,
          fromInjury
        };

        if (item.system.isCombat) {
          effects.combat.push(effData);
        } else {
          effects.nonCombat.push(effData);
        }
      }
    }

    return effects;
  }

  /**
   * Calculates the total numeric bonus for a specific attribute from all active effects.
   * @param {Actor} actor 
   * @param {string} attributeKey 
   * @returns {number}
   */
  static getAttributeBonus(actor, attributeKey) {
    if (!actor) return 0;
    const effects = this.getActorEffects(actor);
    const allEffects = [...effects.combat, ...effects.nonCombat, ...effects.passive];
    
    let total = 0;
    for (const eff of allEffects) {
      if (eff.target !== attributeKey) continue;

      // Skip active effects that have a specific trigger timing (they aren't constant bonuses)
      if (eff.type === "active" && eff.when && eff.when !== "immediate") continue;
      
      // Parse numeric modifier, ignoring dice formulas for static calculation
      const modStr = eff.modifier.toString().replace("+", "").trim();
      const value = parseFloat(modStr);
      if (!isNaN(value)) {
        total += value;
      }
    }
    return total;
  }

  /**
   * Asynchronously evaluates all modifiers for a damage attribute key (damage_dealt / damage_received),
   * rolling any dice expressions and resolving <sd> / <wd> tokens from the actor's current state.
   *
   * @param {Actor}  actor
   * @param {string} attributeKey  "damage_dealt" or "damage_received"
   * @param {string} [weaponDie]   Weapon die string (e.g. "d6"). Defaults to "d4" when not provided.
   * @returns {Promise<number>}    Summed total (may be negative for damage_received reductions)
   */
  static async evaluateDamageBonus(actor, attributeKey, weaponDie = "d4", { toMessage = true } = {}) {
    if (!actor) return 0;
    const effects = this.getActorEffects(actor);
    const allEffects = [...effects.combat, ...effects.nonCombat, ...effects.passive];

    let total = 0;
    for (const eff of allEffects) {
      if (eff.target !== attributeKey) continue;
      // Skip timed actives that haven't fired yet
      if (eff.type === "active" && eff.when && eff.when !== "immediate") continue;

      const value = await this.evaluateModifier(
        eff.modifier,
        eff.intensity || 0,
        { actor, weaponDie, toMessage }
      );
      total += value;
    }
    return total;
  }

  /**
   * Checks if any active effect provides advantage ('adv') for a specific attribute.
   * @param {Actor} actor 
   * @param {string} attributeKey 
   * @returns {boolean}
   */
  static hasAdvantage(actor, attributeKey) {
    if (!actor) return false;
    const effects = this.getActorEffects(actor);
    const allEffects = [...effects.combat, ...effects.nonCombat, ...effects.passive];
    
    for (const eff of allEffects) {
      if (eff.target !== attributeKey) continue;
      if (eff.modifier.toString().toLowerCase() === "adv") return true;
    }
    return false;
  }

  /**
   * For a given clicked effect item, collect every standalone effect/state item on the actor
   * that belongs to the same "prevail group" — same targetAttribute, same `when` timing,
   * same effect type (active/passive) — and is NOT from an injury.
   *
   * DC = min(20, 10 + netSum)  where netSum = sum of all numeric modifiers in the group.
   *
   * @param {Actor} actor
   * @param {Item}  clickedItem  The effect/state the Prevail button was clicked on
   * @returns {{ dc: number, groupIds: string[], groupNames: string, netSum: number }}
   */
  static getPrevailGroup(actor, clickedItem) {
    const sys        = clickedItem.system;
    const targetAttr = sys.targetAttribute;
    const whenCond   = sys.when;
    const typeKey    = sys.type;

    const group = actor.items.filter(i => {
      if (i.type !== "effect" && i.type !== "state") return false;
      if (i.flags?.trespasser?.fromInjury)            return false;
      const s = i.system;
      return s.targetAttribute === targetAttr &&
             s.when            === whenCond   &&
             s.type            === typeKey;
    });

    // Sum numeric modifiers, replacing <Int> with the item's intensity first
    let netSum = 0;
    for (const item of group) {
      const parsed = this.parseModifier(item.system.modifier, item.system.intensity || 0);
      const n = parseFloat(parsed.toString().replace("+", "").trim());
      if (!isNaN(n)) netSum += n;
    }

    const dc         = Math.min(20, Math.round(10 + netSum));
    const groupIds   = group.map(i => i.id);
    const groupNames = group.map(i => i.name).join(", ");

    return { dc, groupIds, groupNames, netSum };
  }

  /**
   * Shows a dialog to create or edit an effect object.

   * @param {Object} effectData Existing data or empty object
   * @returns {Promise<Object|null>} The updated effect data or null if cancelled
   */
  static async showEffectDialog(effectData = {}) {
    const isCombat = effectData.isCombat ?? true;
    const type = effectData.type ?? "active";
    const intensity = effectData.intensity ?? 1;
    const target = effectData.target ?? "health";
    const modifier = effectData.modifier ?? "0";
    const when = effectData.when ?? "immediate";

    const content = `
      <div class="dialog-content">
        <div class="details-grid">
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Type")}</label>
            <select id="eff-type">
              <option value="active" ${type === "active" ? "selected" : ""}>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Active")}</option>
              <option value="passive" ${type === "passive" ? "selected" : ""}>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Passive")}</option>
            </select>
          </div>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.IsCombat")}</label>
            <input type="checkbox" id="eff-isCombat" ${isCombat ? "checked" : ""} />
          </div>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Intensity")}</label>
            <input type="number" id="eff-intensity" value="${intensity}" />
          </div>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.TargetAttr")}</label>
            <select id="eff-target">
              ${Object.entries(this.TARGET_ATTRIBUTES).map(([k, v]) => `<option value="${k}" ${target === k ? "selected" : ""}>${game.i18n.localize(v)}</option>`).join("")}
            </select>
          </div>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Modifier")}</label>
            <input type="text" id="eff-modifier" value="${modifier}" placeholder="${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.ModifierPlaceholder")}" />
          </div>
          <p class="notes">${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.IntensityNote")}</p>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.TriggerWhen")}</label>
            <select id="eff-when">
              ${Object.entries(this.TRIGGER_LABELS).map(([v, label]) => `<option value="${v}" ${when === v ? "selected" : ""}>${game.i18n.localize(label)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      new Dialog({
        title: game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Title"),
        content: content,
        buttons: {
          ok: {
            label: game.i18n.localize("TRESPASSER.Dialog.General.Save"),
            callback: (html) => {
              resolve({
                type: html.find("#eff-type").val(),
                isCombat: html.find("#eff-isCombat").is(":checked"),
                intensity: parseInt(html.find("#eff-intensity").val()) || 1,
                target: html.find("#eff-target").val(),
                modifier: html.find("#eff-modifier").val(),
                when: html.find("#eff-when").val()
              });
            }
          },
          cancel: {
            label: game.i18n.localize("TRESPASSER.Dialog.Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }, { classes: ["trespasser", "dialog"] }).render(true);
    });
  }

  /**
   * Triggers automated effects on an actor based on the timing (e.g. "start-of-turn", "end-of-turn").
   * Generates a chat message and automatically applies health adjustments if applicable.
   * @param {Actor} actor
   * @param {string} timing "start-of-round", "start-of-turn", "end-of-turn", "end-of-round"
   */
  static async triggerEffects(actor, timing) {
    if (!actor) return;
    const effects = this.getActorEffects(actor);
    const allEffects = [...effects.combat, ...effects.nonCombat, ...effects.passive];
    
    // Filter effects that match the required timing
    const triggered = allEffects.filter(e => e.when === timing);
    if (triggered.length === 0) return;

    for (const eff of triggered) {
      const modValue = await this.evaluateModifier(eff.modifier, eff.intensity || 0, { actor, toMessage: false });
      const label = this.TRIGGER_LABELS[timing] || timing;
      
      let flavor = `<div class="trespasser-chat-card">
        <h3>${actor.name} — ${eff.name}</h3>
        <p style="font-style: italic;">${game.i18n.format("TRESPASSER.Trigger.TriggeredAt", { label: game.i18n.localize(label) })}</p>`;

      if (eff.target === "health") {
        const newHP = Math.clamp(actor.system.health + modValue, 0, actor.system.max_health);
        await actor.update({ "system.health": newHP });
        
        if (modValue > 0) {
          flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Trigger.HealthRecovered", { value: modValue })}</p>`;
        } else if (modValue < 0) {
          flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Trigger.HealthLost", { value: Math.abs(modValue) })}</p>`;
        } else {
          flavor += `<p>${game.i18n.localize("TRESPASSER.Trigger.HealthUnaffected")}</p>`;
        }
      } else {
        const targetLabel = game.i18n.localize(this.TARGET_ATTRIBUTES[eff.target]) || eff.target;
        flavor += `<p>${game.i18n.format("TRESPASSER.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
      }
      
      flavor += `</div>`;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: flavor
      });
    }
  }
}
