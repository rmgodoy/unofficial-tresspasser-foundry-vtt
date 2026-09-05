import { TrespasserCombat } from "../documents/combat.mjs";

/**
 * Handle the retreat attempt flow.
 * @param {Combat} combat 
 * @param {number} enemyMaxInit 
 */
export async function attemptRetreat(combat, enemyMaxInit) {
  const playerFacingInit = game.settings.get("trespasser", "playerFacingInitiative");
  
  // Post attempt to chat
  await ChatMessage.create({
    content: `<h3 style="color:var(--trp-gold-bright)">${game.i18n.localize("TRESPASSER.Chat.Retreat.Attempt")}</h3>`
  });

  if (playerFacingInit) {
    await combat.setFlag("trespasser", "retreatPending", true);
    await combat.setFlag("trespasser", "waitingForInitiatives", true);
    return;
  }

  // GM rolls for everyone
  for (const c of combat.combatants) {
    if ((c.actor?.type === "character" || c.actor?.type === "commoner") && !c.defeated) {
      const initBonus = c.actor.system.combat?.initiative || 0;
      const roll = new foundry.dice.Roll(`1d20 + ${initBonus}`);
      await roll.evaluate();
      
      if (game.settings.get("trespasser", "showInitiativeInChat")) {
        const retreatSuccess = roll.total >= enemyMaxInit;
        const retreatKey = retreatSuccess ? "TRESPASSER.Chat.Retreat.Success" : "TRESPASSER.Chat.Retreat.Fail";
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: c.actor }),
          flavor: game.i18n.format(retreatKey, { name: c.actor.name, total: roll.total, dc: enemyMaxInit })
        });
      }
      
      await c.setFlag("trespasser", "initiativePending", false);
      await c.update({ initiative: roll.total });
    }
  }

  await evaluateRetreat(combat);
}

/**
 * Evaluate if the retreat succeeded.
 * @param {Combat} combat
 */
export async function evaluateRetreat(combat) {
  const combatInfo = combat.getFlag("trespasser", "combatInfo");
  const enemyMaxInit = combatInfo.enemyMaxInit;
  
  const pcs = combat.combatants.filter(c => (c.actor?.type === "character" || c.actor?.type === "commoner") && !c.defeated);
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
      content: `<h2 style="color:var(--trp-green-bright)">${game.i18n.format("TRESPASSER.Chat.Retreat.PartyEscaped", { successes, total: pcs.length })}</h2>`
    });
    
    if (game.settings.get("trespasser", "autoEndCombatOnRetreat")) {
      await combat.endCombat();
      return;
    }
  } else {
    await ChatMessage.create({
      content: `<h2 style="color:var(--trp-red)">${game.i18n.format("TRESPASSER.Chat.Retreat.PartyFailed", { successes, total: pcs.length, needed })}</h2>`
    });
  }

  await combat.setFlag("trespasser", "retreatPending", false);
  
  const updates = [];
  for (const c of pcs) {
    const total = c.initiative;
    const initValue = total >= enemyMaxInit ? TrespasserCombat.PHASES.EARLY : TrespasserCombat.PHASES.LATE;
    updates.push({ _id: c.id, initiative: initValue });
  }
  
  if (updates.length > 0) {
    await combat.updateEmbeddedDocuments("Combatant", updates);
  }

  const initialPhase = combat._firstNonEmptyPhase();
  await combat.setFlag("trespasser", "activePhase", initialPhase);
  await combat._onStartOfRound();
  await combat._onStartOfTurn(initialPhase);
}
