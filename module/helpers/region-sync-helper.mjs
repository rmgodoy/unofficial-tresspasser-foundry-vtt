import { TerrainHelper } from "./terrain-helper.mjs";
import { TrespasserRegionHUD } from "../hud/region-hud.mjs";

// --- Region HUD Registration ---

let _regionHUD = null;

export function ensureRegionHUD() {
  if (!_regionHUD) {
    _regionHUD = new TrespasserRegionHUD();
    if (!game.trespasser) game.trespasser = {};
    game.trespasser.RegionHUD = _regionHUD;
  }
  return _regionHUD;
}

function patchRegionPlaceable() {
  const regionClass = CONFIG.Region?.objectClass || foundry.canvas?.placeables?.Region;
  if (regionClass?.prototype && !regionClass.prototype._trespasserPatchedClickRight) {
    regionClass.prototype._trespasserPatchedClickRight = true;
    const origOnClickRight = regionClass.prototype._onClickRight;
    regionClass.prototype._onClickRight = function(event) {
      const hud = ensureRegionHUD();
      if (hud) {
        if (hud.rendered && (hud.object === this || hud.object?.id === this.id)) {
          hud.clear();
        } else {
          const rawEv = event?.data?.originalEvent || event;
          const screenPos = (rawEv && typeof rawEv.clientX === "number") ? { screenX: rawEv.clientX, screenY: rawEv.clientY } : null;
          hud.bind(this, screenPos);
        }
        return;
      }
      if (typeof origOnClickRight === "function") {
        return origOnClickRight.call(this, event);
      }
    };
  }
}

Hooks.once("init", () => {
  patchRegionPlaceable();
});

Hooks.once("ready", () => {
  if (!game.trespasser) game.trespasser = {};
  game.trespasser.TerrainHelper = TerrainHelper;
  ensureRegionHUD();
  patchRegionPlaceable();

  // Instantly close Region HUD on any left-click outside the HUD
  window.addEventListener("pointerdown", (event) => {
    if (!_regionHUD || !_regionHUD.rendered) return;
    if (_regionHUD.element && _regionHUD.element.contains(event.target)) return;
    if (event.button === 0) {
      _regionHUD.clear();
    }
  }, { capture: true });

  // Close Region HUD on Escape key
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && _regionHUD?.rendered) {
      _regionHUD.clear();
    }
  }, { capture: true });

  // Global right-click listener on window/canvas to open Region HUD on any active layer
  window.addEventListener("contextmenu", (event) => {
    if (!canvas.ready || !canvas.scene) return;
    
    const target = event.target;
    if (!target) return;
    
    // Ignore clicks inside interactive UI elements (windows, sidebars, controls, form inputs, etc.)
    if (target.closest(".window-app, #sidebar, #controls, #hotbar, #navigation, #players, #chat-log, .trespasser-region-hud, dialog, form, input, select, textarea, button")) {
      return;
    }

    // Convert mouse client coordinates to canvas world coordinates
    let worldPos = null;
    if (typeof canvas.canvasCoordinatesFromClient === "function") {
      try {
        worldPos = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      } catch {}
    }
    if (!worldPos && typeof canvas.stage?.toLocal === "function") {
      try {
        const p = canvas.stage.toLocal(new PIXI.Point(event.clientX, event.clientY));
        worldPos = { x: p.x, y: p.y };
      } catch {}
    }
    if (!worldPos && canvas.stage) {
      try {
        const p = new PIXI.Point(event.clientX, event.clientY);
        const inv = canvas.stage.worldTransform.applyInverse(p, new PIXI.Point());
        worldPos = { x: inv.x, y: inv.y };
      } catch {}
    }

    if (!worldPos) return;

    const gridSize = canvas.grid?.size || 100;

    // Check all regions on the current scene
    const regions = canvas.scene.regions.filter(r => {
      const doc = r.document ?? r;
      if (typeof doc.testPoint === "function") {
        try {
          if (doc.testPoint({ x: worldPos.x, y: worldPos.y, elevation: doc.elevation ?? 0 })) return true;
        } catch {}
      }
      return TerrainHelper.isPointInRegion(worldPos.x, worldPos.y, doc, gridSize);
    });

    if (regions.length > 0) {
      // Prioritize terrain region if multiple overlap
      const targetRegion = regions.find(r => r.flags?.trespasser?.terrain) || regions[0];
      const placeable = targetRegion.object || canvas.regions?.get(targetRegion.id) || targetRegion;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const hud = ensureRegionHUD();
      if (hud.rendered && (hud.object === placeable || hud.object?.id === targetRegion.id)) {
        hud.clear();
      } else {
        hud.bind(placeable, {
          screenX: event.clientX,
          screenY: event.clientY,
          x: worldPos.x,
          y: worldPos.y
        });
      }
    }
  }, { capture: true });
});

Hooks.on("canvasInit", () => {
  patchRegionPlaceable();
});

Hooks.on("canvasReady", () => {
  ensureRegionHUD();
  patchRegionPlaceable();
});

Hooks.on("canvasPan", () => {
  if (_regionHUD?.rendered) {
    _regionHUD.clear();
  }
});

// --- Token Movement & Region Synchronization ---

// Capture old position before token update so we can trace the movement path
Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
  if (changes.x !== undefined || changes.y !== undefined) {
    options._trespasserOldPos = { x: tokenDocument.x, y: tokenDocument.y };
  }
});

Hooks.on("updateToken", async (tokenDocument, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (changes.x === undefined && changes.y === undefined) return;

  // Immediately synchronize whileInside effects for the token at its new position
  await TerrainHelper.syncWhileInsideEffectsForToken(tokenDocument);

  // If this token has an aura terrain attached, synchronize all tokens on the scene
  const scene = tokenDocument.parent || canvas.scene;
  if (scene) {
    const actorId = tokenDocument.actor?.id;
    const auraRegions = scene.regions.filter(r => {
      const t = r.flags?.trespasser?.terrain;
      return t?.system?.centerMode === "actor" && (t.system.centerActorId === actorId || r.flags?.trespasser?.centerActorId === actorId);
    });
    for (const auraRegion of auraRegions) {
      await TerrainHelper.syncWhileInsideEffectsForRegion(auraRegion);
    }
  }

  // Process terrain events using old → new position path tracing (for onMove, terrainDamage, slippery)
  const oldPos = options._trespasserOldPos;
  if (oldPos) {
    const newX = changes.x ?? tokenDocument.x;
    const newY = changes.y ?? tokenDocument.y;
    // Check if it's a native jump/teleport using Foundry's movementAction
    const actionType = options.movementAction || tokenDocument.movementAction;
    const isJump = actionType === "jump" || actionType === "teleport" || actionType === "blink";
    TerrainHelper.processTokenMovement(tokenDocument, oldPos.x, oldPos.y, newX, newY, isJump);
  }
});

// --- Region Lifecycle Hooks ---

Hooks.on("createRegion", async (region, options, userId) => {
  const isResponsibleGM = game.user.isGM && (game.users.activeGM?.id === game.user.id || (!game.users.activeGM && game.user.id === userId));
  if (isResponsibleGM && region.flags?.trespasser?.terrain) {
    await TerrainHelper.syncWhileInsideEffectsForRegion(region);
  }
});

Hooks.on("deleteRegion", async (region, options, userId) => {
  const isResponsibleGM = game.user.isGM && (game.users.activeGM?.id === game.user.id || (!game.users.activeGM && game.user.id === userId));
  if (isResponsibleGM) {
    await TerrainHelper.cleanupWhileInsideEffectsForRegion(region.id);
  }
});

Hooks.on("updateRegion", async (region, changes, options, userId) => {
  const isResponsibleGM = game.user.isGM && (game.users.activeGM?.id === game.user.id || (!game.users.activeGM && game.user.id === userId));
  if (isResponsibleGM && region.flags?.trespasser?.terrain) {
    await TerrainHelper.syncWhileInsideEffectsForRegion(region);
  }
});

// --- Effect Item Hooks (Live Linked Intensity & Auto-Cleanup) ---

Hooks.on("updateItem", async (item, changes, options, userId) => {
  if (item.type === "effect" && (changes.system?.intensity !== undefined || changes.name !== undefined)) {
    const isResponsibleGM = game.user.isGM && (game.users.activeGM?.id === game.user.id || (!game.users.activeGM && game.user.id === userId));
    if (isResponsibleGM) {
      await TerrainHelper.onEffectIntensityUpdated(item, changes);
    }
  }
});

Hooks.on("deleteItem", async (item, options, userId) => {
  if (item.type === "effect") {
    const isResponsibleGM = game.user.isGM && (game.users.activeGM?.id === game.user.id || (!game.users.activeGM && game.user.id === userId));
    if (isResponsibleGM) {
      await TerrainHelper.onEffectDeleted(item);
    }
  }
});

// --- Combat Cleanup Hook ---

Hooks.on("deleteCombat", async (combat, options, userId) => {
  const isResponsibleGM = game.user.isGM && (game.users.activeGM?.id === game.user.id || (!game.users.activeGM && game.user.id === userId));
  if (isResponsibleGM) {
    await TerrainHelper.cleanupCombatTerrains();
  }
});
