import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * Global event bus for Trespasser actor lifecycle, combat actions, and cross-actor reactive effects.
 * Supports dual-phase dispatch:
 * 1. Middleware phase (sequential, async, can modify payload or set preventDefault)
 * 2. Observer phase (sequential, async, read-only frozen payload)
 */
export class ActorEventBus {
  constructor() {
    /** @type {Map<string, Array<{ id: string, handler: Function, options: object }>>} */
    this._middleware = new Map();

    /** @type {Map<string, Array<{ id: string, handler: Function, options: object }>>} */
    this._observers = new Map();

    /** @type {Array<object>} */
    this._history = [];

    /** @type {number} */
    this._maxHistory = 100;

    /** @type {boolean} */
    this.debug = false;
  }

  /**
   * Log debug messages when debug mode is enabled.
   * @param {string} message
   * @param {...any} args
   */
  logDebug(message, ...args) {
    if (this.debug) {
      console.log(`%c[ActorEventBus]%c ${message}`, "color: #e5c07b; font-weight: bold;", "color: inherit;", ...args);
    }
  }

  /**
   * Register a middleware handler for an event.
   * Middleware can inspect and mutate event properties (e.g. amount, preventDefault, deferredActions).
   * @param {string} eventName
   * @param {Function} handler - async (event) => void
   * @param {object} [options]
   * @param {string} [options.id] - Unique identifier for this handler
   * @param {string} [options.scope='self'] - 'self' | 'ally' | 'enemy' | 'all'
   * @param {string} [options.sourceActorId] - ID of the actor registering this middleware
   * @param {string} [options.effectItemId] - ID of the effect item granting this middleware
   * @param {number|string|null} [options.range=null] - Max range in squares or keyword ('spell', 'melee')
   * @param {number} [options.priority=100] - Lower runs earlier
   * @returns {string} The registered handler ID
   */
  middleware(eventName, handler, options = {}) {
    if (!eventName || typeof handler !== "function") return null;
    const id = options.id || foundry.utils.randomID();
    const entry = {
      id,
      handler,
      options: {
        scope: options.scope || "self",
        sourceActorId: options.sourceActorId || null,
        effectItemId: options.effectItemId || null,
        range: options.range ?? null,
        priority: options.priority ?? 100,
        ...options
      }
    };

    if (!this._middleware.has(eventName)) {
      this._middleware.set(eventName, []);
    }
    const list = this._middleware.get(eventName);
    list.push(entry);
    list.sort((a, b) => (a.options.priority ?? 100) - (b.options.priority ?? 100));

    this.logDebug(`Registered middleware for "${eventName}" (id: ${id}, scope: ${entry.options.scope})`);
    return id;
  }

  /**
   * Register an observer handler for an event.
   * Observers receive a frozen copy of the event after the action has executed.
   * @param {string} eventName
   * @param {Function} handler - async (frozenEvent) => void
   * @param {object} [options]
   * @param {string} [options.id]
   * @param {number} [options.priority=100]
   * @returns {string} The registered handler ID
   */
  on(eventName, handler, options = {}) {
    if (!eventName || typeof handler !== "function") return null;
    const id = options.id || foundry.utils.randomID();
    const entry = {
      id,
      handler,
      options: {
        priority: options.priority ?? 100,
        ...options
      }
    };

    if (!this._observers.has(eventName)) {
      this._observers.set(eventName, []);
    }
    const list = this._observers.get(eventName);
    list.push(entry);
    list.sort((a, b) => (a.options.priority ?? 100) - (b.options.priority ?? 100));

    this.logDebug(`Registered observer for "${eventName}" (id: ${id})`);
    return id;
  }

  /**
   * Unregister an observer handler.
   * @param {string} eventName
   * @param {string} handlerId
   * @returns {boolean} True if a handler was removed
   */
  off(eventName, handlerId) {
    if (!this._observers.has(eventName)) return false;
    const list = this._observers.get(eventName);
    const initialLen = list.length;
    const filtered = list.filter(e => e.id !== handlerId);
    this._observers.set(eventName, filtered);
    return filtered.length < initialLen;
  }

  /**
   * Unregister a middleware by ID across all events or for a specific event.
   * @param {string} handlerId
   * @param {string} [eventName]
   * @returns {boolean}
   */
  removeMiddleware(handlerId, eventName = null) {
    let removed = false;
    if (eventName) {
      if (this._middleware.has(eventName)) {
        const list = this._middleware.get(eventName);
        const filtered = list.filter(e => e.id !== handlerId && e.options.effectItemId !== handlerId);
        if (filtered.length < list.length) {
          this._middleware.set(eventName, filtered);
          removed = true;
        }
      }
    } else {
      for (const [evt, list] of this._middleware.entries()) {
        const filtered = list.filter(e => e.id !== handlerId && e.options.effectItemId !== handlerId);
        if (filtered.length < list.length) {
          this._middleware.set(evt, filtered);
          removed = true;
        }
      }
    }
    if (removed) {
      this.logDebug(`Removed middleware (id/effect: ${handlerId})`);
    }
    return removed;
  }

  /**
   * Unregister all middleware associated with an effect item.
   * @param {string} effectItemId
   * @returns {boolean}
   */
  removeMiddlewareByEffect(effectItemId) {
    return this.removeMiddleware(effectItemId);
  }

  /**
   * Unregister all middleware associated with a source actor.
   * @param {string} actorId
   * @returns {boolean}
   */
  removeMiddlewareByActor(actorId) {
    let removed = false;
    for (const [evt, list] of this._middleware.entries()) {
      const filtered = list.filter(e => e.options.sourceActorId !== actorId);
      if (filtered.length < list.length) {
        this._middleware.set(evt, filtered);
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Clear all middleware, observers, and history.
   */
  clear() {
    this._middleware.clear();
    this._observers.clear();
    this._history = [];
    this.logDebug("Cleared all middleware, observers, and history.");
  }

  /**
   * Recent event history for post-mortem inspection.
   * @type {Array<object>}
   */
  get history() {
    return [...this._history];
  }

  /**
   * Execute the middleware phase for an event.
   * @param {string} eventName
   * @param {object} event
   */
  async runMiddleware(eventName, event) {
    if (!eventName || !event) return;
    this.logDebug(`runMiddleware: ${eventName}`, event);

    const list = this._middleware.get(eventName) || [];
    for (const entry of list) {
      const { handler, options } = entry;

      // Scope validation
      if (options.scope && options.sourceActorId) {
        const sourceActor = game.actors?.get(options.sourceActorId);
        const sourceToken = options.sourceToken || sourceActor?.getActiveTokens?.(true, true)?.[0] || sourceActor?.token;
        const targetToken = event.token || event.actor?.getActiveTokens?.(true, true)?.[0] || event.actor?.token;

        if (!this.isActorInScope(options.scope, sourceActor, event.actor, sourceToken, targetToken)) {
          continue;
        }

        // Range validation
        if (options.range !== null && options.range !== undefined && options.range !== "none") {
          const maxRange = typeof options.range === "number"
            ? options.range
            : (options.range === "spell" ? 4 : (options.range === "melee" ? 1 : null));

          if (maxRange !== null && sourceToken && targetToken && canvas?.grid) {
            const dist = RangeHelper.measureDistanceSquares(sourceToken, targetToken);
            if (dist > maxRange) {
              this.logDebug(`Middleware ${entry.id} out of range (dist: ${dist}, max: ${maxRange})`);
              continue;
            }
          }
        }
      }

      try {
        await handler(event);
      } catch (err) {
        console.error(`ActorEventBus | Error in middleware (${entry.id}) for "${eventName}":`, err);
      }

      if (event.preventDefault) {
        this.logDebug(`Event "${eventName}" aborted by middleware ${entry.id}`);
        break;
      }
    }

    this._recordHistory(eventName, event);
  }

  /**
   * Execute the observer phase for an event.
   * @param {string} eventName
   * @param {object} event
   */
  async runObservers(eventName, event) {
    if (!eventName || !event) return;
    this.logDebug(`runObservers: ${eventName}`, event);

    const list = this._observers.get(eventName) || [];
    const frozenEvent = Object.freeze({ ...event });

    for (const entry of list) {
      try {
        await entry.handler(frozenEvent);
      } catch (err) {
        console.error(`ActorEventBus | Error in observer (${entry.id}) for "${eventName}":`, err);
      }
    }
  }

  /**
   * Determine whether targetActor is in scope relative to sourceActor.
   * @param {string} scope - 'self' | 'ally' | 'enemy' | 'all'
   * @param {Actor} sourceActor
   * @param {Actor} targetActor
   * @param {Token|TokenDocument} [sourceToken]
   * @param {Token|TokenDocument} [targetToken]
   * @returns {boolean}
   */
  isActorInScope(scope, sourceActor, targetActor, sourceToken = null, targetToken = null) {
    if (!scope || scope === "all") return true;
    if (!sourceActor || !targetActor) return true;

    if (scope === "self") {
      return sourceActor.id === targetActor.id;
    }

    const isSameActor = sourceActor.id === targetActor.id;
    if (isSameActor) return false;

    const sTok = sourceToken || sourceActor.getActiveTokens?.(true, true)?.[0] || sourceActor.token;
    const tTok = targetToken || targetActor.getActiveTokens?.(true, true)?.[0] || targetActor.token;

    let isAlly = false;
    if (sTok && tTok) {
      const sDisp = sTok.document?.disposition ?? sTok.disposition;
      const tDisp = tTok.document?.disposition ?? tTok.disposition;
      if (sDisp !== undefined && tDisp !== undefined && sDisp !== CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
        isAlly = sDisp === tDisp;
      } else {
        isAlly = this._isActorTypeAlly(sourceActor, targetActor);
      }
    } else {
      isAlly = this._isActorTypeAlly(sourceActor, targetActor);
    }

    if (scope === "ally") return isAlly;
    if (scope === "enemy") return !isAlly;

    return true;
  }

  /**
   * Fallback check for actor alliance based on actor type.
   * @param {Actor} sourceActor
   * @param {Actor} targetActor
   * @returns {boolean}
   * @private
   */
  _isActorTypeAlly(sourceActor, targetActor) {
    const pcTypes = ["character", "companion", "commoner", "party"];
    const isSourcePC = pcTypes.includes(sourceActor.type);
    const isTargetPC = pcTypes.includes(targetActor.type);
    return isSourcePC === isTargetPC;
  }

  /**
   * Record event in the circular history buffer.
   * @param {string} eventName
   * @param {object} event
   * @private
   */
  _recordHistory(eventName, event) {
    const entry = {
      timestamp: Date.now(),
      eventName,
      actorId: event.actor?.id,
      actorName: event.actor?.name,
      type: event.type,
      amount: event.amount,
      preventDefault: Boolean(event.preventDefault),
      modifiersCount: event.modifiers?.length ?? 0,
      deferredActionsCount: event.deferredActions?.length ?? 0
    };
    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
  }
}

export const actorEventBus = new ActorEventBus();
