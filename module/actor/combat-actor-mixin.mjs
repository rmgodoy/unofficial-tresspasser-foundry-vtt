import { actorEventBus } from "./actor-event-bus.mjs";
import { isSunken } from "../helpers/elevation-helper.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { onItemConsume as handleItemConsume, executePrevailRoll } from "./actor-actions.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Mixin injecting unified combat actions and observability hooks into Actor classes.
 * All actions (damage, healing, rolling, movement, deeds) route through here and emit to actorEventBus.
 *
 * @template {new (...args: any[]) => any} T
 * @param {T} BaseClass
 */
export function CombatActorMixin(BaseClass) {
  return class extends BaseClass {

    /**
     * Whether this actor participates in standard combat mechanics.
     * True for character, commoner, companion, and creature.
     * @type {boolean}
     */
    get _isCombatant() {
      return ["character", "commoner", "companion", "creature"].includes(this.type);
    }

    /**
     * Build standard event payload.
     * @param {string} type
     * @param {number} [amount=0]
     * @param {object} [options={}]
     * @returns {object}
     * @private
     */
    _buildCombatEvent(type, amount = 0, options = {}) {
      const token = this.getActiveTokens?.(true, true)?.[0] || this.token;
      const sourceActor = options.sourceActor || (options.sourceActorId ? game.actors?.get(options.sourceActorId) : null);
      const sourceItem = options.sourceItem || (options.sourceItemId ? this.items?.get(options.sourceItemId) : null);

      return {
        actor: this,
        token,
        type,
        amount: Number(amount) || 0,
        source: sourceActor || sourceItem || this,
        sourceActor,
        sourceItem,
        data: { ...options },
        modifiers: [],
        deferredActions: [],
        preventDefault: false
      };
    }

    /**
     * Execute observers and deferred actions after state mutation.
     * @param {object} event
     * @param {string|null} [observerEventName]
     * @private
     */
    async _executePostAction(event, observerEventName = null) {
      if (observerEventName) {
        await actorEventBus.runObservers(observerEventName, event);
      }
      for (const action of event.deferredActions || []) {
        if (typeof action === "function") {
          try {
            await action();
          } catch (err) {
            console.error("CombatActorMixin | Error executing deferred action:", err);
          }
        }
      }
      event.deferredActions = [];
    }

    /**
     * Dispatch an event through middleware, observers, and deferred actions.
     * @param {string} eventName
     * @param {object} event
     * @returns {Promise<boolean>} False if prevented by middleware, true otherwise
     * @private
     */
    async _dispatchCombatEvent(eventName, event) {
      await actorEventBus.runMiddleware(eventName, event);
      if (event.preventDefault) return false;
      await this._executePostAction(event, eventName);
      return true;
    }

    /**
     * Apply damage to this actor with dual-phase event bus lifecycle.
     * @param {number} amount
     * @param {object} [options]
     * @returns {Promise<object|number>} Result with health, appliedDamage, rawHP
     */
    async applyDamage(amount, options = {}) {
      let damageNum = Math.max(0, Number(amount) || 0);
      const currentHealth = this.system.health ?? this.system.hp?.value ?? this.system.hp ?? 0;
      if (damageNum <= 0) return { health: currentHealth, appliedDamage: 0, rawHP: currentHealth, valueOf() { return this.health; } };

      const isImmune = TrespasserEffectsHelper.hasActorFlagOrEffect(this, "immuneToDamage");
      if (isImmune) {
        if (!options.silent && !options.skipBelowZeroChat) {
          ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Combat.ImmuneToDamage", { name: this.name }));
        }
        return { health: currentHealth, appliedDamage: 0, rawHP: currentHealth, isImmune: true, event: null, valueOf() { return this.health; } };
      }

      const event = this._buildCombatEvent(options.type || "damage", damageNum, options);

      await actorEventBus.runMiddleware("damage-received", event);
      if (event.preventDefault) {
        await this._executePostAction(event, "damage-received", null);
        return { health: this.system?.health ?? currentHealth, appliedDamage: 0, rawHP: currentHealth, event, valueOf() { return this.health; } };
      }

      damageNum = Math.max(0, Number(event.amount) || 0);
      let rawHealth = currentHealth;

      if (damageNum > 0) {
        if (isSunken(this) && !options.isPreHalved && !event.data.isPreHalved) {
          damageNum = Math.floor(damageNum / 2);
        }
        if (damageNum > 0) {
          rawHealth = currentHealth - damageNum;
          await this.update({ "system.health": rawHealth }, options);
        }
      }

      await this._executePostAction(event, "damage-received");
      if (event.sourceActor) {
        const dealtEvent = { ...event, actor: event.sourceActor, targetActor: this };
        await this._executePostAction(dealtEvent, "damage-dealt");
      }

      const finalHealth = this.system.health ?? Math.max(0, rawHealth);
      return { health: finalHealth, appliedDamage: damageNum, rawHP: rawHealth, event, valueOf() { return this.health; } };
    }

    /**
     * Apply healing to this actor bounded by max_health.
     * @param {number} amount
     * @param {object} [options]
     * @returns {Promise<number>} Resulting health value
     */
    async applyHealing(amount, options = {}) {
      let healNum = Math.max(0, Number(amount) || 0);
      if (healNum <= 0) return this.system?.health ?? 0;

      const event = this._buildCombatEvent(options.type || "healing", healNum, options);

      await actorEventBus.runMiddleware("heal-received", event);
      if (event.preventDefault) return this.system?.health ?? 0;

      healNum = Math.max(0, Number(event.amount) || 0);
      if (healNum <= 0) return this.system?.health ?? 0;

      const currentHealth = this.system.health ?? this.system.hp?.value ?? this.system.hp ?? 0;
      const maxHealth = this.system.max_health ?? this.system.hp?.max ?? currentHealth;
      const newHealth = Math.clamp(currentHealth + healNum, 0, maxHealth);

      const wasDefeated = Boolean(
        this.statuses?.has("defeated") ||
        this.statuses?.has(CONFIG.specialStatusEffects?.DEFEATED) ||
        this.items?.some(i => i.type === "effect" && (i.getFlag("trespasser", "statusEffectId") === "defeated" || i.name?.toLowerCase() === "defeated"))
      );

      const isDirectlyUpdatable = this.isOwner || game.user?.isGM;

      if (isDirectlyUpdatable) {
        await this.update({ "system.health": newHealth });
      } else {
        const { emitDeedActionAndWait } = await import("../helpers/socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("applyHealing", {
          actorId: this.id,
          healing: healNum
        });
      }

      if (wasDefeated && newHealth > 0 && this.type === "character") {
        if (isDirectlyUpdatable) {
          await this.toggleStatusEffect("defeated", { active: false });
        }
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<div class="trespasser-chat-card"><p class="hit-text"><strong>${this.name}</strong> ${game.i18n.localize("TRESPASSER.Chat.Combat.RecoveredFromDefeat")}</p></div>`
        });
      }

      await this._executePostAction(event, "heal-received");
      if (event.sourceActor) {
        const givenEvent = { ...event, actor: event.sourceActor, targetActor: this };
        await this._executePostAction(givenEvent, "heal-given");
      }

      return newHealth;
    }

    /**
     * Roll a skill check against an attribute with event emission.
     * @param {string} attribute - "mighty" | "agility" | "intellect" | "spirit"
     * @param {object} [options]
     * @returns {Promise<Roll|null>}
     */
    async rollSkillCheck(attribute, options = {}) {
      const event = this._buildCombatEvent("skill", 0, { attribute, ...options });
      event.attribute = attribute;

      await actorEventBus.runMiddleware("use", event);
      if (event.preventDefault) return null;

      if (options.skipRoll || options.roll) {
        await this._executePostAction(event, "use");
        return options.roll || null;
      }

      const data = this.system;
      const attrValue = data?.attributes?.[attribute] ?? 0;
      const skillDie = data?.skill_die || "d6";

      const bonus = TrespasserEffectsHelper.getAttributeBonus(this, attribute, "use");
      const formula = `1${skillDie} + ${attrValue} + ${bonus}`;

      const roll = new foundry.dice.Roll(formula);
      const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`);

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: `${attrLabel} Check ${bonus !== 0 ? `(Bonus: ${bonus > 0 ? "+" : ""}${bonus})` : ""}`
      });

      await this._executePostAction(event, "use");
      return roll;
    }

    /**
     * Roll a Prevail check to remove a state.
     * @param {string} stateItemId
     * @param {number} [extraAP=0]
     * @param {object} [options]
     * @returns {Promise<Roll|null>}
     */
    async rollPrevail(stateItemId, extraAP = 0, options = {}) {
      const event = this._buildCombatEvent("prevail", 0, { stateItemId, extraAP, ...options });
      event.stateItemId = stateItemId;
      event.extraAP = extraAP;

      await actorEventBus.runMiddleware("on-prevail", event);
      if (event.preventDefault) return null;

      const roll = await executePrevailRoll(this, stateItemId, extraAP, options);
      if (roll) {
        await this._executePostAction(event, "on-prevail");
      }
      return roll;
    }

    /** Called when combat begins. */
    async onCombatStart(combat = null, options = {}) {
      const event = this._buildCombatEvent("combat-start", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("start-of-combat", event);
    }

    /** Called when combat ends. */
    async onCombatEnd(combat = null, options = {}) {
      const event = this._buildCombatEvent("combat-end", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("end-of-combat", event);
    }

    /** Called when a combat round begins. */
    async onRoundStart(combat = null, options = {}) {
      const event = this._buildCombatEvent("round-start", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("start-of-round", event);
    }

    /** Called when a combat round ends. */
    async onRoundEnd(combat = null, options = {}) {
      const event = this._buildCombatEvent("round-end", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("end-of-round", event);
    }

    /** Called when this actor's turn begins. */
    async onTurnStart(combatant = null, options = {}) {
      const event = this._buildCombatEvent("turn-start", 0, { combatant, ...options });
      event.combatant = combatant;
      return this._dispatchCombatEvent("start-of-turn", event);
    }

    /**
     * Called when this actor's turn ends.
     * @param {Combatant} [combatant]
     * @param {object} [options]
     */
    async onTurnEnd(combatant = null, options = {}) {
      const event = this._buildCombatEvent("turn-end", 0, { combatant, ...options });
      event.combatant = combatant;

      await actorEventBus.runMiddleware("end-of-turn", event);
      if (event.preventDefault) return;

      if (game.combat && this.type === "character") {
        const usedExpensive = combatant ? combatant.getFlag("trespasser", "usedExpensiveDeed") : false;
        if (!usedExpensive) {
          const skillBonus = this.system?.skill || 0;
          if (skillBonus > 0) {
            const currentFocus = this.system?.combat?.focus ?? 0;
            const newFocus = currentFocus + skillBonus;
            if (newFocus > currentFocus) {
              await this.update({ "system.combat.focus": newFocus });
              ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this }),
                content: `<div class="trespasser-chat-card"><p><strong>${this.name}</strong> recovered <strong>${newFocus - currentFocus} Focus</strong> at end of turn.</p></div>`
              });
            }
          }
        }
      }

      await this._executePostAction(event, "end-of-turn");
    }

    /**
     * Called when actor moves on the map.
     * @param {object} movementData
     * @returns {Promise<boolean>}
     */
    async onMove(movementData = {}) {
      const event = this._buildCombatEvent("move", movementData.distance || 0, movementData);

      await actorEventBus.runMiddleware("on-move", event);
      if (movementData.isFirstMove) {
        await actorEventBus.runMiddleware("on-first-move", event);
      }

      if (event.preventDefault) return false;

      await this._executePostAction(event, "on-move");
      if (movementData.isFirstMove) {
        await this._executePostAction(event, "on-first-move");
      }

      return true;
    }

    /**
     * Called when actor begins executing a deed.
     * @param {Item} item
     * @param {object} [options]
     * @returns {Promise<boolean>}
     */
    async useDeed(item, options = {}) {
      if (TrespasserEffectsHelper.hasActorFlagOrEffect(this, "cannotAct")) {
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", { name: this.name }));
        return false;
      }
      const event = this._buildCombatEvent("use-deed", 0, { item, ...options });
      event.source = item;
      event.sourceItem = item;
      return this._dispatchCombatEvent("on-use-deed", event);
    }

    /**
     * Called when this actor scores a hit with a deed.
     * @param {Actor|Token|TokenDocument} target
     * @param {object} [options]
     */
    async onDeedHit(target, options = {}) {
      return this._handleDeedOutcome(target, options, "hit");
    }

    /**
     * Called when this actor misses with a deed.
     * @param {Actor|Token|TokenDocument} target
     * @param {object} [options]
     */
    async onDeedMiss(target, options = {}) {
      return this._handleDeedOutcome(target, options, "miss");
    }

    /**
     * Common outcome handler for deed hits and misses.
     * @param {Actor|Token|TokenDocument} target
     * @param {object} options
     * @param {"hit"|"miss"} outcome
     * @private
     */
    async _handleDeedOutcome(target, options, outcome) {
      const targetDoc = target?.actor || target;
      const targetToken = target?.document ? target : (targetDoc?.getActiveTokens?.(true, true)?.[0] || targetDoc?.token);

      const attackerEvt = this._buildCombatEvent(`deed-${outcome}`, 0, { target: targetDoc, ...options });
      attackerEvt.targetActor = targetDoc;
      attackerEvt.targetToken = targetToken;
      attackerEvt.source = options.item || this;
      attackerEvt.sourceItem = options.item || null;

      await this._dispatchCombatEvent(`on-deed-${outcome}`, attackerEvt);

      if (targetDoc) {
        const receiverEvt = {
          actor: targetDoc,
          token: targetToken,
          sourceActor: this,
          sourceToken: attackerEvt.token,
          sourceItem: options.item || null,
          type: `deed-${outcome}-received`,
          amount: 0,
          source: this,
          data: { attacker: this, ...options },
          modifiers: [],
          deferredActions: [],
          preventDefault: false
        };

        if (typeof targetDoc._dispatchCombatEvent === "function") {
          await targetDoc._dispatchCombatEvent(`on-deed-${outcome}-received`, receiverEvt);
        } else {
          await this._dispatchCombatEvent(`on-deed-${outcome}-received`, receiverEvt);
        }
      }
    }

    /**
     * Called when this actor is targeted by a deed or action.
     * @param {Actor|Token|TokenDocument} source
     * @param {object} [options]
     * @returns {Promise<boolean>}
     */
    async onTargeted(source, options = {}) {
      const sourceActor = source?.actor || (source instanceof Actor ? source : null);
      const sourceToken = source?.document ? source : (sourceActor?.getActiveTokens?.(true, true)?.[0] || sourceActor?.token);

      const event = this._buildCombatEvent("targeted", 0, { source, ...options });
      event.source = sourceActor || source || null;
      event.sourceActor = sourceActor;
      event.sourceToken = sourceToken;
      event.sourceItem = options.item || null;

      await actorEventBus.runMiddleware("targeted", event);
      await actorEventBus.runMiddleware("on-targeted-deed", event);
      if (event.preventDefault) return false;

      await this._executePostAction(event, "targeted");
      await this._executePostAction(event, "on-targeted-deed");
      return true;
    }

    /**
     * Consume an item from this actor's inventory.
     * @param {string} itemId
     * @param {object} [options]
     */
    async onItemConsume(itemId, options = {}) {
      return handleItemConsume(this, itemId, options);
    }
  };
}
