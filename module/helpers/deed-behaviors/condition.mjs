import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";

/**
 * ConditionBehavior
 * Evaluates logical predicates against targets, source actor, or runtime context,
 * segregating tokens into matched/unmatched and branching flow to onTrue/onFalse.
 */
export class ConditionBehavior {
  /**
   * Execute condition check.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey] - Current phase key
   * @returns {Promise<{ passed: boolean, matchedTokens: Token[], unmatchedTokens: Token[] }>}
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const scope = params.targetScope || "targets";
    const condType = params.conditionType || "hasState";

    // 1. Target count scope
    if (scope === "targetCount") {
      const currentTargets = context.targets || [];
      const operator = params.operator || "==";
      const expectedCount = Number(params.targetCount ?? 1);
      const actualCount = currentTargets.length;
      let countPassed = false;

      switch (operator) {
        case "==": countPassed = actualCount === expectedCount; break;
        case "!=": countPassed = actualCount !== expectedCount; break;
        case ">=": countPassed = actualCount >= expectedCount; break;
        case "<=": countPassed = actualCount <= expectedCount; break;
        case ">":  countPassed = actualCount > expectedCount; break;
        case "<":  countPassed = actualCount < expectedCount; break;
      }

      return {
        passed: countPassed,
        matchedTokens: countPassed ? currentTargets : [],
        unmatchedTokens: countPassed ? [] : currentTargets
      };
    }

    // 2. Resolve candidate tokens to evaluate
    let candidates = [];
    if (scope === "self" || scope === "source") {
      const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(actor);
      candidates = sourceToken ? [sourceToken] : (actor ? [actor] : []);
    } else {
      candidates = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    }

    const matchedTokens = [];
    const unmatchedTokens = [];

    for (const candidate of candidates) {
      const candActor = candidate.actor || (candidate instanceof Actor ? candidate : null);
      if (!candActor) {
        unmatchedTokens.push(candidate);
        continue;
      }

      const passed = this._evaluatePredicate(candActor, candidate, condType, params, context, actor);
      if (passed) {
        matchedTokens.push(candidate);
      } else {
        unmatchedTokens.push(candidate);
      }
    }

    const passed = matchedTokens.length > 0;
    return {
      passed,
      matchedTokens,
      unmatchedTokens
    };
  }

  /**
   * Evaluates predicate against an individual token/actor.
   * @private
   */
  static _evaluatePredicate(candActor, candToken, condType, params, context, sourceActor) {
    switch (condType) {
      case "hasState":
        return this._checkHasState(candActor, params.stateId || params.stateName || params.stateUuid, params.minIntensity);

      case "lacksState":
        return !this._checkHasState(candActor, params.stateId || params.stateName || params.stateUuid, params.minIntensity);

      case "hpStatus": {
        const hp = candActor.system?.hp?.value ?? 0;
        const maxHp = candActor.system?.hp?.max ?? 1;
        const status = params.hpStatus || "bloodied";
        if (status === "defeated") return hp <= 0;
        if (status === "bloodied") return hp <= Math.floor(maxHp / 2);
        if (status === "fullHp") return hp >= maxHp;
        if (status === "staggered") {
          return this._checkHasState(candActor, "staggered", 0) || hp <= Math.floor(maxHp / 4);
        }
        return false;
      }

      case "disposition": {
        const targetDisp = candToken.document?.disposition ?? 0;
        const expectedDisp = params.disposition || "hostile";
        if (expectedDisp === "hostile") return targetDisp < 0;
        if (expectedDisp === "friendly") return targetDisp > 0;
        if (expectedDisp === "neutral") return targetDisp === 0;
        return true;
      }

      case "spatial": {
        const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(sourceActor);
        if (!sourceToken || !candToken.x) return false;
        const gridPx = canvas.grid?.size || 100;
        const distSquares = Math.hypot(candToken.x - sourceToken.x, candToken.y - sourceToken.y) / gridPx;
        const rel = params.spatialRelation || "adjacent";
        if (rel === "adjacent") return distSquares <= 1.5;
        if (rel === "withinRange") {
          const maxRange = Number(params.maxRange ?? 4);
          return distSquares <= (maxRange + 0.5);
        }
        return true;
      }

      default:
        return true;
    }
  }

  /**
   * Helper checking whether an actor has an effect or state matching key.
   * @private
   */
  static _checkHasState(actor, stateKey, minIntensity = 0) {
    if (!actor || !stateKey) return false;
    const cleanKey = String(stateKey).trim().toLowerCase();

    // Check embedded effect items
    const matchItem = actor.items.find(i => {
      if (i.type !== "effect") return false;
      const nameMatch = i.name.toLowerCase().includes(cleanKey);
      const uuidMatch = i.flags?.core?.sourceId === stateKey || i.id === stateKey;
      return nameMatch || uuidMatch;
    });

    if (matchItem) {
      if (minIntensity && minIntensity > 0) {
        const intensity = Number(matchItem.system?.intensity ?? 0);
        return intensity >= minIntensity;
      }
      return true;
    }

    // Check ActiveEffect statuses
    if (actor.statuses && actor.statuses.has(cleanKey)) {
      return true;
    }

    return false;
  }
}
