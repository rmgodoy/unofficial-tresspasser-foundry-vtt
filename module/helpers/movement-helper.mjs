import { MovementOverlay } from "../canvas/movement-overlay.mjs";

/**
 * Generic Movement Helper for Trespasser.
 * Manages free/independent movement execution contexts (Vault, BDeed flows, Forced Movement, etc.)
 * that cost no Movement Points and do not require taking the standard Move Action.
 */
export class MovementHelper {
  static #freeMovementDepth = 0;

  /**
   * Run an async function within a free/independent movement context scope.
   * Any token position updates occurring during callback execution bypass Move Action checks.
   * @param {Function} callback 
   * @returns {Promise<any>}
   */
  static async withFreeMovement(callback) {
    this.#freeMovementDepth++;
    try {
      return await callback();
    } finally {
      this.#freeMovementDepth = Math.max(0, this.#freeMovementDepth - 1);
    }
  }

  /**
   * Synchronously check if a free/independent movement context is currently active.
   * @param {object} [options={}] Token update options passed to preUpdateToken
   * @returns {boolean}
   */
  static isFreeMovementActive(options = {}) {
    // 1. Explicit option flags
    if (options.trespasserPhaseAction || options.trespasserForcedMovement || options.trespasserIgnoreMoveAction) {
      return true;
    }

    // 2. Active free movement execution scope stack
    if (this.#freeMovementDepth > 0) {
      return true;
    }

    // 3. Movement overlay is in Vault mode (or any non-move active overlay mode)
    if (MovementOverlay.mode === "vault" || (MovementOverlay.isActive && MovementOverlay.mode !== "move")) {
      return true;
    }

    return false;
  }
}
