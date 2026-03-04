import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

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

  /** @override */
  async startCombat() {
    if ( game.user.isGM ) {
      await this.rollAllTrespasserInitiatives();
      
      // Initialize Focus and AP for Player Characters
      const updates = [];
      for (const combatant of this.combatants) {
        if (combatant.actor?.type === "character") {
          const skillBonus = combatant.actor.system.skill || 2;
          await combatant.actor.update({ "system.combat.focus": skillBonus });
        }
        // Every actor starts with 3 AP by default
        updates.push({ _id: combatant.id, "flags.trespasser.actionPoints": 3 });
      }
      if (updates.length > 0) await this.updateEmbeddedDocuments("Combatant", updates);

      // Set initial phase to the first non-empty phase
      const initialPhase = this._firstNonEmptyPhase();
      await this.setFlag("trespasser", "activePhase", initialPhase);

      // Trigger start-of-combat, start-of-round, and start-of-turn for the first phase
      await this._onStartOfCombat();
      await this._onStartOfRound();
      await this._onStartOfTurn(initialPhase);
    }
    return super.startCombat();
  }

  /** @override */
  async nextRound() {
    if ( game.user.isGM ) {
      await this.rollAllTrespasserInitiatives();
      // Reset AP for everyone
      const updates = this.combatants.map(c => ({ _id: c.id, "flags.trespasser.actionPoints": 3 }));
      await this.updateEmbeddedDocuments("Combatant", updates);
      // Reset phase to first non-empty phase
      const initialPhase = this._firstNonEmptyPhase();
      await this.setFlag("trespasser", "activePhase", initialPhase);

      // Trigger start-of-round and start-of-turn for the first phase
      await this._onStartOfRound();
      await this._onStartOfTurn(initialPhase);
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
    for (const c of this.combatants) {
      if (c.actor) {
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
      // Reset per-turn flags
      await c.setFlag("trespasser", "hasMovedThisTurn", false);
      await c.setFlag("trespasser", "usedExpensiveDeed", false);

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
   * Custom method to resolve Trespasser initiatives.
   * Cleans up proxy combatants, calculates extra turns, assigns phases, and rolls Peril.
   */
  async rollAllTrespasserInitiatives() {
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

    // To prevent infinite loop with new proxy combatants, snapshot current base combatants
    const baseCombatants = this.combatants.filter(c => !c.getFlag("trespasser", "isExtraTurn"));

    for ( const c of baseCombatants ) {
      const actor = c.actor;
      if ( !actor ) continue;

      if ( actor.type === "creature" ) {
        // Enemies are set to base 30 (Enemy Phase)
        updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.ENEMY });

        // Paragon or Tyrant gets an extra turn at End of Round (0)
        const template = actor.system.template;
        if ( template === "paragon" || template === "tyrant" ) {
          const extraData = this.createExtraCombatant(c, TrespasserCombat.PHASES.EXTRA);
          newCombatants.push(extraData);
        }
      } else if ( actor.type === "character" ) {
        // Player rolls 1d20 + Initiative
        const initBonus = actor.system.combat?.initiative || 0;
        const roll = new foundry.dice.Roll(`1d20 + ${initBonus}`);
        await roll.evaluate();
        
        // Broadcast the roll so everyone sees it (if setting is enabled)
        if (game.settings.get("trespasser", "showInitiativeInChat")) {
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            flavor: game.i18n.format("TRESPASSER.Chat.Initiative", { max: enemyMaxInit })
          });
        }

        const total = roll.total;
        const isNat20 = roll.dice[0].results[0].result === 20;

        if ( isNat20 || true) {
          // Nat 20: acts in Extra phase (10)
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY });
          const extraData = this.createExtraCombatant(c, TrespasserCombat.PHASES.LATE);
          newCombatants.push(extraData);
        } else if ( total >= enemyMaxInit ) {
          // >= enemy max: Early (40)
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY });
        } else {
          // < enemy max: Late (20)
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.LATE });
        }
      } else {
        // Fallback for non-character/creature (e.g. traps/hazards)
        updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.END });
      }
    }

    // Apply updates
    if ( updates.length > 0 ) {
      await this.updateEmbeddedDocuments("Combatant", updates);
    }
    
    // Create extra proxy combatants
    if ( newCombatants.length > 0 ) {
      await this.createEmbeddedDocuments("Combatant", newCombatants);
    }

    // 4. Calculate Panic Level
    let panicLevel = 2;
    
    const players = baseCombatants.filter(c => c.actor?.type === "character");
    const enemies = baseCombatants.filter(c => c.actor?.type === "creature");

    const livingPlayers = players.filter(c => !c.defeated);
    const livingEnemies = enemies.filter(c => !c.defeated);
    
    const deadPlayers = players.filter(c => c.defeated);
    const deadEnemies = enemies.filter(c => c.defeated);

    const reasons = [];

    if ( livingPlayers.length > livingEnemies.length ) {
      panicLevel += 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.EnemiesOutnumbered"));
    }

    if ( enemies.length > 0 && deadEnemies.length >= (enemies.length / 2) ) {
      panicLevel += 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.HalfEnemiesDefeated"));
    }

    const deadParagon = enemies.some(c => {
      const t = c.actor?.system.template;
      return (t === "paragon" || t === "tyrant") && c.defeated;
    });
    if ( deadParagon ) {
      panicLevel += 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.ParagonDefeated"));
    }

    if ( deadPlayers.length > 0 ) {
      panicLevel -= 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.CharacterDefeated"));
    }

    // 5. Roll Peril (2d6) and store in flags
    const perilRoll = new foundry.dice.Roll("2d6");
    await perilRoll.evaluate();
    
    const perilTotal = perilRoll.total;
    let perilLabel = "";
    let heavy = 0;
    let mighty = 0;

    if ( perilTotal <= 6 ) {
      perilLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.Labels.Low");
      heavy = 1;
      mighty = 0;
    } else if ( perilTotal >= 7 && perilTotal <= 9 ) {
      perilLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.Labels.Medium");
      heavy = 1;
      mighty = 1;
    } else {
      perilLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.Labels.High");
      heavy = 2;
      mighty = 1;
    }

    // Store combat state in flags for the tracker
    await this.setFlag("trespasser", "combatInfo", {
      perilTotal,
      perilLabel,
      heavy,
      mighty,
      panicLevel,
      enemyMaxInit
    });
  }

  /** @override */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (collection !== "Combatant") return;
    if (!this.started || !game.user.isGM || game.user.id !== userId) return;

    // Check if any initiative or defeated state was changed
    const needsCheck = changes.some(c => c.initiative !== undefined || c.defeated !== undefined);
    if (needsCheck) this.verifyPhaseAdvancement();
  }

  /**
   * Checks if the current phase is empty and advances if necessary.
   */
  async verifyPhaseAdvancement() {
    if (!this.started || !game.user.isGM) return;
    const currentPhase = this.getFlag("trespasser", "activePhase");
    const activeCombatants = this.combatants.filter(c => c.initiative === currentPhase && !c.defeated);
    
    if (activeCombatants.length === 0) {
      console.log(`Trespasser | Phase ${currentPhase} is now empty. Advancing...`);
      return this.nextPhase();
    }
  }

  /**
   * Trigger end-of-combat effects for all combatants and clean up.
   */
  async _onEndOfCombat() {
    const uniqueActors = new Set();
    for (const c of this.combatants) {
      if (c.actor) uniqueActors.add(c.actor);
      const token = canvas.tokens.placeables.find(t => t.id === c.tokenId)
      if (token) this.clearTurnIndicator(token);
    }

    for (const actor of uniqueActors) {
      // 1. Trigger end-of-combat effects
      await TrespasserEffectsHelper.triggerEffects(actor, "end-of-combat");

      // 2. Clean up "isCombat" effects
      const combatEffects = actor.items.filter(i => i.type === "effect" && i.system.isCombat === true);
      if (combatEffects.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", combatEffects.map(i => i.id));
      }

      // 3. Reset focus
      await actor.update({ "system.combat.focus": 0 });
    }
  }

  /** @override */
  async _preDelete(options, user) {
    if ( game.user.id === user.id ) {
      await this._onEndOfCombat();
    }
    return super._preDelete(options, user);
  }

  /**
   * Creates an extra combatant for a given actor and phase.
   * @param {Actor} actor The actor to create an extra combatant for.
   * @param {number} phase The phase to create the extra combatant for.
   * @returns {Object} The extra combatant data.
   */
  createExtraCombatant(actor, phase) {
    const extraData = actor.toObject();
    delete extraData._id;
    extraData.initiative = phase;
    extraData.flags = extraData.flags || {};
    extraData.flags.trespasser = extraData.flags.trespasser || {};
    extraData.flags.trespasser.isExtraTurn = true;
    extraData.flags.trespasser.actionPoints = 3;
    extraData.name = game.i18n.format("TRESPASSER.Sheet.Combat.Panic.Phase2", { name: actor.name });
    return extraData;
  }

  /**
   * Update turn markers on all tokens for a given phase.
   * Removes any existing marker and draws a new one on the first combatant in the phase.
   * @param {number} phase
   */
  updateTurnMarkers(phase) {
    for(const token of canvas.tokens.placeables) {
      const combatants = game.combat.combatants.filter(c => c.tokenId === token.id);
      let alreadyUpdated = false;
      for (const combatant of combatants) {
        if (alreadyUpdated) continue;
        if (token._trespasserTurnMarker) {
          token._trespasserTurnMarker.destroy();
          token._trespasserTurnMarker = undefined;
        }

        if (combatant.initiative === phase) {
          game.combat.drawTurnIndicator(token, phase);
          alreadyUpdated = true;
          continue;
        }
      }
    }
  }

  /**
 * Draw an animated turn indicator arrow above a token (similar to Foundry's native marker)
 * @param {Token} token - The token to draw the indicator for
 * @param {string} phase - The current combat phase (early/enemy/late)
 */
  drawTurnIndicator(token, phase) {
    // IMPORTANT: Prevent duplicate markers - check if one already exists
    if (token._trespasserTurnMarker) {
      return; // Already has a marker, don't add another
    }

    const isHostile = token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
    let markerPath = "systems/trespasser/assets/icons/ring.svg";
    if (isHostile) {
      markerPath = "systems/trespasser/assets/icons/ring_enemy.svg";
    } else {
      markerPath = "systems/trespasser/assets/icons/ring_early.svg";
    }

    // Calculate token dimensions
    const gridSize = canvas.grid.size;
    const tokenSize = token.document.width * gridSize;

    // Create a container for the turn marker
    const container = new PIXI.Container();

    // Mark this token as having a marker IMMEDIATELY (before async load)
    // This prevents race conditions with multiple calls
    token._trespasserTurnMarker = container;

    // Add the container to the token right away
    token.addChild(container);

    // Load the texture and create sprite asynchronously
    foundry.canvas.loadTexture(markerPath).then(texture => {
      // Check if the marker was removed while we were loading
      if (token._trespasserTurnMarker !== container || container.destroyed) {
        return;
      }

      const sprite = new PIXI.Sprite(texture);

      // Size the sprite (about 40% of token size)
      const markerSize = tokenSize * 1.5;
      sprite.width = markerSize;
      sprite.height = markerSize;

      // Center the sprite's anchor
      sprite.anchor.set(0.5, 0.5);

      // Position at top center of token, slightly above
      sprite.x = tokenSize / 2;
      sprite.y = tokenSize / 2;
      sprite._zIndex = 1000; // Ensure it's on top
      console.log(sprite)
      container.addChild(sprite);

      // Clean up function to remove the ticker when destroyed
      const originalDestroy = container.destroy.bind(container);
      container.destroy = function(options) {
        if (container._animationTicker) {
          canvas.app.ticker.remove(container._animationTicker);
        }
        originalDestroy(options);
      };

    }).catch(error => {
      console.warn("Trespasser | Failed to load turn marker texture:", error);
      // Check if the marker was removed while we were loading
      if (token._trespasserTurnMarker !== container) {
        return;
      }
      // Remove the empty container and use fallback
      container.destroy();
      token._trespasserTurnMarker = null;
      drawFallbackTurnIndicator(token, phase);
    });
  }

  /**
   * Clear the turn indicator from a token.
   * @param {Token} token - The token to clear the indicator from
   */
  clearTurnIndicator(token) {
    if (token._trespasserTurnMarker) {
      token._trespasserTurnMarker.destroy();
      token._trespasserTurnMarker = null;
    }
  }
}

