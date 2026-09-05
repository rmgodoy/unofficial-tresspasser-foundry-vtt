/**
 * Common utilities, logging, and chat helpers for dungeon actions.
 */

/**
 * Post a dungeon action result to chat.
 * @param {Actor} dungeon - The dungeon actor
 * @param {string} title - Action name
 * @param {string} body - HTML body content
 * @param {boolean} [gmOnly=false] - Whether to whisper to GM only
 */
export async function postActionChat(dungeon, title, body, gmOnly = false) {
  const system = dungeon.system;
  const remaining = system.actionsRemaining ?? 0;

  const content = `<div class="trespasser-dungeon-action">
    <strong>${title}</strong>
    <div class="dungeon-action-body">${body}</div>
    <span class="dungeon-action-meta">${game.i18n.localize("TRESPASSER.Sheet.Dungeon.Round")} ${system.currentRound || 1} | ${remaining} ${game.i18n.localize("TRESPASSER.Sheet.Dungeon.ActionsRemaining").toLowerCase()}</span>
  </div>`;

  const messageData = {
    content,
    speaker: ChatMessage.getSpeaker({ alias: dungeon.name })
  };

  if (gmOnly) {
    messageData.whisper = game.users.filter(u => u.isGM).map(u => u.id);
  }

  await ChatMessage.create(messageData);
}

/**
 * Decrement actions remaining and log the action on the dungeon actor.
 * @param {Actor} dungeon
 * @param {string} actionLabel - Localized action name
 * @param {string} [detail=""] - Extra detail for the log
 * @returns {Promise<number>} New actions remaining count
 */
export async function consumeAction(dungeon, actionLabel, detail = "") {
  const system = dungeon.system;
  const remaining = Math.max(0, (system.actionsRemaining ?? 3) - 1);
  const roundLog = [...(system.roundLog ?? [])];
  roundLog.push({
    round: system.currentRound || 1,
    action: actionLabel,
    detail
  });
  await dungeon.update({
    "system.actionsRemaining": remaining,
    "system.roundLog": roundLog
  });
  return remaining;
}

/**
 * Log an action without decrementing actions remaining.
 * @param {Actor} dungeon
 * @param {string} actionLabel - Localized action name
 * @param {string} [detail=""] - Extra detail for the log
 */
export async function logAction(dungeon, actionLabel, detail = "") {
  const system = dungeon.system;
  const roundLog = [...(system.roundLog ?? [])];
  roundLog.push({
    round: system.currentRound || 1,
    action: actionLabel,
    detail
  });
  await dungeon.update({ "system.roundLog": roundLog });
}

/**
 * Get the hostility DC for this dungeon.
 * @param {Actor} dungeon
 * @returns {number}
 */
export function getDungeonDC(dungeon) {
  const tier = dungeon.system.hostilityTier ?? 1;
  return CONFIG.TRESPASSER.dungeon.hostilityTiers[tier]?.dc ?? 12;
}
