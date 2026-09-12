import { renderPhasedCombatTracker } from "./combat-tracker-render.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { DurationHelper } from "../helpers/duration-helper.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Register combat lifecycle hooks and combat tracker rendering.
 */
export function registerCombatHooks() {
  // Render Combat Tracker with Phased Initiative
  Hooks.on("renderCombatTracker", async (app, html, data) => {
    await renderPhasedCombatTracker(app, html, data);
  });

  // Turn marker update on active phase change and refresh token effects on round advance / phase change / combat start
  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    const activePhase = changed.flags?.[SYSTEM_ID]?.activePhase ?? changed.flags?.trespasser?.activePhase;
    if (activePhase !== undefined) {
      combat.updateTurnMarkers(activePhase);
      for (const c of combat.combatants) {
        if (c.actor) TrespasserEffectsHelper.syncActorTokenEffects(c.actor);
      }
    }
    if (changed.round !== undefined || changed.turn !== undefined || changed.active !== undefined) {
      for (const c of combat.combatants) {
        if (c.actor) TrespasserEffectsHelper.syncActorTokenEffects(c.actor);
      }
    }
  });

  // Refresh token effects when combatants are added or removed
  Hooks.on("createCombatant", (combatant) => {
    if (combatant.actor) TrespasserEffectsHelper.syncActorTokenEffects(combatant.actor);
  });

  Hooks.on("deleteCombatant", (combatant) => {
    if (combatant.actor) TrespasserEffectsHelper.syncActorTokenEffects(combatant.actor);
  });

  // Turn marker updates and automatic phase advance on combatant state changes
  Hooks.on("updateCombatant", (combatant, changed, options, userId) => {
    if (!game.combat) return;
    const isDefeatedChanged = changed.defeated !== undefined;
    const isAPChanged = (changed.flags?.[SYSTEM_ID]?.actionPoints !== undefined) || (changed.flags?.trespasser?.actionPoints !== undefined);
    const isInitiativeChanged = changed.initiative !== undefined;
    if (isDefeatedChanged || isAPChanged || isInitiativeChanged) {
      const activePhase = game.combat.getFlag(SYSTEM_ID, "activePhase") ?? game.combat.getFlag("trespasser", "activePhase");
      game.combat.updateTurnMarkers(activePhase);
    }

    if ((isInitiativeChanged || isDefeatedChanged) && game.user.isGM) {
      game.combat.checkEmptyPhaseAdvance();
    }
  });

  // Clean up markers, temporary states, and trigger end-of-combat effects on combat deletion
  Hooks.on("deleteCombat", async (combat) => {
    combat.updateTurnMarkers(null);

    for (const c of combat.combatants) {
      if (c.actor) {
        await TrespasserEffectsHelper.triggerEffects(c.actor, "end-of-combat");

        // Remove combat states that were acquired during combat (excluding persistent special states)
        const acquiredInCombat = c.actor.items.filter(i => {
          if (i.type !== "effect") return false;
          if (TrespasserEffectsHelper.isSpecialState(i)) return false;
          const wasAcquired = i.getFlag(SYSTEM_ID, "acquiredDuringCombat") === true ||
                              i.getFlag("trespasser", "acquiredDuringCombat") === true;
          return wasAcquired && i.system.isCombat && !i.system.isLasting;
        });
        for (const eff of acquiredInCombat) {
          await eff.delete();
        }
        
        // Remove effects where combat-end triggers expiry (excluding persistent special states)
        const toRemove = c.actor.items.filter(i => {
          if (i.type !== "effect") return false;
          if (TrespasserEffectsHelper.isSpecialState(i)) return false;
          return DurationHelper.shouldExpire(i) || i.system.duration === "combat";
        });
        for (const eff of toRemove) {
          if (c.actor.items.has(eff.id)) {
            await eff.delete();
          }
        }

        // Automatically recover thrown weapons after the encounter
        const thrownWeapons = c.actor.items.filter(i => i.type === "weapon" && i.system?.isThrown);
        for (const w of thrownWeapons) {
          await w.update({ "system.isThrown": false });
        }

        if (c.actor.getFlag(SYSTEM_ID, "failedTenacityThisEncounter") || c.actor.getFlag("trespasser", "failedTenacityThisEncounter")) {
          await c.actor.unsetFlag(SYSTEM_ID, "failedTenacityThisEncounter");
          await c.actor.unsetFlag("trespasser", "failedTenacityThisEncounter");
        }

        // Re-evaluate and synchronize persistent passive states
        await TrespasserEffectsHelper.syncActorBloodiedItem(c.actor);
        await TrespasserEffectsHelper.syncActorTenaciousItem(c.actor);
        await TrespasserEffectsHelper.syncActorEncumberedItem(c.actor);
        await TrespasserEffectsHelper.syncActorEngagedItem(c.actor);

        TrespasserEffectsHelper.syncActorTokenEffects(c.actor);
      }
    }
  });

  // Sync companion initiative when bound character initiative changes
  Hooks.on("updateCombatant", async (combatant, changes, options, userId) => {
    if (game.user.id !== userId) return;
    if (!("initiative" in changes) || changes.initiative === null) return;

    const actor = combatant.actor;
    if (!actor || actor.type !== "character") return;

    const combat = combatant.combat;
    if (!combat) return;

    const boundCompanions = combat.combatants.filter(
      c => c.actor?.type === "companion" &&
           c.actor.system.boundCharacterId === actor.id &&
           (c.actor.system.initiativeMode ?? "follow") === "follow" &&
           !c.defeated
    );

    for (const comp of boundCompanions) {
      if (comp.initiative !== changes.initiative) {
        await comp.update({ initiative: changes.initiative, [`flags.${SYSTEM_ID}.initiativePending`]: false });
      }
    }
  });

  // Companion inherits bound character initiative when created
  Hooks.on("createCombatant", async (combatant, options, userId) => {
    if (game.user.id !== userId) return;

    const actor = combatant.actor;
    if (!actor || actor.type !== "companion") return;
    if ((actor.system.initiativeMode ?? "follow") !== "follow") return;

    const boundCharId = actor.system.boundCharacterId;
    if (!boundCharId) return;

    const combat = combatant.combat;
    if (!combat) return;

    const charCombatant = combat.combatants.find(c => c.actorId === boundCharId && !c.defeated);
    if (charCombatant?.initiative != null && combatant.initiative !== charCombatant.initiative) {
      await combatant.update({ initiative: charCombatant.initiative, [`flags.${SYSTEM_ID}.initiativePending`]: false });
    }
  });
}

