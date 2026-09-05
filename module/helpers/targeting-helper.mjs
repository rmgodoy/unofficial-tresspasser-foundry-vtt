/**
 * TargetingHelper — AOE template placement and target resolution for deeds.
 * Facade coordinating modular targeting sub-modules.
 */

import { RangeHelper } from "./range-helper.mjs";
import {
  matchesDisposition,
  getTokenOccupiedSquares,
  getCentersFromSquares,
  getMinSquareDistance,
  isBlastAdjacentToToken,
  isAdjacentToCasterToken,
  getTokensInSquares,
  getTokensInPath
} from "../targeting/targeting-geometry.mjs";
import { placeBlast } from "../targeting/targeting-blast.mjs";
import {
  getMeleeReach,
  computeBurstSquares,
  createAuraRegion,
  placeBurst
} from "../targeting/targeting-burst.mjs";
import { placePath } from "../targeting/targeting-path.mjs";
import {
  validateTargets,
  hasFreeHand,
  getWeaponRangeInSquares,
  isEngaged,
  isExemptFromEngagement,
  checkCounterEligibility,
  validateWeaponCompatibility,
  getMaxRangeSq,
  validateRange
} from "../targeting/targeting-validation.mjs";

export {
  matchesDisposition,
  getTokenOccupiedSquares,
  getCentersFromSquares,
  getMinSquareDistance,
  isBlastAdjacentToToken,
  isAdjacentToCasterToken,
  getTokensInSquares,
  getTokensInPath,
  placeBlast,
  getMeleeReach,
  computeBurstSquares,
  createAuraRegion,
  placeBurst,
  placePath,
  validateTargets,
  hasFreeHand,
  getWeaponRangeInSquares,
  isEngaged,
  isExemptFromEngagement,
  checkCounterEligibility,
  validateWeaponCompatibility,
  getMaxRangeSq,
  validateRange
};

export class TargetingHelper {
  /* -------------------------------------------- */
  /* Template Placement                            */
  /* -------------------------------------------- */

  /**
   * Place an AOE for a deed. All types return { squares, templateDoc } or null.
   * @param {Actor}  actor
   * @param {Token}  token   The caster's token
   * @param {object} deed    item.system of the deed
   * @param {Item[]} [activeWeapons=[]]
   * @param {object} [options={}]
   * @returns {Promise<{squares: Array<{x:number,y:number}>, templateDoc: RegionDocument|null}|null>}
   */
  static async placeTemplate(actor, token, deed, activeWeapons = [], options = {}) {
    const type = deed.targetType;
    const size = deed.targetSize ?? 1;
    const gridPx = canvas.grid.size;

    const effectiveDeed = { ...(options.item?.system || {}), ...deed };
    const maxRangeSq = RangeHelper.getDeedRange(token, effectiveDeed, actor, { notify: true });
    const isClose = effectiveDeed.close === true || type === "close_blast" || type === "close_path";

    switch (type) {
      case "blast":
        return placeBlast(token, size, gridPx, isClose, maxRangeSq);

      case "close_blast":
        return placeBlast(token, size, gridPx, true, 1);

      case "burst":
      case "aura": {
        const result = await placeBurst(token, size, gridPx, false, type === "aura", options);
        if (!result) return null;
        let templateDoc = null;
        // Aura persists visually using a token-attached Region emanation
        if (type === "aura") {
          templateDoc = await createAuraRegion(token, size);
        }
        return { squares: result.squares, templateDoc };
      }

      case "melee_burst": {
        return placeBurst(token, 0, gridPx, true, false, options);
      }

      case "path":
        return placePath(token, size, gridPx, isClose, maxRangeSq);

      case "close_path":
        return placePath(token, size, gridPx, true, 1);

      default:
        return null;
    }
  }

  /* -------------------------------------------- */
  /* Spatial & Target Resolution                   */
  /* -------------------------------------------- */

  static matchesDisposition(targetToken, disposition, sourceToken = null) {
    return matchesDisposition(targetToken, disposition, sourceToken);
  }

  static getTokensInSquares(squares, gridPx, options) {
    return getTokensInSquares(squares, gridPx, options);
  }

  static getTokensInPath(squares, gridPx, opts) {
    return getTokensInPath(squares, gridPx, opts);
  }

  /* -------------------------------------------- */
  /* Validation & Rules Checks                     */
  /* -------------------------------------------- */

  static validateTargets(targets, deed, sourceToken) {
    return validateTargets(targets, deed, sourceToken);
  }

  static isEngaged(token) {
    return isEngaged(token);
  }

  static isExemptFromEngagement(deed, targets, sourceToken) {
    return isExemptFromEngagement(deed, targets, sourceToken);
  }

  static checkCounterEligibility(defenderToken, attackerToken) {
    return checkCounterEligibility(defenderToken, attackerToken);
  }

  static validateWeaponCompatibility(deed, activeWeapons, actor) {
    return validateWeaponCompatibility(deed, activeWeapons, actor);
  }

  static getMaxRangeSq(sourceToken, deed, activeWeapons = []) {
    return getMaxRangeSq(sourceToken, deed, activeWeapons);
  }

  static validateRange(targets, sourceToken, deed, activeWeapons) {
    return validateRange(targets, sourceToken, deed, activeWeapons);
  }
}
