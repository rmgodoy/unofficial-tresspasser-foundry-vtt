import {
  TRESPASSER_STATUS_EFFECTS,
  STATUS_EFFECT_COUNTERS,
  TOGGLE_ONLY_STATUS_EFFECTS
} from "../config/status-effects.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { StatusIntensityDialog } from "../dialogs/status-intensity-dialog.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Finds a matching status effect definition from TRESPASSER_STATUS_EFFECTS.
 * Handles IDs, compendium source IDs, full/relative image URLs, and filenames.
 * @param {string} rawId
 * @returns {object|null}
 */
export function findMatchingStatus(rawId) {
  if (!rawId) return null;
  const decoded = typeof rawId === "string" ? decodeURIComponent(rawId).trim() : rawId;

  return TRESPASSER_STATUS_EFFECTS.find(s => {
    if (s.id === decoded || s.compendiumId === decoded || s.img === decoded) return true;
    if (typeof decoded === "string") {
      const lowerDecoded = decoded.toLowerCase();
      if (s.id.toLowerCase() === lowerDecoded) return true;
      if (s.img && (decoded.endsWith(s.img) || s.img.endsWith(decoded))) return true;
      if (s.img && (lowerDecoded.endsWith(s.img.toLowerCase()) || s.img.toLowerCase().endsWith(lowerDecoded))) return true;

      // Match by icon filename (e.g. "burning.svg")
      const imgFileName = s.img.split("/").pop()?.toLowerCase();
      const rawFileName = lowerDecoded.split("/").pop()?.split("?")[0];
      if (imgFileName && rawFileName && imgFileName === rawFileName) return true;
    }
    return false;
  }) || null;
}

/**
 * Handles status effect toggle with intensity prompt and counter state resolution.
 * @param {Actor} actor - The target actor document
 * @param {string} statusId - The clicked status ID or image path
 * @param {object} [app=null] - The TokenHUD instance
 */
export async function handleStatusEffectToggle(actor, statusId, app = null) {
  if (!actor || (!actor.isOwner && !game.user.isGM)) return;

  const status = findMatchingStatus(statusId);
  if (!status) return;

  // Check if actor already has an effect item matching this state
  const localizedName = game.i18n.localize(status.name);
  const existingItem = actor.items.find(i =>
    i.type === "effect" && (
      TrespasserEffectsHelper.getMatchingCustomStatus(i)?.id === status.id ||
      i.getFlag(SYSTEM_ID, "statusEffectId") === status.id ||
      (status.id === "bloodied" && i.getFlag(SYSTEM_ID, "isBloodiedState")) ||
      (status.id === "tenacious" && i.getFlag(SYSTEM_ID, "isTenaciousState")) ||
      (status.id === "engaged" && i.getFlag(SYSTEM_ID, "isEngagedState")) ||
      (status.id === "encumbered" && i.getFlag(SYSTEM_ID, "isEncumberedState")) ||
      (status.compendiumId && (
        i.flags?.core?.sourceId?.includes(status.compendiumId) ||
        i._stats?.compendiumSource?.includes(status.compendiumId)
      )) ||
      (i.system?.statusIcon && i.system.statusIcon === status.img) ||
      (i.img && i.img === status.img) ||
      (i.name?.toLowerCase() === status.id.toLowerCase()) ||
      (localizedName && i.name?.toLowerCase() === localizedName.toLowerCase())
    )
  );

  const existingAEs = actor.effects?.filter(ae => ae.statuses?.has(status.id)) || [];
  const isActive = Boolean(existingItem || existingAEs.length > 0 || actor.statuses?.has(status.id));

  // States without intensity (bloodied, defeated, shadowy, tenacious) can be directly toggled, skipping the dialog
  if (TOGGLE_ONLY_STATUS_EFFECTS.has(status.id.toLowerCase())) {
    if (isActive) {
      if (existingItem) {
        await actor.deleteEmbeddedDocuments("Item", [existingItem.id]);
      }

      if (existingAEs.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", existingAEs.map(e => e.id));
      }

      if (status.id === "defeated" || status.id === CONFIG.specialStatusEffects?.DEFEATED) {
        const combatant = game.combat?.combatants?.find(c =>
          c.actorId === actor.id || (actor.isToken && c.tokenId === actor.token?.id)
        );
        if (combatant && combatant.defeated) {
          await combatant.update({ defeated: false });
        }
      }

      await TrespasserEffectsHelper._performSyncActorTokenEffects(actor);
      if (app?.rendered) app.render(true);
      else if (canvas.tokens?.hud?.rendered) canvas.tokens.hud.render(true);
    } else {
      await actor.toggleStatusEffect(status.id, { active: true, intensity: 0 });
    }
    return;
  }

  const isEdit = isActive;
  const currentIntensity = existingItem ? (existingItem.system?.intensity || 0) : 1;

  // Check for active opposing counter state on the actor for informative display
  let counterInfo = null;
  const counterId = STATUS_EFFECT_COUNTERS[status.id];
  if (counterId) {
    const counterStatus = TRESPASSER_STATUS_EFFECTS.find(s => s.id === counterId);
    const existingCounter = actor.items.find(i =>
      i.type === "effect" && (
        TrespasserEffectsHelper.isCounterEffectMatch(counterId, i) ||
        (counterStatus && TrespasserEffectsHelper.isCounterEffectMatch(counterStatus.name, i)) ||
        (counterStatus?.compendiumId && TrespasserEffectsHelper.isCounterEffectMatch(counterStatus.compendiumId, i))
      )
    );
    if (existingCounter) {
      counterInfo = {
        name: existingCounter.name,
        intensity: existingCounter.system?.intensity || 0
      };
    }
  }

  // Open the ApplicationV2 intensity dialog
  const result = await StatusIntensityDialog.wait({
    status,
    currentIntensity,
    isEdit,
    counterInfo
  });

  if (result === null) {
    // User cancelled or closed dialog -> No change
    return;
  }

  const newIntensity = Math.max(0, parseInt(result.intensity, 10) || 0);

  if (isEdit) {
    if (newIntensity === 0) {
      // Remove the existing effect
      if (existingItem) {
        await actor.deleteEmbeddedDocuments("Item", [existingItem.id]);
      }

      const matchingAEs = actor.effects?.filter(ae => ae.statuses?.has(status.id)) || [];
      if (matchingAEs.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", matchingAEs.map(e => e.id));
      }

      if (status.id === "defeated" || status.id === CONFIG.specialStatusEffects?.DEFEATED) {
        const combatant = game.combat?.combatants?.find(c =>
          c.actorId === actor.id || (actor.isToken && c.tokenId === actor.token?.id)
        );
        if (combatant && combatant.defeated) {
          await combatant.update({ defeated: false });
        }
      }

      await TrespasserEffectsHelper._performSyncActorTokenEffects(actor);
      if (app?.rendered) app.render(true);
      else if (canvas.tokens?.hud?.rendered) canvas.tokens.hud.render(true);
    } else if (!existingItem) {
      // Was active via loose AE, now setting intensity so create proper Item
      await actor.toggleStatusEffect(status.id, { active: true, intensity: newIntensity });
    } else {
      // Edit existing intensity and resolve any counter states
      let remainingIntensity = newIntensity;
      const counterStates = existingItem.system?.counterStates || [];

      if (counterStates.length > 0) {
        const existingCounters = actor.items.filter(i =>
          i.type === "effect" && counterStates.some(cs => TrespasserEffectsHelper.isCounterEffectMatch(cs, i))
        );

        for (const counter of existingCounters) {
          if (remainingIntensity <= 0) break;
          const counterIntensity = counter.system.intensity || 0;

          if (counterIntensity > remainingIntensity) {
            await counter.update({ "system.intensity": counterIntensity - remainingIntensity });
            remainingIntensity = 0;
          } else {
            remainingIntensity -= counterIntensity;
            await counter.delete();
          }
        }
      }

      if (remainingIntensity <= 0) {
        // Counter state completely negated this effect
        await actor.deleteEmbeddedDocuments("Item", [existingItem.id]);
      } else {
        await existingItem.update({ "system.intensity": remainingIntensity });
      }

      await TrespasserEffectsHelper._performSyncActorTokenEffects(actor);
      if (app?.rendered) app.render(true);
      else if (canvas.tokens?.hud?.rendered) canvas.tokens.hud.render(true);
    }
  } else {
    // Adding new effect
    if (newIntensity === 0) {
      return;
    }

    // Add the effect with specified intensity; preCreateItem handles counter state resolution
    await actor.toggleStatusEffect(status.id, { active: true, intensity: newIntensity });
  }
}

/**
 * Register Token HUD interception hooks and global DOM capture listener.
 */
export function registerStatusHudInterceptor() {
  if (globalThis._trespasserGlobalHudListenerBound) return;
  globalThis._trespasserGlobalHudListenerBound = true;

  const onHudEffectTriggered = (event) => {
    const control = event.target?.closest?.(
      "#token-hud .status-effects .effect-control, .token-hud .status-effects .effect-control, [id*='token-hud'] .status-effects .effect-control"
    );
    if (!control) return;

    const statusId = control.dataset?.statusId ||
                     control.getAttribute?.("data-status-id") ||
                     control.getAttribute?.("src") ||
                     control.querySelector?.("img")?.getAttribute?.("src") ||
                     control.querySelector?.("img")?.src;

    if (!statusId) return;

    const status = findMatchingStatus(statusId);
    if (!status) return;

    // Prevent Foundry's default toggle effect handler from running
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const hud = canvas.tokens?.hud;
    const token = hud?.object;
    const actor = token?.actor || token?.document?.actor;
    if (!actor) return;

    handleStatusEffectToggle(actor, statusId, hud);
  };

  // Attach global capture phase listeners on document
  document.addEventListener("click", onHudEffectTriggered, { capture: true });
  document.addEventListener("contextmenu", onHudEffectTriggered, { capture: true });

  // Also hook into renderTokenHUD for ordering and direct jQuery event handling
  Hooks.on("renderTokenHUD", (app, html, data) => {
    const root = html instanceof HTMLElement ? html : (html?.[0] || (typeof $ !== "undefined" ? $(html)[0] : null));
    if (root) {
      const palette = root.querySelector(".status-effects");
      if (palette) {
        const controls = Array.from(palette.querySelectorAll(".effect-control"));
        const orderMap = new Map();
        TRESPASSER_STATUS_EFFECTS.forEach((s, idx) => {
          const ord = s.order ?? (idx + 1);
          if (s.id) orderMap.set(s.id.toLowerCase(), ord);
          if (s.img) {
            orderMap.set(s.img.toLowerCase(), ord);
            const fileName = s.img.split("/").pop()?.toLowerCase();
            if (fileName) orderMap.set(fileName, ord);
          }
        });

        controls.sort((a, b) => {
          const idA = (a.dataset.statusId || a.getAttribute("src")?.split("/").pop()?.split("?")[0] || "").toLowerCase();
          const idB = (b.dataset.statusId || b.getAttribute("src")?.split("/").pop()?.split("?")[0] || "").toLowerCase();
          const orderA = orderMap.get(idA) ?? 999;
          const orderB = orderMap.get(idB) ?? 999;
          return orderA - orderB;
        });

        for (const ctrl of controls) {
          palette.appendChild(ctrl);
        }
      }
    }

    if (typeof $ !== "undefined" && html) {
      const $hud = $(html);
      $hud.find(".status-effects").off("click.trespasser contextmenu.trespasser");
      $hud.find(".status-effects").on("click.trespasser contextmenu.trespasser", ".effect-control", function (ev) {
        onHudEffectTriggered(ev);
      });
    }
  });
}
