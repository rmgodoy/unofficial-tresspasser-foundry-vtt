import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * Resolves a canvas token or token document for an actor, including unlinked tokens.
 * @param {Actor} [actor]
 * @param {Token|TokenDocument|null} [preferred=null]
 * @returns {Token|TokenDocument|null}
 */
export function resolveActorToken(actor, preferred = null) {
  if (preferred) return preferred;
  if (!actor) return null;
  if (actor.isToken) return actor.token?.object || actor.token;
  return actor.getActiveTokens?.(false, false)?.[0]
    || actor.getActiveTokens?.()[0]
    || (canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id))
    || actor.token
    || null;
}

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

    /** @type {object|null} */
    this._activeBatch = null;
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
   * @param {string} [options.rangeType='custom'] - 'custom' | 'melee' | 'missile' | 'spell' | 'throw'
   * @param {number|string|null} [options.range=null] - Max range in squares
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
        rangeType: options.rangeType || "custom",
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
   * Unregister all middleware associated with a source actor or token.
   * @param {string} actorOrTokenId
   * @returns {boolean}
   */
  removeMiddlewareByActor(actorOrTokenId) {
    let removed = false;
    for (const [evt, list] of this._middleware.entries()) {
      const filtered = list.filter(e => e.options.sourceActorId !== actorOrTokenId && e.options.sourceTokenId !== actorOrTokenId);
      if (filtered.length < list.length) {
        this._middleware.set(evt, filtered);
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Start a multi-target batch envelope to resolve cross-actor reactions in a single prompt.
   * @param {string} eventName
   * @param {Array<Actor|Token|{ actor: Actor, token?: Token, amount?: number }>} targets
   * @param {object} [context={}]
   * @returns {Promise<object|null>}
   */
  async startBatch(eventName, targets = [], context = {}) {
    if (!eventName || !Array.isArray(targets) || targets.length <= 1) return null;

    const normalizedTargets = targets.map(t => {
      if (t?.actor && t?.document) return { actor: t.actor, token: t, amount: t.amount ?? context.amount ?? 0 };
      if (t?.actor) return { actor: t.actor, token: resolveActorToken(t.actor, t.token), amount: t.amount ?? context.amount ?? 0 };
      if (t?.type) return { actor: t, token: resolveActorToken(t), amount: context.amount ?? 0 };
      return null;
    }).filter(Boolean);

    if (normalizedTargets.length <= 1) return null;

    const batch = {
      eventName,
      targets: normalizedTargets,
      preApproved: new Map(),
      context
    };

    const middlewareList = this._middleware.get(eventName) || [];
    const { promptBatchInterception } = await import("../reactions/middleware-interception.mjs");

    for (const entry of middlewareList) {
      const { options } = entry;
      if (!options.scope || options.scope === "self" || (!options.sourceActorId && !options.sourceActor)) continue;

      const sourceActor = options.sourceActor || (options.sourceTokenId ? canvas?.tokens?.get(options.sourceTokenId)?.actor : null) || game.actors?.get(options.sourceActorId);
      if (!sourceActor) continue;

      const sourceToken = resolveActorToken(sourceActor, options.sourceToken);

      // Filter eligible targets in scope and in range
      const eligible = [];
      for (const targetItem of normalizedTargets) {
        if (!this.isActorInScope(options.scope, sourceActor, targetItem.actor, sourceToken, targetItem.token)) {
          continue;
        }

        const rangeType = options.rangeType || (typeof options.range === "string" ? options.range : "custom");
        const customSquares = typeof options.range === "number" ? options.range : (Number(options.rangeRequirement) || 0);
        const hasRangeReq = (rangeType !== "custom" && rangeType !== "none") || customSquares > 0;

        if (hasRangeReq) {
          const maxRange = RangeHelper.getActorRange(sourceActor, rangeType, customSquares, sourceToken);
          if (maxRange !== null && maxRange > 0 && sourceToken && targetItem.token && canvas?.grid) {
            const dist = RangeHelper.measureDistanceSquares(sourceToken, targetItem.token);
            if (dist > maxRange) continue;
          }
        }

        eligible.push(targetItem);
      }

      if (eligible.length > 1 && typeof promptBatchInterception === "function") {
        const effectItem = sourceActor.items?.get(options.effectItemId);
        if (effectItem) {
          const approvedSet = await promptBatchInterception(sourceActor, effectItem, eligible, sourceToken);
          batch.preApproved.set(effectItem.id, approvedSet);
          batch.preApproved.set(entry.id, approvedSet);
        }
      }
    }

    this._activeBatch = batch;
    return batch;
  }

  /**
   * End the current batch envelope and clean up active batch context.
   */
  endBatch() {
    this._activeBatch = null;
  }

  /**
   * Retrieve the active multi-target batch envelope if one is open.
   * @returns {object|null}
   */
  getActiveBatch() {
    return this._activeBatch;
  }

  /**
   * Clear all middleware, observers, and history.
   */
  clear() {
    this._middleware.clear();
    this._observers.clear();
    this._history = [];
    this._activeBatch = null;
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
      if (options.scope && (options.sourceActorId || options.sourceActor)) {
        const sourceActor = options.sourceActor || (options.sourceTokenId ? canvas?.tokens?.get(options.sourceTokenId)?.actor : null) || game.actors?.get(options.sourceActorId);
        const sourceToken = resolveActorToken(sourceActor, options.sourceToken);
        const targetToken = resolveActorToken(event.actor, event.token);

        if (!this.isActorInScope(options.scope, sourceActor, event.actor, sourceToken, targetToken)) {
          continue;
        }

        // Range validation
        const rangeType = options.rangeType || (typeof options.range === "string" ? options.range : "custom");
        const customSquares = typeof options.range === "number" ? options.range : (Number(options.rangeRequirement) || 0);
        const hasRangeReq = (rangeType !== "custom" && rangeType !== "none") || customSquares > 0;

        if (hasRangeReq) {
          const maxRange = RangeHelper.getActorRange(sourceActor, rangeType, customSquares, sourceToken);

          if (maxRange !== null && maxRange > 0 && sourceToken && targetToken && canvas?.grid) {
            const dist = RangeHelper.measureDistanceSquares(sourceToken, targetToken);
            if (dist > maxRange) {
              this.logDebug(`Middleware ${entry.id} out of range (dist: ${dist}, max: ${maxRange}, type: ${rangeType})`);
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

    const isSameActor = (sourceActor.id === targetActor.id)
      && (!sourceActor.isToken || !targetActor.isToken || sourceActor.token?.id === targetActor.token?.id);
    if (isSameActor) return false;

    const sTok = resolveActorToken(sourceActor, sourceToken);
    const tTok = resolveActorToken(targetActor, targetToken);

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
