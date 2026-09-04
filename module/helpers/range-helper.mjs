import { getEffectiveDeedAttributes } from "./deed-behaviors/roll-accuracy.mjs";
import { getActiveWeapons } from "../sheets/character/handlers-combat.mjs";

/**
 * RangeHelper — Modular deed range evaluation and distance measurement.
 * Handles reach/range calculations for melee, missile, spell, tool, versatile, and creature deeds.
 */
export class RangeHelper {

  /**
   * Determine the maximum range in grid squares for a deed.
   * Accepts either an Item document or a deed data/system object.
   * @param {Token|TokenDocument} sourceToken
   * @param {Item|object} itemOrDeed - The deed item or deed system object
   * @param {Actor} [actor] - The owning actor
   * @returns {number|null} Max range in squares, or null if unlimited / not applicable
   */
  static getDeedRange(sourceToken, itemOrDeed, actor = null) {
    if (!itemOrDeed) return null;
    const actorDoc = actor || sourceToken?.actor || itemOrDeed?.actor;
    const deedSys = itemOrDeed.system ?? itemOrDeed;

    // 0. Target types requiring adjacency (close blast, close path, or close flag)
    const targetType = deedSys.targetType || deedSys.aoeType;
    if (targetType === "close_blast" || targetType === "close_path" || deedSys.close === true) {
      return 1;
    }

    // 1. Resolve effective abilityType and actionType
    const { actionType, abilityType } = getEffectiveDeedAttributes(itemOrDeed);
    if (actionType === "support") return null;

    let baseRange = null;

    // 2. Explicit numerical range defined on deed system
    const deedRange = deedSys.range;
    if (deedRange !== null && deedRange !== undefined && Number.isFinite(Number(deedRange)) && Number(deedRange) > 0) {
      baseRange = Number(deedRange);
    } else if (actorDoc?.type === "creature") {
      // 3. Creature actor handling
      if (abilityType === "melee" || abilityType === "unarmed") {
        baseRange = actorDoc.system?.combat?.engagement_range ?? actorDoc.system?.engagement_range ?? 1;
      } else if (abilityType === "spell") {
        baseRange = 4;
      } else {
        baseRange = 1;
      }
    } else {
      // 4. Character / companion actors (weapon-dependent or ability-dependent)
      const activeWeapons = getActiveWeapons(actorDoc);
      const gridDist = canvas.dimensions?.distance ?? 5;
      const isThrown = activeWeapons.some(w => w.system?.properties?.thrown);

      if (abilityType === "melee" || abilityType === "unarmed") {
        if (isThrown) {
          const thrownWeapons = activeWeapons.filter(w => w.system?.properties?.thrown);
          const r = this.getWeaponRangeInSquares(thrownWeapons, gridDist);
          baseRange = r > 0 ? r : 1;
        } else {
          const meleeWeapons = activeWeapons.filter(w => w.system?.type === "melee");
          const r = this.getWeaponRangeInSquares(meleeWeapons, gridDist);
          baseRange = r > 0 ? r : 1;
        }
      } else if (abilityType === "missile") {
        const missileWeapons = activeWeapons.filter(w =>
          w.system?.type === "missile" || w.system?.properties?.thrown
        );
        const r = this.getWeaponRangeInSquares(missileWeapons, gridDist);
        baseRange = r > 0 ? r : 12;
      } else if (abilityType === "spell") {
        const spellWeapons = activeWeapons.filter(w => w.system?.type === "spell");
        const r = this.getWeaponRangeInSquares(spellWeapons, gridDist);
        baseRange = r > 0 ? r : 4;
      } else if (abilityType === "tool") {
        const agility = actorDoc?.system?.attributes?.agility ?? 0;
        baseRange = 5 + agility;
      } else if (abilityType === "versatile") {
        const r = this.getWeaponRangeInSquares(activeWeapons, gridDist);
        baseRange = r > 0 ? r : 1;
      }
    }

    if (baseRange === null || baseRange <= 0) return null;

    // 5. Take Aim range bonus (+4 or +8 for missile and spell deeds)
    const activeWeapons = getActiveWeapons(actorDoc);
    const isMissileOrSpell = abilityType === "missile" || abilityType === "spell"
      || (abilityType === "versatile" && activeWeapons.some(w => w.system?.type === "missile" || w.system?.type === "spell" || w.system?.properties?.thrown));

    if (isMissileOrSpell) {
      const aimBonus = this.getAimRangeBonus(sourceToken, actorDoc);
      return baseRange + aimBonus;
    }

    return baseRange;
  }

  /**
   * Retrieve active Take Aim range bonus in grid squares for an actor/token.
   * Checks combatant flag first, then actor flag.
   * @param {Token|TokenDocument} [sourceToken]
   * @param {Actor} [actor]
   * @returns {number} Aim bonus in squares (0 if not active)
   */
  static getAimRangeBonus(sourceToken, actor = null) {
    const actorDoc = actor || sourceToken?.actor;
    const tokenDoc = sourceToken?.document ?? sourceToken;
    const tokenId = tokenDoc?.id ?? sourceToken?.id;

    // 1. Check combatant flag if combat is active
    let combatant = null;
    if (game.combat) {
      if (tokenId) {
        combatant = game.combat.combatants.find(c => c.tokenId === tokenId);
      }
      if (!combatant && actorDoc) {
        combatant = game.combat.combatants.find(c => c.actorId === actorDoc.id);
      }
    }

    if (combatant) {
      const b = combatant.getFlag("trespasser", "aimRangeBonus");
      if (b !== undefined && b !== null && Number.isFinite(Number(b)) && Number(b) > 0) {
        return Number(b);
      }
    }

    // 2. Check actor flag
    if (actorDoc) {
      const b = actorDoc.getFlag("trespasser", "aimRangeBonus");
      if (b !== undefined && b !== null && Number.isFinite(Number(b)) && Number(b) > 0) {
        return Number(b);
      }
    }

    return 0;
  }

  /**
   * Parse max range in grid squares from a collection of weapons.
   * Handles formats like "5", "10 squares", "30 ft", "6 sq", etc.
   * @param {Item[]} weapons
   * @param {number} [gridDist=5]
   * @returns {number}
   */
  static getWeaponRangeInSquares(weapons = [], gridDist = 5) {
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
   * Measure edge-to-edge Chebyshev distance in grid squares between a source token and target.
   * Target can be a Token, TokenDocument, or a canvas point {x, y}.
   * @param {Token|TokenDocument} sourceToken
   * @param {Token|TokenDocument|{x: number, y: number}} target
   * @returns {number} Distance in squares (0 if overlapping / adjacent = 1)
   */
  static measureDistanceSquares(sourceToken, target) {
    if (!sourceToken || !target) return 0;

    const gridPx = canvas.grid.size || 100;
    const sDoc = sourceToken.document ?? sourceToken;

    const sLeft = Math.floor(sDoc.x / gridPx);
    const sTop = Math.floor(sDoc.y / gridPx);
    const sW = sDoc.width ?? 1;
    const sH = sDoc.height ?? 1;
    const sRight = sLeft + sW - 1;
    const sBottom = sTop + sH - 1;

    let tLeft, tTop, tRight, tBottom;

    if (target.document || (target.x !== undefined && target.width !== undefined)) {
      const tDoc = target.document ?? target;
      tLeft = Math.floor(tDoc.x / gridPx);
      tTop = Math.floor(tDoc.y / gridPx);
      const tW = tDoc.width ?? 1;
      const tH = tDoc.height ?? 1;
      tRight = tLeft + tW - 1;
      tBottom = tTop + tH - 1;
    } else {
      tLeft = Math.floor(target.x / gridPx);
      tTop = Math.floor(target.y / gridPx);
      tRight = tLeft;
      tBottom = tTop;
    }

    const dx = Math.max(0, sLeft - tRight, tLeft - sRight);
    const dy = Math.max(0, sTop - tBottom, tTop - sBottom);

    return Math.max(dx, dy);
  }

  /**
   * Check whether a target is within the specified range from the source token.
   * @param {Token|TokenDocument} sourceToken
   * @param {Token|TokenDocument|{x: number, y: number}} target
   * @param {number|null} maxRangeSq
   * @returns {boolean}
   */
  static isWithinRange(sourceToken, target, maxRangeSq) {
    if (maxRangeSq === null || maxRangeSq === undefined || maxRangeSq <= 0) return true;
    const enforce = game.settings.get?.("trespasser", "enforceAttackRange") ?? false;
    if (!enforce) return true;

    const dist = this.measureDistanceSquares(sourceToken, target);
    return dist <= maxRangeSq;
  }
}
