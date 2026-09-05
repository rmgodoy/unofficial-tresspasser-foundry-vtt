/**
 * Dungeon Tracker Application for Trespasser RPG
 *
 * Runtime exploration interface that tracks dungeon state: current room,
 * round, actions remaining, alarm, and light sources.
 */

import {
  getPartyMembers,
  aggregateLightSources,
  promptLightDepletion
} from "./dungeon-light-sources.mjs";

import {
  getAvailableDungeons,
  prepareDungeonContext
} from "./dungeon-tracker-context.mjs";

import {
  pauseOtherActiveSessions,
  onChooseDungeon,
  onSwitchDungeon,
  onStartSession,
  onResumeSession,
  onEndSession,
  onPerformAction,
  onNextRound,
  onSetCurrentRoom,
  onAdjustAlarm,
  onAdjustActions,
  onAlarmCheck,
  onRefundLastAction,
  onOpenDungeonSheet,
  onOpenRoomSheet
} from "./dungeon-tracker-actions.mjs";

export {
  getPartyMembers,
  aggregateLightSources,
  promptLightDepletion,
  getAvailableDungeons,
  prepareDungeonContext,
  pauseOtherActiveSessions
};

const { api } = foundry.applications;

/** @typedef {"idle"|"active"|"paused"} SessionState */

export class DungeonTracker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "dungeon-tracker",
    classes: ["trespasser", "dungeon-tracker"],
    position: { width: 360, height: "auto", top: 80 },
    window: {
      title: "TRESPASSER.App.DungeonTracker.Title",
      resizable: true,
      minimizable: true
    },
    actions: {
      chooseDungeon: DungeonTracker.#onChooseDungeon,
      switchDungeon: DungeonTracker.#onSwitchDungeon,
      startSession: DungeonTracker.#onStartSession,
      resumeSession: DungeonTracker.#onResumeSession,
      endSession: DungeonTracker.#onEndSession,
      performAction: DungeonTracker.#onPerformAction,
      nextRound: DungeonTracker.#onNextRound,
      setCurrentRoom: DungeonTracker.#onSetCurrentRoom,
      openDungeonSheet: DungeonTracker.#onOpenDungeonSheet,
      openRoomSheet: DungeonTracker.#onOpenRoomSheet,
      adjustAlarm: DungeonTracker.#onAdjustAlarm,
      adjustActions: DungeonTracker.#onAdjustActions,
      alarmCheck: DungeonTracker.#onAlarmCheck,
      refundLastAction: DungeonTracker.#onRefundLastAction
    }
  };

  static PARTS = {
    tracker: {
      template: "systems/trespasser/templates/exploration/dungeon-tracker.hbs"
    }
  };

  /** @type {DungeonTracker|null} */
  static _instance = null;

  static getInstance() {
    if (!DungeonTracker._instance) {
      DungeonTracker._instance = new DungeonTracker();
    }
    return DungeonTracker._instance;
  }

  static async launch() {
    const tracker = DungeonTracker.getInstance();
    tracker.render(true);
  }

  static async _promptLightDepletion(dungeon) {
    return promptLightDepletion(dungeon);
  }

  /** @type {Actor|null} The dungeon currently in focus (UI pointer only). */
  dungeon = null;

  constructor(...args) {
    super(...args);
    this._adoptCurrentSession();
  }

  get sessionState() {
    return this.dungeon?.system?.sessionState ?? "idle";
  }

  _adoptCurrentSession() {
    const dungeons = game.actors?.filter(a => a.type === "dungeon") ?? [];
    const active = dungeons.find(d => d.system?.sessionState === "active");
    if (active) {
      this.dungeon = active;
      return;
    }
    const paused = dungeons
      .filter(d => d.system?.sessionState === "paused")
      .sort((a, b) => (b._stats?.modifiedTime ?? 0) - (a._stats?.modifiedTime ?? 0));
    this.dungeon = paused[0] ?? null;
  }

  async _pauseOtherActiveSessions() {
    return pauseOtherActiveSessions(this.dungeon);
  }

  _getAvailableDungeons() {
    return getAvailableDungeons();
  }

  _getPartyMembers() {
    return getPartyMembers();
  }

  _aggregateLightSources() {
    return aggregateLightSources();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareDungeonContext(this, context);
  }

  // Action Delegates
  static #onChooseDungeon(event, target) { onChooseDungeon(this, event, target); }
  static #onSwitchDungeon(event, target) { onSwitchDungeon(this, event, target); }
  static async #onStartSession(event, target) { return onStartSession(this, event, target); }
  static async #onResumeSession(event, target) { return onResumeSession(this, event, target); }
  static async #onEndSession(event, target) { return onEndSession(this, event, target); }
  static async #onPerformAction(event, target) { return onPerformAction(this, event, target); }
  static async #onNextRound(event, target) { return onNextRound(this, event, target); }
  static async #onSetCurrentRoom(event, target) { return onSetCurrentRoom(this, event, target); }
  static async #onAdjustAlarm(event, target) { return onAdjustAlarm(this, event, target); }
  static async #onAdjustActions(event, target) { return onAdjustActions(this, event, target); }
  static async #onAlarmCheck(event, target) { return onAlarmCheck(this, event, target); }
  static async #onRefundLastAction(event, target) { return onRefundLastAction(this, event, target); }
  static #onOpenDungeonSheet(event, target) { onOpenDungeonSheet(this, event, target); }
  static #onOpenRoomSheet(event, target) { onOpenRoomSheet(this, event, target); }

  get title() {
    return game.i18n.localize("TRESPASSER.App.DungeonTracker.Title");
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!this._updateHookId) {
      this._updateHookId = Hooks.on("updateActor", (actor) => {
        if (this.dungeon && actor.id === this.dungeon.id) this.render();
      });
      this._updateItemHookId = Hooks.on("updateItem", (item) => {
        if (this.dungeon && item.parent?.id === this.dungeon.id) this.render();
      });
      this._createItemHookId = Hooks.on("createItem", (item) => {
        if (this.dungeon && item.parent?.id === this.dungeon.id) this.render();
      });
      this._deleteItemHookId = Hooks.on("deleteItem", (item) => {
        if (this.dungeon && item.parent?.id === this.dungeon.id) this.render();
      });
      this._createActorHookId = Hooks.on("createActor", (actor) => {
        if (actor.type === "dungeon") {
          this.render({ force: true });
        }
      });
      this._deleteActorHookId = Hooks.on("deleteActor", (actor) => {
        if (actor.type === "dungeon") {
          if (this.dungeon?.id === actor.id) {
            this.dungeon = null;
          }
          this.render({ force: true });
        }
      });
    }
  }

  async close(options = {}) {
    if (this._updateHookId) {
      Hooks.off("updateActor", this._updateHookId);
      this._updateHookId = null;
    }
    if (this._updateItemHookId) {
      Hooks.off("updateItem", this._updateItemHookId);
      this._updateItemHookId = null;
    }
    if (this._createItemHookId) {
      Hooks.off("createItem", this._createItemHookId);
      this._createItemHookId = null;
    }
    if (this._deleteItemHookId) {
      Hooks.off("deleteItem", this._deleteItemHookId);
      this._deleteItemHookId = null;
    }
    if (this._createActorHookId) {
      Hooks.off("createActor", this._createActorHookId);
      this._createActorHookId = null;
    }
    if (this._deleteActorHookId) {
      Hooks.off("deleteActor", this._deleteActorHookId);
      this._deleteActorHookId = null;
    }
    DungeonTracker._instance = null;
    return super.close(options);
  }
}

export function registerDungeonTrackerHooks() {
  Hooks.on("renderSceneControls", (controls, html) => {
    if (html.querySelector(".dungeon-tracker-control")) return;

    const layers = html.querySelector("#scene-controls-layers");
    if (!layers) return;

    const li = document.createElement("li");
    li.classList.add("control", "dungeon-tracker-control");
    li.innerHTML = `
      <button type="button" class="control ui-control tool icon button fas fa-dungeon" 
        data-action="tool" data-tool="dungeonTracker" 
        aria-label="Dungeon Tracker" 
        aria-pressed="false" data-tooltip="">
      </button>
    `;

    li.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      DungeonTracker.launch();
    });

    layers.appendChild(li);
  });
}
