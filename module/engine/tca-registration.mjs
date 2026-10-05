/**
 * TCA Registration and Lifecycle Management.
 * Registers TCA event handlers with ActorEventBus and maintains cross-actor middleware state.
 */

import { actorEventBus, resolveActorToken } from "../actor/actor-event-bus.mjs";
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

/**
 * Register all cross-actor TCA behaviors from an actor's effects as scoped middleware on the event bus.
 * @param {Actor} actor
 */
export function registerActorTCA(actor) {
  if (!actor || !actor.items) return;

  const tcaEffects = tcaEngine.getTCAEffects(actor);
  console.log(`%c[TCA Registration]%c Registering TCA for actor "${actor.name}" (${actor.id}) - found ${tcaEffects.length} TCA effects`, "color: #c678dd;", "color: inherit;", tcaEffects.map(e => ({ name: e.name, intensity: e.system?.intensity, behaviors: e.system?.behaviors })));

  const actorKey = actor.isToken ? (actor.token?.id || actor.id) : actor.id;
  const actorToken = resolveActorToken(actor);

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
        // Cross-actor TCA execution
        await tcaEngine.processTCAEvent(trigger, event, actor);
      }, {
        id: middlewareId,
        scope,
        sourceActorId: actor.id,
        sourceTokenId: actor.isToken ? (actor.token?.id || null) : null,
        sourceActor: actor,
        sourceToken: actorToken,
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
 * Unregister all TCA middleware for an actor.
 * @param {Actor} actor
 */
export function unregisterActorTCA(actor) {
  if (!actor) return;
  const actorKey = actor.isToken ? (actor.token?.id || actor.id) : actor.id;
  actorEventBus.removeMiddlewareByActor(actorKey);
}

/**
 * Sync TCA registrations for an actor.
 * @param {Actor} actor
 */
export function syncActorTCA(actor) {
  if (!actor) return;
  console.log(`%c[TCA Registration]%c Syncing TCA for actor "${actor.name}" (${actor.id})`, "color: #c678dd; font-weight: bold;", "color: inherit;");
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

  // Register unlinked tokens on the active scene
  if (canvas?.tokens?.placeables) {
    for (const token of canvas.tokens.placeables) {
      if (token.actor && !token.document.actorLink) {
        registerActorTCA(token.actor);
      }
    }
  }

  Hooks.on("canvasReady", () => {
    if (canvas?.tokens?.placeables) {
      for (const token of canvas.tokens.placeables) {
        if (token.actor && !token.document.actorLink) {
          registerActorTCA(token.actor);
        }
      }
    }
  });

  Hooks.on("createToken", (tokenDoc) => {
    if (tokenDoc.actor && !tokenDoc.actorLink) {
      registerActorTCA(tokenDoc.actor);
    }
  });

  Hooks.on("deleteToken", (tokenDoc) => {
    if (tokenDoc.actor && !tokenDoc.actorLink) {
      unregisterActorTCA(tokenDoc.actor);
    }
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
