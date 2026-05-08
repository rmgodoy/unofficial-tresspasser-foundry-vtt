import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { showRetreatDialog } from "../dialogs/retreat-dialog.mjs";

/**
 * Custom Combat class for Trespasser TTRPG.
 */
export class TrespasserCombat extends Combat {

  /**
   * Phase constants for Trespasser.
   */
  static PHASES = {
    EARLY:    40,
    ENEMY:    30,
    LATE:     20,
    EXTRA:    10,  // Paragon/Tyrant extra turn at end of round
    END:       0 
  };

  /**
   * Mapping of phase values to localized labels.
   */
  static PHASE_LABELS = {
    [TrespasserCombat.PHASES.EARLY]: "TRESPASSER.Phase.Early",
    [TrespasserCombat.PHASES.ENEMY]: "TRESPASSER.Phase.Enemy",
    [TrespasserCombat.PHASES.LATE]: "TRESPASSER.Phase.Late",
    [TrespasserCombat.PHASES.EXTRA]: "TRESPASSER.Phase.Extra",
    [TrespasserCombat.PHASES.END]: "TRESPASSER.Phase.End"
  };

  /**
   * Find the correct combatant for an actor, token, tokenId, or actorId
   * in the currently active combat phase.
   * Priority: 1) Active phase match → 2) Foundry's current turn → 3) Any match.
   * @param {Actor|Token|TokenDocument|string} target
   * @param {Combat} [combat=game.combat]
   * @returns {Combatant|null}
   */
  static getPhaseCombatant(target, combat = game.combat) {
    if (!target || !combat) return null;

    // Resolve tokenId and actorId from whatever was passed in
    let actorId = null;
    let tokenId = null;

    if (typeof target === "string") {
      // Could be either — try both
      actorId = target;
      tokenId = target;
    } else if (target instanceof Actor) {
      actorId = target.id;
    } else {
      // Token or TokenDocument
      tokenId = target.id ?? target.document?.id;
      actorId = target.actor?.id ?? target.document?.actor?.id;
    }

    const matches = (c) =>
      (tokenId && c.tokenId === tokenId) ||
      (actorId && c.actorId === actorId);

    const activePhase = combat.getFlag("trespasser", "activePhase");

    // 1. Match in the active phase
    if (activePhase !== undefined && activePhase !== null) {
      const phaseMatch = combat.combatants.find(
        c => matches(c) && Number(c.initiative) === Number(activePhase)
      );
      if (phaseMatch) return phaseMatch;
    }

    // 2. Foundry's current active turn combatant
    if (combat.combatant && matches(combat.combatant)) return combat.combatant;

    // 3. First matching combatant
    return combat.combatants.find(c => matches(c)) ?? null;
  }

  /**
   * Record that a HUD action has been used this turn for a given actor.
   * Works from any context (sheet, HUD, handler) — not just the HUD class.
   * @param {Actor|string} actorOrId  - Actor document or actorId
   * @param {string}       actionId   - e.g. "attempt-deed", "prevail", "defend", "help"
   * @param {Combat}       [combat]   - defaults to game.combat
   */
  static async recordHUDAction(actorOrId, actionId, combat = game.combat) {
    const target = typeof actorOrId === "string"
      ? { id: actorOrId }  // getPhaseCombatant accepts actorId strings
      : actorOrId;
    const combatant = TrespasserCombat.getPhaseCombatant(target, combat);
    if (!combatant) return;
    const used = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
    used.add(actionId);
    await combatant.setFlag("trespasser", "usedHUDActions", [...used]);
  }
  
  /**
   * Remove a HUD action from the used actions list for a given actor.
   * @param {Actor|string} actorOrId  - Actor document or actorId
   * @param {string}       actionId   - e.g. "attempt-deed", "prevail", "defend", "help"
   * @param {Combat}       [combat]   - defaults to game.combat
   */
  static async removeHUDAction(actorOrId, actionId, combat = game.combat) {
    const target = typeof actorOrId === "string"
      ? { id: actorOrId }  // getPhaseCombatant accepts actorId strings
      : actorOrId;
    const combatant = TrespasserCombat.getPhaseCombatant(target, combat);
    if (!combatant) return;
    const used = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
    used.delete(actionId);
    await combatant.setFlag("trespasser", "usedHUDActions", [...used]);
  }

  /** @override */
  async startCombat() {
    if ( game.user.isGM ) {
      // 1. Roll initiatives (this now returns updates but doesn't apply them yet)
      const initResults = await this.rollAllTrespasserInitiatives();
      
      // 2. Initialize Focus and AP for Player Characters, merging with initiative updates
      const combatantUpdates = initResults.updates;
      for (const combatant of this.combatants) {
        if (combatant.actor?.type === "character") {
          const skillBonus = combatant.actor.system.skill || 2;
          await combatant.actor.update({ "system.combat.focus": skillBonus });
        }
        
        // Find existing update for this combatant or create a new one
        let up = combatantUpdates.find(u => u._id === combatant.id);
        if (!up) {
          up = { _id: combatant.id };
          combatantUpdates.push(up);
        }
        
        // Ensure AP and history are reset
        up["flags.trespasser.actionPoints"] = 3;
        up["flags.trespasser.usedHUDActions"] = [];
      }
      
      // 3. Apply ALL combatant updates in one go
      if (combatantUpdates.length > 0) {
        await this.updateEmbeddedDocuments("Combatant", combatantUpdates);
      }
      
      // 4. Create any extra proxy combatants
      if (initResults.newCombatants.length > 0) {
        await this.createEmbeddedDocuments("Combatant", initResults.newCombatants);
      }

      // 5. Determine if we should start the first phase or wait
      const playerFacingInit = game.settings.get("trespasser", "playerFacingInitiative");
      const isWaiting = this.getFlag("trespasser", "waitingForInitiatives");

      if (!playerFacingInit || !isWaiting) {
        const initialPhase = this._firstNonEmptyPhase();
        await this.setFlag("trespasser", "activePhase", initialPhase);
        await this._onStartOfCombat();
        await this._onStartOfRound();
        await this._onStartOfTurn(initialPhase);
      } else {
        await this._onStartOfCombat();
        await this._onStartOfRound();
      }
    }
    return super.startCombat();
  }

  /** @override */
  async nextRound() {
    if ( game.user.isGM ) {
      const initResults = await this.rollAllTrespasserInitiatives();
      
      const combatantUpdates = initResults.updates;
      for (const combatant of this.combatants) {
        let up = combatantUpdates.find(u => u._id === combatant.id);
        if (!up) {
          up = { _id: combatant.id };
          combatantUpdates.push(up);
        }
        up["flags.trespasser.actionPoints"] = 3;
        up["flags.trespasser.usedHUDActions"] = [];
      }
      
      if (combatantUpdates.length > 0) {
        await this.updateEmbeddedDocuments("Combatant", combatantUpdates);
      }

      if (initResults.newCombatants.length > 0) {
        await this.createEmbeddedDocuments("Combatant", initResults.newCombatants);
      }

      // Check if we should show retreat dialog
      const enableRetreat = game.settings.get("trespasser", "enableRetreatDialog");
      if (enableRetreat) {
        const combatInfo = this.getFlag("trespasser", "combatInfo");
        const choice = await showRetreatDialog(combatInfo);
        
        if (choice === "retreat") {
          await this._attemptRetreat(combatInfo.enemyMaxInit);
          // If retreat succeeded and combat ended, we don't need to advance round
          if (!game.combats.has(this.id)) return this; 
          return super.nextRound();
        }
      }

      const playerFacingInit = game.settings.get("trespasser", "playerFacingInitiative");
      const isWaiting = this.getFlag("trespasser", "waitingForInitiatives");

      if (!playerFacingInit || !isWaiting) {
        const initialPhase = this._firstNonEmptyPhase();
        await this.setFlag("trespasser", "activePhase", initialPhase);
        await this._onStartOfRound();
        await this._onStartOfTurn(initialPhase);
      } else {
        await this._onStartOfRound();
      }
    }
    return super.nextRound();
  }

  /**
   * Returns the first phase (highest initiative value) that has at least one non-defeated combatant.
   * @returns {number}
   */
  _firstNonEmptyPhase() {
    const phases = Object.values(TrespasserCombat.PHASES).sort((a, b) => b - a);
    for (const p of phases) {
      if (this.combatants.some(c => c.initiative === p && !c.defeated)) return p;
    }
    return TrespasserCombat.PHASES.EARLY; // Fallback
  }

  /**
   * Advance to the next combat phase.
   * Handles all turn-end/turn-start/round-end transitions.
   */
  async nextPhase() {
    if ( !game.user.isGM ) return;

    const currentPhase = this.getFlag("trespasser", "activePhase") ?? TrespasserCombat.PHASES.EARLY;

    // ── 1. END OF TURN for everyone in the current phase ──────────────────
    await this._onEndOfTurn(currentPhase);

    // ── 2. Find next valid phase ───────────────────────────────────────────
    const phases = Object.values(TrespasserCombat.PHASES).sort((a, b) => b - a);
    const currentIndex = phases.indexOf(currentPhase);

    let nextPhase = null;
    for (let i = currentIndex + 1; i < phases.length; i++) {
      const p = phases[i];
      if (this.combatants.some(c => c.initiative === p && !c.defeated)) {
        nextPhase = p;
        break;
      }
    }

    if (nextPhase !== null) {
      // ── 3a. Advance to next phase ────────────────────────────────────────
      await this.setFlag("trespasser", "activePhase", nextPhase);
      await this.update({ turn: 0 });

      // START OF TURN for all actors entering the new phase
      await this._onStartOfTurn(nextPhase);
    } else {
      // ── 3b. No more phases → end of round ────────────────────────────────
      await this._onEndOfRound();
      // Advance to a new round (which re-rolls initiative and sets activePhase)
      return this.nextRound();
    }
  }

  /**
   * Trigger start-of-combat effects for all combatants.
   */
  async _onStartOfCombat() {
    for (const c of this.combatants) {
      if (c.actor) {
        await TrespasserEffectsHelper.triggerEffects(c.actor, "start-of-combat");
      }
    }
  }

  /**
   * Trigger start-of-round effects for all combatants.
   */
  async _onStartOfRound() {
    const processedActors = new Set();
    for (const c of this.combatants) {
      if (c.actor && !processedActors.has(c.actor.id)) {
        processedActors.add(c.actor.id);
        await TrespasserEffectsHelper.decrementRound(c.actor);
        await TrespasserEffectsHelper.triggerEffects(c.actor, "start-of-round");
      }
    }
  }

  /**
   * Trigger end-of-round effects for all combatants.
   */
  async _onEndOfRound() {
    for (const c of this.combatants) {
      if (c.actor) {
        await TrespasserEffectsHelper.triggerEffects(c.actor, "end-of-round");
      }
    }
  }

  /**
   * Trigger start-of-turn effects for all combatants in a specific phase.
   * @param {number} phase 
   */
  async _onStartOfTurn(phase) {
    const phaseEntrants = this.combatants.filter(c => c.initiative === phase && !c.defeated);
    for (const c of phaseEntrants) {
      // If this combatant is finishing a 'Wait' action, they carry over their state and don't trigger start-of-turn effects again.
      if (c.getFlag("trespasser", "isWaitFinish")) {
        await c.setFlag("trespasser", "isWaitFinish", false);
        continue;
      }

      // Reset per-turn flags
      const token = c.token;
      if (token?.document?.clearMovementHistory) {
        await token.document.clearMovementHistory();
      }
      
      await c.update({
        "flags.trespasser.hasMovedThisTurn": false,
        "flags.trespasser.moveActionTaken": false,
        "flags.trespasser.movementAllowed": 0,
        "flags.trespasser.movementUsed": 0,
        "flags.trespasser.movementHistory": token?.document?.movementHistory ?? [],
        "flags.trespasser.usedExpensiveDeed": false,
        "flags.trespasser.usedHUDActions": []
      });

      if (c.actor) {
        await TrespasserEffectsHelper.triggerEffects(c.actor, "start-of-turn");
      }
    }
  }

  /**
   * Trigger end-of-turn effects for all combatants in a specific phase.
   * @param {number} phase 
   */
  async _onEndOfTurn(phase) {
    const currentCombatants = this.combatants.filter(c => c.initiative === phase && !c.defeated);
    for (const c of currentCombatants) {
      // Force AP to 0 (in case they didn't spend it all)
      await c.setFlag("trespasser", "actionPoints", 0);
      if (c.actor) {
        await c.actor.onTurnEnd(c);
        await TrespasserEffectsHelper.triggerEffects(c.actor, "end-of-turn");
      }
    }
  }

  /** @deprecated Token highlighting removed by user request. */
  setupTokenHighlight() {}

  /**
   * Roll initiative for a single player character combatant.
   * Called when the player clicks their initiative button.
   * If a player rolls, it communicates the result to the GM via Actor Flags.
   * @param {string} combatantId
   */
  async rollPlayerInitiative(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant?.actor || combatant.actor.type !== "character") return;

    // Verify this combatant is pending
    if (!combatant.getFlag("trespasser", "initiativePending")) return;

    // 1. Roll locally
    const initBonus = combatant.actor.system.combat?.initiative || 0;
    const isAdv = combatant.actor.getFlag("trespasser", "initiativeAdvantage") || false;
    const formula = isAdv ? "2d20kh" : "1d20";
    const roll = new foundry.dice.Roll(`${formula} + ${initBonus}`);
    await roll.evaluate();

    // 2. Post to chat
    const combatInfo = this.getFlag("trespasser", "combatInfo") || {};
    const enemyMaxInit = combatInfo.enemyMaxInit || 0;
    if (game.settings.get("trespasser", "showInitiativeInChat")) {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
        flavor: game.i18n.format("TRESPASSER.Chat.Action.Initiative", { max: enemyMaxInit })
      });
    }

    const total = roll.total;
    const isNat20 = roll.dice[0].results[0].result === 20;

    // 3. Handle Update (GM updates directly, Players use Flags)
    if (game.user.isGM) {
      await this._processInitiativeResult(combatantId, total, isNat20);
    } else {
      // Set flag on Actor (which the player owns) for the GM to process
      await combatant.actor.setFlag("trespasser", "initiativeRollResult", {
        combatId: this.id,
        combatantId: combatantId,
        total: total,
        isNat20: isNat20
      });
    }
  }

  /**
   * Internal method to actually apply the initiative result.
   * Only called by GM.
   * @private
   */
  async _processInitiativeResult(combatantId, total, isNat20) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant) return;

    const combatInfo = this.getFlag("trespasser", "combatInfo") || {};
    const enemyMaxInit = combatInfo.enemyMaxInit || 0;
    
    const updates = { "flags.trespasser.initiativePending": false };
    const newCombatants = [];
    const isRetreat = this.getFlag("trespasser", "retreatPending");

    if (isRetreat) {
      // During retreat, we store the raw total to evaluate success later
      updates.initiative = total;
    } else {
      if (isNat20) {
        updates.initiative = TrespasserCombat.PHASES.EARLY;
        const extraData = this.createExtraCombatant(combatant, TrespasserCombat.PHASES.LATE);
        newCombatants.push(extraData);
      } else if (total >= enemyMaxInit) {
        updates.initiative = TrespasserCombat.PHASES.EARLY;
      } else {
        updates.initiative = TrespasserCombat.PHASES.LATE;
      }
    }

    // Apply updates
    await this.updateEmbeddedDocuments("Combatant", [{ _id: combatantId, ...updates }]);
    if (newCombatants.length > 0) {
      await this.createEmbeddedDocuments("Combatant", newCombatants);
    }

    // Check if all players have rolled
    await this._checkAllInitiativesRolled();
  }

  /**
   * Check if all player combatants have rolled initiative.
   * If so, clear the waiting flag and start the round normally.
   */
  async _checkAllInitiativesRolled() {
    const pending = this.combatants.filter(c =>
      c.actor?.type === "character" &&
      !c.defeated &&
      c.getFlag("trespasser", "initiativePending")
    );

    if (pending.length === 0) {
      await this.setFlag("trespasser", "waitingForInitiatives", false);

      // Now start the round: set phase, trigger effects
      const initialPhase = this._firstNonEmptyPhase();
      await this.setFlag("trespasser", "activePhase", initialPhase);
      
      // If we're GM, we can definitely do this
      if (game.user.isGM) {
        const isRetreat = this.getFlag("trespasser", "retreatPending");
        if (isRetreat) {
          await this._evaluateRetreat();
        } else {
          await this._onStartOfTurn(initialPhase);
        }
      }
    }
  }

  /**
   * Post Peril roll to chat.
   * @param {object} combatInfo 
   */
  async _postPerilToChat(combatInfo) {
    if (!game.settings.get("trespasser", "showPerilInChat")) return;
    
    const label = game.i18n.localize(combatInfo.perilLabel);
    const content = await renderTemplate("systems/trespasser/templates/chat/peril-card.hbs", {
      total: combatInfo.perilTotal,
      label: label,
      heavy: combatInfo.heavy,
      mighty: combatInfo.mighty,
      panicLevel: combatInfo.panicLevel
    });

    await ChatMessage.create({
      user: game.user.id,
      content: content,
      flavor: game.i18n.localize("TRESPASSER.Terms.Combat.Peril"),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  }

  /**
   * Handle the retreat attempt flow.
   * @param {number} enemyMaxInit 
   */
  async _attemptRetreat(enemyMaxInit) {
    const playerFacingInit = game.settings.get("trespasser", "playerFacingInitiative");
    
    // Post attempt to chat
    await ChatMessage.create({
      content: `<h3 style="color:var(--trp-gold-bright)">${game.i18n.localize("TRESPASSER.Chat.Action.RetreatAttempt")}</h3>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });

    if (playerFacingInit) {
      await this.setFlag("trespasser", "retreatPending", true);
      await this.setFlag("trespasser", "waitingForInitiatives", true);
      // Players already have pending flag from rollAllTrespasserInitiatives
      return;
    }

    // GM rolls for everyone
    for (const c of this.combatants) {
      if (c.actor?.type === "character" && !c.defeated) {
        const initBonus = c.actor.system.combat?.initiative || 0;
        const roll = new foundry.dice.Roll(`1d20 + ${initBonus}`);
        await roll.evaluate();
        
        if (game.settings.get("trespasser", "showInitiativeInChat")) {
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: c.actor }),
            flavor: game.i18n.format("TRESPASSER.Chat.Action.Initiative", { max: enemyMaxInit })
          });
        }
        
        await c.setFlag("trespasser", "initiativePending", false);
        await c.update({ initiative: roll.total }); // Store roll result temporarily in initiative
      }
    }

    await this._evaluateRetreat();
  }

  /**
   * Evaluate if the retreat succeeded.
   */
  async _evaluateRetreat() {
    const combatInfo = this.getFlag("trespasser", "combatInfo");
    const enemyMaxInit = combatInfo.enemyMaxInit;
    
    const pcs = this.combatants.filter(c => c.actor?.type === "character" && !c.defeated);
    let successes = 0;

    for (const c of pcs) {
      const rollTotal = c.initiative;
      if (rollTotal >= enemyMaxInit) {
        successes++;
      }
    }

    const needed = Math.ceil(pcs.length / 2);
    const success = successes >= needed;

    if (success) {
      await ChatMessage.create({
        content: `<h2 style="color:var(--trp-green-bright)">${game.i18n.format("TRESPASSER.Chat.Action.RetreatSuccess", { successes, total: pcs.length })}</h2>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
      });
      
      if (game.settings.get("trespasser", "autoEndCombatOnRetreat")) {
        await this.endCombat();
        return;
      }
    } else {
      await ChatMessage.create({
        content: `<h2 style="color:var(--trp-red)">${game.i18n.format("TRESPASSER.Chat.Action.RetreatFailure", { successes, total: pcs.length, needed })}</h2>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
      });
    }

    // Clean up flags and finalize initiatives
    await this.setFlag("trespasser", "retreatPending", false);
    
    const updates = [];
    for (const c of pcs) {
      const total = c.initiative;
      const isNat20 = false; // We don't track nat 20 for retreat usually, or do we? 
      // Plan said: If they fail, the rolled initiative is used and the combat continues as normal.
      
      let initValue;
      if (total >= enemyMaxInit) {
        initValue = TrespasserCombat.PHASES.EARLY;
      } else {
        initValue = TrespasserCombat.PHASES.LATE;
      }
      updates.push({ _id: c.id, initiative: initValue });
    }
    
    if (updates.length > 0) {
      await this.updateEmbeddedDocuments("Combatant", updates);
    }

    const initialPhase = this._firstNonEmptyPhase();
    await this.setFlag("trespasser", "activePhase", initialPhase);
    await this._onStartOfRound();
    await this._onStartOfTurn(initialPhase);
  }

  /**
   * Custom method to resolve Trespasser initiatives.
   * Cleans up proxy combatants, calculates extra turns, assigns phases, and rolls Peril.
   */
  async rollAllTrespasserInitiatives() {
    const playerFacingInit = game.settings.get("trespasser", "playerFacingInitiative");
    
    // 1. Remove dynamically generated extra combatants
    const extras = this.combatants.filter(c => c.getFlag("trespasser", "isExtraTurn"));
    if ( extras.length > 0 ) {
      await this.deleteEmbeddedDocuments("Combatant", extras.map(c => c.id));
    }

    // 2. Identify living creatures to calculate enemy max initiative
    const livingCreatures = this.combatants.filter(c => {
      const actor = c.actor;
      if ( !actor || actor.type !== "creature" ) return false;
      return !c.defeated;
    });

    let enemyMaxInit = 0;
    for ( const c of livingCreatures ) {
      const init = c.actor.system.combat?.initiative || 0;
      if ( init > enemyMaxInit ) {
        enemyMaxInit = init;
      }
    }

    // 3. Process combatants
    const updates = [];
    const newCombatants = [];
    let hasPending = false;

    // To prevent infinite loop with new proxy combatants, snapshot current base combatants
    const baseCombatants = this.combatants.filter(c => !c.getFlag("trespasser", "isExtraTurn"));

    for ( const c of baseCombatants ) {
      const actor = c.actor;
      if ( !actor ) continue;

      if ( actor.type === "creature" ) {
        // Enemies are set to base 30 (Enemy Phase)
        updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.ENEMY, "flags.trespasser.initiativePending": false });

        // Paragon or Tyrant gets an extra turn at End of Round (0)
        const template = actor.system.template;
        if ( template === "paragon" || template === "tyrant" ) {
          const extraData = this.createExtraCombatant(c, TrespasserCombat.PHASES.EXTRA);
          newCombatants.push(extraData);
        }
      } else if ( actor.type === "character" ) {
        if (playerFacingInit) {
          // ── NEW: Mark as pending, set initiative to null ──
          updates.push({
            _id: c.id,
            initiative: null,
            "flags.trespasser.initiativePending": true
          });
          hasPending = true;
        } else {
          // Player rolls 1d20 + Initiative
          const initBonus = actor.system.combat?.initiative || 0;
          const roll = new foundry.dice.Roll(`1d20 + ${initBonus}`);
          await roll.evaluate();
          
          // Broadcast the roll so everyone sees it (if setting is enabled)
          if (game.settings.get("trespasser", "showInitiativeInChat")) {
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              flavor: game.i18n.format("TRESPASSER.Chat.Action.Initiative", { max: enemyMaxInit })
            });
          }

          const total = roll.total;
          const isNat20 = roll.dice[0].results[0].result === 20;

          if ( isNat20 ) {
            // Nat 20: acts in Extra phase (10)
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY, "flags.trespasser.initiativePending": false });
            const extraData = this.createExtraCombatant(c, TrespasserCombat.PHASES.LATE);
            newCombatants.push(extraData);
          } else if ( total >= enemyMaxInit ) {
            // >= enemy max: Early (40)
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY, "flags.trespasser.initiativePending": false });
          } else {
            // < enemy max: Late (20)
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.LATE, "flags.trespasser.initiativePending": false });
          }
        }
      } else {
        // Fallback for non-character/creature (e.g. traps/hazards)
        updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.END, "flags.trespasser.initiativePending": false });
      }
    }

    // 4. Calculate Panic Level
    let panicLevel = 2;
    
    const players = baseCombatants.filter(c => c.actor?.type === "character");
    const enemies = baseCombatants.filter(c => c.actor?.type === "creature");

    const livingPlayers = players.filter(c => !c.defeated);
    const livingEnemies = enemies.filter(c => !c.defeated);
    
    const deadPlayers = players.filter(c => c.defeated);
    const deadEnemies = enemies.filter(c => c.defeated);

    if ( livingPlayers.length > livingEnemies.length ) {
      panicLevel += 2;
    }

    if ( enemies.length > 0 && deadEnemies.length >= (enemies.length / 2) ) {
      panicLevel += 2;
    }

    const deadParagon = enemies.some(c => {
      const t = c.actor?.system.template;
      return (t === "paragon" || t === "tyrant") && c.defeated;
    });
    if ( deadParagon ) {
      panicLevel += 2;
    }

    if ( deadPlayers.length > 0 ) {
      panicLevel -= 2;
    }

    // 5. Roll Peril (2d6) and store in flags
    const perilRoll = new foundry.dice.Roll("2d6");
    await perilRoll.evaluate();
    
    const perilTotal = perilRoll.total;
    let perilLabel = "";
    let heavy = 0;
    let mighty = 0;

    if ( perilTotal <= 6 ) {
      perilLabel = "TRESPASSER.PanicLabels.Low";
      heavy = 1;
      mighty = 0;
    } else if ( perilTotal >= 7 && perilTotal <= 9 ) {
      perilLabel = "TRESPASSER.PanicLabels.Medium";
      heavy = 1;
      mighty = 1;
    } else {
      perilLabel = "TRESPASSER.PanicLabels.High";
      heavy = 2;
      mighty = 1;
    }

    // Store combat state in flags for the tracker
    const combatInfo = {
      perilTotal,
      perilLabel,
      heavy,
      mighty,
      panicLevel,
      enemyMaxInit
    };
    
    await this.setFlag("trespasser", "combatInfo", combatInfo);

    // 6. Post Peril to Chat
    await this._postPerilToChat(combatInfo);

    // 5. Store whether we're waiting for player initiatives
    if (playerFacingInit) {
      await this.setFlag("trespasser", "waitingForInitiatives", hasPending);
    } else {
      await this.setFlag("trespasser", "waitingForInitiatives", false);
    }

    return { updates, newCombatants };
  }

  /**
   * Helper to create an extra combatant for Paragon/Tyrant.
   * @param {Combatant} baseCombatant 
   * @param {number} initiative 
   * @returns {object}
   */
  createExtraCombatant(baseCombatant, initiative) {
    return {
      actorId: baseCombatant.actorId,
      tokenId: baseCombatant.tokenId,
      sceneId: baseCombatant.sceneId,
      initiative: initiative,
      hidden: baseCombatant.hidden,
      flags: {
        trespasser: {
          isExtraTurn: true,
          baseCombatantId: baseCombatant.id,
          actionPoints: 3
        }
      }
    };
  }

  /**
   * Update turn markers on all tokens in the scene based on the active phase.
   * @param {number} activePhase 
   */
  async updateTurnMarkers(activePhase) {
    if (!canvas.ready || !canvas.tokens) return;
    
    const hasActivePhase = (activePhase !== null) && (activePhase !== undefined);

    for (const token of canvas.tokens.placeables) {
      // Find a combatant for this token in this combat
      const combatant = this.combatants.find(c => c.tokenId === token.id);
      
      // Determine if this token should have a marker
      // It should have a marker if it's the active phase and not defeated
      const isMyPhase = hasActivePhase && combatant && (Number(combatant.initiative) === Number(activePhase)) && !combatant.defeated;
      
      this._updateTokenMarker(token, isMyPhase, activePhase);
    }
  }

  /**
   * Internal helper to add/remove/update the marker sprite on a token.
   * @private
   */
  _updateTokenMarker(token, active, phase) {
    // Look for existing marker
    let marker = token.children.find(c => c.isTrespasserMarker);

    if (!active) {
      if (marker) marker.visible = false;
      return;
    }

    const texturePath = this._getMarkerTexture(phase);
    if (!texturePath) return;

    if (!marker) {
      marker = new PIXI.Sprite(PIXI.Texture.from(texturePath));
      marker.isTrespasserMarker = true;
      marker.anchor.set(0.5, 0.5);
      
      // Position at center
      marker.position.set(token.w / 2, token.h / 2);
      
      // Scale slightly larger than token
      const scale = 1.4;
      marker.width = token.w * scale;
      marker.height = token.h * scale;
      
      marker.zIndex = -1; // Under the token
      token.addChildAt(marker, 0);
    } else {
      marker.texture = PIXI.Texture.from(texturePath);
      marker.visible = true;
      // Re-center and re-scale in case token size changed
      marker.position.set(token.w / 2, token.h / 2);
      marker.width = token.w * 1.4;
      marker.height = token.h * 1.4;
    }
  }

  /**
   * Determine the correct ring texture for a given phase.
   * @private
   */
  _getMarkerTexture(phase) {
    const PHASES = TrespasserCombat.PHASES;
    switch(Number(phase)) {
      case PHASES.EARLY: return "systems/trespasser/assets/icons/ring_early.svg";
      case PHASES.ENEMY: return "systems/trespasser/assets/icons/ring_enemy.svg";
      case PHASES.LATE:  return "systems/trespasser/assets/icons/ring.svg";
      case PHASES.EXTRA: return "systems/trespasser/assets/icons/ring.svg";
      default:           return "systems/trespasser/assets/icons/ring.svg";
    }
  }
}

/**
 * GM-side listener for initiative roll results from players.
 */
Hooks.on("updateActor", async (actor, updates, options, userId) => {
  const result = foundry.utils.getProperty(updates, "flags.trespasser.initiativeRollResult");
  if (result && game.user.isGM) {
    const combat = game.combats.get(result.combatId);
    if (combat) {
      await combat._processInitiativeResult(result.combatantId, result.total, result.isNat20);
    }
    // Cleanup flag
    await actor.unsetFlag("trespasser", "initiativeRollResult");
  }
});