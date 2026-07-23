import { TerrainHelper } from "./terrain-helper.mjs";

// --- Region Hooks ---

Hooks.on("renderRegionConfig", (app, html, data) => {
  const region = app.document;
  if (region.flags?.trespasser?.terrain) {
    app.close({ force: true });
    TerrainHelper.editTerrainRegion(region);
  }
});

// Capture old position before token update so we can trace the movement path
Hooks.on("preUpdateToken", (tokenDocument, changes, options, userId) => {
  if (changes.x !== undefined || changes.y !== undefined) {
    options._trespasserOldPos = { x: tokenDocument.x, y: tokenDocument.y };
  }
});

Hooks.on("updateToken", (tokenDocument, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (changes.x === undefined && changes.y === undefined) return;

  // Process terrain events using old → new position path tracing
  const oldPos = options._trespasserOldPos;
  if (oldPos) {
    const newX = changes.x ?? tokenDocument.x;
    const newY = changes.y ?? tokenDocument.y;
    // Check if it's a native jump/teleport using Foundry's movementAction
    const actionType = options.movementAction || tokenDocument.movementAction;
    const isJump = actionType === "jump" || actionType === "teleport";
    TerrainHelper.processTokenMovement(tokenDocument, oldPos.x, oldPos.y, newX, newY, isJump);
  }
});
