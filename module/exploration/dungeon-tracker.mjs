/**
 * Dungeon Tracker Application for Trespasser RPG
 *
 * Runtime exploration interface that tracks dungeon state: current room,
 * round, actions remaining, alarm, and light sources.
 *
 * Session lifecycle: idle → active ↔ paused → idle (ended)
 *   - idle: No exploration in progress. GM picks a dungeon and starts.
 *   - active: Exploration in progress. Actions, rounds, encounters run.
 *   - paused: Exploration paused. State preserved but controls disabled.
 *
 * GM view: full controls (session management, action buttons, room nav).
 * Player view: dungeon name, round, actions remaining, party light sources.
 */

import { executeDungeonAction } from "./dungeon-actions.mjs";
import { resolveEndOfRound } from "./encounter-resolution.mjs";

const { api } = foundry.applications;

/** @typedef {"idle"|"active"|"paused"} SessionState */

export class DungeonTracker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "dungeon-tracker",
    classes: ["trespasser", "dungeon-tracker"],
    position: { width: 360, height: "auto", top: 80 },
    window: {
      title: "TRESPASSER.Dungeon.Tracker.Title",
      resizable: true,
      minimizable: true
    },
    actions: {
      // Session lifecycle
      chooseDungeon: DungeonTracker.#onChooseDungeon,
      startSession: DungeonTracker.#onStartSession,
      pauseSession: DungeonTracker.#onPauseSession,
      resumeSession: DungeonTracker.#onResumeSession,
      endSession: DungeonTracker.#onEndSession,
      // Exploration
      performAction: DungeonTracker.#onPerformAction,
      nextRound: DungeonTracker.#onNextRound,
      setCurrentRoom: DungeonTracker.#onSetCurrentRoom,
      openDungeonSheet: DungeonTracker.#onOpenDungeonSheet,
      openRoomSheet: DungeonTracker.#onOpenRoomSheet
    }
  };

  static PARTS = {
    tracker: {
      template: "systems/trespasser/templates/exploration/dungeon-tracker.hbs"
    }
  };

  /* -------------------------------------------- */
  /* Singleton Management                         */
  /* -------------------------------------------- */

  /** @type {DungeonTracker|null} */
  static _instance = null;

  /**
   * Get or create the singleton tracker instance.
   * @returns {DungeonTracker}
   */
  static getInstance() {
    if (!DungeonTracker._instance) {
      DungeonTracker._instance = new DungeonTracker();
    }
    return DungeonTracker._instance;
  }

  /**
   * Launch the tracker — opens to whatever state we're in.
   * Does NOT auto-detect or auto-start a session.
   */
  static async launch() {
    const tracker = DungeonTracker.getInstance();
    tracker.render(true);
  }

  /* -------------------------------------------- */
  /* Instance State                               */
  /* -------------------------------------------- */

  /** @type {Actor|null} The selected dungeon actor */
  dungeon = null;

  /** @type {SessionState} Current session state */
  sessionState = "idle";

  /* -------------------------------------------- */
  /* Dungeon Selection                            */
  /* -------------------------------------------- */

  /**
   * Build a list of available dungeon actors.
   * Prefers dungeon tokens on the active scene, falls back to world actors.
   * @returns {Actor[]}
   */
  _getAvailableDungeons() {
    // Collect all actors of type 'dungeon' from the world
    const worldDungeons = game.actors.filter(a => a.type === "dungeon");
    
    // Also collect 'dungeon' actors that might exist only as tokens on the current scene (unlinked)
    const sceneDungeons = [];
    const scene = canvas?.scene;
    if (scene) {
      const dungeonTokens = scene.tokens.filter(td => td.actor?.type === "dungeon" && !td.actorLink);
      sceneDungeons.push(...dungeonTokens.map(td => td.actor));
    }

    // Combine and unique by ID
    const all = [...worldDungeons, ...sceneDungeons];
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

    // Dungeon selection
    context.hasDungeon = !!this.dungeon;
    context.dungeonName = this.dungeon?.name ?? "";
    context.dungeonId = this.dungeon?.id ?? "";

    // Available dungeons (for the picker in idle state)
    if (context.isIdle && isGM) {
      const available = this._getAvailableDungeons();
      context.availableDungeons = available.map(d => ({
        _id: d.id,
        name: d.name,
        img: d.img,
        selected: this.dungeon?.id === d.id
      }));
      context.hasAvailableDungeons = available.length > 0;
    }

    if (!this.dungeon) return context;

    const system = this.dungeon.system;
    const dungeonConfig = CONFIG.TRESPASSER.dungeon;

    // Dungeon info
    context.dungeonImg = this.dungeon.img;

    // Hostility
    const tier = dungeonConfig.hostilityTiers[system.hostilityTier] ?? dungeonConfig.hostilityTiers[1];
    context.hostilityLabel = game.i18n.localize(tier.label);
    context.hostilityDC = tier.dc;

    // Exploration state
    context.currentRound = system.currentRound ?? 0;
    const actionsMax = dungeonConfig.actionsPerRound;
    const actionsRemaining = system.actionsRemaining ?? actionsMax;
    context.actionsRemaining = actionsRemaining;
    context.alarm = system.alarm ?? 0;

    // Action pips (filled = remaining, empty = spent)
    context.actionPips = Array.from({ length: actionsMax }, (_, i) => ({
      filled: i < actionsRemaining
    }));

    // Current room
    context.currentRoomId = system.currentRoomId ?? "";
    if (system.currentRoomId) {
      const room = this.dungeon.items.get(system.currentRoomId);
      context.currentRoomName = room?.name ?? "—";
    } else {
      context.currentRoomName = "—";
    }

    // Rooms list (for GM room navigation, only when active)
    if (isGM && !context.isIdle) {
      const rooms = this.dungeon.items.filter(i => i.type === "room");
      rooms.sort((a, b) => (a.system.sortOrder ?? 0) - (b.system.sortOrder ?? 0));

      const currentRoom = system.currentRoomId ? this.dungeon.items.get(system.currentRoomId) : null;
      const connectedIds = new Set(currentRoom?.system.connections ?? []);

      context.rooms = rooms.map(r => ({
        _id: r.id,
        name: r.name,
        discovered: r.system.discovered,
        isCurrent: r.id === system.currentRoomId,
        isConnected: connectedIds.has(r.id)
      }));

      context.connectedRooms = context.rooms.filter(r => r.isConnected && !r.isCurrent);

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
    context.lightSources = this._aggregateLightSources();

    // Recent log (last 5 entries)
    const log = [...(system.roundLog ?? [])].reverse();
    context.recentLog = log.slice(0, 5);
    context.hasMoreLog = log.length > 5;

    return context;
  }

  /* -------------------------------------------- */
  /* Light Source Aggregation                      */
  /* -------------------------------------------- */

  /**
   * Get the character actors that belong to the active party.
   * Falls back to all character actors if no party exists.
   * @returns {Actor[]}
   */
  _getPartyMembers() {
    const party = game.actors.find(a => a.type === "party");
    if (party) {
      const memberIds = party.system.members ?? [];
      return memberIds.map(id => game.actors.get(id)).filter(a => a?.type === "character");
    }
    return game.actors.filter(a => a.type === "character");
  }

  /**
   * Scan party members for equipped items that are light sources.
   * Supports two detection methods:
   *   1. rmgodoy's item model: item.system.isLightFuel field
   *   2. Original approach: tag-based detection from lightSourceTags config
   * @returns {Object[]}
   */
  _aggregateLightSources() {
    const lightTags = CONFIG.TRESPASSER.dungeon.lightSourceTags ?? [];
    const sources = [];

    for (const actor of this._getPartyMembers()) {
      for (const item of actor.items) {
        let isLightSource = false;
        let depletionDie = "";

        // Method 1: rmgodoy's item type with isLightFuel field
        if (item.system.isLightFuel) {
          isLightSource = true;
          depletionDie = item.system.depletionDie ?? "";
        }

        // Method 2: Tag-based detection (original approach)
        if (!isLightSource && item.type === "equipment") {
          if (!item.system.equipped && item.system.equipped !== undefined) continue;
          const tags = item.system.tags ?? [];
          const tagMatch = tags.some(t => lightTags.includes(t.toLowerCase()));
          const nameMatch = lightTags.some(t => item.name.toLowerCase().includes(t));
          if (tagMatch || nameMatch) {
            isLightSource = true;
            depletionDie = item.system.depletionDie ?? "";
          }
        }

        if (isLightSource) {
          sources.push({
            actorName: actor.name,
            itemName: item.name,
            quantity: item.system.quantity ?? 1,
            depletionDie
          });
        }
      }
    }

    return sources;
  }

  /* -------------------------------------------- */
  /* Light Source Depletion                        */
  /* -------------------------------------------- */

  /**
   * At end of round, prompt the GM to roll depletion for active light sources.
   * @param {Actor} dungeon
   */
  static async _promptLightDepletion(dungeon) {
    const lightTags = CONFIG.TRESPASSER.dungeon.lightSourceTags ?? [];
    const activeSources = [];

    // Use party members if a party actor exists, otherwise all characters
    const party = game.actors.find(a => a.type === "party");
    const characters = party
      ? (party.system.members ?? []).map(id => game.actors.get(id)).filter(a => a?.type === "character")
      : game.actors.filter(a => a.type === "character");

    for (const actor of characters) {
      for (const item of actor.items) {
        let isLightSource = false;
        let depDie = "";

        // Method 1: rmgodoy's isLightFuel field
        if (item.system.isLightFuel) {
          isLightSource = true;
          depDie = item.system.depletionDie ?? "";
        }

        // Method 2: Tag-based detection
        if (!isLightSource && item.type === "equipment") {
          if (!item.system.equipped && item.system.equipped !== undefined) continue;
          const tags = item.system.tags ?? [];
          const tagMatch = tags.some(t => lightTags.includes(t.toLowerCase()));
          const nameMatch = lightTags.some(t => item.name.toLowerCase().includes(t));
          if (tagMatch || nameMatch) {
            isLightSource = true;
            depDie = item.system.depletionDie ?? "";
          }
        }

        if (isLightSource && depDie) {
          activeSources.push({
            actorName: actor.name,
            actorId: actor.id,
            itemName: item.name,
            itemId: item.id,
            depletionDie: depDie,
            quantity: item.system.quantity ?? 1
          });
        }
      }
    }

    if (activeSources.length === 0) return;

    let content = `<div class="trespasser-light-depletion">`;
    content += `<h3><i class="fas fa-fire"></i> ${game.i18n.localize("TRESPASSER.Dungeon.LightDepletion")}</h3>`;
    content += `<p>${game.i18n.localize("TRESPASSER.Dungeon.DepletionPrompt")}</p>`;
    content += `<table class="light-depletion-table">`;
    content += `<tr><th>Source</th><th>Owner</th><th>Die</th><th>Qty</th></tr>`;
    for (const source of activeSources) {
      content += `<tr>`;
      content += `<td>${source.itemName}</td>`;
      content += `<td>${source.actorName}</td>`;
      content += `<td><strong>${source.depletionDie}</strong></td>`;
      content += `<td>${source.quantity}</td>`;
      content += `</tr>`;
    }
    content += `</table>`;
    content += `<p><em>${game.i18n.localize("TRESPASSER.Dungeon.DepletionRollHint")}</em></p>`;
    content += `</div>`;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ alias: dungeon.name }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
  }

  /* -------------------------------------------- */
  /* Session Lifecycle Handlers                   */
  /* -------------------------------------------- */

  /**
   * Select a dungeon from the available list (idle state).
   */
  static #onChooseDungeon(event, target) {
    const dungeonId = target.dataset.dungeonId;
    if (!dungeonId) return;
    const actor = game.actors.get(dungeonId);
    if (!actor || actor.type !== "dungeon") return;
    this.dungeon = actor;
    this.render();
  }

  /**
   * Start a new exploration session with the selected dungeon.
   * Resets round/alarm/actions to fresh state.
   */
  static async #onStartSession(event, target) {
    if (!this.dungeon || !game.user.isGM) return;

    const dungeonConfig = CONFIG.TRESPASSER.dungeon;

    // Reset exploration state on the dungeon actor
    await this.dungeon.update({
      "system.currentRound": 1,
      "system.actionsRemaining": dungeonConfig.actionsPerRound,
      "system.alarm": 0,
      "system.currentRoomId": "",
      "system.roundLog": []
    });

    this.sessionState = "active";

    // Announce in chat
    await ChatMessage.create({
      content: `<div class="trespasser-dungeon-round">
        <strong>${game.i18n.format("TRESPASSER.Dungeon.Session.Started", { name: this.dungeon.name })}</strong>
        <div>${game.i18n.localize("TRESPASSER.Dungeon.Session.Round1")}</div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: this.dungeon.name })
    });

    this.render();
  }

  /**
   * Pause the current exploration session.
   */
  static #onPauseSession(event, target) {
    if (!game.user.isGM) return;
    this.sessionState = "paused";
    this.render();
  }

  /**
   * Resume a paused exploration session.
   */
  static #onResumeSession(event, target) {
    if (!game.user.isGM) return;
    this.sessionState = "active";
    this.render();
  }

  /**
   * End the current exploration session. Confirm before resetting.
   */
  static async #onEndSession(event, target) {
    if (!game.user.isGM) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Dungeon.Session.EndTitle") },
      content: `<p>${game.i18n.localize("TRESPASSER.Dungeon.Session.EndConfirm")}</p>`,
      yes: { label: game.i18n.localize("TRESPASSER.Dungeon.Session.EndYes") },
      no: { label: game.i18n.localize("TRESPASSER.Cancel") }
    });
    if (!confirmed) return;

    // Post summary to chat
    if (this.dungeon) {
      const system = this.dungeon.system;
      await ChatMessage.create({
        content: `<div class="trespasser-dungeon-round">
          <strong>${game.i18n.format("TRESPASSER.Dungeon.Session.Ended", { name: this.dungeon.name })}</strong>
          <div>${game.i18n.format("TRESPASSER.Dungeon.Session.Summary", {
            rounds: system.currentRound ?? 0,
            actions: (system.roundLog ?? []).length
          })}</div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ alias: this.dungeon.name })
      });
    }

    this.dungeon = null;
    this.sessionState = "idle";
    this.render();
  }

  /* -------------------------------------------- */
  /* Exploration Action Handlers                  */
  /* -------------------------------------------- */

  /**
   * Handle clicking a dungeon action button.
   */
  static async #onPerformAction(event, target) {
    if (!this.dungeon || !game.user.isGM || this.sessionState !== "active") return;
    const actionKey = target.dataset.actionKey;
    if (!actionKey) return;

    const remaining = this.dungeon.system.actionsRemaining ?? CONFIG.TRESPASSER.dungeon.actionsPerRound;
    if (remaining <= 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Dungeon.NoActionsRemaining"));
      return;
    }

    await executeDungeonAction(this.dungeon, actionKey);
    this.render();
  }

  /**
   * Advance to the next round.
   */
  static async #onNextRound(event, target) {
    if (!this.dungeon || !game.user.isGM || this.sessionState !== "active") return;

    const system = this.dungeon.system;
    const dungeonConfig = CONFIG.TRESPASSER.dungeon;
    const currentRound = system.currentRound ?? 0;

    // Step 1: Encounter check
    const encounterResult = await resolveEndOfRound(this.dungeon);

    // Step 2: Prompt light depletion
    await DungeonTracker._promptLightDepletion(this.dungeon);

    // Step 3: Advance round state
    const freshSystem = this.dungeon.system;
    const newRound = currentRound + 1;
    const newAlarm = (freshSystem.alarm ?? 0) + 1;

    const roundLog = [...(freshSystem.roundLog ?? [])];
    roundLog.push({
      round: newRound,
      action: game.i18n.localize("TRESPASSER.Dungeon.NewRound"),
      detail: encounterResult.encountered
        ? "Encounter resolved. " + game.i18n.format("TRESPASSER.Dungeon.AlarmValue", { value: newAlarm })
        : game.i18n.format("TRESPASSER.Dungeon.AlarmValue", { value: newAlarm })
    });

    await this.dungeon.update({
      "system.currentRound": newRound,
      "system.actionsRemaining": dungeonConfig.actionsPerRound,
      "system.alarm": newAlarm,
      "system.roundLog": roundLog
    });

    await ChatMessage.create({
      content: `<div class="trespasser-dungeon-round">
        <strong>${game.i18n.format("TRESPASSER.Dungeon.RoundEnd", { round: newRound })}</strong>
        <div>${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: ${newAlarm}</div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: this.dungeon.name })
    });

    this.render();
  }

  /**
   * Set the current room the party is in.
   */
  static async #onSetCurrentRoom(event, target) {
    if (!this.dungeon || !game.user.isGM || this.sessionState !== "active") return;
    const roomId = target.dataset.roomId;
    if (!roomId) return;

    const room = this.dungeon.items.get(roomId);
    if (!room) return;

    if (!room.system.discovered) {
      await room.update({ "system.discovered": true });
    }

    await this.dungeon.update({ "system.currentRoomId": roomId });
    this.render();
  }

  /**
   * Open the dungeon actor's full sheet.
   */
  static #onOpenDungeonSheet(event, target) {
    if (this.dungeon) this.dungeon.sheet.render(true);
  }

  /**
   * Open a room item's sheet.
   */
  static #onOpenRoomSheet(event, target) {
    if (!this.dungeon) return;
    const roomId = target.dataset.roomId;
    const room = this.dungeon.items.get(roomId);
    if (room) room.sheet.render(true);
  }

  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("TRESPASSER.Dungeon.Tracker.Title");
  }

  /** @override */
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
            this.sessionState = "idle";
          }
          this.render({ force: true });
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

/* -------------------------------------------- */
/* Registration                                 */
/* -------------------------------------------- */

/**
 * Register the dungeon tracker scene control button and hooks.
 */
export function registerDungeonTrackerHooks() {
  Hooks.on("renderSceneControls", (controls, html) => {
    // In Foundry V13, html is a native HTMLElement.
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
