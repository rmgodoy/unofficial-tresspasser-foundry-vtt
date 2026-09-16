import { SYSTEM_ID } from "../system-id.mjs";
import { getMovementType } from "../effects/effects-aggregate.mjs";
import { getEffectiveDeedAttributes } from "./deed-behaviors/roll-accuracy.mjs";
import { getActiveWeapons } from "../sheets/character/handlers-combat.mjs";

/**
 * ElevationHelper — Shared queries and targeting rules for Airborne and Sunken elevation states.
 */

/**
 * Calculate the airborne height in squares for a token or actor.
 * Resolves from active "airborne" effect item intensity or token elevation.
 * @param {Token|TokenDocument|Actor} tokenOrActor
 * @returns {number}
 */
export function getAirborneHeight(tokenOrActor) {
  if (!tokenOrActor) return 0;
  const actor = tokenOrActor.actor || (tokenOrActor instanceof Actor ? tokenOrActor : null);
  const tokenDoc = tokenOrActor.document || (tokenOrActor instanceof TokenDocument ? tokenOrActor : (tokenOrActor.x !== undefined ? tokenOrActor : null));

  // 1. Check active airborne effect item on the actor
  if (actor?.items) {
    const airborneEffect = actor.items.find(i =>
      i.type === "effect" && (
        i.getFlag(SYSTEM_ID, "statusEffectId") === "airborne" ||
        i.getFlag("trespasser", "statusEffectId") === "airborne" ||
        i.name?.toLowerCase() === "airborne"
      )
    );
    if (airborneEffect) {
      const intensity = Number(airborneEffect.system?.intensity);
      if (Number.isFinite(intensity) && intensity > 0) return Math.round(intensity);
      const elev = Number(tokenDoc?.elevation);
      if (Number.isFinite(elev) && elev > 0) return Math.round(elev);
      return 1;
    }
  }

  // 2. Check actor statuses Set
  if (actor?.statuses?.has("airborne")) {
    const elev = Number(tokenDoc?.elevation);
    return (Number.isFinite(elev) && elev > 0) ? Math.round(elev) : 1;
  }

  return 0;
}

/**
 * Check if a token or actor has the airborne state.
 * @param {Token|TokenDocument|Actor} tokenOrActor
 * @returns {boolean}
 */
export function isAirborne(tokenOrActor) {
  return getAirborneHeight(tokenOrActor) > 0;
}

/**
 * Calculate the sunken depth in squares for a token or actor.
 * Resolves from active "sunken" effect item intensity or negative token elevation.
 * @param {Token|TokenDocument|Actor} tokenOrActor
 * @returns {number}
 */
export function getSunkenDepth(tokenOrActor) {
  if (!tokenOrActor) return 0;
  const actor = tokenOrActor.actor || (tokenOrActor instanceof Actor ? tokenOrActor : null);
  const tokenDoc = tokenOrActor.document || (tokenOrActor instanceof TokenDocument ? tokenOrActor : (tokenOrActor.x !== undefined ? tokenOrActor : null));

  // 1. Check active sunken effect item on the actor
  if (actor?.items) {
    const sunkenEffect = actor.items.find(i =>
      i.type === "effect" && (
        i.getFlag(SYSTEM_ID, "statusEffectId") === "sunken" ||
        i.getFlag("trespasser", "statusEffectId") === "sunken" ||
        i.name?.toLowerCase() === "sunken"
      )
    );
    if (sunkenEffect) {
      const intensity = Number(sunkenEffect.system?.intensity);
      if (Number.isFinite(intensity) && intensity > 0) return Math.round(intensity);
      const elev = Number(tokenDoc?.elevation);
      if (Number.isFinite(elev) && elev < 0) return Math.abs(Math.round(elev));
      return 1;
    }
  }

  // 2. Check actor statuses Set
  if (actor?.statuses?.has("sunken")) {
    const elev = Number(tokenDoc?.elevation);
    return (Number.isFinite(elev) && elev < 0) ? Math.abs(Math.round(elev)) : 1;
  }

  return 0;
}

/**
 * Check if a token or actor has the sunken state.
 * @param {Token|TokenDocument|Actor} tokenOrActor
 * @returns {boolean}
 */
export function isSunken(tokenOrActor) {
  return getSunkenDepth(tokenOrActor) > 0;
}

/**
 * Check if a deed or actor action involves a jump.
 * @param {Item|object} itemOrDeed
 * @param {Actor} [actor]
 * @returns {boolean}
 */
export function deedInvolvesJump(itemOrDeed, actor = null) {
  const actorDoc = actor || itemOrDeed?.actor;
  if (actorDoc && getMovementType(actorDoc) === "jump") {
    return true;
  }
  if (!itemOrDeed) return false;
  const deedSys = itemOrDeed.system ?? itemOrDeed;
  if (deedSys.movementType === "jump") return true;

  const graph = deedSys.graph;
  if (graph?.nodes) {
    return graph.nodes.some(n =>
      (n.type === "moveSource" || n.type === "move") &&
      (n.params?.movementType === "jump" || n.params?.movementAction === "jump" || n.params?.destinationMode === "jump")
    );
  }
  return false;
}

/**
 * Validate whether an airborne target can be targeted by a deed according to Trespasser rules:
 * 1. At airborne 2+, melee attacks cannot target unless they involve a jump.
 * 2. Missile / spell attacks targeting a single/individual creature can always target.
 * 3. Blast or burst AoEs can only target if area/size >= creature height.
 *
 * @param {Token|TokenDocument} sourceToken
 * @param {Token|TokenDocument|Actor} targetToken
 * @param {Item|object} itemOrDeed
 * @param {object} [options={}]
 * @param {boolean} [options.isJump] - Explicit jump toggle (e.g. from HUD or dialog)
 * @param {number} [options.aoeSize] - Specific AoE size override
 * @param {string} [options.aoeType] - Specific AoE type override
 * @param {Actor} [options.actor] - Caster actor
 * @returns {{ valid: boolean, reason?: string, height?: number, aoeSize?: number }}
 */
export function canTargetAirborne(sourceToken, targetToken, itemOrDeed, options = {}) {
  const targetHeight = getAirborneHeight(targetToken);
  if (targetHeight <= 0) return { valid: true };

  const actorDoc = options.actor || sourceToken?.actor || itemOrDeed?.actor;
  const deedSys = itemOrDeed?.system ?? itemOrDeed ?? {};
  const { abilityType } = itemOrDeed ? getEffectiveDeedAttributes(itemOrDeed) : { abilityType: "melee" };

  const targetType = options.aoeType || deedSys.targetType || deedSys.aoeType;
  const isAoE = ["blast", "close_blast", "burst", "melee_burst", "aura", "path", "close_path"].includes(targetType);

  // Rule 3: Blast or burst AoEs
  if (isAoE) {
    let aoeSize;
    if (options.aoeSize !== undefined && options.aoeSize !== null) {
      aoeSize = Number(options.aoeSize);
    } else if (targetType === "melee_burst") {
      aoeSize = 0;
    } else if (targetType === "path" || targetType === "close_path") {
      aoeSize = 1;
    } else {
      aoeSize = Number(deedSys.targetSize ?? deedSys.aoeSize ?? 1);
    }

    if (aoeSize < targetHeight) {
      return { valid: false, reason: "airborne_too_high", height: targetHeight, aoeSize };
    }
    return { valid: true };
  }

  // Rule 2: Missile or Spell attacks targeting individual creatures can always target
  if (abilityType === "missile" || abilityType === "spell" || abilityType === "innate" || abilityType === "tool") {
    return { valid: true };
  }

  // Rule 1: Melee / Unarmed / Versatile attacks
  const isJump = options.isJump === true || deedInvolvesJump(itemOrDeed, actorDoc);

  if (abilityType === "melee" || abilityType === "unarmed") {
    if (targetHeight >= 2 && !isJump) {
      return { valid: false, reason: "airborne_requires_jump", height: targetHeight };
    }
    return { valid: true };
  }

  if (abilityType === "versatile") {
    const activeWeapons = getActiveWeapons(actorDoc);
    const hasMissile = activeWeapons.some(w => !w.system?.isThrown && (w.system?.type === "missile" || w.system?.type === "spell" || w.system?.properties?.thrown));
    if (!hasMissile && targetHeight >= 2 && !isJump) {
      return { valid: false, reason: "airborne_requires_jump", height: targetHeight };
    }
    return { valid: true };
  }

  if (targetHeight >= 2 && !isJump) {
    return { valid: false, reason: "airborne_requires_jump", height: targetHeight };
  }

  return { valid: true };
}
