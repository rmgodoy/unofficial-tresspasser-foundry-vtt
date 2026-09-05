import { runTravelHostilityCheck, resolveEndOfRound } from "./encounter-resolution.mjs";

/**
 * Pause any other regions currently flagged active so only one travel session is
 * "live" at a time.
 * @param {Actor} [currentRegion]
 */
export async function pauseOtherActiveSessions(currentRegion) {
  if (!game.user.isGM) return;
  const others = game.actors.filter(a =>
    a.type === "region" &&
    a.id !== currentRegion?.id &&
    a.system?.sessionState === "active"
  );
  for (const other of others) {
    await other.update({ "system.sessionState": "paused" });
  }
}

export function onChooseRegion(tracker, event, target) {
  const regionId = target.dataset.regionId;
  if (!regionId) return;
  const actor = game.actors.get(regionId);
  if (!actor || actor.type !== "region") return;
  tracker.region = actor;
  tracker.render();
}

export function onSwitchRegion(tracker, event, target) {
  if (!game.user.isGM) return;
  tracker.region = null;
  tracker.render();
}

export function onOpenRegionSheet(tracker, event, target) {
  if (tracker.region) tracker.region.sheet.render(true);
}

export async function onStartSession(tracker, event, target) {
  if (!tracker.region || !game.user.isGM) return;
  await pauseOtherActiveSessions(tracker.region);
  await tracker.region.update({
    "system.currentDay": 1,
    "system.currentPeriod": "morning",
    "system.travelPointsRemaining": 0,
    "system.onRoad": false,
    "system.isDisoriented": false,
    "system.dayLog": [],
    "system.sessionState": "active"
  });

  const chatContent = game.i18n.format("TRESPASSER.Chat.Travel.SessionStarted", { name: tracker.region.name }) +
    " — " + game.i18n.localize("TRESPASSER.Chat.Travel.SessionDay1");
  await ChatMessage.create({
    content: chatContent,
    speaker: ChatMessage.getSpeaker({ alias: tracker.region.name })
  });

  tracker.render();
}

export async function onResumeSession(tracker, event, target) {
  if (!tracker.region || !game.user.isGM) return;
  await pauseOtherActiveSessions(tracker.region);
  await tracker.region.update({ "system.sessionState": "active" });
  tracker.render();
}

export async function onEndSession(tracker, event, target) {
  if (!tracker.region || !game.user.isGM) return;
  await tracker.region.update({ "system.sessionState": "paused" });
  tracker.region = null;
  tracker.render();
}

export async function postWayfindingPrompt(region) {
  const system = region.system;
  const dc = CONFIG.TRESPASSER.dungeon.hostilityTiers[system?.hostilityTier]?.dc ?? 10;

  let content = `<div class="trespasser-wayfinding-check">`;
  content += `<h3><i class="fas fa-compass"></i> ${game.i18n.localize("TRESPASSER.Chat.Travel.WayfindingCheck")}</h3>`;
  content += `<div>${game.i18n.format("TRESPASSER.Chat.Travel.WayfindingPrompt", { dc })}</div>`;
  content += `<div><strong>${game.i18n.localize("TRESPASSER.Chat.Travel.WayfindingSkill")}:</strong> INTELLECT | NATURE</div>`;
  content += `<div class="wayfinding-outcomes">`;
  content += `<div><i class="fas fa-star"></i> <strong>${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.Spark")}:</strong> ${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.SparkDesc")}</div>`;
  content += `<div><i class="fas fa-check"></i> <strong>${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.Success")}:</strong> ${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.SuccessDesc")}</div>`;
  content += `<div><i class="fas fa-xmark"></i> <strong>${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.Failure")}:</strong> ${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.FailureDesc")}</div>`;
  content += `<div><i class="fas fa-skull"></i> <strong>${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.Shadow")}:</strong> ${game.i18n.localize("TRESPASSER.Chat.Travel.Wayfinding.ShadowDesc")}</div>`;
  content += `</div></div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ alias: region.name }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });
}

export async function onPerformAdvance(tracker, event, target) {
  if (!tracker.region || !game.user.isGM || tracker.sessionState !== "active") return;

  const system = tracker.region.system;
  const travelConfig = CONFIG.TRESPASSER.travel;
  const currentPeriod = system?.currentPeriod ?? "morning";

  const periodOrder = ["morning", "evening", "night"];
  const currentIndex = periodOrder.indexOf(currentPeriod);
  
  const nextIndex = (currentIndex + 1) % periodOrder.length;
  const nextPeriod = periodOrder[nextIndex];
  const isNewDay = nextIndex === 0;
  const isPressing = currentIndex === 1;
  const nextDay = isNewDay ? (system?.currentDay ?? 1) + 1 : (system?.currentDay ?? 1);

  const newTP = travelConfig.travelPointsPerAdvance;

  const dayLog = [...(system?.dayLog ?? [])];
  dayLog.push({
    day: nextDay,
    action: game.i18n.localize("TRESPASSER.Terms.Travel.Actions.Advance"),
    detail: game.i18n.localize(travelConfig.periods[nextPeriod]?.label ?? "")
  });

  await tracker.region.update({
    "system.currentDay": nextDay,
    "system.currentPeriod": nextPeriod,
    "system.travelPointsRemaining": newTP,
    "system.dayLog": dayLog
  });

  if (!system?.onRoad || system?.isDisoriented) {
    await postWayfindingPrompt(tracker.region);
  }

  if (isPressing) {
    await ChatMessage.create({
      content: `<div class="trespasser-travel-action">
        <strong>${game.i18n.localize("TRESPASSER.Chat.Travel.PressingOn")}</strong>
        <div>${game.i18n.localize("TRESPASSER.Chat.Travel.PressingOnDetail")}</div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: tracker.region.name })
    });
  }

  await runTravelHostilityCheck(tracker.region);

  await ChatMessage.create({
    content: `<div class="trespasser-travel-action">
      <strong>${game.i18n.format("TRESPASSER.Chat.Travel.AdvanceAnnounce", { name: tracker.region.name })}</strong>
      <div>${game.i18n.localize("TRESPASSER.Chat.Travel.TravelPointsAwarded")}</div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: tracker.region.name })
  });

  tracker.render();
}

export async function onToggleRoad(tracker, event, target) {
  if (!tracker.region || !game.user.isGM) return;
  await tracker.region.update({ "system.onRoad": !tracker.region.system?.onRoad });
}

export async function onAdjustTravelPoints(tracker, event, target) {
  if (!tracker.region || !game.user.isGM) return;
  const delta = parseInt(target.dataset.delta, 10) || 0;
  const current = tracker.region.system?.travelPointsRemaining ?? 0;
  const max = CONFIG.TRESPASSER.travel.travelPointsPerAdvance;
  const newTP = Math.max(0, Math.min(max, current + delta));
  if (newTP === current) return;
  await tracker.region.update({ "system.travelPointsRemaining": newTP });
}

export async function onClearDisorientation(tracker, event, target) {
  if (!tracker.region || !game.user.isGM) return;
  await tracker.region.update({ "system.isDisoriented": false });
}

export async function onNextDay(tracker, event, target) {
  if (!tracker.region || !game.user.isGM || tracker.sessionState !== "active") return;
  const currentDay = tracker.region.system?.currentDay ?? 1;
  await tracker.region.update({
    "system.currentDay": currentDay + 1,
    "system.currentPeriod": "morning",
    "system.travelPointsRemaining": 0
  });

  await ChatMessage.create({
    content: `<div class="trespasser-travel-action">
      <strong>${game.i18n.format("TRESPASSER.Chat.Travel.NewDay", { day: currentDay + 1 })}</strong>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: tracker.region.name })
  });
  tracker.render();
}

export async function onPerformNightsRest(tracker, event, target) {
  if (!tracker.region || !game.user.isGM || tracker.sessionState !== "active") return;

  const system = tracker.region.system;

  const keepingWatch = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.Title") },
    content: `<p>${game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.Content")}</p>`,
    yes: { label: game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.Yes"), icon: "fa-solid fa-eye" },
    no: { label: game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.No"), icon: "fa-solid fa-eye-slash" }
  });

  if (keepingWatch === null) return;

  if (keepingWatch) {
    await runTravelHostilityCheck(tracker.region);
  } else {
    const hostilityTier = system?.hostilityTier ?? 1;
    const roll = await new Roll("1d10").evaluate();
    const encountered = roll.total <= hostilityTier;

    let content = `<div class="trespasser-encounter-check">`;
    content += `<strong>${game.i18n.localize("TRESPASSER.Chat.Travel.NightHostilityCheck")}</strong>`;
    content += `<div class="encounter-roll-result">`;
    content += `<span class="encounter-die">d10: ${roll.total}</span>`;
    content += ` vs `;
    content += `<span class="encounter-alarm">${game.i18n.localize("TRESPASSER.Dungeon.Hostility")}: ${hostilityTier}</span>`;
    content += `</div>`;

    if (encountered) {
      content += `<div class="encounter-triggered">${game.i18n.localize("TRESPASSER.Chat.Travel.NightEncounterAmbush")}</div>`;
    } else {
      content += `<div class="encounter-clear">${game.i18n.localize("TRESPASSER.Chat.Travel.NoEncounter")}</div>`;
    }
    content += `</div>`;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ alias: tracker.region.name }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    if (encountered) {
      await ChatMessage.create({
        content: `<div class="trespasser-travel-action">
          <strong><i class="fas fa-skull-crossbones"></i> ${game.i18n.localize("TRESPASSER.Chat.Travel.AutoAmbush")}</strong>
          <div>${game.i18n.localize("TRESPASSER.Chat.Travel.AutoAmbushDetail")}</div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ alias: tracker.region.name }),
        whisper: game.users.filter(u => u.isGM).map(u => u.id)
      });

      await resolveEndOfRound(tracker.region, { context: "travel", forceEncounter: true });
    }
  }

  await ChatMessage.create({
    content: `<div class="trespasser-travel-action">
      <strong>${game.i18n.format("TRESPASSER.Chat.Travel.NightsRest", { name: tracker.region.name })}</strong>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: tracker.region.name })
  });

  const currentDay = system?.currentDay ?? 1;
  const dayLog = [...(system?.dayLog ?? [])];
  dayLog.push({
    day: currentDay,
    action: game.i18n.localize("TRESPASSER.Terms.Travel.Actions.NightsRest"),
    detail: keepingWatch
      ? game.i18n.localize("TRESPASSER.Chat.Travel.WatchKept")
      : game.i18n.localize("TRESPASSER.Chat.Travel.NoWatch")
  });

  await tracker.region.update({
    "system.currentDay": currentDay + 1,
    "system.currentPeriod": "morning",
    "system.travelPointsRemaining": 0,
    "system.dayLog": dayLog
  });

  tracker.render();
}
