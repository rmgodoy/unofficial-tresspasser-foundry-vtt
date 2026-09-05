import { TrespasserCombat } from "../documents/combat.mjs";

/**
 * Update turn markers on all tokens in the scene based on the active phase.
 * @param {Combat} combat
 * @param {number} activePhase
 */
export async function updateCombatTurnMarkers(combat, activePhase) {
  if (!canvas.ready || !canvas.tokens) return;
  
  const hasActivePhase = (activePhase !== null) && (activePhase !== undefined);

  for (const token of canvas.tokens.placeables) {
    const combatant = combat.combatants.find(c => c.tokenId === token.id);
    const isMyPhase = hasActivePhase && combatant && (Number(combatant.initiative) === Number(activePhase)) && !combatant.defeated;
    
    updateTokenTurnMarker(token, isMyPhase, activePhase);
  }
}

/**
 * Add, remove, or update the marker sprite on a token.
 * @param {Token} token
 * @param {boolean} active
 * @param {number} phase
 */
export function updateTokenTurnMarker(token, active, phase) {
  let marker = token.children.find(c => c.isTrespasserMarker);

  if (!active) {
    if (marker) marker.visible = false;
    return;
  }

  const texturePath = getTurnMarkerTexture(phase);
  if (!texturePath) return;

  if (!marker) {
    marker = new PIXI.Sprite(PIXI.Texture.from(texturePath));
    marker.isTrespasserMarker = true;
    marker.anchor.set(0.5, 0.5);
    marker.position.set(token.w / 2, token.h / 2);
    
    const scale = 1.4;
    marker.width = token.w * scale;
    marker.height = token.h * scale;
    marker.zIndex = -1;
    token.addChildAt(marker, 0);
  } else {
    marker.texture = PIXI.Texture.from(texturePath);
    marker.visible = true;
    marker.position.set(token.w / 2, token.h / 2);
    marker.width = token.w * 1.4;
    marker.height = token.h * 1.4;
  }
}

/**
 * Determine the correct ring texture for a given phase.
 * @param {number} phase
 * @returns {string}
 */
export function getTurnMarkerTexture(phase) {
  const PHASES = TrespasserCombat.PHASES;
  switch (Number(phase)) {
    case PHASES.EARLY: return "systems/trespasser/assets/icons/ring_early.svg";
    case PHASES.ENEMY: return "systems/trespasser/assets/icons/ring_enemy.svg";
    case PHASES.LATE:  return "systems/trespasser/assets/icons/ring.svg";
    case PHASES.EXTRA: return "systems/trespasser/assets/icons/ring.svg";
    default:           return "systems/trespasser/assets/icons/ring.svg";
  }
}
