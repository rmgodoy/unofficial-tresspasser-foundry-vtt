/**
 * Dungeon Action Handlers for Trespasser RPG
 *
 * Each of the 11 dungeon actions has a handler that resolves its mechanics
 * and posts results to chat. Actions consume one dungeon action from the
 * round's allotment of 3 unless otherwise noted.
 *
 * Actions:
 *   explore, traverse, interact, loot, hide, smash, disarm,
 *   converse, momentsRest, combat, incant
 */

/**
 * Dispatch a dungeon action by key. Returns true if the action was consumed.
 * @param {Actor} dungeon - The dungeon actor
 * @param {string} actionKey - One of the 11 action keys
 * @param {Object} [options] - Additional options (e.g., selected room)
 * @returns {Promise<boolean>} Whether the action was successfully consumed
 */
export async function executeDungeonAction(dungeon, actionKey, options = {}) {
  const handler = ACTION_HANDLERS[actionKey];
  if (!handler) {
    console.warn(`Trespasser | Unknown dungeon action: ${actionKey}`);
    return false;
  }
  return handler(dungeon, options);
}

/* -------------------------------------------- */
/* Chat Helpers                                 */
/* -------------------------------------------- */

/**
 * Post a dungeon action result to chat.
 * @param {Actor} dungeon - The dungeon actor
 * @param {string} title - Action name
 * @param {string} body - HTML body content
 * @param {boolean} [gmOnly=false] - Whether to whisper to GM only
 */
async function postActionChat(dungeon, title, body, gmOnly = false) {
  const system = dungeon.system;
  const remaining = system.actionsRemaining ?? 0;

  const content = `<div class="trespasser-dungeon-action">
    <strong>${title}</strong>
    <div class="dungeon-action-body">${body}</div>
    <span class="dungeon-action-meta">Round ${system.currentRound || 1} | ${remaining} action${remaining !== 1 ? "s" : ""} remaining</span>
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
async function consumeAction(dungeon, actionLabel, detail = "") {
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
 * Get the hostility DC for this dungeon.
 * @param {Actor} dungeon
 * @returns {number}
 */
function getDungeonDC(dungeon) {
  const tier = dungeon.system.hostilityTier ?? 1;
  return CONFIG.TRESPASSER.dungeon.hostilityTiers[tier]?.dc ?? 10;
}

/* -------------------------------------------- */
/* Explore                                      */
/* -------------------------------------------- */

/**
 * EXPLORE: Move cautiously into a new adjoining room and search for traps,
 * hidden doors, and secrets. Each character makes INTELLECT | PERCEPTION.
 * Investigate one feature on success, +1 per spark.
 */
async function handleExplore(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Explore");
  const dc = getDungeonDC(dungeon);

  // Get connected unexplored rooms for the GM to pick from
  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const connections = currentRoom?.system.connections ?? [];
  const unexplored = connections
    .map(id => dungeon.items.get(id))
    .filter(r => r && !r.system.discovered);

  let body = `<p>The party explores cautiously into a new room.</p>`;
  body += `<p><strong>Check:</strong> INTELLECT | PERCEPTION vs DC ${dc}</p>`;
  body += `<p><em>Investigate one room feature on success, +1 per spark.</em></p>`;

  if (unexplored.length > 0) {
    body += `<p><strong>Unexplored connections:</strong></p><ul>`;
    for (const room of unexplored) {
      body += `<li>${room.name}</li>`;
    }
    body += `</ul>`;
  } else if (connections.length === 0) {
    body += `<p><em>No rooms are connected to the current location.</em></p>`;
  } else {
    body += `<p><em>All connected rooms have already been explored.</em></p>`;
  }

  await consumeAction(dungeon, label, unexplored.length ? `${unexplored.length} unexplored` : "");
  await postActionChat(dungeon, label, body, true);
  return true;
}

/* -------------------------------------------- */
/* Traverse                                     */
/* -------------------------------------------- */

/**
 * TRAVERSE: Move quietly to a previously explored room. No checks required.
 * Fleeing the dungeon triggers one final encounter check.
 */
async function handleTraverse(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Traverse");

  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const connections = currentRoom?.system.connections ?? [];
  const explored = connections
    .map(id => dungeon.items.get(id))
    .filter(r => r && r.system.discovered);

  let body = `<p>The party moves quietly to a previously explored room.</p>`;
  body += `<p><em>No checks required. Fleeing the dungeon triggers one final encounter check.</em></p>`;

  if (explored.length > 0) {
    body += `<p><strong>Explored connections:</strong></p><ul>`;
    for (const room of explored) {
      body += `<li>${room.name}</li>`;
    }
    body += `</ul>`;
  }

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body, true);
  return true;
}

/* -------------------------------------------- */
/* Interact                                     */
/* -------------------------------------------- */

/**
 * INTERACT: Engage with a feature of the current room in a complex or
 * time-consuming way. The Judge calls for a skill check as needed.
 */
async function handleInteract(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Interact");
  const dc = getDungeonDC(dungeon);

  let body = `<p>The party engages with a feature of the current room.</p>`;
  body += `<p><strong>Check:</strong> Skill check as appropriate vs DC ${dc}</p>`;
  body += `<p><em>The Judge determines the appropriate skill and consequences.</em></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Loot                                         */
/* -------------------------------------------- */

/**
 * LOOT: Linger in a room to explore it further. Investigate each remaining
 * room feature. No check required — only costs time.
 */
async function handleLoot(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Loot");

  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const features = currentRoom?.system.features ?? [];
  const loot = currentRoom?.system.loot ?? "";

  let body = `<p>The party lingers to thoroughly explore the room.</p>`;
  body += `<p><em>No check required. All remaining room features are investigated.</em></p>`;

  if (features.length > 0) {
    body += `<p><strong>Room features:</strong></p><ul>`;
    for (const f of features) {
      body += `<li>${f}</li>`;
    }
    body += `</ul>`;
  }
  if (loot) {
    body += `<p><strong>Loot:</strong> ${loot}</p>`;
  }

  await consumeAction(dungeon, label, currentRoom?.name ?? "");
  await postActionChat(dungeon, label, body, true);
  return true;
}

/* -------------------------------------------- */
/* Hide                                         */
/* -------------------------------------------- */

/**
 * HIDE: Wait in silent darkness. Group AGILITY | STEALTH check.
 * On success, alarm falls by 3, plus 1 per spark.
 */
async function handleHide(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Hide");
  const dc = getDungeonDC(dungeon);

  let body = `<p>The party waits in silent darkness.</p>`;
  body += `<p><strong>Group Check:</strong> AGILITY | STEALTH vs DC ${dc}</p>`;
  body += `<p><em>On success, alarm falls by 3, plus 1 per spark.</em></p>`;
  body += `<p>Current alarm: <strong>${dungeon.system.alarm ?? 0}</strong></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Smash                                        */
/* -------------------------------------------- */

/**
 * SMASH: Break open a locked door, chest, or barrier. Group MIGHT | ATHLETICS.
 * Alarm rises by +1.
 */
async function handleSmash(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Smash");
  const dc = getDungeonDC(dungeon);

  // Auto-raise alarm by 1
  const newAlarm = (dungeon.system.alarm ?? 0) + 1;
  await dungeon.update({ "system.alarm": newAlarm });

  let body = `<p>The party attempts to smash through an obstacle.</p>`;
  body += `<p><strong>Group Check:</strong> MIGHT | ATHLETICS vs DC ${dc}</p>`;
  body += `<p><em>Alarm rises by +1.</em> New alarm: <strong>${newAlarm}</strong></p>`;

  await consumeAction(dungeon, label, `Alarm → ${newAlarm}`);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Disarm                                       */
/* -------------------------------------------- */

/**
 * DISARM: Attempt to disarm a trap. INTELLECT | TINKERING (or INTELLECT | MAGIC
 * for magical traps).
 */
async function handleDisarm(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Disarm");
  const dc = getDungeonDC(dungeon);

  let body = `<p>The party attempts to disarm a trap.</p>`;
  body += `<p><strong>Check:</strong> INTELLECT | TINKERING vs DC ${dc}</p>`;
  body += `<p><em>For magical traps, use INTELLECT | MAGIC instead.</em></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Converse                                     */
/* -------------------------------------------- */

/**
 * CONVERSE: Spend a few minutes talking to a creature. Automatically consumes
 * an action if more than a minute or two is spent talking.
 */
async function handleConverse(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Converse");

  let body = `<p>The party spends time conversing with a creature.</p>`;
  body += `<p><em>Extended conversation (more than a minute or two) automatically consumes a dungeon action.</em></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Moment's Rest                                */
/* -------------------------------------------- */

/**
 * MOMENT'S REST: Pause for 10 minutes. Eat or lose 1 endurance. Spend
 * recovery dice (max value). Erase 2 checkmarks. Repair armor dice.
 */
async function handleMomentsRest(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.MomentsRest");

  let body = `<p>The party pauses for a Moment's Rest.</p>`;
  body += `<ul>`;
  body += `<li>Each character must <strong>eat</strong> or lose 1 endurance.</li>`;
  body += `<li>Spend any number of <strong>recovery dice</strong> (max value each).</li>`;
  body += `<li>Erase <strong>2 focus checkmarks</strong>.</li>`;
  body += `<li>Regain spent <strong>armor dice</strong>.</li>`;
  body += `</ul>`;
  body += `<p><em>Use the Rest button on character sheets to resolve individual rest effects.</em></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Combat                                       */
/* -------------------------------------------- */

/**
 * COMBAT: Do battle with a creature. Even a short fight uses a full dungeon
 * action. This is often triggered automatically by an encounter.
 */
async function handleCombat(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Combat");

  let body = `<p>The party engages in combat!</p>`;
  body += `<p><em>Even a brief battle consumes a full dungeon action.</em></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Incant                                       */
/* -------------------------------------------- */

/**
 * INCANT: Cast an incantation while the rest of the party keeps watch.
 */
async function handleIncant(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Incant");

  let body = `<p>A character casts an incantation while the party keeps watch.</p>`;
  body += `<p><em>The caster uses their incantation as normal. The rest of the party keeps lookout.</em></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Handler Registry                             */
/* -------------------------------------------- */

const ACTION_HANDLERS = {
  explore: handleExplore,
  traverse: handleTraverse,
  interact: handleInteract,
  loot: handleLoot,
  hide: handleHide,
  smash: handleSmash,
  disarm: handleDisarm,
  converse: handleConverse,
  momentsRest: handleMomentsRest,
  combat: handleCombat,
  incant: handleIncant
};
