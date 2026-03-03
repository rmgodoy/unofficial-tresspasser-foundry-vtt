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
    CRITICAL: 10,  // Nat 20 initiative rolls
    END:       0   // Paragon/Tyrant extra turn at end of round
  };

  /**
   * Mapping of phase values to localized labels.
   */
  static PHASE_LABELS = {
    40: "TRESPASSER.Phase.Early",
    30: "TRESPASSER.Phase.Enemy",
    20: "TRESPASSER.Phase.Late",
    10: "TRESPASSER.Phase.Critical",
    0: "TRESPASSER.Phase.End"
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
      await this.setFlag("trespasser", "activePhase", this._firstNonEmptyPhase());
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
      await this.setFlag("trespasser", "activePhase", this._firstNonEmptyPhase());
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
    const currentCombatants = this.combatants.filter(c => c.initiative === currentPhase && !c.defeated);
    for (const c of currentCombatants) {
      // Force AP to 0 (in case they didn't spend it all)
      await c.setFlag("trespasser", "actionPoints", 0);
      if (c.actor) await c.actor.onTurnEnd(c);
    }

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
      const phaseEntrants = this.combatants.filter(c => c.initiative === nextPhase && !c.defeated);
      for (const c of phaseEntrants) {
        // Reset per-turn flags
        await c.setFlag("trespasser", "hasMovedThisTurn", false);
        await c.setFlag("trespasser", "usedExpensiveDeed", false);

        if (c.actor) {
          await c.actor.onTurnStart();
        }
      }
    } else {
      // ── 3b. No more phases → end of round ────────────────────────────────
      // End-of-round effects for all combatants
      for (const c of this.combatants) {
        if (c.actor) {
          await TrespasserEffectsHelper.triggerEffects(c.actor, "end-of-round");
        }
      }
      // Advance to a new round (which re-rolls initiative and sets activePhase)
      return this.nextRound();
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
          const extraData = c.toObject();
          delete extraData._id;
          extraData.initiative = TrespasserCombat.PHASES.END;
          extraData.flags = extraData.flags || {};
          extraData.flags.trespasser = extraData.flags.trespasser || {};
          extraData.flags.trespasser.isExtraTurn = true;
          extraData.flags.trespasser.actionPoints = 3;
          extraData.name = game.i18n.format("TRESPASSER.Sheet.Combat.Panic.Phase2", { name: c.name });
          newCombatants.push(extraData);
        }
      } else if ( actor.type === "character" ) {
        // Player rolls 1d20 + Initiative
        const initBonus = actor.system.combat?.initiative || 0;
        const roll = new foundry.dice.Roll(`1d20 + ${initBonus}`);
        await roll.evaluate({ async: true });
        
        // Broadcast the roll so everyone sees it
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          flavor: game.i18n.format("TRESPASSER.Chat.Initiative", { max: enemyMaxInit })
        });

        const total = roll.total;
        const isNat20 = roll.dice[0].results[0].result === 20;

        if ( isNat20 ) {
          // Nat 20: acts in CRITICAL phase (10)
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.CRITICAL });
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
    await perilRoll.evaluate({ async: true });
    
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

    const formsPanic = perilTotal <= panicLevel;
    const moraleStatus = formsPanic 
      ? `<p class="miss-text">${game.i18n.format("TRESPASSER.Sheet.Combat.Panic.PanicStatus", { peril: perilTotal, panic: panicLevel })}</p>` 
      : `<p class="hit-text">${game.i18n.format("TRESPASSER.Sheet.Combat.Panic.MoraleHolds", { peril: perilTotal, panic: panicLevel })}</p>`;

    const gmUsers = game.users.filter(u => u.isGM).map(u => u.id);
    if ( gmUsers.length > 0 ) {
      const content = `
        <div class="trespasser-chat-card">
          <h3>${game.i18n.format("TRESPASSER.Sheet.Combat.Panic.PerilRound", { round: this.round + 1, label: perilLabel, total: perilTotal })}</h3>
          <p>${game.i18n.format("TRESPASSER.Sheet.Combat.Panic.DeedUsage", { heavy, mighty })}</p>
          <hr />
          <p><strong>${game.i18n.format("TRESPASSER.Sheet.Combat.Panic.Title", { panic: panicLevel })}</strong></p>
          <ul style="font-size: 11px; margin: 0; padding-left: 15px;">
            ${reasons.map(r => `<li>${r}</li>`).join("") || `<li>${game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.NoAdjustments")}</li>`}
          </ul>
          ${moraleStatus}
        </div>
      `;
      foundry.documents.BaseChatMessage.create({
        content: content,
        whisper: gmUsers,
        speaker: { alias: game.i18n.localize("TRESPASSER.Chat.System") || "System" }
      });
    }
  }

  /** @override */
  async _onDelete(options, userId) {
    if ( game.user.id === userId ) {
      const uniqueActors = new Set();
      for ( const c of this.combatants ) {
        if ( c.actor ) uniqueActors.add(c.actor);
      }

      for ( const actor of uniqueActors ) {
        const combatEffects = actor.items.filter(i => i.type === "effect" && i.system.isCombat === true);
        if ( combatEffects.length > 0 ) {
          await actor.deleteEmbeddedDocuments("Item", combatEffects.map(i => i.id));
        }
        await actor.update({ "system.combat.focus": 0 });
      }
    }
    return super._onDelete(options, userId);
  }
}

