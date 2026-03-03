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
    TARGETED: "targeted",
    IMMEDIATE: "immediate",
    DAMAGE_DEALT: "damage-dealt",
    DAMAGE_RECEIVED: "damage-received",
    ON_PREVAIL: "on-prevail",
    USE_DEED: "on-use-deed",
    TARGETED_DEED: "on-targeted-deed",
    DEED_HIT_RECEIVED: "on-deed-hit-received",
    DEED_MISS_RECEIVED: "on-deed-miss-received",
    DEED_HIT: "on-deed-hit",
    DEED_MISS: "on-deed-miss",
    START_COMBAT: "start-of-combat",
    END_COMBAT: "end-of-combat"
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
    "targeted": "TRESPASSER.TriggerLabels.Targeted",
    "immediate": "TRESPASSER.TriggerLabels.Immediate",
    "damage-dealt": "TRESPASSER.TriggerLabels.DamageDealt",
    "damage-received": "TRESPASSER.TriggerLabels.DamageReceived",
    "on-prevail": "TRESPASSER.TriggerLabels.OnPrevail",
    "on-use-deed": "TRESPASSER.TriggerLabels.OnUseDeed",
    "on-targeted-deed": "TRESPASSER.TriggerLabels.OnTargetedDeed",
    "on-deed-hit-received": "TRESPASSER.TriggerLabels.OnDeedHitReceived",
    "on-deed-miss-received": "TRESPASSER.TriggerLabels.OnDeedMissReceived",
    "on-deed-hit": "TRESPASSER.TriggerLabels.OnDeedHit",
    "on-deed-miss": "TRESPASSER.TriggerLabels.OnDeedMiss",
    "start-of-combat": "TRESPASSER.TriggerLabels.StartOfCombat",
    "end-of-combat": "TRESPASSER.TriggerLabels.EndOfCombat"
  };

  /**
   * Constant for effect duration modes.
   */
  static DURATION_MODES = {
    INDEFINITE: "indefinite",
    COMBAT: "combat",
    ROUNDS: "rounds",
    TRIGGERS: "triggers"
  };

  /**
   * Labels for effect duration modes.
   */
  static DURATION_LABELS = {
    "indefinite": "TRESPASSER.DurationLabels.Indefinite",
    "combat": "TRESPASSER.DurationLabels.Combat",
    "rounds": "TRESPASSER.DurationLabels.Rounds",
    "triggers": "TRESPASSER.DurationLabels.Triggers"
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
    "focus": "TRESPASSER.Sheet.Combat.Focus",
    "action_points": "TRESPASSER.Sheet.Combat.ActionPoints",
    "combat_phase": "TRESPASSER.Sheet.Combat.Phase",
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
   * Replaces <sd> and <wd> placeholders in a formula, handling multipliers correctly.
   * If <sd> is "2d6", "2<sd>" becomes "4d6".
   * 
   * @param {string} formula The dice formula (e.g., "2<sd> + 5")
   * @param {Actor} actor The actor providing the skill die
   * @param {string} [weaponDie] Optional weapon die override
   * @returns {string} The resolved formula
   */
  static replacePlaceholders(formula, actor, weaponDie = "d4") {
    if (!formula) return "";
    let resolved = formula;
    
    const sd = actor?.system?.skill_die || "d6";
    const wd = weaponDie || "d4";

    const multiplyDice = (expression, factor) => {
        let fullExpr = /^\d/.test(expression) ? expression : `1${expression}`;
        const match = fullExpr.match(/^(\d+)(d\d+.*)$/i);
        if (!match) return expression;
        const count = parseInt(match[1]) * factor;
        return `${count}${match[2]}`;
    };

    const placeholderRegex = /(\d*)<(sd|wd)>/gi;
    resolved = resolved.replace(placeholderRegex, (match, factorStr, type) => {
        const factor = factorStr === "" ? 1 : parseInt(factorStr);
        const diceExpr = (type.toLowerCase() === "sd") ? sd : wd;
        return multiplyDice(diceExpr, factor);
    });

    return resolved;
  }

  /**
   * Evaluates a modifier string, replacing <Int> and rolling any dice formulas.
   * @param {string} modifierString 
   * @param {number} intensity 
   * @param {Object} [options] 
   * @param {Actor} [options.actor] Optional actor for roll data
   * @param {boolean} [options.toMessage] Whether to post the roll to chat
   * @returns {Promise<number|Roll>}
   */
  static async evaluateModifier(modifierString, intensity, { actor = null, toMessage = false, weaponDie = null, returnRoll = false } = {}) {
    let parsed = this.parseModifier(modifierString, intensity);

    // Resolve <sd> (skill die) and <wd> (weapon die) tokens dynamically
    parsed = this.replacePlaceholders(parsed, actor, weaponDie);
    
    // 2. Handle max(...) and min(...) functions recursively
    // Regex matches max(args) or min(args) where args don't contain other parentheses
    const mathRegex = /(max|min)\(([^()]+)\)/gi;
    while (mathRegex.test(parsed)) {
      parsed = await this._asyncStringReplace(parsed, mathRegex, async (match, func, args) => {
        const values = args.split(',').map(arg => arg.trim());
        const resolvedValues = await Promise.all(values.map(val => 
          this.evaluateModifier(val, intensity, { actor, toMessage: false, weaponDie })
        ));
        
        if (func.toLowerCase() === 'max') {
          return Math.max(...resolvedValues).toString();
        } else {
          return Math.min(...resolvedValues).toString();
        }
      });
    }

    // 3. Evaluate the remaining formula
    // Check if it looks like a dice formula (has 'd' and numbers) or basic math
    const isFormula = /[0-9]*d[0-9]+|[\+\-\*\/\(\)]/.test(parsed);
    
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
    
    if (returnRoll) return roll;
    return roll.total;
  }

  /**
   * Helper for asynchronous string replacement with regex.
   * @private
   */
  static async _asyncStringReplace(str, regex, replacer) {
    const matches = [];
    str.replace(regex, (...args) => {
      matches.push(args);
      return args[0];
    });

    let offset = 0;
    for (const match of matches) {
      const replacement = await replacer(...match);
      const matchIndex = match[match.length - 2];
      const matchString = match[0];
      
      str = str.slice(0, matchIndex + offset) + replacement + str.slice(matchIndex + matchString.length + offset);
      offset += replacement.length - matchString.length;
    }
    return str;
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
        item.system.effects.forEach((eff, index) => {
          const property = "effects";
          const effData = {
            id: `${item.id}-${property}-${index}`, // Stable Synthetic ID
            name: `${item.name} (${eff.type || "effect"})`,
            intensity: eff.intensity || 0,
            modifier: this.parseModifier(eff.modifier, eff.intensity || 0),
            target: eff.target,
            isCombat: eff.isCombat,
            isOnlyReminder: !!eff.isOnlyReminder,
            gmOnly: !!eff.gmOnly,
            type: eff.type,
            description: eff.description || "",
            source: item.name,
            itemId: item.id,
            item: item,
            when: eff.when,
            duration: eff.duration || "indefinite",
            durationValue: eff.durationValue || 0,
            intensityIncrement: eff.intensityIncrement || 0,
            property,
            index
          };
          if (eff.isCombat) effects.combat.push(effData);
          else effects.nonCombat.push(effData);
        });
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
          isOnlyReminder: item.system.isOnlyReminder,
          type: item.system.type,
          description: item.system.description,
          source: item.name,
          sourceName,
          when: item.system.when,
          duration: item.system.duration || "indefinite",
          durationValue: item.system.durationValue || 0,
          intensityIncrement: item.system.intensityIncrement || 0,
          item: item,
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

      // Decrement triggers for bonuses used here
      if (eff.duration === "triggers") {
        const remaining = (eff.durationValue || 0) - 1;
        if (remaining <= 0) {
          await eff.item.delete();
        } else {
          await eff.item.update({ "system.durationValue": remaining });
        }
      }
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
   * Shows a dialog to create or edit an effect object.

   * @param {Object} effectData Existing data or empty object
   * @returns {Promise<Object|null>} The updated effect data or null if cancelled
   */
  static async showEffectDialog(effectData = {}) {
    const isCombat   = effectData.isCombat ?? false;
    const type = effectData.type ?? "active";
    const intensity  = effectData.intensity ?? 0;
    const increment  = effectData.intensityIncrement ?? 0;
    const target     = effectData.targetAttribute || effectData.target || "health";
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
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.isOnlyReminder")}</label>
            <input type="checkbox" id="eff-isOnlyReminder" ${effectData.isOnlyReminder ? "checked" : ""} />
          </div>
          <div class="field-row" id="gm-only-row" style="${effectData.isOnlyReminder ? "" : "display:none;"}">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.gmOnly")}</label>
            <input type="checkbox" id="eff-gmOnly" ${effectData.gmOnly ? "checked" : ""} />
          </div>
          <script>
            document.getElementById('eff-isOnlyReminder').addEventListener('change', (e) => {
              document.getElementById('gm-only-row').style.display = e.target.checked ? '' : 'none';
            });
          </script>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Dialog.EffectEditor.Intensity")}</label>
            <input type="number" id="eff-intensity" value="${intensity}" />
          </div>
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Item.intensityIncrement")}</label>
            <input type="number" id="eff-intensityIncrement" value="${increment}" />
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
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Item.duration")}</label>
            <select id="eff-duration">
              ${Object.entries(this.DURATION_LABELS).map(([k, v]) => `<option value="${k}" ${(effectData.duration || "indefinite") === k ? "selected" : ""}>${game.i18n.localize(v)}</option>`).join("")}
            </select>
          </div>
          <div class="field-row" id="duration-value-row" style="${(effectData.duration === 'rounds' || effectData.duration === 'triggers') ? '' : 'display:none;'}">
            <label id="eff-duration-label">${effectData.duration === 'triggers' ? game.i18n.localize("TRESPASSER.DurationLabels.Triggers") : game.i18n.localize("TRESPASSER.DurationLabels.Rounds")}</label>
            <input type="number" id="eff-durationValue" value="${effectData.durationValue || 0}" />
          </div>
          <script>
            document.getElementById('eff-duration').addEventListener('change', (e) => {
              const row = document.getElementById('duration-value-row');
              const label = document.getElementById('eff-duration-label');
              const show = (e.target.value === 'rounds' || e.target.value === 'triggers');
              row.style.display = show ? "" : "none";
              if (show) {
                label.innerText = (e.target.value === 'triggers') 
                  ? "${game.i18n.localize("TRESPASSER.DurationLabels.Triggers")}"
                  : "${game.i18n.localize("TRESPASSER.DurationLabels.Rounds")}";
              }
            });
          </script>
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
                isOnlyReminder: html.find("#eff-isOnlyReminder").is(":checked"),
                gmOnly: html.find("#eff-gmOnly").is(":checked"),
                intensity: parseInt(html.find("#eff-intensity").val()) || 0,
                intensityIncrement: parseInt(html.find("#eff-intensityIncrement").val()) || 0,
                target: html.find("#eff-target").val(),
                modifier: html.find("#eff-modifier").val(),
                when: html.find("#eff-when").val(),
                duration: html.find("#eff-duration").val(),
                durationValue: parseInt(html.find("#eff-durationValue").val()) || 0
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
      const label = this.TRIGGER_LABELS[timing] || timing;
      
      // Title format: [Effect] [Int.]
      const title = `${eff.name} [${eff.intensity}]`;
      
      let flavor = `<div class="trespasser-chat-card">
        <h3>${title}</h3>
        <p style="font-style: italic;">${game.i18n.format("TRESPASSER.Trigger.TriggeredAt", { label: game.i18n.localize(label) })}</p>`;

      if (eff.isOnlyReminder) {
        // Only show text if it exists
        if (eff.description) {
          flavor += `<div class="reminder-text">${eff.description}</div>`;
        }
      } else {
        const roll = await this.evaluateModifier(eff.modifier, eff.intensity || 0, { actor, toMessage: false, returnRoll: true });
        const modValue = typeof roll === "number" ? roll : roll.total;
        
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
        } else if (eff.target === "focus") {
          flavor += await TrespasserEffectsHelper.updateFocus(actor, modValue);
        } else if (eff.target === "action_points") {
          flavor += await TrespasserEffectsHelper.updateActionPoints(actor, modValue);
        } else if (eff.target === "combat_phase") {
          flavor += await TrespasserEffectsHelper.updateCombatPhase(actor, modValue);
        } else {
          const targetLabel = game.i18n.localize(this.TARGET_ATTRIBUTES[eff.target]) || eff.target;
          flavor += `<p>${game.i18n.format("TRESPASSER.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
        }

        // Add the rendered roll if it was a dice roll
        if (roll instanceof foundry.dice.Roll) {
          flavor += await roll.render();
        }
      }
      
      flavor += `</div>`;

      const chatData = {
        speaker: ChatMessage.getSpeaker({ actor }),
        content: flavor
      };

      if (eff.gmOnly) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
      }

      await ChatMessage.create(chatData);

      // Apply intensity increment after triggering
      const currentIntensity = eff.intensity || 0;
      const increment = eff.intensityIncrement || 0;
      if (increment !== 0) {
        await eff.item.update({ "system.intensity": currentIntensity + increment });
      }

      // Handle triggers-based duration
      if (eff.duration === "triggers") {
        const remaining = (eff.durationValue || 0) - 1;
        if (remaining <= 0) {
          await eff.item.delete();
        } else {
          await eff.item.update({ "system.durationValue": remaining });
        }
      }
    }
  }

  /**
   * Triggers a single effect item immediately.
   * @param {Actor} actor 
   * @param {Item} item 
   */
  static async triggerImmediate(actor, item) {
    if (!actor || !item) return;
    
    // Ensure it's an effect or state and has immediate timing
    const when = item.system.when || item.system.triggerWhen;
    if (when !== "immediate") return;

    const target = item.system.targetAttribute || item.system.target;
    const intensity = item.system.intensity || 0;
    const modifier = item.system.modifier;

    const label = this.TRIGGER_LABELS["immediate"] || "immediate";
    const title = `${item.name} [${intensity}]`;

    let flavor = `<div class="trespasser-chat-card">
      <h3>${title}</h3>
      <p style="font-style: italic;">${game.i18n.format("TRESPASSER.Trigger.TriggeredAt", { label: game.i18n.localize(label) })}</p>`;

    if (item.system.isOnlyReminder) {
      if (item.system.description) {
        flavor += `<div class="reminder-text">${item.system.description}</div>`;
      }
    } else {
      const roll = await this.evaluateModifier(modifier, intensity, { actor, toMessage: false, returnRoll: true });
      const modValue = typeof roll === "number" ? roll : roll.total;

      if (target === "health") {
        const newHP = Math.clamp(actor.system.health + modValue, 0, actor.system.max_health);
        await actor.update({ "system.health": newHP });
        if (modValue > 0) flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Trigger.HealthRecovered", { value: modValue })}</p>`;
        else if (modValue < 0) flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Trigger.HealthLost", { value: Math.abs(modValue) })}</p>`;
        else flavor += `<p>${game.i18n.localize("TRESPASSER.Trigger.HealthUnaffected")}</p>`;
      } 
      else if (target === "focus") flavor += await TrespasserEffectsHelper.updateFocus(actor, modValue);
      else if (target === "action_points") flavor += await TrespasserEffectsHelper.updateActionPoints(actor, modValue);
      else if (target === "combat_phase") flavor += await TrespasserEffectsHelper.updateCombatPhase(actor, modValue);
      else {
        const targetLabel = game.i18n.localize(this.TARGET_ATTRIBUTES[target]) || target;
        flavor += `<p>${game.i18n.format("TRESPASSER.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
      }

      if (roll instanceof foundry.dice.Roll) flavor += await roll.render();
    }

    flavor += `</div>`;

    const chatData = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content: flavor
    };
    if (item.system.gmOnly) chatData.whisper = ChatMessage.getWhisperRecipients("GM");

    await ChatMessage.create(chatData);

    // Apply intensity increment
    const increment = item.system.intensityIncrement || 0;
    if (increment !== 0) {
      await item.update({ "system.intensity": intensity + increment });
    }

    // Handle triggers-based duration
    if (item.system.duration === "triggers") {
      const remaining = (item.system.durationValue || 0) - 1;
      if (remaining <= 0) await item.delete();
      else await item.update({ "system.durationValue": remaining });
    }
  }

  /**
   * Updates the focus of an actor.
   * @param {Actor} actor
   * @param {number} modValue
   * @returns {string} The flavor text to be added to the chat message.
   */
  static async updateFocus(actor, modValue) {
    const currentFocus = actor.system.combat?.focus ?? null;
    let flavor = '';
    if (currentFocus !== null) {
      const newFocus = Math.max(0, currentFocus + modValue);
      await actor.update({ "system.combat.focus": newFocus });

      if (modValue > 0) {
        flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Trigger.FocusRecovered", { value: modValue })}</p>`;
      } else if (modValue < 0) {
        flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Trigger.FocusLost", { value: Math.abs(modValue) })}</p>`;
      } else {
        flavor += `<p>${game.i18n.localize("TRESPASSER.Trigger.FocusUnaffected")}</p>`;
      }
    } else {
      const targetLabel = game.i18n.localize(this.TARGET_ATTRIBUTES["focus"]) || "focus";
      flavor += `<p>${game.i18n.format("TRESPASSER.Trigger.ModifierGenerated", { value: modValue, target: targetLabel })}</p>`;
    }
    return flavor;
  }

  /**
   * Updates the action points of an actor.
   * @param {Actor} actor
   * @param {number} modValue
   * @returns {string} The flavor text to be added to the chat message.
   */
  static async updateActionPoints(actor, modValue) {
    let flavor = '';
    if (game.combat) {
      const combatant = game.combat.combatants.find(c => c.actorId === actor.id);
      if (combatant) {
        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
        const newAP = Math.max(0, currentAP + modValue);
        await combatant.setFlag("trespasser", "actionPoints", newAP);
        
        if (modValue > 0) {
          flavor += `<p class="hit-text">${game.i18n.format("TRESPASSER.Trigger.APGained", { value: modValue })}</p>`;
        } else if (modValue < 0) {
          flavor += `<p class="miss-text">${game.i18n.format("TRESPASSER.Trigger.APLost", { value: Math.abs(modValue) })}</p>`;
        }
      }
    }
    return flavor;
  }

  /**
   * Updates the combat phase of an actor.
   * @param {Actor} actor
   * @param {number} modValue
   * @returns {string} The flavor text to be added to the chat message.
   */
  static async updateCombatPhase(actor, modValue) {
    let flavor = '';
    if (game.combat) {
      const combatant = game.combat.combatants.find(c => c.actorId === actor.id);
      if (combatant) {
        const phaseValues = [40, 30, 20, 10, 0];
        const closestPhase = phaseValues.reduce((prev, curr) => 
          Math.abs(curr - modValue) < Math.abs(prev - modValue) ? curr : prev
        );
        
        await combatant.update({ initiative: closestPhase });
        
        if (game.combat?.verifyPhaseAdvancement) {
          await game.combat.verifyPhaseAdvancement();
        }

        const combatClass = CONFIG.Combat.documentClass;
        let phaseLabel = closestPhase;
        if (combatClass && combatClass.PHASE_LABELS) {
          phaseLabel = game.i18n.localize(combatClass.PHASE_LABELS[closestPhase]) || closestPhase;
        }
        
        flavor += `<p>${game.i18n.format("TRESPASSER.Trigger.PhaseChanged", { phase: phaseLabel })}</p>`;
      }
    }
    return flavor;
  }
}
