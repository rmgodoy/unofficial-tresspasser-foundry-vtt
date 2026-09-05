import { renderPhasedCombatTracker } from "./combat-tracker-render.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { DurationHelper } from "../helpers/duration-helper.mjs";

/**
 * Register combat lifecycle hooks and combat tracker rendering.
 */
export function registerCombatHooks() {
  // Render Combat Tracker with Phased Initiative
  Hooks.on("renderCombatTracker", async (app, html, data) => {
    await renderPhasedCombatTracker(app, html, data);
  });

  // Turn marker update on active phase change
  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    if (changed.flags?.trespasser?.activePhase !== undefined) {
      combat.updateTurnMarkers(changed.flags.trespasser.activePhase);
    }
  });

  // Turn marker updates and automatic phase advance on combatant state changes
  Hooks.on("updateCombatant", (combatant, changed, options, userId) => {
    if (!game.combat) return;
    const isDefeatedChanged = changed.defeated !== undefined;
    const isAPChanged = changed.flags?.trespasser?.actionPoints !== undefined;
    const isInitiativeChanged = changed.initiative !== undefined;
    if (isDefeatedChanged || isAPChanged || isInitiativeChanged) {
      const activePhase = game.combat.getFlag("trespasser", "activePhase");
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

        // Remove combat states that were acquired during combat
        const acquiredInCombat = c.actor.items.filter(i => {
          if (i.type !== "effect") return false;
          return i.getFlag("trespasser", "acquiredDuringCombat") === true && i.system.isCombat && !i.system.isLasting;
        });
        for (const eff of acquiredInCombat) {
          await eff.delete();
        }
        
        // Remove effects where combat-end triggers expiry
        const toRemove = c.actor.items.filter(i => {
          if (i.type !== "effect") return false;
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
        await comp.update({ initiative: changes.initiative, "flags.trespasser.initiativePending": false });
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
      await combatant.update({ initiative: charCombatant.initiative, "flags.trespasser.initiativePending": false });
    }
  });
}
