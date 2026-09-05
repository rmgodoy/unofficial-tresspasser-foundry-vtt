import { postActionChat, consumeAction, getDungeonDC } from "./dungeon-actions-common.mjs";

/**
 * EXPLORE (p.55): Move cautiously into an adjacent, unexplored room.
 */
export async function handleExplore(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Explore");
  const dc = getDungeonDC(dungeon);

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

/**
 * TRAVERSE (p.55): Move to any previously explored room or to the dungeon entrance.
 */
export async function handleTraverse(dungeon, options) {
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

/**
 * SEARCH (p.55): Linger in an explored room to investigate it further.
 */
export async function handleSearch(dungeon, options) {
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

  const detailTraps = currentRoom?.system.detailTraps ?? [];
  const activeTraps = detailTraps.filter(t => !t.disarmed);
  if (activeTraps.length > 0) {
    body += `<p class="gm-trap-warning">${game.i18n.format("TRESPASSER.Sheet.Dungeon.Room.DetailTrapsWarning", { count: activeTraps.length, label: game.i18n.localize("TRESPASSER.Sheet.Dungeon.Room.DetailTraps") })}</p>`;
  }

  await consumeAction(dungeon, label, currentRoom?.name ?? "");
  await postActionChat(dungeon, label, body, true);
  return true;
}

/**
 * HIDE (p.55): Wait in silent darkness for the dungeon to become still again.
 */
export async function handleHide(dungeon, options) {
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
