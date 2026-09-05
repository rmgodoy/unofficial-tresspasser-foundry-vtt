import { startCampSelection, repromptMember } from "./camp-activity-handler.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";

export async function onPerformCamp(tracker, event, target) {
  if (!tracker.region || !game.user.isGM || tracker.sessionState !== "active") return;

  let members = [];
  const party = game.trespasser.TrespasserPartyHelper?.getActiveParty();
  if (party && party.system?.members?.length > 0) {
    members = party.system.members.map(id => game.actors.get(id)).filter(a => a?.type === "character");
  } else {
    members = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
  }
  if (members.length === 0) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Travel.NoPartyMembers"));
    return;
  }

  startCampSelection(tracker.region, members);
}

export async function onConfirmCamp(tracker, event, target) {
  if (!tracker.region || !game.user.isGM || !tracker._campPending) return;

  const allSelected = [...tracker._campSelections.values()].every(v => v !== null);
  if (!allSelected) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Travel.CampNotAllSelected"));
    return;
  }

  const campConfig = CONFIG.TRESPASSER.travel.campActivities;
  let content = `<div class="trespasser-camp-results">`;
  content += `<h3><i class="fas fa-campground"></i> ${game.i18n.localize("TRESPASSER.Chat.Travel.CampActivities")}</h3>`;
  content += `<div class="camp-results-list">`;
  for (const [actorId, selection] of tracker._campSelections) {
    const activityKey = typeof selection === 'string' ? selection : selection.activityKey;
    const targetId = typeof selection === 'object' ? selection.targetId : null;
    const actor = game.actors.get(actorId);
    const activity = campConfig[activityKey];
    
    let targetName = "";
    if (targetId) {
      const targetActor = game.actors.get(targetId);
      if (targetActor) targetName = ` (${targetActor.name})`;
    }
    
    content += `<div class="camp-result-entry">
      <span class="camp-result-name">${actor?.name ?? "?"}</span>
      <span class="camp-result-activity"><i class="${activity?.icon ?? ""}"></i> ${game.i18n.localize(activity?.label ?? activityKey)}${targetName}</span>
    </div>`;
  }
  content += `</div></div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ alias: tracker.region.name })
  });

  const system = tracker.region.system;
  const periodOrder = ["morning", "evening", "night"];
  const currentIndex = periodOrder.indexOf(system?.currentPeriod ?? "morning");
  const nextPeriod = periodOrder[Math.min(currentIndex + 1, 2)];

  const dayLog = [...(system?.dayLog ?? [])];
  dayLog.push({
    day: system?.currentDay ?? 1,
    action: game.i18n.localize("TRESPASSER.Terms.Travel.Actions.Camp"),
    detail: `${tracker._campSelections.size} activities`
  });

  await tracker.region.update({
    "system.currentPeriod": nextPeriod,
    "system.dayLog": dayLog
  });

  TrespasserSocket.emit("CAMP_ACTIVITY_CONFIRM", { 
    regionId: tracker.region.id,
    selections: Object.fromEntries(tracker._campSelections)
  });

  tracker._campPending = false;
  tracker._campSelections = null;

  tracker.render();
}

export async function onCancelCamp(tracker, event, target) {
  if (!game.user.isGM) return;
  tracker._campPending = false;
  tracker._campSelections = null;
  TrespasserSocket.emit("CAMP_ACTIVITY_CANCEL", { regionId: tracker.region?.id });
  tracker.render();
}

export async function onOverrideCampActivity(tracker, event, target) {
  if (!game.user.isGM || !tracker._campPending) return;
  const actorId = target.dataset.actorId;
  const activityKey = target.dataset.activityKey;
  if (!actorId || !activityKey) return;
  tracker._campSelections.set(actorId, { activityKey, targetId: null });
  tracker.render();
}

export async function onRepromptCamp(tracker, event, target) {
  if (!game.user.isGM || !tracker._campPending) return;
  const actorId = target.dataset.actorId;
  if (!actorId) return;
  repromptMember(actorId);
  const actor = game.actors.get(actorId);
  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Travel.CampRepromptSent", { name: actor?.name ?? "" }));
}
