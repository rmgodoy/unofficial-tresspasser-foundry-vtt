import { actorEventBus } from "./actor-event-bus.mjs";
import { isSunken } from "../helpers/elevation-helper.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { onItemConsume as handleItemConsume } from "./actor-actions.mjs";

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
     * Execute observers, deferred actions, and triggerEffects after state mutation.
     * @param {object} event
     * @param {string|null} [observerEventName]
     * @param {string|null} [triggerTiming]
     * @private
     */
    async _executePostAction(event, observerEventName = null, triggerTiming = null) {
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
      if (triggerTiming && event.actor) {
        const filterTarget = event.attribute || event.data?.filterTarget || null;
        await TrespasserEffectsHelper.triggerEffects(event.actor, triggerTiming, { filterTarget });
      }
    }

    /**
     * Dispatch an event through middleware, observers, deferred actions, and triggerEffects.
     * @param {string} eventName
     * @param {object} event
     * @param {string|null} [triggerTiming]
     * @returns {Promise<boolean>} False if prevented by middleware, true otherwise
     * @private
     */
    async _dispatchCombatEvent(eventName, event, triggerTiming = null) {
      await actorEventBus.runMiddleware(eventName, event);
      if (event.preventDefault) return false;
      await this._executePostAction(event, eventName, triggerTiming);
      return true;
    }

    /**
     * Apply damage to this actor with dual-phase event bus lifecycle.
     * @param {number} amount
     * @param {object} [options]
     * @returns {Promise<number>} Resulting health value
     */
    async applyDamage(amount, options = {}) {
      let damageNum = Math.max(0, Number(amount) || 0);
      if (damageNum <= 0) return this.system?.health ?? 0;

      const event = this._buildCombatEvent(options.type || "damage", damageNum, options);

      await actorEventBus.runMiddleware("damage-received", event);
      if (event.preventDefault) return this.system?.health ?? 0;

      damageNum = Math.max(0, Number(event.amount) || 0);
      if (damageNum <= 0) return this.system?.health ?? 0;

      if (isSunken(this) && !options.isPreHalved && !event.data.isPreHalved) {
        damageNum = Math.floor(damageNum / 2);
      }
      if (damageNum <= 0) return this.system?.health ?? 0;

      const currentHealth = this.system.health ?? this.system.hp?.value ?? this.system.hp ?? 0;
      const maxHealth = this.system.max_health ?? this.system.hp?.max ?? currentHealth;
      const rawHealth = currentHealth - damageNum;
      const newHealth = Math.clamp(rawHealth, 0, maxHealth);

      await this.update({ "system.health": rawHealth }, options);

      await this._executePostAction(event, "damage-received", "damage-received");
      if (event.sourceActor) {
        const dealtEvent = { ...event, actor: event.sourceActor, targetActor: this };
        await this._executePostAction(dealtEvent, "damage-dealt", "damage-dealt");
      }

      return newHealth;
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

      await this.update({ "system.health": newHealth });

      if (wasDefeated && newHealth > 0 && this.type === "character") {
        await this.toggleStatusEffect("defeated", { active: false });
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<div class="trespasser-chat-card"><p class="hit-text"><strong>${this.name}</strong> ${game.i18n.localize("TRESPASSER.Chat.Combat.RecoveredFromDefeat")}</p></div>`
        });
      }

      await this._executePostAction(event, "heal-received", "heal-received");
      if (event.sourceActor) {
        const givenEvent = { ...event, actor: event.sourceActor, targetActor: this };
        await this._executePostAction(givenEvent, "heal-given", "heal-given");
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
        await this._executePostAction(event, "use", "use");
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

      await this._executePostAction(event, "use", "use");
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

      const stateItem = this.items?.get(stateItemId);
      if (!stateItem) {
        ui.notifications.warn("State item not found.");
        return null;
      }

      const { modifier = 0, cd = null, totalBonus = null } = options;
      let intensity = stateItem.system?.intensity || 0;
      if (!stateItem.system?.isLasting) {
        const matchingLasting = this.items?.find(i =>
          i.type === "effect" &&
          i.system?.isLasting &&
          i.name.toLowerCase() === stateItem.name.toLowerCase()
        );
        if (matchingLasting) {
          intensity += (matchingLasting.system?.intensity || 0);
        }
      }
      const dc = cd !== null ? cd : Math.min(20, 10 + intensity);
      const prevailStat = this.system?.combat?.prevail || 0;
      const apBonus = extraAP * 2;
      const bonuses = totalBonus !== null ? `${totalBonus}` : `${prevailStat} + ${apBonus} + ${modifier}`;

      const isAdv = TrespasserEffectsHelper.hasAdvantage(this, "prevail");
      const formula = isAdv ? `2d20kh + ${bonuses}` : `1d20 + ${bonuses}`;

      const roll = new foundry.dice.Roll(formula);
      await roll.evaluate();

      const success = roll.total >= dc;
      const flavor = `<div class="trespasser-chat-card">
        <h3>${game.i18n.format("TRESPASSER.Chat.Check.PrevailCheck", { name: stateItem.name })}</h3>
        <p>${game.i18n.format("TRESPASSER.Chat.Check.PrevailVsDC", { total: roll.total, dc })}</p>
        <div class="roll-details" style="font-size: var(--fs-10); color: var(--trp-text-dim); margin-bottom: 5px;">
          Formula: ${roll.formula} (d20: ${roll.dice[0].total})<br>
          Bonus: ${prevailStat} (Prevail) ${apBonus > 0 ? `+ ${apBonus} (AP)` : ""} ${modifier !== 0 ? `+ ${modifier} (Mod)` : ""}
        </div>
        <p class="${success ? 'hit-text' : 'miss-text'}" style="font-size: var(--fs-16); font-weight: bold; text-align: center;">
          ${success ? game.i18n.localize("TRESPASSER.Chat.Common.Success") : game.i18n.localize("TRESPASSER.Chat.Common.Failure")}
        </p>
      </div>`;

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor
      });

      if (success) {
        await stateItem.delete();
      }

      await this._executePostAction(event, "on-prevail", "on-prevail");
      return roll;
    }

    /** Called when combat begins. */
    async onCombatStart(combat = null, options = {}) {
      const event = this._buildCombatEvent("combat-start", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("start-of-combat", event, "start-of-combat");
    }

    /** Called when combat ends. */
    async onCombatEnd(combat = null, options = {}) {
      const event = this._buildCombatEvent("combat-end", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("end-of-combat", event, "end-of-combat");
    }

    /** Called when a combat round begins. */
    async onRoundStart(combat = null, options = {}) {
      const event = this._buildCombatEvent("round-start", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("start-of-round", event, "start-of-round");
    }

    /** Called when a combat round ends. */
    async onRoundEnd(combat = null, options = {}) {
      const event = this._buildCombatEvent("round-end", 0, { combat, ...options });
      event.combat = combat;
      return this._dispatchCombatEvent("end-of-round", event, "end-of-round");
    }

    /** Called when this actor's turn begins. */
    async onTurnStart(combatant = null, options = {}) {
      const event = this._buildCombatEvent("turn-start", 0, { combatant, ...options });
      event.combatant = combatant;
      return this._dispatchCombatEvent("start-of-turn", event, "start-of-turn");
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

      await this._executePostAction(event, "end-of-turn", "end-of-turn");
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

      await this._executePostAction(event, "on-move", "on-move");
      if (movementData.isFirstMove) {
        await this._executePostAction(event, "on-first-move", "on-first-move");
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
      const event = this._buildCombatEvent("use-deed", 0, { item, ...options });
      event.source = item;
      event.sourceItem = item;
      return this._dispatchCombatEvent("on-use-deed", event, "on-use-deed");
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

      await this._dispatchCombatEvent(`on-deed-${outcome}`, attackerEvt, `on-deed-${outcome}`);

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

        await this._dispatchCombatEvent(`on-deed-${outcome}-received`, receiverEvt, `on-deed-${outcome}-received`);
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

      await this._executePostAction(event, "targeted", "targeted");
      await this._executePostAction(event, "on-targeted-deed", "on-targeted-deed");
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
