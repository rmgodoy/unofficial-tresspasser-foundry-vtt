/**
 * Travel Tracker Application for Trespasser RPG
 *
 * Runtime exploration interface that tracks overland travel state: current region,
 * day, period, remaining travel points, road status, etc.
 */

import {
  getAvailableRegions,
  prepareTravelContext
} from "./travel-tracker-context.mjs";

import {
  pauseOtherActiveSessions,
  onChooseRegion,
  onSwitchRegion,
  onOpenRegionSheet,
  onStartSession,
  onResumeSession,
  onEndSession,
  onPerformAdvance,
  postWayfindingPrompt,
  onToggleRoad,
  onAdjustTravelPoints,
  onClearDisorientation,
  onNextDay,
  onPerformNightsRest
} from "./travel-tracker-actions.mjs";

import {
  onPerformCamp,
  onConfirmCamp,
  onCancelCamp,
  onOverrideCampActivity,
  onRepromptCamp
} from "./travel-tracker-camp.mjs";

export {
  getAvailableRegions,
  prepareTravelContext,
  pauseOtherActiveSessions,
  postWayfindingPrompt
};

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

  /** @type {TravelTracker|null} */
  static _instance = null;

  static getInstance() {
    if (!TravelTracker._instance) {
      TravelTracker._instance = new TravelTracker();
    }
    return TravelTracker._instance;
  }

  static async launch() {
    const tracker = TravelTracker.getInstance();
    tracker.render(true);
  }

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

  get sessionState() {
    return this.region?.system?.sessionState ?? "idle";
  }

  _adoptCurrentSession() {
    const regions = game.actors?.filter(a => a.type === "region") ?? [];
    const active = regions.find(r => r.system?.sessionState === "active");
    if (active) {
      this.region = active;
      return;
    }
    const paused = regions
      .filter(r => r.system?.sessionState === "paused")
      .sort((a, b) => (b._stats?.modifiedTime ?? 0) - (a._stats?.modifiedTime ?? 0));
    this.region = paused[0] ?? null;
  }

  async _pauseOtherActiveSessions() {
    return pauseOtherActiveSessions(this.region);
  }

  _getAvailableRegions() {
    return getAvailableRegions();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareTravelContext(this, context);
  }

  async _postWayfindingPrompt() {
    return postWayfindingPrompt(this.region);
  }

  // Action Delegates
  static #onChooseRegion(event, target) { onChooseRegion(this, event, target); }
  static #onSwitchRegion(event, target) { onSwitchRegion(this, event, target); }
  static #onOpenRegionSheet(event, target) { onOpenRegionSheet(this, event, target); }
  static async #onStartSession(event, target) { return onStartSession(this, event, target); }
  static async #onResumeSession(event, target) { return onResumeSession(this, event, target); }
  static async #onEndSession(event, target) { return onEndSession(this, event, target); }
  static async #onPerformAdvance(event, target) { return onPerformAdvance(this, event, target); }
  static async #onToggleRoad(event, target) { return onToggleRoad(this, event, target); }
  static async #onAdjustTravelPoints(event, target) { return onAdjustTravelPoints(this, event, target); }
  static async #onClearDisorientation(event, target) { return onClearDisorientation(this, event, target); }
  static async #onNextDay(event, target) { return onNextDay(this, event, target); }
  static async #onPerformNightsRest(event, target) { return onPerformNightsRest(this, event, target); }
  static async #onPerformCamp(event, target) { return onPerformCamp(this, event, target); }
  static async #onConfirmCamp(event, target) { return onConfirmCamp(this, event, target); }
  static async #onCancelCamp(event, target) { return onCancelCamp(this, event, target); }
  static async #onOverrideCampActivity(event, target) { return onOverrideCampActivity(this, event, target); }
  static async #onRepromptCamp(event, target) { return onRepromptCamp(this, event, target); }

  get title() {
    return game.i18n.localize("TRESPASSER.App.TravelTracker.Title");
  }

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
