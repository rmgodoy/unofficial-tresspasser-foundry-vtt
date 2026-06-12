/**
 * Travel Tracker Application for Trespasser RPG
 *
 * Runtime exploration interface that tracks overland travel state: current region,
 * day, period, remaining travel points, road status, etc.
 *
 * Session lifecycle: idle → active ↔ paused → idle (ended)
 *   - idle: No travel in progress. GM picks a region and starts.
 *   - active: Travel in progress. Actions, periods, hostility checks run.
 *   - paused: Travel paused. State preserved but controls disabled.
 *
 * GM view: full controls (session management, action buttons, region nav).
 * Player view: region name, day, period, road status.
 */

import { runTravelHostilityCheck, resolveEndOfRound } from "./encounter-resolution.mjs";
import { startCampSelection, repromptMember } from "./camp-activity-handler.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";

const { api } = foundry.applications;

/** @typedef {"idle"|"active"|"paused"} SessionState */

export class TravelTracker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "travel-tracker",
    classes: ["trespasser", "travel-tracker"],
    position: { width: 380, height: "auto", top: 80 },
    window: {
      title: "TRESPASSER.App.TravelTracker.Title",
      resizable: true,
      minimizable: true
    },
    actions: {
      chooseRegion: TravelTracker.#onChooseRegion,
      switchRegion: TravelTracker.#onSwitchRegion,
      openRegionSheet: TravelTracker.#onOpenRegionSheet,
      startSession:   TravelTracker.#onStartSession,
      resumeSession:  TravelTracker.#onResumeSession,
      endSession:     TravelTracker.#onEndSession,
      performAdvance:       TravelTracker.#onPerformAdvance,
      toggleRoad:           TravelTracker.#onToggleRoad,
      adjustTravelPoints:   TravelTracker.#onAdjustTravelPoints,
      clearDisorientation:  TravelTracker.#onClearDisorientation,
      nextDay:              TravelTracker.#onNextDay,
      performNightsRest:    TravelTracker.#onPerformNightsRest,
      performCamp:          TravelTracker.#onPerformCamp,
      confirmCamp:          TravelTracker.#onConfirmCamp,
      cancelCamp:           TravelTracker.#onCancelCamp,
      overrideCampActivity: TravelTracker.#onOverrideCampActivity,
      repromptCamp:         TravelTracker.#onRepromptCamp
    }
  };

  static PARTS = {
    tracker: {
      template: "systems/trespasser/templates/exploration/travel-tracker.hbs"
    }
  };

  /* -------------------------------------------- */
  /* Singleton Management                         */
  /* -------------------------------------------- */

  /** @type {TravelTracker|null} */
  static _instance = null;

  /**
   * Get or create the singleton tracker instance.
   * @returns {TravelTracker}
   */
  static getInstance() {
    if (!TravelTracker._instance) {
      TravelTracker._instance = new TravelTracker();
    }
    return TravelTracker._instance;
  }

  /**
   * Launch the tracker — opens to whatever state we're in.
   */
  static async launch() {
    const tracker = TravelTracker.getInstance();
    tracker.render(true);
  }

  /* -------------------------------------------- */
  /* Instance State                               */
  /* -------------------------------------------- */

  /** @type {Actor|null} The region currently in focus (UI pointer only). */
  region = null;

  /** @type {boolean} Whether camp selection is in progress */
  _campPending = false;

  /** @type {Map<string, string|null>|null} actorId → activity key (null = pending) */
  _campSelections = null;

  constructor(...args) {
    super(...args);
    this._adoptCurrentSession();
  }

  /**
   * Session state is the source-of-truth on the region actor itself, so
   * each region remembers its own status across reloads and the tracker
   * can switch between paused sessions without losing logs.
   * @type {SessionState}
   */
  get sessionState() {
    return this.region?.system?.sessionState ?? "idle";
  }

  /**
   * On construction, find the most relevant region to focus on:
   *   - any region with state="active" (only one is allowed at a time)
   *   - else the most-recently-modified region with state="paused"
   *   - else null (show the picker)
   */
  _adoptCurrentSession() {
    const regions = game.actors?.filter(a => a.type === "region") ?? [];
    const active = regions.find(r => r.system.sessionState === "active");
    if (active) {
      this.region = active;
      return;
    }
    const paused = regions
      .filter(r => r.system.sessionState === "paused")
      .sort((a, b) => (b._stats?.modifiedTime ?? 0) - (a._stats?.modifiedTime ?? 0));
    this.region = paused[0] ?? null;
  }

  /**
   * Pause any other regions currently flagged active so only one travel session is
   * "live" at a time. Called before activating or resuming a session.
   */
  async _pauseOtherActiveSessions() {
    if (!game.user.isGM) return;
    const others = game.actors.filter(a =>
      a.type === "region" &&
      a.id !== this.region?.id &&
      a.system.sessionState === "active"
    );
    for (const other of others) {
      await other.update({ "system.sessionState": "paused" });
    }
  }

  /**
   * Build a list of available region actors.
   * Prefers region tokens on the active scene, falls back to world actors.
   * @returns {Actor[]}
   */
  _getAvailableRegions() {
    // Collect all actors of type 'region' from the world
    const worldRegions = game.actors.filter(a => a.type === "region");

    // Also collect 'region' actors that might exist only as tokens on the current scene (unlinked)
    const sceneRegions = [];
    const scene = canvas?.scene;
    if (scene) {
      const regionTokens = scene.tokens.filter(td => td.actor?.type === "region" && !td.actorLink);
      sceneRegions.push(...regionTokens.map(td => td.actor));
    }

    // Combine and unique by ID
    const all = [...worldRegions, ...sceneRegions];
    return [...new Map(all.map(a => [a.id, a])).values()];
  }

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isGM = game.user.isGM;
    context.isGM = isGM;

    // Session state
    context.sessionState = this.sessionState;
    context.isIdle = this.sessionState === "idle";
    context.isActive = this.sessionState === "active";
    context.isPaused = this.sessionState === "paused";

    // Region selection
    context.hasRegion = !!this.region;
    context.regionName = this.region?.name ?? "";
    context.regionId = this.region?.id ?? "";

    // Available regions (for the picker in idle state)
    if (context.isIdle && isGM) {
      const available = this._getAvailableRegions();
      context.availableRegions = available.map(r => {
        const state = r.system.sessionState ?? "idle";
        return {
          _id: r.id,
          name: r.name,
          img: r.img,
          selected: this.region?.id === r.id,
          state,
          stateLabel: state === "idle" ? "" : game.i18n.localize(`TRESPASSER.App.TravelTracker.Session.State.${state}`),
          day: r.system.currentDay ?? 0
        };
      });
      context.hasAvailableRegions = available.length > 0;
      const selectedState = this.region?.system?.sessionState ?? "idle";
      context.selectedIsResumable = selectedState === "paused";
    }

    // Hostility info (if region selected)
    if (this.region) {
      const tier = CONFIG.TRESPASSER.dungeon.hostilityTiers[this.region.system.hostilityTier] ?? CONFIG.TRESPASSER.dungeon.hostilityTiers[1];
      context.hostilityLabel = game.i18n.localize(tier.label);
      context.hostilityDC = tier.dc;

      if (!context.isIdle) {
        const system = this.region.system;
        context.regionImg = this.region.img;
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
    context.isCampPending = this._campPending;
    if (this._campPending && this._campSelections) {
      context.campSelections = [...this._campSelections].map(([actorId, selection]) => {
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

      // Available activities for override dropdowns
      context.campActivityChoices = Object.entries(CONFIG.TRESPASSER.travel.campActivities).map(([key, cfg]) => ({
        key,
        label: game.i18n.localize(cfg.label)
      }));
    }

    return context;
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  static #onChooseRegion(event, target) {
    const regionId = target.dataset.regionId;
    if (!regionId) return;
    const actor = game.actors.get(regionId);
    if (!actor || actor.type !== "region") return;
    this.region = actor;
    this.render();
  }

  static #onSwitchRegion(event, target) {
    if (!game.user.isGM) return;
    this.region = null;
    this.render();
  }

  static #onOpenRegionSheet(event, target) {
    if (this.region) this.region.sheet.render(true);
  }

  static async #onStartSession(event, target) {
    if (!this.region || !game.user.isGM) return;
    await this._pauseOtherActiveSessions();
    await this.region.update({
      "system.currentDay": 1,
      "system.currentPeriod": "morning",
      "system.travelPointsRemaining": 0,
      "system.onRoad": false,
      "system.isDisoriented": false,
      "system.dayLog": [],
      "system.sessionState": "active"
    });

    const chatContent = game.i18n.format("TRESPASSER.Chat.Travel.SessionStarted", { name: this.region.name }) +
      " — " + game.i18n.localize("TRESPASSER.Chat.Travel.SessionDay1");
    await ChatMessage.create({
      content: chatContent,
      speaker: ChatMessage.getSpeaker({ alias: this.region.name })
    });

    this.render();
  }

  static async #onResumeSession(event, target) {
    if (!this.region || !game.user.isGM) return;
    await this._pauseOtherActiveSessions();
    await this.region.update({ "system.sessionState": "active" });
    this.render();
  }

  static async #onEndSession(event, target) {
    if (!this.region || !game.user.isGM) return;
    await this.region.update({ "system.sessionState": "paused" });
    this.region = null;
    this.render();
  }

  static async #onPerformAdvance(event, target) {
    if (!this.region || !game.user.isGM || this.sessionState !== "active") return;

    const system = this.region.system;
    const travelConfig = CONFIG.TRESPASSER.travel;
    const currentPeriod = system.currentPeriod ?? "morning";

    // Advance the period
    const periodOrder = ["morning", "evening", "night"];
    const currentIndex = periodOrder.indexOf(currentPeriod);
    
    const nextIndex = (currentIndex + 1) % periodOrder.length;
    const nextPeriod = periodOrder[nextIndex];
    const isNewDay = nextIndex === 0;
    const isPressing = currentIndex === 1; // 2nd advance in a day (evening -> night) = pressing on
    const nextDay = isNewDay ? (system.currentDay ?? 1) + 1 : (system.currentDay ?? 1);

    // Award travel points
    const newTP = travelConfig.travelPointsPerAdvance;

    // Build log entry
    const dayLog = [...(system.dayLog ?? [])];
    dayLog.push({
      day: nextDay,
      action: game.i18n.localize("TRESPASSER.Terms.Travel.Actions.Advance"),
      detail: game.i18n.localize(travelConfig.periods[nextPeriod]?.label ?? "")
    });

    // Update region state
    await this.region.update({
      "system.currentDay": nextDay,
      "system.currentPeriod": nextPeriod,
      "system.travelPointsRemaining": newTP,
      "system.dayLog": dayLog
    });

    // Post chat messages

    // 1. Wayfinding check (if not on road or disoriented override)
    if (!system.onRoad || system.isDisoriented) {
      await this._postWayfindingPrompt();
    }

    // 2. Pressing on warning
    if (isPressing) {
      await ChatMessage.create({
        content: `<div class="trespasser-travel-action">
          <strong>${game.i18n.localize("TRESPASSER.Chat.Travel.PressingOn")}</strong>
          <div>${game.i18n.localize("TRESPASSER.Chat.Travel.PressingOnDetail")}</div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ alias: this.region.name })
      });
    }

    // 3. Hostility check
    await runTravelHostilityCheck(this.region);

    // 4. Advance announcement
    await ChatMessage.create({
      content: `<div class="trespasser-travel-action">
        <strong>${game.i18n.format("TRESPASSER.Chat.Travel.AdvanceAnnounce", { name: this.region.name })}</strong>
        <div>${game.i18n.localize("TRESPASSER.Chat.Travel.TravelPointsAwarded")}</div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: this.region.name })
    });

    this.render();
  }

  async _postWayfindingPrompt() {
    const system = this.region.system;
    const dc = CONFIG.TRESPASSER.dungeon.hostilityTiers[system.hostilityTier]?.dc ?? 10;

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
      speaker: ChatMessage.getSpeaker({ alias: this.region.name }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
  }

  static async #onToggleRoad(event, target) {
    if (!this.region || !game.user.isGM) return;
    await this.region.update({ "system.onRoad": !this.region.system.onRoad });
  }

  static async #onAdjustTravelPoints(event, target) {
    if (!this.region || !game.user.isGM) return;
    const delta = parseInt(target.dataset.delta, 10) || 0;
    const current = this.region.system.travelPointsRemaining ?? 0;
    const max = CONFIG.TRESPASSER.travel.travelPointsPerAdvance;
    const newTP = Math.max(0, Math.min(max, current + delta));
    if (newTP === current) return;
    await this.region.update({ "system.travelPointsRemaining": newTP });
  }

  static async #onClearDisorientation(event, target) {
    if (!this.region || !game.user.isGM) return;
    await this.region.update({ "system.isDisoriented": false });
  }

  static async #onNextDay(event, target) {
    if (!this.region || !game.user.isGM || this.sessionState !== "active") return;
    const currentDay = this.region.system.currentDay ?? 1;
    await this.region.update({
      "system.currentDay": currentDay + 1,
      "system.currentPeriod": "morning",
      "system.travelPointsRemaining": 0
    });

    await ChatMessage.create({
      content: `<div class="trespasser-travel-action">
        <strong>${game.i18n.format("TRESPASSER.Chat.Travel.NewDay", { day: currentDay + 1 })}</strong>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: this.region.name })
    });
    this.render();
  }

  static async #onPerformNightsRest(event, target) {
    if (!this.region || !game.user.isGM || this.sessionState !== "active") return;

    const system = this.region.system;

    // Ask if anyone is keeping watch
    const keepingWatch = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.Title") },
      content: `<p>${game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.Content")}</p>`,
      yes: { label: game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.Yes"), icon: "fa-solid fa-eye" },
      no: { label: game.i18n.localize("TRESPASSER.Dialog.Travel.KeepingWatch.No"), icon: "fa-solid fa-eye-slash" }
    });

    // If dialog was closed/cancelled, abort without consuming the action
    if (keepingWatch === null) return;

    // Run hostility check
    if (keepingWatch) {
      // Normal encounter check
      await runTravelHostilityCheck(this.region);
    } else {
      // No watch — roll to determine if encounter, but it's auto-ambush
      const hostilityTier = system.hostilityTier ?? 1;
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
        speaker: ChatMessage.getSpeaker({ alias: this.region.name }),
        whisper: game.users.filter(u => u.isGM).map(u => u.id)
      });

      // If encounter occurred, post auto-ambush warning
      if (encountered) {
        // Still run the full encounter resolution for reaction/approach/table
        // but note in chat that it's an ambush
        await ChatMessage.create({
          content: `<div class="trespasser-travel-action">
            <strong><i class="fas fa-skull-crossbones"></i> ${game.i18n.localize("TRESPASSER.Chat.Travel.AutoAmbush")}</strong>
            <div>${game.i18n.localize("TRESPASSER.Chat.Travel.AutoAmbushDetail")}</div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ alias: this.region.name }),
          whisper: game.users.filter(u => u.isGM).map(u => u.id)
        });

        // Resolve the rest of the encounter automatically (table draw, reaction, surprise DC, approaches)
        await resolveEndOfRound(this.region, { context: "travel", forceEncounter: true });
      }
    }

    // Post Night's Rest chat message
    await ChatMessage.create({
      content: `<div class="trespasser-travel-action">
        <strong>${game.i18n.format("TRESPASSER.Chat.Travel.NightsRest", { name: this.region.name })}</strong>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: this.region.name })
    });

    // Advance to next day
    const currentDay = system.currentDay ?? 1;
    const dayLog = [...(system.dayLog ?? [])];
    dayLog.push({
      day: currentDay,
      action: game.i18n.localize("TRESPASSER.Terms.Travel.Actions.NightsRest"),
      detail: keepingWatch
        ? game.i18n.localize("TRESPASSER.Chat.Travel.WatchKept")
        : game.i18n.localize("TRESPASSER.Chat.Travel.NoWatch")
    });

    await this.region.update({
      "system.currentDay": currentDay + 1,
      "system.currentPeriod": "morning",
      "system.travelPointsRemaining": 0,
      "system.dayLog": dayLog
    });

    this.render();
  }

  static async #onPerformCamp(event, target) {
    if (!this.region || !game.user.isGM || this.sessionState !== "active") return;

    // Get party members
    const party = game.actors.find(a => a.type === "party");
    if (!party) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Travel.NoPartyFound"));
      return;
    }
    const memberIds = party.system.members ?? [];
    const members = memberIds.map(id => game.actors.get(id)).filter(a => a?.type === "character");
    if (members.length === 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Travel.NoPartyMembers"));
      return;
    }

    // Start the camp selection flow
    startCampSelection(this.region, members);
  }

  static async #onConfirmCamp(event, target) {
    if (!this.region || !game.user.isGM || !this._campPending) return;

    // Check all selections are made
    const allSelected = [...this._campSelections.values()].every(v => v !== null);
    if (!allSelected) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Travel.CampNotAllSelected"));
      return;
    }

    // Build camp results chat card
    const campConfig = CONFIG.TRESPASSER.travel.campActivities;
    let content = `<div class="trespasser-camp-results">`;
    content += `<h3><i class="fas fa-campground"></i> ${game.i18n.localize("TRESPASSER.Chat.Travel.CampActivities")}</h3>`;
    content += `<div class="camp-results-list">`;
    for (const [actorId, selection] of this._campSelections) {
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
      speaker: ChatMessage.getSpeaker({ alias: this.region.name })
    });

    // Advance period
    const system = this.region.system;
    const periodOrder = ["morning", "evening", "night"];
    const currentIndex = periodOrder.indexOf(system.currentPeriod ?? "morning");
    const nextPeriod = periodOrder[Math.min(currentIndex + 1, 2)];

    // Log
    const dayLog = [...(system.dayLog ?? [])];
    dayLog.push({
      day: system.currentDay ?? 1,
      action: game.i18n.localize("TRESPASSER.Terms.Travel.Actions.Camp"),
      detail: `${this._campSelections.size} activities`
    });

    await this.region.update({
      "system.currentPeriod": nextPeriod,
      "system.dayLog": dayLog
    });

    // Notify other clients that camp is confirmed
    TrespasserSocket.emit("CAMP_ACTIVITY_CONFIRM", { 
      regionId: this.region.id,
      selections: Object.fromEntries(this._campSelections)
    });

    // Clean up camp state
    this._campPending = false;
    this._campSelections = null;

    this.render();
  }

  static async #onCancelCamp(event, target) {
    if (!game.user.isGM) return;
    this._campPending = false;
    this._campSelections = null;
    TrespasserSocket.emit("CAMP_ACTIVITY_CANCEL", { regionId: this.region?.id });
    this.render();
  }

  static async #onOverrideCampActivity(event, target) {
    if (!game.user.isGM || !this._campPending) return;
    const actorId = target.dataset.actorId;
    const activityKey = target.dataset.activityKey;
    if (!actorId || !activityKey) return;
    this._campSelections.set(actorId, { activityKey, targetId: null });
    this.render();
  }

  static async #onRepromptCamp(event, target) {
    if (!game.user.isGM || !this._campPending) return;
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    repromptMember(actorId);
    const actor = game.actors.get(actorId);
    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Travel.CampRepromptSent", { name: actor?.name ?? "" }));
  }


  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("TRESPASSER.App.TravelTracker.Title");
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this._updateHookId) {
      this._updateHookId = Hooks.on("updateActor", (actor) => {
        if (this.region && actor.id === this.region.id) this.render();
      });
      this._createActorHookId = Hooks.on("createActor", (actor) => {
        if (actor.type === "region") {
          this.render({ force: true });
        }
      });
      this._deleteActorHookId = Hooks.on("deleteActor", (actor) => {
        if (actor.type === "region") {
          if (this.region?.id === actor.id) {
            this.region = null;
          }
          this.render({ force: true });
        }
      });
    }

    // Weather select change listener
    const weatherSelect = this.element.querySelector('.travel-weather-select');
    if (weatherSelect) {
      weatherSelect.addEventListener('change', async (ev) => {
        if (!this.region || !game.user.isGM) return;
        const weather = weatherSelect.value;
        if (weather) {
          await this.region.update({ "system.weather": weather });
        }
      });
    }

    // Camp override selects
    const overrideSelects = this.element.querySelectorAll('.camp-override-select');
    for (const select of overrideSelects) {
      select.addEventListener('change', (ev) => {
        const actorId = select.dataset.actorId;
        const activityKey = select.value;
        if (actorId && activityKey) {
          this._campSelections?.set(actorId, { activityKey, targetId: null });
          this.render();
        }
      });
    }
  }

  /** @override */
  async close(options = {}) {
    if (this._updateHookId) {
      Hooks.off("updateActor", this._updateHookId);
      this._updateHookId = null;
    }
    if (this._createActorHookId) {
      Hooks.off("createActor", this._createActorHookId);
      this._createActorHookId = null;
    }
    if (this._deleteActorHookId) {
      Hooks.off("deleteActor", this._deleteActorHookId);
      this._deleteActorHookId = null;
    }
    TravelTracker._instance = null;
    return super.close(options);
  }
}

/* -------------------------------------------- */
/* Registration                                 */
/* -------------------------------------------- */

/**
 * Register the travel tracker scene control button and hooks.
 */
export function registerTravelTrackerHooks() {
  Hooks.on("renderSceneControls", (controls, html) => {
    if (html.querySelector(".travel-tracker-control")) return;

    const layers = html.querySelector("#scene-controls-layers");
    if (!layers) return;

    const li = document.createElement("li");
    li.classList.add("control", "travel-tracker-control");
    li.innerHTML = `
      <button type="button" class="control ui-control tool icon button fas fa-compass" 
        data-action="tool" data-tool="travelTracker" 
        aria-label="Travel Tracker" 
        aria-pressed="false" data-tooltip="">
      </button>
    `;

    li.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      TravelTracker.launch();
    });

    layers.appendChild(li);
  });
}
