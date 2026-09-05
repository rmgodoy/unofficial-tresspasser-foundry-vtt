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
   * @param {object} [options] - Options (e.g. { notify: boolean })
   * @returns {number|null} Max range in squares, or null if unlimited / not applicable
   */
  static getDeedRange(sourceToken, itemOrDeed, actor = null, options = {}) {
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

    // 2. Explicit numerical range defined on deed system (except missile deeds which strictly use weapon range)
    const deedRange = deedSys.range;
    if (deedRange !== null && deedRange !== undefined && Number.isFinite(Number(deedRange)) && Number(deedRange) > 0 && abilityType !== "missile") {
      baseRange = Number(deedRange);
    } else if (actorDoc?.type === "creature") {
      // 3. Creature actor handling
      if (abilityType === "melee" || abilityType === "unarmed") {
        baseRange = actorDoc.system?.combat?.engagement_range ?? actorDoc.system?.engagement_range ?? 1;
      } else if (abilityType === "missile") {
        baseRange = deedRange && Number(deedRange) > 0 ? Number(deedRange) : (actorDoc.system?.combat?.range ?? 12);
      } else if (abilityType === "spell") {
        baseRange = 4;
      } else {
        baseRange = 1;
      }
    } else {
      // 4. Character / companion actors (weapon-dependent or ability-dependent)
      const activeWeapons = getActiveWeapons(actorDoc);
      const gridDist = canvas.dimensions?.distance ?? 5;
      const hasFree = this.hasFreeHand(actorDoc);

      if (abilityType === "innate") {
        // Innate deeds require no specific weapon or implement
        baseRange = (deedRange !== null && deedRange !== undefined && Number(deedRange) > 0) ? Number(deedRange) : null;
      } else if (abilityType === "melee" || abilityType === "unarmed") {
        const meleeWeapons = activeWeapons.filter(w => w.system?.type === "melee");
        if (meleeWeapons.length > 0) {
          const ranges = meleeWeapons.map(w => this.getWeaponMeleeRange(w, gridDist));
          baseRange = Math.max(...ranges);
        } else if (hasFree || abilityType === "unarmed") {
          baseRange = 1;
        } else {
          if (options.notify) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NeedMeleeWeapon"));
          }
          baseRange = 0;
        }
      } else if (abilityType === "missile") {
        const missileWeapons = activeWeapons.filter(w =>
          !w.system?.isThrown && (w.system?.type === "missile" || w.system?.properties?.thrown)
        );
        if (missileWeapons.length === 0) {
          if (options.notify) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NeedMissileWeapon"));
          }
          baseRange = 0;
        } else {
          let maxRange = 0;
          for (const w of missileWeapons) {
            if (w.system?.properties?.thrown) {
              maxRange = Math.max(maxRange, this.getWeaponThrownRange(w, gridDist));
            } else {
              const raw = String(w.system?.range ?? "").trim();
              const num = parseInt(raw);
              if (!isNaN(num) && num > 0) {
                const r = /ft|feet/i.test(raw) ? Math.round(num / gridDist) : num;
                maxRange = Math.max(maxRange, r);
              }
            }
          }
          if (maxRange > 0) {
            baseRange = maxRange;
          } else {
            if (options.notify) {
              ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.MissileWeaponNoRange"));
            }
            baseRange = 0;
          }
        }
      } else if (abilityType === "spell") {
        const spellWeapons = activeWeapons.filter(w => w.system?.type === "spell");
        if (spellWeapons.length > 0) {
          const r = this.getWeaponRangeInSquares(spellWeapons, gridDist);
          baseRange = r > 0 ? r : 4;
        } else if (hasFree) {
          baseRange = 4;
        } else {
          if (options.notify) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NeedSpellWeapon"));
          }
          baseRange = 0;
        }
      } else if (abilityType === "tool") {
        if (!hasFree) {
          if (options.notify) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NeedFreeHand"));
          }
          baseRange = 0;
        } else {
          const agility = actorDoc?.system?.attributes?.agility ?? 0;
          baseRange = 5 + agility;
        }
      } else if (abilityType === "versatile") {
        const missileWeapons = activeWeapons.filter(w =>
          !w.system?.isThrown && (w.system?.type === "missile" || w.system?.properties?.thrown)
        );
        const meleeWeapons = activeWeapons.filter(w => w.system?.type === "melee");

        let bestRange = 0;
        if (missileWeapons.length > 0) {
          bestRange = Math.max(bestRange, this.getWeaponRangeInSquares(missileWeapons, gridDist));
        }
        if (meleeWeapons.length > 0) {
          const meleeReaches = meleeWeapons.map(w => this.getWeaponMeleeRange(w, gridDist));
          bestRange = Math.max(bestRange, ...meleeReaches);
        }

        if (bestRange > 0) {
          baseRange = bestRange;
        } else if (hasFree) {
          baseRange = 1;
        } else {
          if (options.notify) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NeedWeapon"));
          }
          baseRange = 0;
        }
      }
    }

    if (baseRange === 0) return 0;
    if (baseRange === null || baseRange < 0) return null;

    // 5. Take Aim range bonus (+4 or +8 for missile and spell deeds)
    const activeWeapons = getActiveWeapons(actorDoc);
    const isMissileOrSpell = abilityType === "missile" || abilityType === "spell"
      || (abilityType === "versatile" && activeWeapons.some(w => !w.system?.isThrown && (w.system?.type === "missile" || w.system?.type === "spell" || w.system?.properties?.thrown)));

    if (isMissileOrSpell && baseRange > 0) {
      const aimBonus = this.getAimRangeBonus(sourceToken, actorDoc);
      return baseRange + aimBonus;
    }

    return baseRange;
  }

  /**
   * Check if an actor has at least one free hand.
   * A hand is considered free if:
   * - main_hand or off_hand is empty
   * - OR a two-handed weapon is equipped (since holding it with one hand temporarily is a free action)
   * @param {Actor} actor
   * @returns {boolean}
   */
  static hasFreeHand(actor) {
    if (!actor) return false;
    const mainHandId = actor.system?.equipment?.main_hand;
    const offHandId = actor.system?.equipment?.off_hand;

    // At least one slot is empty
    if (!mainHandId || !offHandId) return true;

    // Check if main_hand and off_hand reference the exact same item
    if (mainHandId === offHandId) return true;

    const mainItem = actor.items?.get(mainHandId);
    const offItem = actor.items?.get(offHandId);
    if (mainItem?.system?.properties?.twoHanded || mainItem?.system?.twoHanded ||
        offItem?.system?.properties?.twoHanded || offItem?.system?.twoHanded) {
      return true;
    }

    return false;
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
   * Get the melee reach in grid squares for a single weapon.
   * Prioritizes system.meleeRange, falling back to system.range only if NOT thrown.
   * Defaults to 1 square.
   * @param {Item} weapon
   * @param {number} [gridDist=5]
   * @returns {number}
   */
  static getWeaponMeleeRange(weapon, gridDist = 5) {
    if (!weapon?.system) return 1;
    const sys = weapon.system;
    let raw = String(sys.meleeRange ?? "").trim();
    if (!raw && !sys.properties?.thrown && sys.type === "melee") {
      raw = String(sys.range ?? "").trim();
    }
    if (!raw) return 1;
    const num = parseInt(raw);
    if (isNaN(num) || num <= 0) return 1;
    if (/ft|feet/i.test(raw)) {
      return Math.max(1, Math.round(num / gridDist));
    }
    return Math.max(1, num);
  }

  /**
   * Get the thrown range in grid squares for a single weapon.
   * @param {Item} weapon
   * @param {number} [gridDist=5]
   * @returns {number} Thrown range in squares (0 if not thrown)
   */
  static getWeaponThrownRange(weapon, gridDist = 5) {
    if (!weapon?.system?.properties?.thrown) return 0;
    const sys = weapon.system;
    let raw = String(sys.thrownRange ?? "").trim();
    if (!raw && sys.type !== "melee") {
      raw = String(sys.range ?? "").trim();
    } else if (!raw && sys.range && sys.range !== "1" && sys.range !== sys.meleeRange) {
      raw = String(sys.range).trim();
    }
    if (!raw) return 4;
    const num = parseInt(raw);
    if (isNaN(num) || num <= 0) return 4;
    if (/ft|feet/i.test(raw)) {
      return Math.max(1, Math.round(num / gridDist));
    }
    return Math.max(1, num);
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
      if (w.system?.isThrown) continue;
      if (w.system?.properties?.thrown) {
        best = Math.max(best, this.getWeaponThrownRange(w, gridDist));
        continue;
      }
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
   * @param {object} [options]
   * @param {{x: number, y: number}} [options.originOverride]
   * @returns {number} Distance in squares (0 if overlapping / adjacent = 1)
   */
  static measureDistanceSquares(sourceToken, target, options = {}) {
    if (!sourceToken && !options.originOverride) return 0;
    if (!target) return 0;

    const gridPx = canvas.grid.size || 100;
    const sDoc = sourceToken?.document ?? sourceToken;

    const srcX = options.originOverride?.x ?? sDoc?.x ?? 0;
    const srcY = options.originOverride?.y ?? sDoc?.y ?? 0;
    const sLeft = Math.floor(srcX / gridPx);
    const sTop = Math.floor(srcY / gridPx);
    const sW = sDoc?.width ?? 1;
    const sH = sDoc?.height ?? 1;
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
   * @param {object} [options]
   * @returns {boolean}
   */
  static isWithinRange(sourceToken, target, maxRangeSq, options = {}) {
    if (maxRangeSq === null || maxRangeSq === undefined) return true;
    if (maxRangeSq === 0) return false;
    const enforce = game.settings.get?.("trespasser", "enforceAttackRange") ?? false;
    if (!enforce) return true;

    const dist = this.measureDistanceSquares(sourceToken, target, options);
    return dist <= maxRangeSq;
  }
}
