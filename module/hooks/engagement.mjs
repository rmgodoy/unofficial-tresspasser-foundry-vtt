import { EngagementHelper } from "../helpers/engagement-helper.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Register tactical engagement synchronization hooks.
 */
export function registerEngagementHooks() {
  Hooks.on("updateToken", (tokenDoc, changed) => {
    if (changed.x !== undefined || changed.y !== undefined || changed.elevation !== undefined ||
        changed.disposition !== undefined || changed.width !== undefined || changed.height !== undefined) {
      EngagementHelper.refreshAllEngagement();
    }
  });

  Hooks.on("createToken", () => EngagementHelper.refreshAllEngagement());
  Hooks.on("deleteToken", (tokenDoc) => {
    if (game.user?.isGM && tokenDoc.actor) {
      const remaining = tokenDoc.actor.getActiveTokens?.(false, false) || [];
      if (remaining.length <= 1) {
        TrespasserEffectsHelper.syncActorEngagedItem(tokenDoc.actor, false);
      }
    }
    EngagementHelper.refreshAllEngagement();
  });

  Hooks.on("updateActor", (actor, changed) => {
    if (changed.system?.health !== undefined || changed.system?.equipment !== undefined ||
        changed.system?.engagement_range !== undefined || changed.system?.combat?.engagement_range !== undefined) {
      EngagementHelper.refreshAllEngagement();
    }
  });

  Hooks.on("updateItem", (item, changed) => {
    if (item.type === "weapon" && changed.system?.equipped !== undefined) {
      EngagementHelper.refreshAllEngagement();
    }
  });

  Hooks.on("updateCombat", () => EngagementHelper.refreshAllEngagement());
}
