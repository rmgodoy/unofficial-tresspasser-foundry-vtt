import { aggregateLightSources } from "./dungeon-light-sources.mjs";

/**
 * Build a list of available dungeon actors.
 * Prefers dungeon tokens on the active scene, falls back to world actors.
 * @returns {Actor[]}
 */
export function getAvailableDungeons() {
  const worldDungeons = game.actors.filter(a => a.type === "dungeon");
  
  const sceneDungeons = [];
  const scene = canvas?.scene;
  if (scene) {
    const dungeonTokens = scene.tokens.filter(td => td.actor?.type === "dungeon" && !td.actorLink);
    sceneDungeons.push(...dungeonTokens.map(td => td.actor));
  }

  const all = [...worldDungeons, ...sceneDungeons];
  return [...new Map(all.map(a => [a.id, a])).values()];
}

/**
 * Prepare template rendering context for the dungeon tracker application.
 * @param {DungeonTracker} tracker
 * @param {object} context Base context
 * @returns {Promise<object>}
 */
export async function prepareDungeonContext(tracker, context) {
  const isGM = game.user.isGM;
  context.isGM = isGM;

  // Session state
  context.sessionState = tracker.sessionState;
  context.isIdle = tracker.sessionState === "idle";
  context.isActive = tracker.sessionState === "active";
  context.isPaused = tracker.sessionState === "paused";

  // Dungeon selection
  context.hasDungeon = !!tracker.dungeon;
  context.dungeonName = tracker.dungeon?.name ?? "";
  context.dungeonId = tracker.dungeon?.id ?? "";
  context.activePartyName = game.trespasser.TrespasserPartyHelper?.getActiveParty()?.name ?? "-";

  // Available dungeons (for the picker in idle state)
  if (context.isIdle && isGM) {
    const available = getAvailableDungeons();
    context.availableDungeons = available.map(d => {
      const state = d.system?.sessionState ?? "idle";
      return {
        _id: d.id,
        name: d.name,
        img: d.img,
        selected: tracker.dungeon?.id === d.id,
        state,
        stateLabel: state === "idle" ? "" : game.i18n.localize(`TRESPASSER.App.DungeonTracker.Session.State.${state}`),
        round: d.system?.currentRound ?? 0
      };
    });
    context.hasAvailableDungeons = available.length > 0;
    const selectedState = tracker.dungeon?.system?.sessionState ?? "idle";
    context.selectedIsResumable = selectedState === "paused";
  }

  if (!tracker.dungeon) return context;

  const system = tracker.dungeon.system;
  const dungeonConfig = CONFIG.TRESPASSER.dungeon;

  context.dungeonImg = tracker.dungeon.img;

  // Hostility
  const tier = dungeonConfig.hostilityTiers[system.hostilityTier] ?? dungeonConfig.hostilityTiers[1];
  context.hostilityLabel = game.i18n.localize(tier.label);
  context.hostilityDC = tier.dc;

  // Exploration state
  context.currentRound = system.currentRound ?? 0;
  const actionsMax = dungeonConfig.actionsPerRound;
  const actionsRemaining = system.actionsRemaining ?? actionsMax;
  context.actionsRemaining = actionsRemaining;
  context.actionsAtMax = actionsRemaining >= actionsMax;
  context.actionsAtMin = actionsRemaining <= 0;
  context.alarm = system.alarm ?? 0;
  context.alarmAtMin = (system.alarm ?? 0) <= 0;

  // Action pips
  context.actionPips = Array.from({ length: actionsMax }, (_, i) => ({
    filled: i < actionsRemaining
  }));

  // Current room
  context.currentRoomId = system.currentRoomId ?? "";
  if (system.currentRoomId) {
    const room = tracker.dungeon.items.get(system.currentRoomId);
    context.currentRoomName = room?.name ?? "—";
  } else {
    context.currentRoomName = "—";
  }

  // Rooms list (for GM room navigation, only when active)
  if (isGM && !context.isIdle) {
    const rooms = tracker.dungeon.items.filter(i => i.type === "room");
    rooms.sort((a, b) => (a.system?.sortOrder ?? 0) - (b.system?.sortOrder ?? 0));

    const currentRoom = system.currentRoomId ? tracker.dungeon.items.get(system.currentRoomId) : null;
    const connectedIds = new Set((currentRoom?.system?.connections ?? []).map(c => c.roomId));

    context.rooms = rooms.map(r => ({
      _id: r.id,
      name: r.name,
      discovered: r.system?.discovered,
      isCurrent: r.id === system.currentRoomId,
      isConnected: connectedIds.has(r.id),
      isEntrance: r.system?.isEntrance ?? false
    }));

    if (!currentRoom) {
      const entrances = context.rooms.filter(r => r.isEntrance);
      const lastRoomId = system.lastRoomId;
      const lastRoom = lastRoomId ? context.rooms.find(r => r._id === lastRoomId) : null;

      const list = [];
      if (lastRoom) {
        lastRoom.isLastVisited = true;
        list.push(lastRoom);
      }
      for (const entrance of entrances) {
        if (entrance._id !== lastRoomId) {
          list.push(entrance);
        }
      }
      context.connectedRooms = list;
    } else {
      context.connectedRooms = context.rooms.filter(r => r.isConnected && !r.isCurrent);
    }

    // Dungeon actions
    context.actions = Object.entries(dungeonConfig.actions).map(([key, action]) => ({
      key,
      label: game.i18n.localize(action.label),
      icon: action.icon,
      description: game.i18n.localize(action.description),
      disabled: !context.isActive || context.actionsRemaining <= 0
    }));
  }

  // Light sources
  context.lightSources = aggregateLightSources();

  // Recent log (last 5 entries)
  const log = [...(system.roundLog ?? [])].reverse();
  context.recentLog = log.slice(0, 5);
  context.hasMoreLog = log.length > 5;

  return context;
}
