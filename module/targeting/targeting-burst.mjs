import { isAtLeastV14 } from "../helpers/compat.mjs";
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";
import { getTokensInSquares } from "./targeting-geometry.mjs";

/**
 * Get the melee reach in grid squares for a melee_burst deed.
 * Parses the weapon range field; defaults to 1.
 * @param {Actor} actor
 * @returns {number}
 */
export function getMeleeReach(actor) {
  const weapons = actor.items.filter(i =>
    i.type === "weapon" && i.system.equipped && i.system.type === "melee"
  );
  if (weapons.length === 0) return 1;
  const gridDist = canvas.dimensions?.distance ?? 5;
  const parsed = Math.max(...weapons.map(w => RangeHelper.getWeaponMeleeRange(w, gridDist)));
  return Math.max(1, parsed);
}

/**
 * Compute all grid squares within Chebyshev distance N of the token's space.
 * For a 1×1 token with Burst N: (2N+1)×(2N+1) square area centered on token.
 * For a 2×2 (Large) token: expands N outward from the token's occupied space.
 * @param {Token} token
 * @param {number} size  Burst size in squares
 * @param {number} gridPx
 * @param {object|null} [originOverride]
 * @returns {Array<{x: number, y: number}>}
 */
export function computeBurstSquares(token, size, gridPx, originOverride = null) {
  const tokenTopLeft = originOverride
    ? { x: originOverride.x, y: originOverride.y }
    : { x: token.document.x, y: token.document.y };
  const tokenW = token.document.width ?? 1;
  const tokenH = token.document.height ?? 1;

  const squares = [];
  for (let dx = -size; dx < tokenW + size; dx++) {
    for (let dy = -size; dy < tokenH + size; dy++) {
      // Caster's own occupied space is unaffected in burst patterns
      const isCasterSpace = dx >= 0 && dx < tokenW && dy >= 0 && dy < tokenH;
      if (isCasterSpace) continue;

      squares.push({
        x: tokenTopLeft.x + dx * gridPx,
        y: tokenTopLeft.y + dy * gridPx
      });
    }
  }
  return squares;
}

/**
 * Create a persistent aura visual. MeasuredTemplates were removed in
 * Foundry v14, where a token-attached Region emanation covers the same
 * squares and follows the token; v13 keeps the original circle template.
 * @param {Token} token
 * @param {number} sizeInSquares
 * @returns {Promise<RegionDocument|MeasuredTemplateDocument|null>}
 */
export async function createAuraRegion(token, sizeInSquares) {
  const gridDist = canvas.dimensions?.distance || canvas.scene?.grid?.distance || 5;

  if (isAtLeastV14()) {
    // Emanation range extends outward from the token's edge in grid units
    const range = sizeInSquares * gridDist;
    const region = await CONFIG.Region.documentClass.createTokenEmanation(token.document, range, {
      name: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TargetTypeChoices.Aura"),
      color: "#5599ff",
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      flags: { trespasser: { autoPlaced: true, isAura: true } }
    });
    return region ?? null;
  }

  // v13: a circle with radius size + 0.5 visually covers the aura squares
  const distance = (sizeInSquares + 0.5) * gridDist;
  const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "circle",
    x: token.center.x,
    y: token.center.y,
    distance,
    direction: 0,
    fillColor: "#5599ff",
    flags: { trespasser: { autoPlaced: true, isAura: true } }
  }]);
  return doc;
}

/**
 * Interactive burst placement and confirmation overlay.
 * Renders the burst square area around the token and highlights targets inside.
 * Asks the user to confirm via CanvasInputSession before executing.
 * @param {Token} token Caster token
 * @param {number} size Burst size in squares
 * @param {number} gridPx Pixels per grid square
 * @param {boolean} [isMelee=false] If true, size is derived from melee reach
 * @param {boolean} [isAura=false] If true, type is aura
 * @param {object} [options]
 * @returns {Promise<{squares: Array<{x:number, y:number}>, templateDoc: null}|null>}
 */
export async function placeBurst(token, size, gridPx, isMelee = false, isAura = false, options = {}) {
  return new Promise(async (resolve) => {
    const actor = token.actor;
    const reach = isMelee ? getMeleeReach(actor) : size;
    const squares = computeBurstSquares(token, reach, gridPx, options.originOverride);
    const targets = getTokensInSquares(squares, gridPx);

    const highlights = [];
    const layer = canvas.interface;

    const drawPreview = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;

      const gfx = new PIXI.Graphics();
      CanvasSelectionRenderer.drawPlacedOrigin(gfx, squares, gridPx);
      layer.addChild(gfx);
      highlights.push(gfx);
    };

    const cleanup = () => {
      for (const gfx of highlights) { layer.removeChild(gfx); gfx.destroy(); }
      highlights.length = 0;
    };

    drawPreview();

    if (game.user.updateTokenTargets && targets.length > 0) {
      game.user.updateTokenTargets(targets.map(t => t.id));
    }

    let title;
    if (isMelee) {
      title = game.i18n.has("TRESPASSER.HUD.Action.MeleeBurst")
        ? game.i18n.localize("TRESPASSER.HUD.Action.MeleeBurst")
        : "Melee Burst";
    } else if (isAura) {
      title = game.i18n.has("TRESPASSER.Sheet.Item.Details.TargetTypeChoices.Aura")
        ? `${game.i18n.localize("TRESPASSER.Sheet.Item.Details.TargetTypeChoices.Aura")} ${reach}`
        : `Aura ${reach}`;
    } else {
      title = game.i18n.has("TRESPASSER.HUD.Action.Burst")
        ? `${game.i18n.localize("TRESPASSER.HUD.Action.Burst")} ${reach}`
        : `Burst ${reach}`;
    }

    let details;
    if (isMelee) {
      details = game.i18n.has("TRESPASSER.HUD.AoE.MeleeBurstInstruction")
        ? game.i18n.format("TRESPASSER.HUD.AoE.MeleeBurstInstruction", { targets: targets.length })
        : `Melee Burst: ${targets.length} target(s) affected. Confirm to execute.`;
    } else if (isAura) {
      details = game.i18n.has("TRESPASSER.HUD.AoE.AuraInstruction")
        ? game.i18n.format("TRESPASSER.HUD.AoE.AuraInstruction", { size: reach, targets: targets.length })
        : `Aura ${reach}: ${targets.length} target(s) affected. Confirm to execute.`;
    } else {
      details = game.i18n.has("TRESPASSER.HUD.AoE.BurstInstruction")
        ? game.i18n.format("TRESPASSER.HUD.AoE.BurstInstruction", { size: reach, targets: targets.length })
        : `Burst ${reach}: ${targets.length} target(s) affected. Confirm to execute.`;
    }

    await CanvasInputSession.start({
      title,
      details,
      icon: "fas fa-expand-alt",
      showConfirm: true,
      canConfirm: true,
      showUndo: false,
      canUndo: false,
      showCancel: true,
      onClick: (ev) => {
        if (ev.data?.originalEvent?.detail === 2) {
          cleanup();
          if (CanvasInputSession.activeSession) CanvasInputSession.activeSession.confirm();
          resolve({ squares: [...squares], templateDoc: null });
        }
      },
      onConfirm: () => {
        cleanup();
        resolve({ squares: [...squares], templateDoc: null });
      },
      onCancel: () => {
        cleanup();
        resolve(null);
      }
    });
  });
}
