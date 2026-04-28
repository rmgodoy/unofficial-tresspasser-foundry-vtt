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
import { resolveEndOfRound, runEncounterCheck } from "./encounter-resolution.mjs";

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
      switchDungeon: DungeonTracker.#onSwitchDungeon,
      startSession: DungeonTracker.#onStartSession,
      resumeSession: DungeonTracker.#onResumeSession,
      endSession: DungeonTracker.#onEndSession,
      // Exploration
      performAction: DungeonTracker.#onPerformAction,
      nextRound: DungeonTracker.#onNextRound,
      setCurrentRoom: DungeonTracker.#onSetCurrentRoom,
      openDungeonSheet: DungeonTracker.#onOpenDungeonSheet,
      openRoomSheet: DungeonTracker.#onOpenRoomSheet,
      // GM manual overrides
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

  /** @type {Actor|null} The dungeon currently in focus (UI pointer only). */
  dungeon = null;

  constructor(...args) {
    super(...args);
    this._adoptCurrentSession();
  }

  /**
   * Session state is the source-of-truth on the dungeon actor itself, so
   * each dungeon remembers its own status across reloads and the tracker
   * can switch between paused delves without losing logs.
   * @type {SessionState}
   */
  get sessionState() {
    return this.dungeon?.system?.sessionState ?? "idle";
  }

  /**
   * On construction, find the most relevant dungeon to focus on:
   *   - any dungeon with state="active" (only one is allowed at a time)
   *   - else the most-recently-modified dungeon with state="paused"
   *   - else null (show the picker)
   */
  _adoptCurrentSession() {
    const dungeons = game.actors?.filter(a => a.type === "dungeon") ?? [];
    const active = dungeons.find(d => d.system.sessionState === "active");
    if (active) {
      this.dungeon = active;
      return;
    }
    const paused = dungeons
      .filter(d => d.system.sessionState === "paused")
      .sort((a, b) => (b._stats?.modifiedTime ?? 0) - (a._stats?.modifiedTime ?? 0));
    this.dungeon = paused[0] ?? null;
  }

  /**
   * Pause any other dungeons currently flagged active so only one delve is
   * "live" at a time. Called before activating or resuming a session.
   */
  async _pauseOtherActiveSessions() {
    if (!game.user.isGM) return;
    const others = game.actors.filter(a =>
      a.type === "dungeon" &&
      a.id !== this.dungeon?.id &&
      a.system.sessionState === "active"
    );
    for (const other of others) {
      await other.update({ "system.sessionState": "paused" });
    }
  }

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
      context.availableDungeons = available.map(d => {
        const state = d.system.sessionState ?? "idle";
        return {
          _id: d.id,
          name: d.name,
          img: d.img,
          selected: this.dungeon?.id === d.id,
          state,
          stateLabel: state === "idle" ? "" : game.i18n.localize(`TRESPASSER.Dungeon.Session.State.${state}`),
          round: d.system.currentRound ?? 0
        };
      });
      context.hasAvailableDungeons = available.length > 0;
      // What button to show when a dungeon is selected: Begin (fresh delve,
      // wipes log) for idle dungeons, Resume for paused ones.
      const selectedState = this.dungeon?.system?.sessionState ?? "idle";
      context.selectedIsResumable = selectedState === "paused";
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
    context.actionsAtMax = actionsRemaining >= actionsMax;
    context.actionsAtMin = actionsRemaining <= 0;
    context.alarm = system.alarm ?? 0;
    context.alarmAtMin = (system.alarm ?? 0) <= 0;

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
   * Select a dungeon from the available list (idle state). The pick is just
   * a UI focus change — the actor's own sessionState determines whether the
   * tracker stays on the picker or jumps into an active/paused session view.
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
   * Clear the tracker's focus to return to the picker without ending the
   * focused dungeon's session. The actor's state is untouched, so the
   * session stays paused/active and can be resumed later.
   */
  static #onSwitchDungeon(event, target) {
    if (!game.user.isGM) return;
    this.dungeon = null;
    this.render();
  }

  /**
   * Start a new exploration session with the selected dungeon.
   * Resets round/alarm/actions to fresh state.
   */
  static async #onStartSession(event, target) {
    if (!this.dungeon || !game.user.isGM) return;

    const dungeonConfig = CONFIG.TRESPASSER.dungeon;

    // Pause any other dungeon currently flagged active before starting fresh.
    await this._pauseOtherActiveSessions();

    // Reset exploration state on the dungeon actor and flag it active.
    await this.dungeon.update({
      "system.currentRound": 1,
      "system.actionsRemaining": dungeonConfig.actionsPerRound,
      "system.alarm": 0,
      "system.currentRoomId": "",
      "system.roundLog": [],
      "system.sessionState": "active"
    });

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
   * Resume a paused session — pauses any other active dungeon first to
   * preserve the one-active-at-a-time invariant.
   */
  static async #onResumeSession(event, target) {
    if (!game.user.isGM || !this.dungeon) return;
    await this._pauseOtherActiveSessions();
    await this.dungeon.update({ "system.sessionState": "active" });
    this.render();
  }

  /**
   * End the focused exploration session. Non-destructive: the dungeon's
   * state is set to "paused" so the log/round/alarm survive and the GM
   * can resume it later from the picker. Drops focus so the picker reopens.
   *
   * To reset a dungeon to a never-visited state (wiping log + counters),
   * use the Reset button on the dungeon sheet itself.
   */
  static async #onEndSession(event, target) {
    if (!game.user.isGM || !this.dungeon) return;
    await this.dungeon.update({ "system.sessionState": "paused" });
    this.dungeon = null;
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
   *
   * End-of-round sequence (Rules, p.54):
   *   1. Party makes depletion checks for active light sources.
   *   2. Alarm value increases by +1.
   *   3. Judge rolls a d10; if equal or less than alarm, resolve a random
   *      encounter and reset alarm to 0.
   *
   * The alarm must be bumped BEFORE the d10 check so the roll is made
   * against the current (post-increment) value.
   */
  static async #onNextRound(event, target) {
    if (!this.dungeon || !game.user.isGM || this.sessionState !== "active") return;

    const dungeonConfig = CONFIG.TRESPASSER.dungeon;
    const currentRound = this.dungeon.system.currentRound ?? 0;
    const newRound = currentRound + 1;

    // Step 1: Light depletion
    await DungeonTracker._promptLightDepletion(this.dungeon);

    // Step 2: Alarm +1 (written first so step 3 sees the new value)
    const bumpedAlarm = (this.dungeon.system.alarm ?? 0) + 1;
    await this.dungeon.update({ "system.alarm": bumpedAlarm });

    // Step 3: Alarm check — resolveEndOfRound resets alarm to 0 on encounter
    const encounterResult = await resolveEndOfRound(this.dungeon);

    // Advance round state
    const resultAlarm = this.dungeon.system.alarm ?? 0;
    const roundLog = [...(this.dungeon.system.roundLog ?? [])];
    roundLog.push({
      round: newRound,
      action: game.i18n.localize("TRESPASSER.Dungeon.NewRound"),
      detail: encounterResult.encountered
        ? "Encounter resolved. " + game.i18n.format("TRESPASSER.Dungeon.AlarmValue", { value: resultAlarm })
        : game.i18n.format("TRESPASSER.Dungeon.AlarmValue", { value: resultAlarm })
    });

    await this.dungeon.update({
      "system.currentRound": newRound,
      "system.actionsRemaining": dungeonConfig.actionsPerRound,
      "system.roundLog": roundLog
    });

    await ChatMessage.create({
      content: `<div class="trespasser-dungeon-round">
        <strong>${game.i18n.format("TRESPASSER.Dungeon.RoundEnd", { round: newRound })}</strong>
        <div>${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: ${resultAlarm}</div>
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

  /* -------------------------------------------- */
  /* GM Manual Overrides                          */
  /* -------------------------------------------- */

  /**
   * Adjust the dungeon's alarm value by a signed delta.
   * Clamped at 0; no upper bound (alarm naturally caps via d10 checks).
   */
  static async #onAdjustAlarm(event, target) {
    if (!this.dungeon || !game.user.isGM) return;
    const delta = parseInt(target.dataset.delta, 10) || 0;
    const current = this.dungeon.system.alarm ?? 0;
    const newAlarm = Math.max(0, current + delta);
    if (newAlarm === current) return;

    const roundLog = [...(this.dungeon.system.roundLog ?? [])];
    roundLog.push({
      round: this.dungeon.system.currentRound ?? 0,
      action: game.i18n.localize("TRESPASSER.Dungeon.Nudge.GMAdjust"),
      detail: game.i18n.format("TRESPASSER.Dungeon.Nudge.AlarmLog", { value: newAlarm })
    });

    await this.dungeon.update({
      "system.alarm": newAlarm,
      "system.roundLog": roundLog
    });
  }

  /**
   * Adjust actions remaining by a signed delta. Clamped to [0, actionsPerRound].
   */
  static async #onAdjustActions(event, target) {
    if (!this.dungeon || !game.user.isGM) return;
    const delta = parseInt(target.dataset.delta, 10) || 0;
    const max = CONFIG.TRESPASSER.dungeon.actionsPerRound;
    const current = this.dungeon.system.actionsRemaining ?? max;
    const newActions = Math.max(0, Math.min(max, current + delta));
    if (newActions === current) return;

    const roundLog = [...(this.dungeon.system.roundLog ?? [])];
    roundLog.push({
      round: this.dungeon.system.currentRound ?? 0,
      action: game.i18n.localize("TRESPASSER.Dungeon.Nudge.GMAdjust"),
      detail: game.i18n.format("TRESPASSER.Dungeon.Nudge.ActionsLog", { value: newActions })
    });

    await this.dungeon.update({
      "system.actionsRemaining": newActions,
      "system.roundLog": roundLog
    });
  }

  /**
   * Run an immediate d10 alarm check without incrementing alarm first.
   * Used for simultaneous actions (p.55), loud noises, or ad-hoc GM calls.
   */
  static async #onAlarmCheck(event, target) {
    if (!this.dungeon || !game.user.isGM || this.sessionState !== "active") return;
    await runEncounterCheck(this.dungeon);
    this.render();
  }

  /**
   * Refund one action and pop the last log entry from the current round.
   * Useful when an action was resolved incorrectly or a spark (Quick) makes
   * it free after the fact.
   */
  static async #onRefundLastAction(event, target) {
    if (!this.dungeon || !game.user.isGM) return;
    const max = CONFIG.TRESPASSER.dungeon.actionsPerRound;
    const currentActions = this.dungeon.system.actionsRemaining ?? max;
    if (currentActions >= max) return;

    const currentRound = this.dungeon.system.currentRound ?? 0;
    const roundLog = [...(this.dungeon.system.roundLog ?? [])];
    let popped = null;
    const lastIndex = roundLog.length - 1;
    if (lastIndex >= 0 && roundLog[lastIndex].round === currentRound) {
      popped = roundLog.pop();
    }

    roundLog.push({
      round: currentRound,
      action: game.i18n.localize("TRESPASSER.Dungeon.Nudge.GMAdjust"),
      detail: popped
        ? game.i18n.format("TRESPASSER.Dungeon.Nudge.ActionRefunded", { action: popped.action })
        : game.i18n.localize("TRESPASSER.Dungeon.Nudge.ActionRefundedNone")
    });

    await this.dungeon.update({
      "system.actionsRemaining": currentActions + 1,
      "system.roundLog": roundLog
    });
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
