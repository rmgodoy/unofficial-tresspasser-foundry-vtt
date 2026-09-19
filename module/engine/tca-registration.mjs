/**
 * TCA Registration and Lifecycle Management.
 * Registers TCA event handlers with ActorEventBus and maintains cross-actor middleware state.
 */

import { actorEventBus } from "../actor/actor-event-bus.mjs";
import { tcaEngine } from "./tca-engine.mjs";
import { resetCooldowns, clearAllCooldowns } from "./cooldown-tracker.mjs";

const TCA_EVENTS = [
  "start-of-combat", "start-of-round", "start-of-turn", "end-of-turn", "end-of-round", "end-of-combat",
  "on-first-move", "on-move", "use", "targeted", "damage-dealt", "damage-received",
  "heal-given", "heal-received", "on-prevail", "on-use-deed", "on-targeted-deed",
  "on-deed-hit-received", "on-deed-miss-received", "on-deed-hit", "on-deed-miss",
  "immediate", "continuous"
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
  }, { id: "tca:cooldown:round", priority: 10 });

  actorEventBus.on("start-of-turn", async () => {
    resetCooldowns("turn");
  }, { id: "tca:cooldown:turn", priority: 10 });

  actorEventBus.on("end-of-combat", async () => {
    clearAllCooldowns();
  }, { id: "tca:cooldown:combat", priority: 10 });
}

/**
 * Register all cross-actor TCA behaviors from an actor's effects as scoped middleware on the event bus.
 * @param {Actor} actor
 */
export function registerActorTCA(actor) {
  if (!actor || !actor.items) return;

  const tcaEffects = tcaEngine.getTCAEffects(actor);
  for (const effect of tcaEffects) {
    const behaviors = effect.system?.behaviors || [];
    for (const block of behaviors) {
      const scope = block.scope || effect.system?.scope || "self";
      if (scope === "self") continue;

      const trigger = block.trigger;
      if (!trigger || trigger === "continuous" || trigger === "immediate") continue;

      const middlewareId = `tca:cross:${actor.id}:${effect.id}:${block.id}`;
      const rangeType = block.rangeType || effect.system?.rangeType || "custom";
      const range = block.range ?? effect.system?.rangeRequirement ?? 0;

      actorEventBus.middleware(trigger, async (event) => {
        // Cross-actor TCA execution
        await tcaEngine.processTCAEvent(trigger, event, actor);
      }, {
        id: middlewareId,
        scope,
        sourceActorId: actor.id,
        effectItemId: effect.id,
        rangeType,
        range,
        priority: block.priority ?? 50
      });
    }
  }
}

/**
 * Unregister all TCA middleware for an actor.
 * @param {Actor} actor
 */
export function unregisterActorTCA(actor) {
  if (!actor) return;
  actorEventBus.removeMiddlewareByActor(actor.id);
}

/**
 * Sync TCA registrations for an actor.
 * @param {Actor} actor
 */
export function syncActorTCA(actor) {
  if (!actor) return;
  unregisterActorTCA(actor);
  registerActorTCA(actor);
}

/**
 * Initialize TCA registration for all world actors and listen to document hooks.
 */
export function initTCARegistration() {
  if (_isInitialized) return;
  _isInitialized = true;

  registerGlobalEventListeners();

  if (game.actors) {
    for (const actor of game.actors) {
      registerActorTCA(actor);
    }
  }

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
