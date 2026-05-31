/**
 * defense-roll-helper.mjs
 * Handles defense roll prompts for player-facing rolls using Document Flags.
 */
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";

// Map of requestId → { resolve, timeout } for pending defense rolls
const _pendingDefenseRolls = new Map();

/**
 * Called by GM: sends a defense roll request to the owning player of a character.
 * Returns a Promise that resolves when the player responds.
 * 
 * @param {object} params
 * @param {string} params.targetActorId - The character actor ID
 * @param {string} params.targetTokenId - The target token ID  
 * @param {string} params.statKey - "guard" or "resist"
 * @param {number} params.creatureDC - The creature's accuracy DC
 * @param {string} params.deedName - Name of the deed (for dialog title)
 * @param {string} params.creatureName - Name of the attacking creature
 * @returns {Promise<{total: number, diceResult: number, modifier: number, cd: number, formula: string} | null>}
 */
export async function requestPlayerDefenseRoll({ targetActorId, targetTokenId, statKey, creatureDC, deedName, creatureName }) {
  const targetActor = game.actors.get(targetActorId);
  if (!targetActor) return null;

  // Find the owning player (non-GM user with OWNER permission)
  const ownerUser = game.users.find(u => !u.isGM && targetActor.testUserPermission(u, "OWNER") && u.active);
  
  // If no active owner found, fall back to GM rolling (current behavior)
  if (!ownerUser) {
    return _rollDefenseLocally(targetActor, statKey, creatureDC, deedName);
  }

  const requestId = foundry.utils.randomID();

  // Wait for response with a timeout (15 minutes)
  const promise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      _pendingDefenseRolls.delete(requestId);
      ui.notifications.warn(game.i18n.format("TRESPASSER.Chat.Combat.DefenseTimeout", { name: targetActor.name }));
      resolve(null); // Timeout — skip this target
    }, 900000);

    _pendingDefenseRolls.set(requestId, { resolve, timeout });
  });

  // Emit socket event instead of setting flag
  const { TrespasserSocket } = await import("./socket/socket.mjs");
  TrespasserSocket.emit("DEFENSE_REQUEST", {
    requestId,
    targetActorId,
    targetUserId: ownerUser.id,
    statKey,
    creatureDC,
    deedName,
    creatureName
  });

  // Display a UI notification for the GM
  const label = statKey.charAt(0).toUpperCase() + statKey.slice(1);
  ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Combat.WaitingForDefense", { 
    name: ownerUser.name, 
    stat: game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`) 
  }));

  return promise;
}

/**
 * Perform the defense roll locally (shows TrespasserRollDialog).
 * Used both by the player (via socket) and as GM fallback.
 */
export async function _rollDefenseLocally(actor, statKey, creatureDC, deedName) {
  const totalDef = actor.system.combat[statKey] ?? 10;
  // Continuous bonuses are already baked into totalDef via prepareDerivedData.
  // Use-triggered bonuses (e.g. Defend's +2) are NOT baked in.
  // We must split them to display correctly and avoid double-counting.
  const continuousBonus = TrespasserEffectsHelper.getAttributeBonus(actor, statKey);
  const fullBonus = TrespasserEffectsHelper.getAttributeBonus(actor, statKey, "use");
  const useOnlyBonus = fullBonus - continuousBonus;
  const baseDefense = totalDef - continuousBonus;
  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, statKey);
  const diceFormula = isAdv ? "2d20kh" : "1d20";
  const label = statKey.charAt(0).toUpperCase() + statKey.slice(1);

  const bonuses = [
    { label: game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`), value: baseDefense },
    { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: fullBonus }
  ];

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: creatureDC,
    bonuses
  }, { title: `${deedName} — ${label} Check` });

  if (!result) return null;

  const userModifier = result.modifier ?? 0;
  let formula = `${diceFormula} + ${baseDefense} + ${fullBonus}`;
  if (userModifier !== 0) formula += ` + ${userModifier}`;

  const defRoll = new foundry.dice.Roll(formula);
  await defRoll.evaluate();

  // Post defense roll to chat from the player's perspective
  await defRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<div class="trespasser-chat-card">
      <h3>${deedName} — ${game.i18n.localize("TRESPASSER.Chat.Check.DefenseRoll")}</h3>
      <p><strong>${actor.name}</strong> rolls ${game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`)}</p>
    </div>`
  });

  // Trigger "use" effects on the defense stat
  await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: statKey });

  return {
    total: defRoll.total,
    diceResult: defRoll.dice?.[0]?.results?.[0]?.result ?? null,
    modifier: userModifier,
    cd: result.cd ?? creatureDC,
    formula
  };
}

/**
 * Resolve a pending defense roll request.
 * Called by the socket handler on the GM's client.
 * 
 * @param {string} requestId 
 * @param {object} result 
 */
export function resolveDefenseRoll(requestId, result) {
  const pending = _pendingDefenseRolls.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    _pendingDefenseRolls.delete(requestId);
    pending.resolve(result);
  }
}
