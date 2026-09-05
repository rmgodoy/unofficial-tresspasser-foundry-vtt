import { RangeHelper } from "../helpers/range-helper.mjs";
import { getActiveWeapons } from "../sheets/character/handlers-combat.mjs";
import { matchesDisposition, getTokenOccupiedSquares, getMinSquareDistance } from "./targeting-geometry.mjs";

/**
 * Validate manually selected targets for "creature" type deeds.
 * @param {Set<Token>|Token[]} targets
 * @param {object} deed  item.system
 * @param {Token}  [sourceToken]
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateTargets(targets, deed, sourceToken = null) {
  const targetArr = Array.from(targets);
  const maxTargets = deed.targetCount ?? 1;

  if (targetArr.length > maxTargets) {
    return {
      valid: false,
      message: game.i18n.format("TRESPASSER.Notification.Combat.TooManyTargets", {
        max: maxTargets,
        count: targetArr.length
      })
    };
  }

  return { valid: true };
}

/**
 * Check if an actor has at least one free hand (empty hand slot).
 * @param {Actor} actor
 * @returns {boolean}
 */
export function hasFreeHand(actor) {
  const mainHandId = actor.system?.equipment?.main_hand;
  const offHandId = actor.system?.equipment?.off_hand;
  return !mainHandId || !offHandId;
}

/**
 * Parse the max range in grid squares from a set of weapons.
 * @param {Item[]} weapons
 * @param {number} gridDist
 * @returns {number}
 */
export function getWeaponRangeInSquares(weapons, gridDist) {
  let best = 0;
  for (const w of weapons) {
    const raw = String(w.system?.range ?? "").trim();
    if (!raw) continue;
    const num = parseInt(raw);
    if (isNaN(num) || num <= 0) continue;
    if (/ft|feet/i.test(raw)) {
      best = Math.max(best, Math.round(num / gridDist));
    } else {
      best = Math.max(best, num);
    }
  }
  return best;
}

/**
 * Check if a token is engaged — any hostile token within melee/engagement range.
 * Creatures use their engagement_range attribute (defaults to 1).
 * Characters/commoners engage if they have an equipped melee weapon within reach.
 * @param {Token} token
 * @returns {boolean}
 */
export function isEngaged(token) {
  if (!token || !canvas?.grid) return false;
  const gridPx = canvas.grid.size || 100;

  for (const other of (canvas.tokens?.placeables || [])) {
    if (other.id === token.id) continue;
    // Enemy check based on token hostility / disposition
    if (!matchesDisposition(other, "enemy", token)) continue;
    // Skip defeated / dead tokens
    if (other.actor && other.actor.system?.health <= 0) continue;
    if (other.document?.defeated || other.actor?.statuses?.has("dead")) continue;

    let engageSquares = 1;
    const otherActor = other.actor;
    if (otherActor?.type === "creature") {
      engageSquares = otherActor.system?.combat?.engagement_range 
        ?? otherActor.system?.engagement_range 
        ?? 1;
    } else if (otherActor) {
      // For characters, commoners, and companions:
      const activeWeapons = getActiveWeapons(otherActor);
      const meleeWeapons = activeWeapons.filter(w => w.system?.type === "melee");
      let meleeWeapon = meleeWeapons[0];
      if (!meleeWeapon) {
        const equipment = otherActor.system?.equipment || {};
        const ids = [equipment.main_hand, equipment.off_hand].filter(Boolean);
        meleeWeapon = ids.map(id => otherActor.items.get(id)).find(i => i?.type === "weapon" && i.system?.type === "melee");
      }

      if (meleeWeapon) {
        engageSquares = RangeHelper.getWeaponMeleeRange(meleeWeapon);
      } else {
        // If holding only ranged/missile weapons, they cannot threaten melee engagement
        const equippedWeaponIds = [otherActor.system?.equipment?.main_hand, otherActor.system?.equipment?.off_hand].filter(Boolean);
        const equippedWeapons = equippedWeaponIds.map(id => otherActor.items.get(id)).filter(w => w && w.type === "weapon");
        const onlyRanged = equippedWeapons.length > 0 && equippedWeapons.every(w => w.system?.type === "missile" || w.system?.type === "ranged");
        if (onlyRanged) continue;
        // Unarmed / natural reach:
        engageSquares = (otherActor.type === "companion" && otherActor.system?.combat?.engagement_range)
          ? otherActor.system.combat.engagement_range
          : 1;
      }
    }

    // Edge-to-edge Chebyshev distance in squares (supports 1x1, 2x2, 3x3+ tokens)
    const docA = token.document ?? token;
    const docB = other.document ?? other;

    const x1A = Math.round((docA.x ?? token.x ?? 0) / gridPx);
    const y1A = Math.round((docA.y ?? token.y ?? 0) / gridPx);
    const x2A = x1A + (docA.width ?? token.width ?? 1) - 1;
    const y2A = y1A + (docA.height ?? token.height ?? 1) - 1;

    const x1B = Math.round((docB.x ?? other.x ?? 0) / gridPx);
    const y1B = Math.round((docB.y ?? other.y ?? 0) / gridPx);
    const x2B = x1B + (docB.width ?? other.width ?? 1) - 1;
    const y2B = y1B + (docB.height ?? other.height ?? 1) - 1;

    const dx = Math.max(0, x1A - x2B, x1B - x2A);
    const dy = Math.max(0, y1A - y2B, y1B - y2A);
    const distSquares = Math.max(dx, dy);

    if (distSquares <= engageSquares) return true;
  }
  return false;
}

/**
 * Check if a deed is exempt from the engagement penalty.
 * Exempt if: targeting adjacent creature, or is burst/close_blast/close_path/melee_burst.
 * @param {object} deed  item.system
 * @param {Token[]} targets
 * @param {Token} sourceToken
 * @returns {boolean}
 */
export function isExemptFromEngagement(deed, targets, sourceToken) {
  const exemptTypes = ["burst", "close_blast", "close_path", "melee_burst", "personal"];
  if (exemptTypes.includes(deed?.targetType)) return true;

  if (sourceToken && targets && targets.length > 0) {
    const gridPx = canvas.grid.size || 100;
    for (const t of targets) {
      if (!t?.center) continue;
      const distSquares = Math.max(
        Math.abs(t.center.x - sourceToken.center.x),
        Math.abs(t.center.y - sourceToken.center.y)
      ) / gridPx;
      if (distSquares <= 1.1) return true; // adjacent
    }
  }
  return false;
}

/**
 * Check if a defending character has a melee weapon and is within melee range of attacker.
 * Melee range is adjacent (1 space) or the equipped melee weapon's range.
 * @param {Token} defenderToken
 * @param {Token} attackerToken
 * @returns {{ canCounter: boolean, weapon: Item|null, weaponDie: string }}
 */
export function checkCounterEligibility(defenderToken, attackerToken) {
  if (!defenderToken?.actor || !attackerToken || !canvas?.grid) {
    return { canCounter: false, weapon: null, weaponDie: "d6" };
  }

  const gridPx = canvas.grid.size || 100;
  const distSquares = Math.max(
    Math.abs(defenderToken.center.x - attackerToken.center.x),
    Math.abs(defenderToken.center.y - attackerToken.center.y)
  ) / gridPx;

  if (defenderToken.actor.type === "creature") {
    const engageRange = defenderToken.actor.system?.combat?.engagement_range 
      ?? defenderToken.actor.system?.engagement_range 
      ?? 1;
    const creatureDie = defenderToken.actor.system?.combat?.damage_die
      ?? defenderToken.actor.system?.damage_die
      ?? "d6";
    if (distSquares > engageRange + 0.1) return { canCounter: false, weapon: null, weaponDie: creatureDie };
    return { canCounter: true, weapon: null, weaponDie: creatureDie };
  }

  const meleeWeapon = defenderToken.actor.items.find(i =>
    i.type === "weapon" && i.system.equipped && i.system.type === "melee"
  );
  if (!meleeWeapon) {
    if (defenderToken.actor.type === "companion") {
      const skillDie = defenderToken.actor.system?.skill_die || defenderToken.actor.system?.damageDie || "d6";
      const engageRange = defenderToken.actor.system?.combat?.engagement_range ?? 1;
      if (distSquares > engageRange + 0.1) return { canCounter: false, weapon: null, weaponDie: skillDie };
      return { canCounter: true, weapon: null, weaponDie: skillDie };
    }
    return { canCounter: false, weapon: null, weaponDie: "d6" };
  }

  const maxRange = RangeHelper.getWeaponMeleeRange(meleeWeapon);

  if (distSquares > maxRange + 0.1) return { canCounter: false, weapon: null, weaponDie: "d6" };

  const weaponDie = meleeWeapon.system.weaponDie || "d6";
  return { canCounter: true, weapon: meleeWeapon, weaponDie };
}

/**
 * Check that the actor has a compatible weapon equipped for this deed type.
 * Per rulebook: melee/spell deeds allow a free hand; spell deeds accept spell weapons.
 * @param {object} deed     item.system of the deed
 * @param {Item[]} activeWeapons  from sheet._getActiveWeapons()
 * @param {Actor}  [actor]  needed to check for free hand (equipment slots)
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateWeaponCompatibility(deed, activeWeapons, actor) {
  const deedType = deed.effectiveAbilityType || deed.abilityType || deed.type;

  // Innate deeds require nothing
  if (deedType === "innate") return { valid: true };

  // Unarmed deeds require no weapon
  if (deedType === "unarmed") return { valid: true };

  // Check if actor has a free hand (either hand slot is empty)
  const freeHand = actor ? hasFreeHand(actor) : false;

  // Melee: requires melee weapon, thrown missile weapon, OR free hand
  if (deedType === "melee") {
    const hasMelee = freeHand || activeWeapons.some(w =>
      !w.system?.isThrown && (w.system.type === "melee" || (w.system.type === "missile" && w.system.properties?.thrown))
    );
    if (!hasMelee) {
      return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedMeleeWeapon") };
    }
  }
  // Missile: requires missile weapon OR thrown melee weapon
  else if (deedType === "missile") {
    const hasMissile = activeWeapons.some(w =>
      !w.system?.isThrown && (w.system.type === "missile" || (w.system.type === "melee" && w.system.properties?.thrown))
    );
    if (!hasMissile) {
      return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedMissileWeapon") };
    }
  }
  // Spell: requires spell weapon OR free hand
  else if (deedType === "spell") {
    const hasSpell = freeHand || activeWeapons.some(w => w.system.type === "spell");
    if (!hasSpell) {
      return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedSpellWeapon") };
    }
  }
  // Tool: requires free hand
  else if (deedType === "tool") {
    if (!freeHand) {
      return { valid: false, message: game.i18n.localize("TRESPASSER.Notification.Combat.NeedFreeHand") };
    }
  }
  // Versatile: does not require any weapon
  else if (deedType === "versatile") {
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Get maximum range in squares for a deed.
 * @param {Token} sourceToken
 * @param {object} deed
 * @param {Item[]} [activeWeapons]
 * @returns {number|null}
 */
export function getMaxRangeSq(sourceToken, deed, activeWeapons = []) {
  return RangeHelper.getDeedRange(sourceToken, deed, sourceToken?.actor);
}

/**
 * Validate range from source token to targets.
 * @param {Token[]} targets
 * @param {Token} sourceToken
 * @param {object} deed
 * @param {Item[]} activeWeapons
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateRange(targets, sourceToken, deed, activeWeapons) {
  if (!sourceToken || targets.length === 0) return { valid: true };
  // Only applies to creature-targeted deeds
  if (deed.targetType !== "creature") return { valid: true };
  // Support deeds don't need range validation
  if (deed.actionType === "support") return { valid: true };

  const gridPx = canvas.grid.size;
  const maxRangeSq = getMaxRangeSq(sourceToken, deed, activeWeapons);

  // If no parseable range found, skip validation (don't block deeds with empty range)
  if (maxRangeSq === null || maxRangeSq === undefined || maxRangeSq <= 0) return { valid: true };

  const sourceSquares = getTokenOccupiedSquares(sourceToken, gridPx);

  // Check each target using Chebyshev edge-to-edge distance calculation
  for (const t of targets) {
    const targetSquares = getTokenOccupiedSquares(t, gridPx);
    const distSq = getMinSquareDistance(sourceSquares, targetSquares, gridPx);

    if (distSq > maxRangeSq) {
      return {
        valid: false,
        message: game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
          name: t.name,
          range: maxRangeSq,
          distance: distSq
        })
      };
    }
  }

  return { valid: true };
}
