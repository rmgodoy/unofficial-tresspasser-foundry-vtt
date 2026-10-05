/**
 * TCA Registration and Lifecycle Management.
 * Registers TCA event handlers with ActorEventBus and maintains cross-actor middleware state.
 */

import { actorEventBus } from "../actor/actor-event-bus.mjs";
import { resolveSourceActor, getUnlinkedSceneTokens } from "../helpers/token-resolver.mjs";
import { tcaEngine } from "./tca-engine.mjs";
import { resetCooldowns, clearAllCooldowns } from "./cooldown-tracker.mjs";

const TCA_EVENTS = [
  "start-of-combat", "start-of-round", "start-of-turn", "end-of-turn", "end-of-round", "end-of-combat",
  "on-first-move", "on-move", "use", "targeted", "damage-dealt", "damage-received",
  "heal-given", "heal-received", "on-prevail", "on-use-deed", "on-targeted-deed",
  "on-deed-hit-received", "on-deed-miss-received", "on-deed-hit", "on-deed-miss"
];

let _isInitialized = false;

/**
 * Register global TCA event listeners on the ActorEventBus.
 */
function registerGlobalEventListeners() {
  for (const eventName of TCA_EVENTS) {
    const handlerId = `tca:core:${eventName}`;
    actorEventBus.removeMiddleware(handlerId, eventName);

    actorEventBus.middleware(eventName, async (event) => {
      if (event.actor) {
        await tcaEngine.processTCAEvent(eventName, event, event.actor);
      }
    }, {
      id: handlerId,
      priority: 60
    });
  }

  // Register cooldown boundary observers
  actorEventBus.on("start-of-round", async () => {
    resetCooldowns("round");
  }, { id: "tca:cooldown:round", priority: 1 });

  actorEventBus.on("start-of-turn", async () => {
    resetCooldowns("turn");
  }, { id: "tca:cooldown:turn", priority: 1 });

  actorEventBus.on("start-of-combat", async () => {
    resetCooldowns("combat");
  }, { id: "tca:cooldown:combat-start", priority: 1 });

  actorEventBus.on("end-of-combat", async () => {
    clearAllCooldowns();
  }, { id: "tca:cooldown:combat-end", priority: 1 });
}

/** Tracks which (trigger, source) pairs already ran for a given event instance. */
const _processedCross = new WeakMap();

/**
 * Marks a cross-actor source as processed for an event.
 * @param {object} event
 * @param {string} key
 * @returns {boolean} True if it had already been processed (caller should skip).
 */
function markCrossProcessed(event, key) {
  let seen = _processedCross.get(event);
  if (!seen) {
    seen = new Set();
    _processedCross.set(event, seen);
  }
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

/**
 * Register all cross-actor TCA behaviors from an actor's effects as scoped middleware on the event bus.
 * World actors that are represented by unlinked tokens on the active scene are skipped,
 * because each unlinked token's synthetic actor (which inherits the base items) is registered instead.
 * @param {Actor} actor
 */
export function registerActorTCA(actor) {
  if (!actor || !actor.items) return;

  if (!actor.isToken && getUnlinkedSceneTokens(actor).length > 0) {
    console.log(`%c[TCA Registration]%c Skipping world actor "${actor.name}" (${actor.id}) - represented by unlinked scene token(s)`, "color: #c678dd;", "color: inherit;");
    return;
  }

  const tcaEffects = tcaEngine.getTCAEffects(actor);
  console.log(`%c[TCA Registration]%c Registering TCA for actor "${actor.name}" (${actor.id}) - found ${tcaEffects.length} TCA effects`, "color: #c678dd;", "color: inherit;", tcaEffects.map(e => ({ name: e.name, intensity: e.system?.intensity, behaviors: e.system?.behaviors })));

  const sourceTokenId = actor.isToken ? (actor.token?.id || null) : null;
  const actorKey = sourceTokenId || actor.id;

  for (const effect of tcaEffects) {
    const behaviors = effect.system?.behaviors || [];
    for (const block of behaviors) {
      const scope = block.scope || effect.system?.scope || "self";
      if (scope === "self") continue;

      const trigger = block.trigger;
      if (!trigger || trigger === "continuous" || trigger === "immediate") continue;

      const middlewareId = `tca:cross:${actorKey}:${effect.id}:${block.id}`;
      const rangeType = block.rangeType || effect.system?.rangeType || "custom";
      const range = block.range ?? effect.system?.rangeRequirement ?? 0;

      actorEventBus.middleware(trigger, async (event) => {
        // processTCAEvent evaluates every block of the actor, so run it once per event/source
        if (markCrossProcessed(event, `${trigger}:${actorKey}`)) return;
        const liveActor = resolveSourceActor({ sourceActorId: actor.id, sourceTokenId });
        if (!liveActor) return;
        await tcaEngine.processTCAEvent(trigger, event, liveActor);
      }, {
        id: middlewareId,
        scope,
        sourceActorId: actor.id,
        sourceTokenId,
        effectItemId: effect.id,
        rangeType,
        range,
        priority: block.priority ?? 50
      });
      console.log(`%c[TCA Registration]%c Registered cross-actor middleware "${middlewareId}" (${scope}) for "${effect.name}" on event "${trigger}"`, "color: #c678dd;", "color: inherit;");
    }
  }
}

/**
 * Unregister all TCA middleware for an actor (or for the token of a synthetic actor).
 * @param {Actor} actor
 */
export function unregisterActorTCA(actor) {
  if (!actor) return;
  if (actor.isToken && actor.token?.id) {
    actorEventBus.removeMiddlewareByToken(actor.token.id);
  } else {
    actorEventBus.removeMiddlewareByActor(actor.id);
  }
}

/**
 * Sync TCA registrations for an actor. For world actors, also resyncs their unlinked scene tokens
 * since those inherit the actor's items.
 * @param {Actor} actor
 */
export function syncActorTCA(actor) {
  if (!actor) return;
  console.log(`%c[TCA Registration]%c Syncing TCA for actor "${actor.name}" (${actor.id})`, "color: #c678dd; font-weight: bold;", "color: inherit;");
  unregisterActorTCA(actor);
  registerActorTCA(actor);

  for (const tokenDoc of getUnlinkedSceneTokens(actor)) {
    if (!tokenDoc.actor) continue;
    unregisterActorTCA(tokenDoc.actor);
    registerActorTCA(tokenDoc.actor);
  }
}

/**
 * Rebuild every TCA registration from scratch (world actors + unlinked tokens of the active scene).
 * Idempotent: safe to call repeatedly (scene change, canvas reload, token changes).
 */
export function refreshAllTCA() {
  actorEventBus.removeAllTokenMiddleware();

  for (const actor of game.actors ?? []) {
    unregisterActorTCA(actor);
    registerActorTCA(actor);
  }

  for (const tokenDoc of canvas?.scene?.tokens ?? []) {
    if (!tokenDoc.actorLink && tokenDoc.actor) {
      registerActorTCA(tokenDoc.actor);
    }
  }
}

/**
 * Resync the world actor and its unlinked tokens after a token is created/deleted on the active scene.
 * @param {TokenDocument} tokenDoc
 */
function syncTokenFamily(tokenDoc) {
  if (tokenDoc.parent !== canvas?.scene) return;
  const baseActor = game.actors?.get(tokenDoc.actorId);
  if (baseActor) syncActorTCA(baseActor);
}

/**
 * Initialize TCA registration for all world actors and listen to document hooks.
 */
export function initTCARegistration() {
  if (_isInitialized) return;
  _isInitialized = true;

  registerGlobalEventListeners();
  refreshAllTCA();

  Hooks.on("canvasReady", () => refreshAllTCA());

  Hooks.on("createToken", (tokenDoc) => syncTokenFamily(tokenDoc));

  Hooks.on("deleteToken", (tokenDoc) => {
    actorEventBus.removeMiddlewareByToken(tokenDoc.id);
    syncTokenFamily(tokenDoc);
  });

  Hooks.on("updateToken", (tokenDoc, changed) => {
    if ("actorLink" in changed) syncTokenFamily(tokenDoc);
  });

  // Hook into item creation, updates, and deletions
  Hooks.on("createItem", (item) => {
    if (item.type === "effect" && item.parent && item.parent instanceof Actor) {
      syncActorTCA(item.parent);
    }
  });

  Hooks.on("updateItem", (item) => {
    if (item.type === "effect" && item.parent && item.parent instanceof Actor) {
      syncActorTCA(item.parent);
    }
  });

  Hooks.on("deleteItem", (item) => {
    if (item.type === "effect" && item.parent && item.parent instanceof Actor) {
      syncActorTCA(item.parent);
    }
  });

  console.log("%c[TCA Engine]%c Core Engine & Registration Initialized", "color: #e5c07b; font-weight: bold;", "color: inherit;");
}
