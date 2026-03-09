/**
 * Dungeon Action Handlers for Trespasser RPG
 *
 * Each dungeon action has a handler that resolves its mechanics and posts
 * results to chat. Actions consume one dungeon action from the round's
 * allotment of 3 unless otherwise noted.
 *
 * Actions (p.55):
 *   explore, traverse, interact, search, hide, vandalize, pickLock,
 *   disarm, converse, momentsRest, incant
 *
 * Note: Combat from encounters does NOT consume a dungeon action (p.55).
 */

/**
 * Dispatch a dungeon action by key. Returns true if the action was consumed.
 * @param {Actor} dungeon - The dungeon actor
 * @param {string} actionKey - One of the action keys
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
    <span class="dungeon-action-meta">${game.i18n.format("TRESPASSER.Dungeon.Round")} ${system.currentRound || 1} | ${remaining} ${game.i18n.localize("TRESPASSER.Dungeon.ActionsRemaining").toLowerCase()}</span>
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
 * Log an action without decrementing actions remaining.
 * Used for events that don't consume a dungeon action (e.g., combat).
 * @param {Actor} dungeon
 * @param {string} actionLabel - Localized action name
 * @param {string} [detail=""] - Extra detail for the log
 */
async function logAction(dungeon, actionLabel, detail = "") {
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
function getDungeonDC(dungeon) {
  const tier = dungeon.system.hostilityTier ?? 1;
  return CONFIG.TRESPASSER.dungeon.hostilityTiers[tier]?.dc ?? 12;
}

/* -------------------------------------------- */
/* Explore                                      */
/* -------------------------------------------- */

/**
 * EXPLORE (p.55): Move cautiously into an adjacent, unexplored room and begin
 * searching for traps, hidden doors, and secrets; or explore the current room
 * if not yet explored. Each character makes INTELLECT | PERCEPTION, noticing
 * one room detail on a success. If there is an encounter or room trap present,
 * the action is interrupted and must be resolved first.
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
    .map(c => dungeon.items.get(c.roomId ?? c))
    .filter(r => r && !r.system.discovered);

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.ExploreDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Party.Roll")}:</strong> ${game.i18n.format("TRESPASSER.Dialog.SkillCheckTitle", {skill: `${game.i18n.localize("TRESPASSER.Intellect")} | ${game.i18n.localize("TRESPASSER.Perception")}`})} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;

  if (unexplored.length > 0) {
    body += `<p><strong>${game.i18n.localize("TRESPASSER.Dungeon.Room.UnexploredConnections")}:</strong></p><ul>`;
    for (const room of unexplored) {
      body += `<li>${room.name}</li>`;
    }
    body += `</ul>`;
  } else if (connections.length === 0) {
    body += `<p><em>${game.i18n.localize("TRESPASSER.Dungeon.Room.NoConnections")}</em></p>`;
  } else {
    body += `<p><em>${game.i18n.localize("TRESPASSER.Dungeon.Room.AllExplored")}</em></p>`;
  }

  // Warn about room traps in the target room
  if (unexplored.length > 0) {
    const trapped = unexplored.filter(r => r.system.roomTrap?.present && !r.system.roomTrap?.disarmed);
    if (trapped.length > 0) {
      body += `<p class="gm-trap-warning">${game.i18n.format("TRESPASSER.Dungeon.Room.TrapWarning", { label: game.i18n.localize("TRESPASSER.Dungeon.Room.RoomTrapPresent") })}</p>`;
    }
  }

  await consumeAction(dungeon, label, unexplored.length ? game.i18n.format("TRESPASSER.Dungeon.Log.UnexploredCount", { count: unexplored.length }) : "");
  await postActionChat(dungeon, label, body, true);
  return true;
}

/* -------------------------------------------- */
/* Traverse                                     */
/* -------------------------------------------- */

/**
 * TRAVERSE (p.55): Move to any previously explored room or to the dungeon
 * entrance. No checks required. Fleeing the dungeon triggers one final
 * alarm check.
 */
async function handleTraverse(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Traverse");

  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const connections = currentRoom?.system.connections ?? [];
  const explored = connections
    .map(c => dungeon.items.get(c.roomId ?? c))
    .filter(r => r && r.system.discovered);

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.TraverseDesc")}</p>`;

  if (explored.length > 0) {
    body += `<p><strong>${game.i18n.localize("TRESPASSER.Dungeon.Room.ExploredConnections")}:</strong></p><ul>`;
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
 * INTERACT (p.55): Engage with a feature of the current room in a complex or
 * time-consuming way. The Judge calls for a skill check or group check as needed.
 */
async function handleInteract(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Interact");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.InteractDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Party.GroupCheck")} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Search                                       */
/* -------------------------------------------- */

/**
 * SEARCH (p.55): Linger in an explored room to investigate it further,
 * learning each remaining undiscovered detail of the current room. No check
 * required.
 */
async function handleSearch(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Search");

  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const features = currentRoom?.system.features ?? [];
  const loot = currentRoom?.system.loot ?? "";

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.SearchDesc")}</p>`;

  if (features.length > 0) {
    body += `<p><strong>${game.i18n.localize("TRESPASSER.Dungeon.Room.Features")}:</strong></p><ul>`;
    for (const f of features) {
      body += `<li>${f}</li>`;
    }
    body += `</ul>`;
  }
  if (loot) {
    body += `<p><strong>${game.i18n.localize("TRESPASSER.Dungeon.Room.Loot")}:</strong> ${loot}</p>`;
  }

  // Warn about detail traps on undiscovered features
  const detailTraps = currentRoom?.system.detailTraps ?? [];
  const activeTraps = detailTraps.filter(t => !t.disarmed);
  if (activeTraps.length > 0) {
    body += `<p class="gm-trap-warning">${game.i18n.format("TRESPASSER.Dungeon.Room.DetailTrapsWarning", { count: activeTraps.length, label: game.i18n.localize("TRESPASSER.Dungeon.Room.DetailTraps") })}</p>`;
  }

  await consumeAction(dungeon, label, currentRoom?.name ?? "");
  await postActionChat(dungeon, label, body, true);
  return true;
}

/* -------------------------------------------- */
/* Hide                                         */
/* -------------------------------------------- */

/**
 * HIDE (p.55): Wait in silent darkness for the dungeon to become still again.
 * Group check of AGILITY | STEALTH. Alarm falls by 1d4 if half or more
 * succeed, or by 1d8 if all succeed. The party must cover their light
 * sources, making a depletion check for each.
 */
async function handleHide(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Hide");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.HideDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Agility")} | ${game.i18n.localize("TRESPASSER.Stealth")} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;
  body += `<p>${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: <strong>${dungeon.system.alarm ?? 0}</strong></p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Vandalize                                    */
/* -------------------------------------------- */

/**
 * VANDALIZE (p.55): Break open a locked door, chest, or do some other act of
 * property destruction. One character makes MIGHT | ATHLETICS; others can join
 * to make it a group check. Alarm rises by +1 for each participant.
 */
async function handleVandalize(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Vandalize");
  const dc = getDungeonDC(dungeon);

  // Raise alarm by at least 1 (for the acting character)
  const newAlarm = (dungeon.system.alarm ?? 0) + 1;
  await dungeon.update({ "system.alarm": newAlarm });

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.VandalizeDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Might")} | ${game.i18n.localize("TRESPASSER.Athletics")} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;
  body += `<p>${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: <strong>${newAlarm}</strong></p>`;

  await consumeAction(dungeon, label, game.i18n.format("TRESPASSER.Dungeon.Log.AlarmChange", { value: newAlarm }));
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Pick Lock                                    */
/* -------------------------------------------- */

/**
 * PICK LOCK (p.55): Attempt to pick a locked door or chest. One party member
 * makes an AGILITY | TINKERING check while the others look out for danger.
 */
async function handlePickLock(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.PickLock");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.PickLockDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Agility")} | ${game.i18n.localize("TRESPASSER.Tinkering")} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Disarm                                       */
/* -------------------------------------------- */

/**
 * DISARM (p.55): Attempt to disarm a trap. INTELLECT | TINKERING (or
 * INTELLECT | MAGIC for magical traps). On a shadow, the trap springs on
 * the acting character.
 */
async function handleDisarm(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Disarm");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.DisarmDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Intellect")} | ${game.i18n.localize("TRESPASSER.Tinkering")} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Converse                                     */
/* -------------------------------------------- */

/**
 * CONVERSE (p.55): Spend a few minutes talking to a creature. Automatically
 * consumes an action if more than a minute or two is spent talking.
 */
async function handleConverse(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Converse");

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.ConverseDesc")}</p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Moment's Rest                                */
/* -------------------------------------------- */

/**
 * MOMENT'S REST (p.55): Pause for 10 minutes. Each resting character must
 * eat or lose 1 endurance. They can spend any number of recovery dice
 * (max value), erase one focus checkmark, and regain spent armor dice.
 */
async function handleMomentsRest(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.MomentsRest");

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.MomentsRestDesc")}</p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/* -------------------------------------------- */
/* Incant                                       */
/* -------------------------------------------- */

/**
 * INCANT (p.55): Cast an incantation while the rest of the party keeps watch.
 */
async function handleIncant(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Dungeon.Actions.Incant");

  let body = `<p>${game.i18n.localize("TRESPASSER.Dungeon.Actions.IncantDesc")}</p>`;

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
  search: handleSearch,
  hide: handleHide,
  vandalize: handleVandalize,
  pickLock: handlePickLock,
  disarm: handleDisarm,
  converse: handleConverse,
  momentsRest: handleMomentsRest,
  incant: handleIncant
};
