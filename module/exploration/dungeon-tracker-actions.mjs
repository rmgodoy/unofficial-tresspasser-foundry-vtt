import { executeDungeonAction } from "./dungeon-actions.mjs";
import { resolveEndOfRound, runEncounterCheck } from "./encounter-resolution.mjs";
import { promptLightDepletion } from "./dungeon-light-sources.mjs";

/**
 * Pause any other dungeons currently flagged active so only one delve is
 * "live" at a time. Called before activating or resuming a session.
 * @param {Actor} [currentDungeon]
 */
export async function pauseOtherActiveSessions(currentDungeon) {
  if (!game.user.isGM) return;
  const others = game.actors.filter(a =>
    a.type === "dungeon" &&
    a.id !== currentDungeon?.id &&
    a.system?.sessionState === "active"
  );
  for (const other of others) {
    await other.update({ "system.sessionState": "paused" });
  }
}

export function onChooseDungeon(tracker, event, target) {
  const dungeonId = target.dataset.dungeonId;
  if (!dungeonId) return;
  const actor = game.actors.get(dungeonId);
  if (!actor || actor.type !== "dungeon") return;
  tracker.dungeon = actor;
  tracker.render();
}

export function onSwitchDungeon(tracker, event, target) {
  if (!game.user.isGM) return;
  tracker.dungeon = null;
  tracker.render();
}

export async function onStartSession(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM) return;

  const dungeonConfig = CONFIG.TRESPASSER.dungeon;
  await pauseOtherActiveSessions(tracker.dungeon);

  await tracker.dungeon.update({
    "system.currentRound": 1,
    "system.actionsRemaining": dungeonConfig.actionsPerRound,
    "system.alarm": 0,
    "system.currentRoomId": "",
    "system.lastRoomId": "",
    "system.roundLog": [],
    "system.sessionState": "active"
  });

  await ChatMessage.create({
    content: `<div class="trespasser-dungeon-round">
      <strong>${game.i18n.format("TRESPASSER.Chat.Dungeon.SessionStarted", { name: tracker.dungeon.name })}</strong>
      <div>${game.i18n.localize("TRESPASSER.Chat.Dungeon.SessionRound1")}</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: tracker.dungeon.name })
  });

  tracker.render();
}

export async function onResumeSession(tracker, event, target) {
  if (!game.user.isGM || !tracker.dungeon) return;
  await pauseOtherActiveSessions(tracker.dungeon);
  await tracker.dungeon.update({
    "system.sessionState": "active",
    "system.currentRoomId": ""
  });
  tracker.render();
}

export async function onEndSession(tracker, event, target) {
  if (!game.user.isGM || !tracker.dungeon) return;
  await tracker.dungeon.update({ "system.sessionState": "paused" });
  tracker.dungeon = null;
  tracker.render();
}

export async function onPerformAction(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM || tracker.sessionState !== "active") return;
  const actionKey = target.dataset.actionKey;
  if (!actionKey) return;

  const remaining = tracker.dungeon.system?.actionsRemaining ?? CONFIG.TRESPASSER.dungeon.actionsPerRound;
  if (remaining <= 0) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.NoActionsRemaining"));
    return;
  }

  await executeDungeonAction(tracker.dungeon, actionKey);
  tracker.render();
}

export async function onNextRound(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM || tracker.sessionState !== "active") return;

  const dungeonConfig = CONFIG.TRESPASSER.dungeon;
  const currentRound = tracker.dungeon.system?.currentRound ?? 0;
  const newRound = currentRound + 1;

  // Step 1: Light depletion
  await promptLightDepletion(tracker.dungeon);

  // Step 2: Alarm +1
  const bumpedAlarm = (tracker.dungeon.system?.alarm ?? 0) + 1;
  await tracker.dungeon.update({ "system.alarm": bumpedAlarm });

  // Step 3: Alarm check
  const encounterResult = await resolveEndOfRound(tracker.dungeon);

  const resultAlarm = tracker.dungeon.system?.alarm ?? 0;
  const roundLog = [...(tracker.dungeon.system?.roundLog ?? [])];
  roundLog.push({
    round: newRound,
    action: game.i18n.localize("TRESPASSER.Chat.Dungeon.NewRound"),
    detail: encounterResult.encountered
      ? "Encounter resolved. " + game.i18n.format("TRESPASSER.App.DungeonTracker.AlarmValue", { value: resultAlarm })
      : game.i18n.format("TRESPASSER.App.DungeonTracker.AlarmValue", { value: resultAlarm })
  });

  await tracker.dungeon.update({
    "system.currentRound": newRound,
    "system.actionsRemaining": dungeonConfig.actionsPerRound,
    "system.roundLog": roundLog
  });

  await ChatMessage.create({
    content: `<div class="trespasser-dungeon-round">
      <strong>${game.i18n.format("TRESPASSER.Chat.Dungeon.RoundEnd", { round: newRound })}</strong>
      <div>${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: ${resultAlarm}</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: tracker.dungeon.name })
  });

  tracker.render();
}

export async function onSetCurrentRoom(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM || tracker.sessionState !== "active") return;
  const roomId = target.dataset.roomId;
  if (!roomId) return;

  const room = tracker.dungeon.items.get(roomId);
  if (!room) return;

  if (!room.system?.discovered) {
    await room.update({ "system.discovered": true });
  }

  await tracker.dungeon.update({
    "system.currentRoomId": roomId,
    "system.lastRoomId": roomId
  });
  tracker.render();
}

export async function onAdjustAlarm(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM) return;
  const delta = parseInt(target.dataset.delta, 10) || 0;
  const current = tracker.dungeon.system?.alarm ?? 0;
  const newAlarm = Math.max(0, current + delta);
  if (newAlarm === current) return;

  const roundLog = [...(tracker.dungeon.system?.roundLog ?? [])];
  roundLog.push({
    round: tracker.dungeon.system?.currentRound ?? 0,
    action: game.i18n.localize("TRESPASSER.App.DungeonTracker.Nudge.GMAdjust"),
    detail: game.i18n.format("TRESPASSER.App.DungeonTracker.Nudge.AlarmLog", { value: newAlarm })
  });

  await tracker.dungeon.update({
    "system.alarm": newAlarm,
    "system.roundLog": roundLog
  });
}

export async function onAdjustActions(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM) return;
  const delta = parseInt(target.dataset.delta, 10) || 0;
  const max = CONFIG.TRESPASSER.dungeon.actionsPerRound;
  const current = tracker.dungeon.system?.actionsRemaining ?? max;
  const newActions = Math.max(0, Math.min(max, current + delta));
  if (newActions === current) return;

  const roundLog = [...(tracker.dungeon.system?.roundLog ?? [])];
  roundLog.push({
    round: tracker.dungeon.system?.currentRound ?? 0,
    action: game.i18n.localize("TRESPASSER.App.DungeonTracker.Nudge.GMAdjust"),
    detail: game.i18n.format("TRESPASSER.App.DungeonTracker.Nudge.ActionsLog", { value: newActions })
  });

  await tracker.dungeon.update({
    "system.actionsRemaining": newActions,
    "system.roundLog": roundLog
  });
}

export async function onAlarmCheck(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM || tracker.sessionState !== "active") return;
  await runEncounterCheck(tracker.dungeon);
  tracker.render();
}

export async function onRefundLastAction(tracker, event, target) {
  if (!tracker.dungeon || !game.user.isGM) return;
  const max = CONFIG.TRESPASSER.dungeon.actionsPerRound;
  const currentActions = tracker.dungeon.system?.actionsRemaining ?? max;
  if (currentActions >= max) return;

  const currentRound = tracker.dungeon.system?.currentRound ?? 0;
  const roundLog = [...(tracker.dungeon.system?.roundLog ?? [])];
  let popped = null;
  const lastIndex = roundLog.length - 1;
  if (lastIndex >= 0 && roundLog[lastIndex].round === currentRound) {
    popped = roundLog.pop();
  }

  roundLog.push({
    round: currentRound,
    action: game.i18n.localize("TRESPASSER.App.DungeonTracker.Nudge.GMAdjust"),
    detail: popped
      ? game.i18n.format("TRESPASSER.App.DungeonTracker.Nudge.ActionRefunded", { action: popped.action })
      : game.i18n.localize("TRESPASSER.App.DungeonTracker.Nudge.ActionRefundedNone")
  });

  await tracker.dungeon.update({
    "system.actionsRemaining": currentActions + 1,
    "system.roundLog": roundLog
  });
}

export function onOpenDungeonSheet(tracker, event, target) {
  if (tracker.dungeon) tracker.dungeon.sheet.render(true);
}

export function onOpenRoomSheet(tracker, event, target) {
  if (!tracker.dungeon) return;
  const roomId = target.dataset.roomId;
  const room = tracker.dungeon.items.get(roomId);
  if (room) room.sheet.render(true);
}
