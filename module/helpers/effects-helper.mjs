import { DurationHelper } from "./duration-helper.mjs";
import { showOilDialog } from "../dialogs/oil-dialog.mjs";

/**
 * Helper class for managing Trespasser effects, states, and modifier parsing.
 */
export class TrespasserEffectsHelper {
  /**
   * Constant for effect trigger timings.
   */
  static TRIGGER_WHEN = {
    START_COMBAT: "start-of-combat",
    START_ROUND: "start-of-round",
    START_TURN: "start-of-turn",
    END_TURN: "end-of-turn",
    END_ROUND: "end-of-round",
    END_COMBAT: "end-of-combat",
    ON_FIRST_MOVE: "on-first-move",
    ON_MOVE: "on-move",
    USE: "use",
    TARGETED: "targeted",
    DAMAGE_DEALT: "damage-dealt",
    DAMAGE_RECEIVED: "damage-received",
    ON_PREVAIL: "on-prevail",
    ON_USE_DEED: "on-use-deed",
    ON_TARGETED_DEED: "on-targeted-deed",
    ON_DEED_HIT_RECEIVED: "on-deed-hit-received",
    ON_DEED_MISS_RECEIVED: "on-deed-miss-received",
    ON_DEED_HIT: "on-deed-hit",
    ON_DEED_MISS: "on-deed-miss",
    IMMEDIATE: "immediate",
    CONTINUOUS: "continuous"
  };

  /**
   * Labels for effect trigger timings.
   */
  static TRIGGER_LABELS = {
    "start-of-combat": "TRESPASSER.TriggerLabels.StartOfCombat",
    "start-of-round": "TRESPASSER.TriggerLabels.StartOfRound",
    "start-of-turn": "TRESPASSER.TriggerLabels.StartOfTurn",
    "end-of-turn": "TRESPASSER.TriggerLabels.EndOfTurn",
    "end-of-round": "TRESPASSER.TriggerLabels.EndOfRound",
    "end-of-combat": "TRESPASSER.TriggerLabels.EndOfCombat",
    "on-first-move": "TRESPASSER.TriggerLabels.OnFirstMove",
    "on-move": "TRESPASSER.TriggerLabels.OnMove",
    "use": "TRESPASSER.TriggerLabels.Use",
    "targeted": "TRESPASSER.TriggerLabels.Targeted",
    "damage-dealt": "TRESPASSER.TriggerLabels.DamageDealt",
    "damage-received": "TRESPASSER.TriggerLabels.DamageReceived",
    "on-prevail": "TRESPASSER.TriggerLabels.OnPrevail",
    "on-use-deed": "TRESPASSER.TriggerLabels.OnUseDeed",
    "on-targeted-deed": "TRESPASSER.TriggerLabels.OnTargetedDeed",
    "on-deed-hit-received": "TRESPASSER.TriggerLabels.OnDeedHitReceived",
    "on-deed-miss-received": "TRESPASSER.TriggerLabels.OnDeedMissReceived",
    "on-deed-hit": "TRESPASSER.TriggerLabels.OnDeedHit",
    "on-deed-miss": "TRESPASSER.TriggerLabels.OnDeedMiss",
    "immediate": "TRESPASSER.TriggerLabels.Immediate",
    "continuous": "TRESPASSER.TriggerLabels.Continuous"
  };

  /**
   * Constant for effect duration modes.
   */
  static DURATION_MODES = {
    INDEFINITE: "indefinite",
    COMBAT: "combat",
    ROUND: "round",
    TRIGGER: "trigger"
  };

  /**
   * Labels for effect duration modes.
   */
  static DURATION_LABELS = {
    "indefinite": "TRESPASSER.DurationLabels.Indefinite",
    "combat": "TRESPASSER.DurationLabels.Combat",
    "round": "TRESPASSER.DurationLabels.Round",
    "trigger": "TRESPASSER.DurationLabels.Trigger"
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
   * Posts or renders a standardized chat card with buttons to apply effects manually.
   * This is the system standard for situational effects from armor, weapons, or deeds.
   * @param {Object|Object[]} effects - Single effect or array of effects from item data
   * @param {Actor} actor - The source actor
   * @param {Object} options - title, description, renderOnly (returns HTML instead of creating msg)
   * @returns {Promise<string|ChatMessage>}
   */
  static async applyEffectChat(effects, actor, { title = "", description = "", renderOnly = false, bypassFilter = false } = {}) {
    if (!effects) return null;
    const effArray = Array.isArray(effects) ? effects : [effects];
    if (effArray.length === 0) return null;

    // Filter out continuous effects (they should be already applied as documents)
    const activeOnly = [];
    for (const eff of effArray) {
      if (!eff.uuid) continue;
      const source = await fromUuid(eff.uuid);
      if (!bypassFilter && source && (source.system.type === "continuous" || source.system.when === "immediate" || !source.system.when)) continue;
      activeOnly.push(eff);
    }
    if (activeOnly.length === 0) return null;

    let cardHtml = `<div class="trespasser-chat-card">`;
    if (title) cardHtml += `<h3>${title}</h3>`;
    if (description) cardHtml += `<p><em>${description}</em></p>`;

    cardHtml += `<div class="applied-effects">
      <strong>${game.i18n.localize("TRESPASSER.Chat.EffectsStates")}</strong>`;

    for (const eff of activeOnly) {
      const intensity = parseInt(eff.intensity) || 0;
      const nameLabel = intensity !== 0 ? `${eff.name} ${intensity}` : eff.name;
      cardHtml += `
        <a class="apply-effect-btn" data-uuid="${eff.uuid}" data-intensity="${intensity}">
          <img src="${eff.img}" width="20" height="20" /><span>${nameLabel}</span><i class="fas fa-hand-sparkles"></i>
        </a>`;
    }
    cardHtml += `</div></div>`;

    if (renderOnly) return cardHtml;

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardHtml
    });
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
   * @returns {Object} { combat: Array, nonCombat: Array, continuous: Array }
   */
  static getActorEffects(actor) {
    const effects = {
      combat: [],
      nonCombat: []
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

    for (const item of actor.items) {
      // Passive/Built-in effects from equipped items
      const equippableTypes = ["weapon", "armor", "accessory", "item"];
      const isEquippable = equippableTypes.includes(item.type);
      
      if (item.system.equipped && Array.isArray(item.system.effects)) {
        item.system.effects.forEach((eff, index) => {
          // If it's an equippable, we skip immediate/continuous effects because those should have been converted to real Effect documents
          if (isEquippable && (eff.type === "continuous" || eff.when === "immediate" || !eff.when)) return;

          const property = "effects";
          const effData = {
            id: `${item.id}-${property}-${index}`, // Stable Synthetic ID
            name: eff.name ? `${item.name}: ${eff.name}` : `${item.name} (${eff.type || "effect"})`,
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
            durationConditions: eff.durationConditions || [],
            durationOperator: eff.durationOperator || "OR",
            durationSummary: null, // inline effects don't have a live item; no compound summary
            intensityIncrement: eff.intensityIncrement || 0,
            property,
            index,
            isPrevailable: !!eff.isPrevailable,
            synthetic: true,
            hiddenOnSheet: isEquippable // Hide equippable-derived effects from the sheet; they trigger in chat
          };
          if (eff.isCombat) effects.combat.push(effData);
          else effects.nonCombat.push(effData);
        });
      }

      // Standalone Effect items currently on the actor
      if (item.type === "effect") {
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
          durationConditions: item.system.durationConditions || [],
          durationOperator: item.system.durationOperator || "OR",
          durationSummary: DurationHelper.formatSummary(item),
          intensityIncrement: item.system.intensityIncrement || 0,
          isPrevailable: !!item.system.isPrevailable,
          gmOnly: !!item.system.gmOnly,
          item: item,
          fromInjury
        };

        if (effData.isCombat) {
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
   * @param {string} [includeTiming] Optional timing to include (e.g. "use")
   * @returns {number}
   */
  static getAttributeBonus(actor, attributeKey, includeTiming = null) {
    if (!actor) return 0;
    const effects = this.getActorEffects(actor);
    const allEffects = [...effects.combat, ...effects.nonCombat];
    
    let total = 0;
    for (const eff of allEffects) {
      if (eff.target !== attributeKey) continue;

      // Skip on-trigger effects that have a specific trigger timing (they aren't constant bonuses)
      // UNLESS the specific timing is explicitly requested (e.g. when making a roll)
      if (eff.type === "on-trigger" && eff.when && eff.when !== "immediate" && eff.when !== includeTiming) continue;
      
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
    const allEffects = [...effects.combat, ...effects.nonCombat];

    let total = 0;
    for (const eff of allEffects) {
      if (eff.target !== attributeKey) continue;
      // Skip timed actives that haven't fired yet
      if (eff.type === "active" && eff.when && eff.when !== "immediate" && eff.when !== "continuous") continue;

      const value = await this.evaluateModifier(
        eff.modifier,
        eff.intensity || 0,
        { actor, weaponDie, toMessage }
      );
      total += value;

      // Decrement triggers-based conditions and evaluate expiry
      const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "triggers");
      if (shouldExpire) {
        if (eff.item?.type === "effect" || eff.item?.type === "state") {
          await eff.item.delete();
        }
      } else {
        await eff.item.update({ "system.durationConditions": updatedConditions });
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
    const allEffects = [...effects.combat, ...effects.nonCombat];
    
    for (const eff of allEffects) {
      if (eff.target !== attributeKey) continue;
      if (eff.modifier.toString().toLowerCase() === "adv") return true;
    }
    return false;
  }


  /**
   * Triggers automated effects on an actor based on the timing (e.g. "start-of-turn", "end-of-turn").
   * Generates a chat message and automatically applies health adjustments if applicable.
   * @param {Actor} actor
   * @param {string} timing "start-of-round", "start-of-turn", "end-of-turn", "end-of-round"
   */
  static async triggerEffects(actor, timing, { filterTarget = null } = {}) {
    if (!actor) return;
    const effects = this.getActorEffects(actor);
    const allEffects = [...effects.combat, ...effects.nonCombat];
    
    // Filter effects that match the required timing (and target if specified)
    const triggered = allEffects.filter(e => {
      const matchTiming = e.when === timing;
      const matchTarget = !filterTarget || e.target === filterTarget;
      return matchTiming && matchTarget;
    });
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

      // Process duration consumption
      const durationConditions = eff.item.system.durationConditions || [];
      const hasRoundDuration = durationConditions.some(c => c.mode === "round");
      const hasTriggerDuration = durationConditions.some(c => c.mode === "trigger");

      if (timing === "end-of-round" && hasRoundDuration) {
        const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "round");
        if (shouldExpire) await eff.item.delete();
        else await eff.item.update({ "system.durationConditions": updatedConditions });
      } else if (hasTriggerDuration) {
        const { shouldExpire, updatedConditions } = DurationHelper.processEvent(eff.item, "trigger");
        if (shouldExpire) await eff.item.delete();
        else await eff.item.update({ "system.durationConditions": updatedConditions });
      }
    }
  }

  /**
   * Dialog to apply an oil to an equipped weapon.
   * @param {Actor} actor 
   * @param {Item} oilItem 
   */
  static async applyOilDialog(actor, oilItem) {
    const equippedWeapons = actor.items.filter(i => 
      i.type === "weapon" && 
      i.system.equipped && 
      ["melee", "missile"].includes(i.system.type)
    );
    if (equippedWeapons.length === 0) {
      ui.notifications.warn("No equipped weapons to apply oil to.");
      return;
    }

    const weaponId = await showOilDialog(equippedWeapons, oilItem);
    if (!weaponId) return;

    const weapon = actor.items.get(weaponId);
    if (!weapon) return;

    const existingOilEffects = weapon.system.oilEffects || [];
    const newEffects = (oilItem.system.effects || []).map(e => ({
      ...e,
      sourceOil: oilItem.id
    }));

    await weapon.update({ "system.oilEffects": [...existingOilEffects, ...newEffects] });
    ui.notifications.info(game.i18n.format("TRESPASSER.Dialog.ApplyOil.Applied", { oil: oilItem.name, weapon: weapon.name }));
    
    // Consume oil if it's an item
    if (oilItem.system.quantity !== undefined) {
      if (oilItem.system.quantity > 1) await oilItem.update({ "system.quantity": oilItem.system.quantity - 1 });
      else await oilItem.delete();
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

    await item.delete();
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
  /**
   * Decrements "round" duration for all standalone effects on an actor.
   * @param {Actor} actor 
   */
  static async decrementRound(actor) {
    if (!actor) return;
    const effects = actor.items.filter(i => i.type === "effect");
    for (const item of effects) {
      const { shouldExpire, updatedConditions } = DurationHelper.processEvent(item, "round");
      if (shouldExpire) {
        await item.delete();
      } else {
        // Only update if round were actually decremented
        const current = DurationHelper.getConditions(item);
        const hasChanged = JSON.stringify(current) !== JSON.stringify(updatedConditions);
        if (hasChanged) {
          await item.update({ "system.durationConditions": updatedConditions });
        }
      }
    }
  }

  static async openEffectSheet(uuid, callback) {
    const doc = await fromUuid(uuid);
    if (!doc) return;
    doc.sheet._updateObject = async (_event, formData) => {
      if (callback) await callback(doc, formData);
    } 
    doc.sheet.render(true);
  }
}
