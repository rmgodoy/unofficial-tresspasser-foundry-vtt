import { TrespasserCombat } from "../documents/combat.mjs";
import { evaluateRetreat, attemptRetreat } from "./combat-retreat.mjs";
import { rollAllTrespasserInitiatives } from "./combat-round-init.mjs";

export { rollAllTrespasserInitiatives, attemptRetreat, evaluateRetreat };

/**
 * Helper to create an extra proxy combatant for Paragon/Tyrant or Nat 20 extra turns.
 * @param {Combatant} baseCombatant 
 * @param {number} initiative 
 * @returns {object}
 */
export function createExtraCombatant(baseCombatant, initiative) {
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
 * Post Peril roll to chat.
 * @param {Combat} combat
 * @param {object} combatInfo 
 */
export async function postPerilToChat(combat, combatInfo) {
  if (!game.settings.get("trespasser", "showPerilInChat")) return;
  
  const label = game.i18n.localize(combatInfo.perilLabel);
  const content = await foundry.applications.handlebars.renderTemplate("systems/trespasser/templates/chat/peril-card.hbs", {
    total: combatInfo.perilTotal,
    label: label,
    heavy: combatInfo.heavy,
    mighty: combatInfo.mighty,
    panicLevel: combatInfo.panicLevel
  });

  await ChatMessage.create({
    content: content,
    flavor: game.i18n.localize("TRESPASSER.Terms.Combat.Peril")
  });
}

/**
 * Roll initiative for a single player combatant.
 * @param {Combat} combat
 * @param {string} combatantId
 */
export async function rollPlayerInitiative(combat, combatantId) {
  const combatant = combat.combatants.get(combatantId);
  if (!combatant?.actor || (combatant.actor.type !== "character" && combatant.actor.type !== "commoner" && combatant.actor.type !== "companion")) return;
  if (!combatant.getFlag("trespasser", "initiativePending")) return;

  const isCompanion = combatant.actor.type === "companion";
  const initMode = isCompanion ? (combatant.actor.system.initiativeMode ?? "follow") : null;
  if (isCompanion && initMode === "follow" && combatant.actor.system.boundCharacterId) {
    const boundId = combatant.actor.system.boundCharacterId;
    const charCombatant = combat.combatants.find(c => c.actorId === boundId && !c.defeated);
    if (charCombatant && !charCombatant.getFlag("trespasser", "initiativePending") && charCombatant.initiative != null) {
      if (game.user.isGM) {
        await combat.updateEmbeddedDocuments("Combatant", [{
          _id: combatantId,
          initiative: charCombatant.initiative,
          "flags.trespasser.initiativePending": false
        }]);
        await checkAllInitiativesRolled(combat);
      } else {
        await combatant.actor.setFlag("trespasser", "initiativeRollResult", {
          combatId: combat.id,
          combatantId: combatantId,
          total: charCombatant.initiative,
          isNat20: false
        });
      }
      return;
    }
  }

  const isSluggish = combatant.actor.system.hasPlight?.("sluggish") || false;
  let total = 0;
  let isNat20 = false;

  if (isSluggish) {
    if (game.settings.get("trespasser", "showInitiativeInChat")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
        content: game.i18n.localize("TRESPASSER.Chat.Check.SluggishAutofail"),
        flavor: game.i18n.localize("TRESPASSER.Sheet.Combat.Initiative")
      });
    }
  } else {
    const initBonus = combatant.actor.system.combat?.initiative || 0;
    const isAdv = combatant.actor.getFlag("trespasser", "initiativeAdvantage") || false;
    const formula = isAdv ? "2d20kh" : "1d20";
    const roll = new foundry.dice.Roll(`${formula} + ${initBonus}`);
    await roll.evaluate();

    total = roll.total;
    isNat20 = roll.dice[0].results[0].result === 20;

    const combatInfo = combat.getFlag("trespasser", "combatInfo") || {};
    const enemyMaxInit = combatInfo.enemyMaxInit || 0;
    const isRetreat = combat.getFlag("trespasser", "retreatPending");

    if (game.settings.get("trespasser", "showInitiativeInChat")) {
      let flavor = "";

      if (isRetreat) {
        const retreatSuccess = total >= enemyMaxInit;
        const retreatKey = retreatSuccess ? "TRESPASSER.Chat.Retreat.Success" : "TRESPASSER.Chat.Retreat.Fail";
        flavor = game.i18n.format(retreatKey, { name: combatant.actor.name, total, dc: enemyMaxInit });
      } else {
        const isSuccess = total >= enemyMaxInit;
        let outcomeLabel = isSuccess
          ? (game.i18n.localize("TRESPASSER.Chat.Check.EarlyPhaseSuccess") || "SUCESSO! (Fase Inicial)")
          : (game.i18n.localize("TRESPASSER.Chat.Check.LatePhaseFail") || "FALHA (Fase Tardia)");
        let outcomeColor = isSuccess ? "var(--trp-green-bright, #4fc3f7)" : "var(--trp-red, #ff5252)";

        if (isNat20) {
          outcomeLabel = game.i18n.localize("TRESPASSER.Chat.Check.CritInitSuccess") || "SUCESSO CRÍTICO! (Fase Inicial + Turno Extra)";
          outcomeColor = "var(--trp-gold-bright, #e8c96b)";
        }

        const baseFlavor = game.i18n.format("TRESPASSER.Chat.Check.Initiative", { max: enemyMaxInit });
        flavor = `<div class="trespasser-chat-card">
          <h4>${baseFlavor}</h4>
          <div style="font-weight: bold; color: ${outcomeColor}; font-size: var(--fs-12); margin-top: 4px;">
            ${outcomeLabel}
          </div>
        </div>`;
      }

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
        flavor
      });
    }
  }

  if (game.user.isGM) {
    await processInitiativeResult(combat, combatantId, total, isNat20);
  } else {
    await combatant.actor.setFlag("trespasser", "initiativeRollResult", {
      combatId: combat.id,
      combatantId: combatantId,
      total: total,
      isNat20: isNat20
    });
  }
}

/**
 * Apply the processed initiative result for a combatant.
 * @param {Combat} combat
 * @param {string} combatantId
 * @param {number} total
 * @param {boolean} isNat20
 */
export async function processInitiativeResult(combat, combatantId, total, isNat20) {
  const combatant = combat.combatants.get(combatantId);
  if (!combatant) return;

  const combatInfo = combat.getFlag("trespasser", "combatInfo") || {};
  const enemyMaxInit = combatInfo.enemyMaxInit || 0;
  
  const updates = [{ _id: combatantId, "flags.trespasser.initiativePending": false }];
  const newCombatants = [];
  const isRetreat = combat.getFlag("trespasser", "retreatPending");

  let assignedInitiative;
  if (isRetreat) {
    assignedInitiative = total;
    updates[0].initiative = total;
  } else {
    const isSluggish = combatant.actor?.system.hasPlight?.("sluggish") || false;
    if (isSluggish) {
      assignedInitiative = TrespasserCombat.PHASES.LATE;
    } else if (isNat20) {
      assignedInitiative = TrespasserCombat.PHASES.EARLY;
      const extraData = createExtraCombatant(combatant, TrespasserCombat.PHASES.LATE);
      newCombatants.push(extraData);
    } else if (total >= enemyMaxInit) {
      assignedInitiative = TrespasserCombat.PHASES.EARLY;
    } else {
      assignedInitiative = TrespasserCombat.PHASES.LATE;
    }
    updates[0].initiative = assignedInitiative;
  }

  if (combatant.actor?.type === "character") {
    const boundCompanions = combat.combatants.filter(c =>
      c.actor?.type === "companion" &&
      c.actor.system.boundCharacterId === combatant.actor.id &&
      (c.actor.system.initiativeMode ?? "follow") === "follow" &&
      !c.defeated
    );
    for (const compCombatant of boundCompanions) {
      updates.push({
        _id: compCombatant.id,
        initiative: assignedInitiative,
        "flags.trespasser.initiativePending": false
      });
    }
  }

  await combat.updateEmbeddedDocuments("Combatant", updates);
  if (newCombatants.length > 0) {
    await combat.createEmbeddedDocuments("Combatant", newCombatants);
  }

  await checkAllInitiativesRolled(combat);
}

/**
 * Check if all player combatants have rolled initiative.
 * @param {Combat} combat
 */
export async function checkAllInitiativesRolled(combat) {
  const pending = combat.combatants.filter(c =>
    (c.actor?.type === "character" || c.actor?.type === "commoner" || c.actor?.type === "companion") &&
    !c.defeated &&
    c.getFlag("trespasser", "initiativePending")
  );

  if (pending.length === 0) {
    await combat.setFlag("trespasser", "waitingForInitiatives", false);

    const initialPhase = combat._firstNonEmptyPhase();
    await combat.setFlag("trespasser", "activePhase", initialPhase);
    
    if (game.user.isGM) {
      const isRetreat = combat.getFlag("trespasser", "retreatPending");
      if (isRetreat) {
        await evaluateRetreat(combat);
      } else {
        await combat._onStartOfTurn(initialPhase);
      }
    }
  }
}
