/**
 * Custom Combat class for Trespasser TTRPG.
 */
export class TrespasserCombat extends Combat {

  /** @override */
  async startCombat() {
    // Roll custom initiatives per Trespasser rules before starting
    if ( game.user.isGM ) {
      await this.rollAllTrespasserInitiatives();
      
      // Initialize Focus for Player Characters
      for (const combatant of this.combatants) {
        if (combatant.actor?.type === "character") {
          const skillBonus = combatant.actor.system.skill || 2;
          await combatant.actor.update({ "system.combat.focus": skillBonus });
        }
      }
    }
    return super.startCombat();
  }

  /** @override */
  async nextRound() {
    // Reroll initiatives every round before advancing
    if ( game.user.isGM ) {
      await this.rollAllTrespasserInitiatives();
    }
    return super.nextRound();
  }

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
        // Enemies are set to base 30 (Enemies Phase)
        updates.push({ _id: c.id, initiative: 30 });

        // Paragon or Tyrant gets an extra turn at initiative 10 (Paragon Phase)
        const template = actor.system.template;
        if ( template === "paragon" || template === "tyrant" ) {
          const extraData = c.toObject();
          delete extraData._id;
          extraData.initiative = 10;
          extraData.flags = extraData.flags || {};
          extraData.flags.trespasser = extraData.flags.trespasser || {};
          extraData.flags.trespasser.isExtraTurn = true;
          extraData.name = game.i18n.format("TRESPASSER.Sheet.Combat.Panic.Phase2", { name: c.name });
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
          // Nat 20 acts in both Player Phase 1 (40) and Player Phase 2 (20)
          updates.push({ _id: c.id, initiative: 40 });

          const extraData = c.toObject();
          delete extraData._id;
          extraData.initiative = 20;
          extraData.flags = extraData.flags || {};
          extraData.flags.trespasser = extraData.flags.trespasser || {};
          extraData.flags.trespasser.isExtraTurn = true;
          extraData.name = game.i18n.format("TRESPASSER.Sheet.Combat.Panic.Phase2", { name: c.name });
          newCombatants.push(extraData);
        } else if ( total >= enemyMaxInit ) {
          // >= enemy max: Player Phase 1 (40)
          updates.push({ _id: c.id, initiative: 40 });
        } else {
          // < enemy max: Player Phase 2 (20)
          updates.push({ _id: c.id, initiative: 20 });
        }
      } else {
        // Fallback for non-character/creature (e.g. traps/hazards)
        updates.push({ _id: c.id, initiative: 0 });
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

    // - the enemies are outnumbered (+2)
    if ( livingPlayers.length > livingEnemies.length ) {
      panicLevel += 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.EnemiesOutnumbered"));
    }

    // - half the enemies are defeated (+2)
    if ( enemies.length > 0 && deadEnemies.length >= (enemies.length / 2) ) {
      panicLevel += 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.HalfEnemiesDefeated"));
    }

    // - a paragon is defeated (+2)
    const deadParagon = enemies.some(c => {
      const t = c.actor?.system.template;
      return (t === "paragon" || t === "tyrant") && c.defeated;
    });
    if ( deadParagon ) {
      panicLevel += 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.ParagonDefeated"));
    }

    // - at least one character is defeated (-2)
    if ( deadPlayers.length > 0 ) {
      panicLevel -= 2;
      reasons.push(game.i18n.localize("TRESPASSER.Sheet.Combat.Panic.CharacterDefeated"));
    }

    // 5. Roll Peril (2d6) and whisper GM
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
    // 5. When encounter ends, remove Combat Effects from actors
    if ( game.user.id === userId ) {
      // Find all unique actors in the encounter
      const uniqueActors = new Set();
      for ( const c of this.combatants ) {
        if ( c.actor ) uniqueActors.add(c.actor);
      }

      for ( const actor of uniqueActors ) {
        const combatEffects = actor.items.filter(i => i.type === "effect" && i.system.isCombat === true);
        if ( combatEffects.length > 0 ) {
          await actor.deleteEmbeddedDocuments("Item", combatEffects.map(i => i.id));
        }
        // Reset Focus to 0
        await actor.update({ "system.combat.focus": 0 });
      }
    }
    return super._onDelete(options, userId);
  }
}
