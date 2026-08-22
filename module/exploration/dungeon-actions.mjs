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

import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { evaluateAndShowRoll } from "../sheets/character/handlers-rolls.mjs";
import { TrespasserPartyHelper } from "../helpers/party-helper.mjs";

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Explore");
  const dc = getDungeonDC(dungeon);

  // Get connected unexplored rooms for the GM to pick from
  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const connections = currentRoom?.system.connections ?? [];
  const unexplored = connections
    .map(c => dungeon.items.get(c.roomId ?? c))
    .filter(r => r && !r.system.discovered);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.ExploreDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.format("TRESPASSER.Dialog.SkillCheck.Title", {skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Perception")}`})} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;

  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="intellect" data-skill="perception" data-dc="${dc}">
      <i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.RollCheck", { skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Perception")}` })}
    </button>
  </div>`;

  let gmDetails = "";
  if (unexplored.length > 0) {
    gmDetails += `<p><strong>${game.i18n.localize("TRESPASSER.Dungeon.Room.UnexploredConnections")}:</strong></p><ul>`;
    for (const room of unexplored) {
      gmDetails += `<li>${room.name}</li>`;
    }
    gmDetails += `</ul>`;
  } else if (connections.length === 0) {
    gmDetails += `<p><em>${game.i18n.localize("TRESPASSER.Dungeon.Room.NoConnections")}</em></p>`;
  } else {
    gmDetails += `<p><em>${game.i18n.localize("TRESPASSER.Dungeon.Room.AllExplored")}</em></p>`;
  }

  // Warn about room traps in the target room
  if (unexplored.length > 0) {
    const trapped = unexplored.filter(r => r.system.roomTrap?.present && !r.system.roomTrap?.disarmed);
    if (trapped.length > 0) {
      gmDetails += `<p class="gm-trap-warning">${game.i18n.format("TRESPASSER.Sheet.Dungeon.Room.TrapWarning", { label: game.i18n.localize("TRESPASSER.Sheet.Dungeon.Room.RoomTrapPresent") })}</p>`;
    }
  }

  if (gmDetails) {
    body += `<div class="gm-only-section">${gmDetails}</div>`;
  }

  await consumeAction(dungeon, label, unexplored.length ? game.i18n.format("TRESPASSER.Chat.Dungeon.Log.UnexploredCount", { count: unexplored.length }) : "");
  await postActionChat(dungeon, label, body, false);
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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Traverse");

  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const connections = currentRoom?.system.connections ?? [];
  const explored = connections
    .map(c => dungeon.items.get(c.roomId ?? c))
    .filter(r => r && r.system.discovered);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.TraverseDesc")}</p>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Interact");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.InteractDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Party.GroupCheck")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Search");

  const currentRoom = dungeon.system.currentRoomId
    ? dungeon.items.get(dungeon.system.currentRoomId)
    : null;
  const features = currentRoom?.system.features ?? [];
  const loot = currentRoom?.system.loot ?? "";

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.SearchDesc")}</p>`;

  if (features.length > 0) {
    body += `<p><strong>${game.i18n.localize("TRESPASSER.Sheet.Dungeon.Room.Features")}:</strong></p><ul>`;
    for (const f of features) {
      body += `<li>${f}</li>`;
    }
    body += `</ul>`;
  }
  if (loot) {
    body += `<p><strong>${game.i18n.localize("TRESPASSER.Sheet.Dungeon.Room.Loot")}:</strong> ${loot}</p>`;
  }

  // Warn about detail traps on undiscovered features
  const detailTraps = currentRoom?.system.detailTraps ?? [];
  const activeTraps = detailTraps.filter(t => !t.disarmed);
  if (activeTraps.length > 0) {
    body += `<p class="gm-trap-warning">${game.i18n.format("TRESPASSER.Sheet.Dungeon.Room.DetailTrapsWarning", { count: activeTraps.length, label: game.i18n.localize("TRESPASSER.Sheet.Dungeon.Room.DetailTraps") })}</p>`;
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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Hide");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.HideDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Attribute.Agility")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Stealth")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<p>${game.i18n.localize("TRESPASSER.Sheet.Dungeon.Alarm")}: <strong>${dungeon.system.alarm ?? 0}</strong></p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="agility" data-skill="stealth" data-dc="${dc}">
      <i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.RollCheck", { skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Agility")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Stealth")}` })}
    </button>
  </div>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Vandalize");
  const dc = getDungeonDC(dungeon);

  // Raise alarm by at least 1 (for the acting character)
  const newAlarm = (dungeon.system.alarm ?? 0) + 1;
  await dungeon.update({ "system.alarm": newAlarm });

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.VandalizeDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Athletics")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<p>${game.i18n.localize("TRESPASSER.Sheet.Dungeon.Alarm")}: <strong>${newAlarm}</strong></p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="mighty" data-skill="athletics" data-dc="${dc}">
      <i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.RollCheck", { skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Athletics")}` })}
    </button>
  </div>`;

  await consumeAction(dungeon, label, game.i18n.format("TRESPASSER.Chat.Dungeon.Log.AlarmChange", { value: newAlarm }));
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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.PickLock");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.PickLockDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Attribute.Agility")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Tinkering")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="agility" data-skill="tinkering" data-dc="${dc}">
      <i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.RollCheck", { skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Agility")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Tinkering")}` })}
    </button>
  </div>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Disarm");
  const dc = getDungeonDC(dungeon);
  const intellectLabel = game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect");
  const tinkeringLabel = game.i18n.localize("TRESPASSER.Terms.Skill.Tinkering");
  const magicLabel = game.i18n.localize("TRESPASSER.Terms.Skill.Magic");

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.DisarmDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${intellectLabel} | ${tinkeringLabel} / ${magicLabel} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="intellect" data-skill="tinkering" data-dc="${dc}">
      <i class="fas fa-wrench"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.DisarmNormal", { skill: `${intellectLabel} | ${tinkeringLabel}` })}
    </button>
    <button type="button" class="dungeon-action-roll-btn" data-attribute="intellect" data-skill="magic" data-dc="${dc}">
      <i class="fas fa-wand-magic-sparkles"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.DisarmMagic", { skill: `${intellectLabel} | ${magicLabel}` })}
    </button>
  </div>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Converse");

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.ConverseDesc")}</p>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.MomentsRest");

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.MomentsRestDesc")}</p>`;

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
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Incant");

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.IncantDesc")}</p>`;

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

/* -------------------------------------------- */
/* Interactive Chat Roll Handlers               */
/* -------------------------------------------- */

/**
 * Resolve which character actor should perform a dungeon check.
 * Priority:
 * 1. Single controlled character token
 * 2. User's assigned character
 * 3. Single owned character (for players)
 * 4. Dialog picker if multiple characters are controlled/owned/in party
 * @returns {Promise<Actor|null>}
 */
export async function resolveActingCharacter() {
  // 1. Check controlled tokens on canvas
  const controlledChars = canvas.tokens?.controlled
    .map(t => t.actor)
    .filter(a => a?.type === "character" && (game.user.isGM || a.isOwner)) || [];

  if (controlledChars.length === 1) return controlledChars[0];
  if (controlledChars.length > 1) {
    return _promptCharacterSelection(controlledChars);
  }

  // 2. Check user's assigned character
  if (game.user.character && game.user.character.type === "character" && (game.user.isGM || game.user.character.isOwner)) {
    return game.user.character;
  }

  // 3. For players: check owned characters
  if (!game.user.isGM) {
    const ownedChars = game.actors.filter(a => a.type === "character" && a.isOwner);
    if (ownedChars.length === 1) return ownedChars[0];
    if (ownedChars.length > 1) {
      return _promptCharacterSelection(ownedChars);
    }
  } else {
    // For GM: check active party members first, or world characters
    const activeParty = TrespasserPartyHelper.getActiveParty();
    const partyMembers = (activeParty?.system?.members ?? [])
      .map(id => game.actors.get(id))
      .filter(a => a && a.type === "character");

    const pool = partyMembers.length > 0
      ? partyMembers
      : game.actors.filter(a => a.type === "character");

    if (pool.length === 1) return pool[0];
    if (pool.length > 1) {
      return _promptCharacterSelection(pool);
    }
  }

  ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.NoCharacterForRoll"));
  return null;
}

/**
 * Prompt user to select a character from a list using DialogV2.
 * @param {Actor[]} characters
 * @returns {Promise<Actor|null>}
 */
async function _promptCharacterSelection(characters) {
  let content = `<div class="trespasser-dialog character-select-dialog">`;
  content += `<p style="font-size:var(--fs-12);color:var(--trp-text-dim);margin-bottom:10px;">${game.i18n.localize("TRESPASSER.Dialog.Dungeon.SelectCharacterPrompt")}</p>`;
  content += `<div class="character-select-grid" style="display:flex;flex-direction:column;gap:6px;">`;
  for (const char of characters) {
    content += `
      <button type="button" class="char-select-btn" data-actor-id="${char.id}" style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:var(--trp-bg-panel);border:1px solid var(--trp-border);border-radius:var(--trp-radius);color:var(--trp-text-bright);cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-13);text-align:left;">
        <img src="${char.img}" style="width:28px;height:28px;border-radius:2px;border:1px solid var(--trp-border-light);object-fit:cover;" />
        <span style="font-weight:bold;">${char.name}</span>
      </button>`;
  }
  content += `</div></div>`;

  return new Promise((resolve) => {
    let resolved = false;
    foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("TRESPASSER.Dialog.Dungeon.SelectCharacterTitle"),
        width: 320
      },
      classes: ["trespasser", "dialog"],
      content,
      buttons: [
        {
          action: "cancel",
          label: game.i18n.localize("TRESPASSER.Dialog.Common.Cancel") || "Cancel",
          callback: () => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }
        }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        el.querySelectorAll(".char-select-btn").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            if (resolved) return;
            resolved = true;
            const actorId = ev.currentTarget.dataset.actorId;
            dialog.close();
            resolve(game.actors.get(actorId) || null);
          });
        });
      },
      rejectClose: false
    }).then(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

/**
 * Perform a dungeon action roll check for a character actor.
 * @param {Actor} actor - The character actor rolling
 * @param {string} attribute - Attribute key (mighty, agility, intellect, spirit)
 * @param {string} skill - Skill key (athletics, perception, stealth, tinkering, magic, etc.)
 * @param {number} dc - Target DC
 * @returns {Promise<Roll|null>}
 */
export async function rollDungeonActionCheck(actor, attribute, skill, dc) {
  if (!actor || actor.type !== "character") return null;

  const attr = actor.system.attributes ?? {};
  const bonuses = actor.system.bonuses ?? {};
  const skillVal = actor.system.skill ?? 0;
  const isTrained = actor.system.skills?.[skill] ?? false;
  const skillBonus = isTrained ? skillVal : 0;
  const trainedLabel = isTrained ? ` (${game.i18n.localize("TRESPASSER.Chat.Common.Trained")})` : "";

  const attrLabelKey = attribute.charAt(0).toUpperCase() + attribute.slice(1);
  const skillLabelKey = skill.charAt(0).toUpperCase() + skill.slice(1);
  const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrLabelKey}`) || attrLabelKey;
  const skillLabel = game.i18n.localize(`TRESPASSER.Terms.Skill.${skillLabelKey}`) || skillLabelKey;
  const checkLabel = `${attrLabel} | ${skillLabel}`;

  let attrVal = attr[attribute] ?? 0;
  let attrBonus = bonuses[attribute] ?? 0;
  let effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, attribute, "use");

  // Befuddled & Sickly checks
  let plightName = "";
  if ((attribute === "intellect" || attribute === "spirit") && actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  } else if ((attribute === "mighty" || attribute === "agility") && actor.system.hasPlight?.("sickly")) {
    plightName = "Sickly";
  }

  if (plightName) {
    attrVal = 0;
    attrBonus = 0;
    effectBonus = 0;
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, attribute);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const rollBonuses = [
    { label: attrLabel, value: attrVal },
    { label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: skillBonus },
    { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
  ];
  if (attrBonus !== 0) {
    rollBonuses.push({ label: game.i18n.localize("TRESPASSER.Dialog.Roll.PermanentBonus") || "Permanent Bonus", value: attrBonus });
  }

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    bonuses: rollBonuses,
    showCD: true,
    cd: dc,
    isNonCombat: true
  }, { title: `${actor.name} — ${checkLabel}` });

  if (!result) return null;

  let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
  if (attrBonus !== 0) formula += ` + ${attrBonus}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (skillBonus > 0) formula += ` + ${skillBonus}`;

  const roll = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: checkLabel }) + trainedLabel
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: checkLabel }) + trainedLabel;

  const finalCD = result.cd ?? dc;
  const rollRes = await evaluateAndShowRoll(roll, flavor, finalCD, actor.sheet, { skillKey: skill, isNonCombat: true });
  if (rollRes) {
    await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: attribute });
  }

  return roll;
}

/**
 * Handle clicking a roll button on a dungeon action chat card.
 * @param {HTMLElement} btn
 */
export async function handleDungeonRollButtonClick(btn) {
  const attribute = btn.dataset.attribute;
  const skill = btn.dataset.skill;
  const dc = parseInt(btn.dataset.dc) || 10;

  if (!attribute || !skill) return;

  const actor = await resolveActingCharacter();
  if (!actor) return;

  await rollDungeonActionCheck(actor, attribute, skill, dc);
}
