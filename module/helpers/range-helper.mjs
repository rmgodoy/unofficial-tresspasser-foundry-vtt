import { getEffectiveDeedAttributes } from "./deed-behaviors/roll-accuracy.mjs";
import { getActiveWeapons } from "../sheets/character/handlers-combat.mjs";
import { SYSTEM_ID } from "../system-id.mjs";
import { TrespasserEffectsHelper } from "./effects-helper.mjs";

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
          const maxRange = this.getWeaponRangeInSquares(missileWeapons, gridDist);
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

    let combatant = null;
    if (game.combat) {
      if (tokenId) combatant = game.combat.combatants.find(c => c.tokenId === tokenId);
      if (!combatant && actorDoc) combatant = game.combat.combatants.find(c => c.actorId === actorDoc.id);
    }
    const bonus = combatant?.getFlag("trespasser", "aimRangeBonus") ?? actorDoc?.getFlag("trespasser", "aimRangeBonus");
    return (bonus && Number.isFinite(Number(bonus)) && Number(bonus) > 0) ? Number(bonus) : 0;
  }

  static _parseDistance(raw, gridDist = 5, fallback = 0) {
    if (!raw) return fallback;
    const str = String(raw).trim();
    const num = parseInt(str);
    if (isNaN(num) || num <= 0) return fallback;
    return /ft|feet/i.test(str) ? Math.max(1, Math.round(num / gridDist)) : num;
  }

  /**
   * Get the melee reach in grid squares for a single weapon.
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
    return this._parseDistance(raw, gridDist, 1);
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
    if (!raw && sys.type !== "melee") raw = String(sys.range ?? "").trim();
    else if (!raw && sys.range && sys.range !== "1" && sys.range !== sys.meleeRange) raw = String(sys.range).trim();
    return this._parseDistance(raw, gridDist, 4);
  }

  /**
   * Parse max range in grid squares from a collection of weapons.
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
      best = Math.max(best, this._parseDistance(w.system?.range, gridDist, 0));
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

  /**
   * Determine the airborne altitude / height in grid squares for a token or actor.
   * Returns 0 if the creature is not airborne.
   * @param {Token|TokenDocument|Actor} tokenOrActor
   * @returns {number}
   */
  static getAirborneHeight(tokenOrActor) {
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
  static isAirborne(tokenOrActor) {
    return this.getAirborneHeight(tokenOrActor) > 0;
  }

  /**
   * Check if a deed or actor action involves a jump.
   * @param {Item|object} itemOrDeed
   * @param {Actor} [actor]
   * @returns {boolean}
   */
  static deedInvolvesJump(itemOrDeed, actor = null) {
    const actorDoc = actor || itemOrDeed?.actor;
    if (actorDoc && TrespasserEffectsHelper.getMovementType(actorDoc) === "jump") {
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
  static canTargetAirborne(sourceToken, targetToken, itemOrDeed, options = {}) {
    const targetHeight = this.getAirborneHeight(targetToken);
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
    const isJump = options.isJump === true || this.deedInvolvesJump(itemOrDeed, actorDoc);

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
}
