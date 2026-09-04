/**
 * defense-roll-helper.mjs
 * Handles defense roll prompts for player-facing rolls using Document Flags.
 */
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";

// Map of requestId → { resolve, timeout } for pending defense rolls
const _pendingDefenseRolls = new Map();

/**
 * Resolve the user that should be prompted for a defense roll for the given actor.
 * - For a companion: first check the bound character's active player owner.
 *   If none, check if an active player owns the companion directly.
 * - For other actors (characters): check active player owners.
 * - If no active player owner is found, returns null (indicating GM prompt).
 * 
 * @param {Actor} targetActor 
 * @returns {User|null}
 */
export function getDefenseTargetUser(targetActor) {
  if (!targetActor) return null;

  // For companion: prioritize the bound character's owner
  if (targetActor.type === "companion") {
    const boundChar = targetActor.system?.getBoundCharacter?.() 
      || (targetActor.system?.boundCharacterId ? game.actors.get(targetActor.system.boundCharacterId) : null);
    if (boundChar) {
      const boundOwner = game.users.find(u => !u.isGM && boundChar.testUserPermission(u, "OWNER") && u.active);
      if (boundOwner) return boundOwner;
    }
  }

  // Check direct active player owner of targetActor
  const directOwner = game.users.find(u => !u.isGM && targetActor.testUserPermission(u, "OWNER") && u.active);
  if (directOwner) return directOwner;

  return null;
}

/**
 * Called by GM: sends a defense roll request to the owning player of a character or companion.
 * Returns a Promise that resolves when the player responds.
 * 
 * @param {object} params
 * @param {string} params.targetActorId - The character or companion actor ID
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

  const targetUser = getDefenseTargetUser(targetActor);

  // If no active player owner found (companion has no owner/bound character, or character has no player owner):
  // Prompt the GM.
  if (!targetUser) {
    if (game.user.isGM) {
      return _rollDefenseLocally(targetActor, statKey, creatureDC, deedName);
    }
    const gmUser = game.users.find(u => u.isGM && u.active);
    if (!gmUser) {
      return _rollDefenseLocally(targetActor, statKey, creatureDC, deedName);
    }
    return _sendDefenseSocketRequest({
      targetActor,
      targetUserId: gmUser.id,
      targetUserName: gmUser.name,
      statKey,
      creatureDC,
      deedName,
      creatureName
    });
  }

  // If the target user is the current client user, roll directly locally
  if (targetUser.id === game.user.id) {
    return _rollDefenseLocally(targetActor, statKey, creatureDC, deedName);
  }

  return _sendDefenseSocketRequest({
    targetActor,
    targetUserId: targetUser.id,
    targetUserName: targetUser.name,
    statKey,
    creatureDC,
    deedName,
    creatureName
  });
}

/**
 * Emit defense request socket and wait for response.
 * @private
 */
async function _sendDefenseSocketRequest({ targetActor, targetUserId, targetUserName, statKey, creatureDC, deedName, creatureName }) {
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
    targetActorId: targetActor.id,
    targetUserId,
    statKey,
    creatureDC,
    deedName,
    creatureName
  });

  // Display a UI notification for the GM
  const label = statKey.charAt(0).toUpperCase() + statKey.slice(1);
  ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Combat.WaitingForDefense", { 
    name: targetUserName, 
    stat: game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`) 
  }));

  return promise;
}

/**
 * Perform the defense roll locally (shows TrespasserRollDialog).
 * Used both by the player (via socket) and as GM fallback.
 */
export async function _rollDefenseLocally(actor, statKey, creatureDC, deedName) {
  const totalDef = actor.system.combat?.[statKey] ?? 10;
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

  const finalCD = result.cd ?? creatureDC;
  const isDefended = defRoll.total >= finalCD;
  const statusLabel = isDefended
    ? (game.i18n.localize("TRESPASSER.Chat.Combat.Defended") || "DEFENDEU!")
    : (game.i18n.localize("TRESPASSER.Chat.Combat.DefenseFailed") || "ATINGIDO!");
  const statusColor = isDefended ? "#4fc3f7" : "#ff5252";
  const statLabel = game.i18n.localize(`TRESPASSER.Sheet.Combat.${label}`);
  const rollsText = game.i18n.format("TRESPASSER.Chat.Check.RollsStatVsDC", { name: actor.name, stat: statLabel, dc: finalCD });

  const diff = defRoll.total - finalCD;
  const diceResult = defRoll.dice?.[0]?.results?.[0]?.result ?? null;
  let sparks = 0;
  let shadows = 0;
  if (diff >= 0) sparks = Math.floor(diff / 5);
  else shadows = Math.floor(Math.abs(diff) / 5);
  if (diceResult === 20) sparks += 1;
  if (diceResult === 1) shadows += 1;
  const net = sparks - shadows;
  const playerSparks = Math.max(0, net);
  const playerShadows = Math.max(0, -net);

  // Post defense roll to chat from the player's perspective
  await defRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<div class="trespasser-chat-card">
      <h3>${deedName} — ${game.i18n.localize("TRESPASSER.Chat.Check.DefenseRoll")}</h3>
      <p><strong>${rollsText}</strong></p>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 4px;">
        <span class="${isDefended ? 'hit-text' : 'miss-text'}" style="font-weight: bold; color: ${statusColor}; font-size: var(--fs-13);">
          ${statusLabel}
        </span>
        <div style="display:flex; gap:10px; font-size: var(--fs-11);">
          <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: playerSparks })}</span>
          <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: playerShadows })}</span>
        </div>
      </div>
    </div>`
  });

  // Trigger "use" effects on the defense stat if user has permission
  if (actor.isOwner) {
    await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: statKey });
  }

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

/**
 * Called by GM: sends a counter reaction request to the owning player.
 * Returns a Promise that resolves when the player responds.
 */
export async function requestPlayerCounterReaction(targetActorId, targetTokenId, creatureTokenId, weaponId, shadows) {
  const targetActor = game.actors.get(targetActorId);
  if (!targetActor) return false;

  const ownerUser = getDefenseTargetUser(targetActor);
  
  if (!ownerUser || ownerUser.id === game.user.id) {
    const targetToken = canvas.tokens.placeables.find(t => t.id === targetTokenId);
    const creatureToken = creatureTokenId ? canvas.tokens.placeables.find(t => t.id === creatureTokenId) : null;
    const weapon = targetActor.items.get(weaponId);
    return _askCounterReactionLocally(targetToken, creatureToken, weapon, shadows);
  }

  const requestId = foundry.utils.randomID();
  const promise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      _pendingDefenseRolls.delete(requestId);
      ui.notifications.warn(game.i18n.format("TRESPASSER.Chat.Combat.CounterTimeout", { name: targetActor.name }));
      resolve(false);
    }, 900000);
    _pendingDefenseRolls.set(requestId, { resolve, timeout });
  });

  const { TrespasserSocket } = await import("./socket/socket.mjs");
  TrespasserSocket.emit("COUNTER_REQUEST", {
    requestId,
    targetActorId,
    targetTokenId,
    targetUserId: ownerUser.id,
    creatureTokenId,
    weaponId,
    shadows
  });

  ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Combat.WaitingForCounter", { 
    name: ownerUser.name 
  }));

  return promise;
}

/**
 * Perform the counter reaction locally.
 * Used both by the player (via socket) and as GM fallback.
 */
export async function _askCounterReactionLocally(targetToken, creatureToken, weapon, shadows) {
  if (!targetToken || !weapon) return false;
  const wDie = weapon.system.weaponDie || "d4";
  const content = `<div class="trespasser-dialog">
    <p>${game.i18n.format("TRESPASSER.Chat.Combat.CounterPrompt", {
      defender: targetToken.name,
      count: shadows,
      die: wDie,
      weapon: weapon.name,
      creature: creatureToken?.name ?? "?"
    })}</p>
  </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Chat.Combat.CounterReaction") },
    classes: ["trespasser", "dialog"],
    position: { width: 380 },
    content,
    buttons: [
      {
        action: "counter",
        icon: "fas fa-shield-alt",
        label: game.i18n.localize("TRESPASSER.Global.Action.Accept"),
        default: true,
        callback: () => true
      },
      {
        action: "pass",
        icon: "fas fa-times",
        label: game.i18n.localize("TRESPASSER.Global.Action.Pass"),
        callback: () => false
      }
    ],
    rejectClose: false,
    close: () => false
  });

  return result;
}

/**
 * Resolve a pending counter reaction request.
 */
export function resolveCounterReaction(requestId, result) {
  const pending = _pendingDefenseRolls.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    _pendingDefenseRolls.delete(requestId);
    pending.resolve(result);
  }
}
