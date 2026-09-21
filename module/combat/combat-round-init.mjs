import { TrespasserCombat } from "../documents/combat.mjs";
import { createExtraCombatant, postPerilToChat } from "./combat-initiative.mjs";
import { SYSTEM_ID, getSystemFlag, setSystemFlag } from "../system-id.mjs";

/**
 * Resolve Trespasser initiatives for all combatants at the start of a combat or new round.
 * @param {Combat} combat
 * @returns {Promise<{updates: Array<object>, newCombatants: Array<object>}>}
 */
export async function rollAllTrespasserInitiatives(combat) {
  const playerFacingInit = game.settings.get(SYSTEM_ID, "playerFacingInitiative");
  
  const extras = combat.combatants.filter(c => getSystemFlag(c, "isExtraTurn"));
  if (extras.length > 0) {
    await combat.deleteEmbeddedDocuments("Combatant", extras.map(c => c.id));
  }

  const livingCreatures = combat.combatants.filter(c => {
    const actor = c.actor;
    if (!actor || actor.type !== "creature") return false;
    return !c.defeated;
  });

  let enemyMaxInit = 0;
  for (const c of livingCreatures) {
    const init = c.actor.system.combat?.initiative || 0;
    if (init > enemyMaxInit) {
      enemyMaxInit = init;
    }
  }

  const updates = [];
  const newCombatants = [];
  let hasPending = false;

  const baseCombatants = combat.combatants.filter(c => !getSystemFlag(c, "isExtraTurn"));

  for (const c of baseCombatants) {
    const actor = c.actor;
    if (!actor) continue;

    if (actor.type === "creature") {
      updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.ENEMY, [`flags.${SYSTEM_ID}.initiativePending`]: false });

      const template = actor.system.template;
      if (template === "paragon" || template === "tyrant") {
        const extraData = createExtraCombatant(c, TrespasserCombat.PHASES.EXTRA);
        newCombatants.push(extraData);
      }
    } else if (actor.type === "character" || actor.type === "commoner") {
      if (playerFacingInit) {
        updates.push({
          _id: c.id,
          initiative: null,
          [`flags.${SYSTEM_ID}.initiativePending`]: true
        });
        hasPending = true;
      } else {
        const isSluggish = actor.system.hasPlight?.("sluggish") || false;
        let total = 0;
        let isNat20 = false;

        if (isSluggish) {
          if (game.settings.get(SYSTEM_ID, "showInitiativeInChat")) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              content: game.i18n.localize("TRESPASSER.Chat.Check.SluggishAutofail"),
              flavor: game.i18n.localize("TRESPASSER.Sheet.Combat.Initiative")
            });
          }
        } else {
          const initBonus = actor.system.combat?.initiative || 0;
          const roll = new foundry.dice.Roll(`1d20 + ${initBonus}`);
          await roll.evaluate();
          
          if (game.settings.get(SYSTEM_ID, "showInitiativeInChat")) {
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              flavor: game.i18n.format("TRESPASSER.Chat.Check.Initiative", { max: enemyMaxInit })
            });
          }

          total = roll.total;
          isNat20 = roll.dice[0].results[0].result === 20;
        }

        if (isSluggish) {
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.LATE, [`flags.${SYSTEM_ID}.initiativePending`]: false });
        } else if (isNat20) {
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY, [`flags.${SYSTEM_ID}.initiativePending`]: false });
          const extraData = createExtraCombatant(c, TrespasserCombat.PHASES.LATE);
          newCombatants.push(extraData);
        } else if (total >= enemyMaxInit) {
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY, [`flags.${SYSTEM_ID}.initiativePending`]: false });
        } else {
          updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.LATE, [`flags.${SYSTEM_ID}.initiativePending`]: false });
        }
      }
    } else if (actor.type === "companion") {
      const boundCharId = actor.system.boundCharacterId;
      const boundCharCombatant = boundCharId ? baseCombatants.find(bc => bc.actorId === boundCharId) : null;
      const followsBound = (actor.system.initiativeMode ?? "follow") === "follow" && !!boundCharCombatant;

      if (followsBound) {
        if (playerFacingInit) {
          updates.push({
            _id: c.id,
            initiative: null,
            [`flags.${SYSTEM_ID}.initiativePending`]: false
          });
        } else {
          const charUp = updates.find(u => u._id === boundCharCombatant.id);
          const initVal = charUp ? charUp.initiative : TrespasserCombat.PHASES.LATE;
          updates.push({ _id: c.id, initiative: initVal, [`flags.${SYSTEM_ID}.initiativePending`]: false });
        }
      } else {
        if (playerFacingInit) {
          updates.push({
            _id: c.id,
            initiative: null,
            [`flags.${SYSTEM_ID}.initiativePending`]: true
          });
          hasPending = true;
        } else {
          const isSluggish = actor.system.hasPlight?.("sluggish") || false;
          let total = 0;
          let isNat20 = false;

          if (isSluggish) {
            if (game.settings.get(SYSTEM_ID, "showInitiativeInChat")) {
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: game.i18n.localize("TRESPASSER.Chat.Check.SluggishAutofail"),
                flavor: game.i18n.localize("TRESPASSER.Sheet.Combat.Initiative")
              });
            }
          } else {
            const initBonus = actor.system.combat?.initiative || 0;
            const isAdv = getSystemFlag(actor, "initiativeAdvantage") || false;
            const formula = isAdv ? "2d20kh" : "1d20";
            const roll = new foundry.dice.Roll(`${formula} + ${initBonus}`);
            await roll.evaluate();

            if (game.settings.get(SYSTEM_ID, "showInitiativeInChat")) {
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                flavor: game.i18n.format("TRESPASSER.Chat.Check.Initiative", { max: enemyMaxInit })
              });
            }

            total = roll.total;
            isNat20 = roll.dice[0]?.results?.[0]?.result === 20;
          }

          if (isSluggish) {
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.LATE, [`flags.${SYSTEM_ID}.initiativePending`]: false });
          } else if (isNat20) {
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY, [`flags.${SYSTEM_ID}.initiativePending`]: false });
            const extraData = createExtraCombatant(c, TrespasserCombat.PHASES.LATE);
            newCombatants.push(extraData);
          } else if (total >= enemyMaxInit) {
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.EARLY, [`flags.${SYSTEM_ID}.initiativePending`]: false });
          } else {
            updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.LATE, [`flags.${SYSTEM_ID}.initiativePending`]: false });
          }
        }
      }
    } else {
      updates.push({ _id: c.id, initiative: TrespasserCombat.PHASES.END, [`flags.${SYSTEM_ID}.initiativePending`]: false });
    }
  }

  for (const c of baseCombatants) {
    if (c.actor?.type === "companion" && c.actor.system.boundCharacterId && (c.actor.system.initiativeMode ?? "follow") === "follow") {
      const charCombatant = baseCombatants.find(bc => bc.actorId === c.actor.system.boundCharacterId);
      if (charCombatant) {
        const charUp = updates.find(u => u._id === charCombatant.id);
        const compUp = updates.find(u => u._id === c.id);
        if (charUp && compUp && charUp.initiative != null) {
          compUp.initiative = charUp.initiative;
          compUp[`flags.${SYSTEM_ID}.initiativePending`] = false;
        }
      }
    }
  }

  let panicLevel = 2;
  const players = baseCombatants.filter(c => c.actor?.type === "character" || c.actor?.type === "commoner");
  const enemies = baseCombatants.filter(c => c.actor?.type === "creature");

  const livingPlayers = players.filter(c => !c.defeated);
  const livingEnemies = enemies.filter(c => !c.defeated);
  const deadPlayers = players.filter(c => c.defeated);
  const deadEnemies = enemies.filter(c => c.defeated);

  if (livingPlayers.length > livingEnemies.length) panicLevel += 2;
  if (enemies.length > 0 && deadEnemies.length >= (enemies.length / 2)) panicLevel += 2;

  const deadParagon = enemies.some(c => {
    const t = c.actor?.system.template;
    return (t === "paragon" || t === "tyrant") && c.defeated;
  });
  if (deadParagon) panicLevel += 2;
  if (deadPlayers.length > 0) panicLevel -= 2;

  const perilRoll = new foundry.dice.Roll("2d6");
  await perilRoll.evaluate();
  
  const perilTotal = perilRoll.total;
  let perilLabel = "";
  let heavy = 0;
  let mighty = 0;

  if (perilTotal <= 6) {
    perilLabel = "TRESPASSER.Terms.Combat.PanicLabels.Low";
    heavy = 1;
    mighty = 0;
  } else if (perilTotal >= 7 && perilTotal <= 9) {
    perilLabel = "TRESPASSER.Terms.Combat.PanicLabels.Medium";
    heavy = 2;
    mighty = 1;
  } else {
    perilLabel = "TRESPASSER.Terms.Combat.PanicLabels.High";
    heavy = 1;
    mighty = 1;
  }

  const isMedium = perilTotal >= 7 && perilTotal <= 9;
  const deedDisplay = isMedium ? `${heavy}H or ${mighty}M` : `${heavy}H/${mighty}M`;

  const combatInfo = {
    perilTotal,
    perilLabel,
    heavy,
    mighty,
    panicLevel,
    enemyMaxInit,
    deedDisplay
  };
  
  await setSystemFlag(combat, "combatInfo", combatInfo);
  await postPerilToChat(combat, combatInfo);

  if (playerFacingInit) {
    await setSystemFlag(combat, "waitingForInitiatives", hasPending);
  } else {
    await setSystemFlag(combat, "waitingForInitiatives", false);
  }

  return { updates, newCombatants };
}
