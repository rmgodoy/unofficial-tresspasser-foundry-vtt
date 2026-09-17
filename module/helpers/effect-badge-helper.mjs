import { TRESPASSER_STATUS_EFFECTS } from "../config/status-effects.mjs";

/**
 * Helper to render an effect badge matching .combatant-effect-badge from the Combat Tracker.
 * Used across the Target Preview HUD and related targeting cards.
 * @param {object|string} eff
 * @returns {string} HTML string
 */
export function formatEffectBadge(eff) {
  let name = typeof eff === "string" ? eff : (eff?.name || "Effect");
  let intensity = typeof eff === "object" ? (parseInt(eff?.intensity) || 0) : 0;
  let icon = (typeof eff === "object" && eff?.img) ? eff.img : null;

  // Match against system status effects for official SVG icon
  if (!icon || icon.endsWith("effect.webp")) {
    const rawName = name.trim().toLowerCase();
    const cleanName = name.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
    const found = TRESPASSER_STATUS_EFFECTS.find(s => {
      const sId = s.id.toLowerCase();
      const locName = game.i18n?.localize(s.name)?.toLowerCase();
      return sId === rawName || locName === rawName || sId === cleanName || locName === cleanName;
    });
    if (found?.img) {
      icon = found.img;
      if (found.name && game.i18n?.has(found.name)) {
        name = game.i18n.localize(found.name);
      }
    }
  }

  icon = icon || "systems/trespasser/assets/icons/effect.webp";
  const intensityHtml = intensity > 0
    ? `<span class="target-preview-effect-intensity">${intensity}</span>`
    : "";

  return `<span class="target-preview-effect-badge" title="${name}"><img class="target-preview-effect-icon" src="${icon}" alt="${name}"/>${intensityHtml}</span>`;
}
