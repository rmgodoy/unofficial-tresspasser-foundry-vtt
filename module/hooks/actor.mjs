import { TrespasserActor } from "../documents/actor.mjs";
import { syncBoundCompanions } from "../helpers/companion-formula.mjs";
import { getDefaultCommonerDeedData } from "../helpers/commoner-generator.mjs";

/**
 * Register Actor lifecycle, damage animation, and synchronization hooks.
 */
export function registerActorHooks() {
  // Ensure commoners receive their default deed
  Hooks.on("createActor", async (actor, options, userId) => {
    if (actor.type !== "commoner" || game.user.id !== userId) return;

    const hasDeed = actor.items.some(i => i.type === "deed" && (i.name === "Weapon Attack" || i.system?.is_default_commoner));
    if (!hasDeed) {
      await actor.createEmbeddedDocuments("Item", [getDefaultCommonerDeedData()]);
    }
  });

  // Track old health and synchronize prototype token name
  Hooks.on("preUpdateActor", (actor, updateData, options, userId) => {
    if (updateData.name && !actor.isToken) {
      updateData.prototypeToken = updateData.prototypeToken || {};
      updateData.prototypeToken.name = updateData.name;
    }
    if (foundry.utils.hasProperty(updateData, "system.health")) {
      options._trespasserOldHealth = actor.system?.health ?? 0;
    }
  });

  // Animate damage/healing numbers and trigger companion/token updates
  Hooks.on("updateActor", async (actor, updateData, options, userId) => {
    if (options._trespasserOldHealth !== undefined && foundry.utils.hasProperty(updateData, "system.health")) {
      const oldHp = options._trespasserOldHealth;
      const newHp = actor.system?.health ?? 0;
      const damage = oldHp - newHp;
      let token = actor.token?.object || canvas.tokens?.get(actor.token?.id);
      if (!token && (actor.isToken || actor.prototypeToken?.actorLink)) {
        token = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id || t.document?.actorId === actor.id);
      }

      if (damage > 0 && token) {
        TrespasserActor.queueDamageAnimation(token, damage);
      } else if (damage < 0 && token) {
        TrespasserActor.animateHealingText(token, Math.abs(damage));
      }
    }

    if (actor.type === "character") {
      syncBoundCompanions(actor);
    }

    if (game.user.id !== userId) return;

    if (updateData.img && actor.isToken && actor.token) {
      if (actor.token.texture?.src !== updateData.img) {
        await actor.token.update({ "texture.src": updateData.img });
      }
    }
  });

  // Sync token texture for actor deltas
  Hooks.on("updateActorDelta", async (actorDelta, changed, options, userId) => {
    if (game.user.id !== userId) return;

    if (changed.img) {
      const tokenDoc = actorDelta.parent;
      if (tokenDoc && tokenDoc.texture?.src !== changed.img) {
        await tokenDoc.update({ "texture.src": changed.img });
      }
    }
  });

  // GM listener for player initiative roll results
  Hooks.on("updateActor", async (actor, updates, options, userId) => {
    const result = foundry.utils.getProperty(updates, "flags.trespasser.initiativeRollResult");
    if (result && game.user.isGM) {
      const combat = game.combats.get(result.combatId);
      if (combat) {
        await combat._processInitiativeResult(result.combatantId, result.total, result.isNat20);
      }
      await actor.unsetFlag("trespasser", "initiativeRollResult");
    }
  });
}
