/**
 * Context preparation for the Travel Tracker application.
 */

/**
 * Build a list of available region actors.
 * Prefers region tokens on the active scene, falls back to world actors.
 * @returns {Actor[]}
 */
export function getAvailableRegions() {
  const worldRegions = game.actors.filter(a => a.type === "region");

  const sceneRegions = [];
  const scene = canvas?.scene;
  if (scene) {
    const regionTokens = scene.tokens.filter(td => td.actor?.type === "region" && !td.actorLink);
    sceneRegions.push(...regionTokens.map(td => td.actor));
  }

  const all = [...worldRegions, ...sceneRegions];
  return [...new Map(all.map(a => [a.id, a])).values()];
}

/**
 * Prepare template rendering context for TravelTracker.
 * @param {TravelTracker} tracker
 * @param {object} context Base context
 * @returns {Promise<object>}
 */
export async function prepareTravelContext(tracker, context) {
  const isGM = game.user.isGM;
  context.isGM = isGM;

  // Session state
  context.sessionState = tracker.sessionState;
  context.isIdle = tracker.sessionState === "idle";
  context.isActive = tracker.sessionState === "active";
  context.isPaused = tracker.sessionState === "paused";

  // Region selection
  context.hasRegion = !!tracker.region;
  context.regionName = tracker.region?.name ?? "";
  context.regionId = tracker.region?.id ?? "";
  context.activePartyName = game.trespasser.TrespasserPartyHelper?.getActiveParty()?.name ?? "-";

  // Available regions (for the picker in idle state)
  if (context.isIdle && isGM) {
    const available = getAvailableRegions();
    context.availableRegions = available.map(r => {
      const state = r.system?.sessionState ?? "idle";
      return {
        _id: r.id,
        name: r.name,
        img: r.img,
        selected: tracker.region?.id === r.id,
        state,
        stateLabel: state === "idle" ? "" : game.i18n.localize(`TRESPASSER.App.TravelTracker.Session.State.${state}`),
        day: r.system?.currentDay ?? 0
      };
    });
    context.hasAvailableRegions = available.length > 0;
    const selectedState = tracker.region?.system?.sessionState ?? "idle";
    context.selectedIsResumable = selectedState === "paused";
  }

  // Hostility info (if region selected)
  if (tracker.region) {
    const tier = CONFIG.TRESPASSER.dungeon.hostilityTiers[tracker.region.system?.hostilityTier] ?? CONFIG.TRESPASSER.dungeon.hostilityTiers[1];
    context.hostilityLabel = game.i18n.localize(tier.label);
    context.hostilityDC = tier.dc;

    if (!context.isIdle) {
      const system = tracker.region.system;
      context.regionImg = tracker.region.img;
      const travelConfig = CONFIG.TRESPASSER.travel;

      // Day & Period
      context.currentDay = system.currentDay ?? 0;
      context.currentPeriod = system.currentPeriod ?? "morning";
      const periodConfig = travelConfig.periods[context.currentPeriod];
      context.periodLabel = game.i18n.localize(periodConfig?.label ?? "");
      context.periodIcon = periodConfig?.icon ?? "fa-solid fa-sun";

      // Travel Points
      const tpMax = travelConfig.travelPointsPerAdvance;
      context.travelPointsRemaining = system.travelPointsRemaining ?? tpMax;
      context.travelPointsMax = tpMax;
      context.travelPips = Array.from({ length: tpMax }, (_, i) => ({
        filled: i < context.travelPointsRemaining
      }));

      // Weather
      const weatherConfig = travelConfig.weatherModifiers[system.weather ?? "clear"];
      context.weatherLabel = game.i18n.localize(weatherConfig?.label ?? "");
      context.weather = system.weather ?? "clear";
      context.weatherChoices = {};
      for (const [key, val] of Object.entries(travelConfig.weatherModifiers)) {
        context.weatherChoices[key] = game.i18n.localize(val.label);
      }

      // Road
      context.onRoad = system.onRoad ?? false;

      // Disorientation
      context.isDisoriented = system.isDisoriented ?? false;

      // Terrain cost reference (with weather modifier applied)
      context.terrainCosts = Object.entries(travelConfig.terrainCosts).map(([key, val]) => {
        const baseCost = system.onRoad ? 1 : val.cost;
        return {
          key,
          label: game.i18n.localize(val.label),
          baseCost: baseCost,
          totalCost: baseCost + (weatherConfig?.extraCost ?? 0),
          examples: game.i18n.localize(val.examples)
        };
      });

      // Day log (last 5 entries)
      const log = [...(system.dayLog ?? [])].reverse();
      context.recentLog = log.slice(0, 5);
      context.hasMoreLog = log.length > 5;
    }
  }

  // Camp Pending Context
  context.isCampPending = tracker._campPending;
  if (tracker._campPending && tracker._campSelections) {
    context.campSelections = [...tracker._campSelections].map(([actorId, selection]) => {
      const activityKey = selection ? (typeof selection === 'string' ? selection : selection.activityKey) : null;
      const targetId = selection && typeof selection === 'object' ? selection.targetId : null;
      const actor = game.actors.get(actorId);
      const activity = activityKey ? CONFIG.TRESPASSER.travel.campActivities[activityKey] : null;
      
      let targetName = "";
      if (targetId) {
        const targetActor = game.actors.get(targetId);
        if (targetActor) targetName = targetActor.name;
      }

      return {
        actorId,
        actorName: actor?.name ?? "?",
        actorImg: actor?.img ?? "",
        activityKey,
        activityLabel: activity ? game.i18n.localize(activity.label) : null,
        activityIcon: activity?.icon ?? "",
        targetName,
        isPending: activityKey === null
      };
    });
    context.allCampSelected = context.campSelections.every(s => !s.isPending);

    context.campActivityChoices = Object.entries(CONFIG.TRESPASSER.travel.campActivities).map(([key, cfg]) => ({
      key,
      label: game.i18n.localize(cfg.label)
    }));
  }

  return context;
}
