/**
 * In-memory tracking of TCA block usage counts per cooldown period.
 */

/** @type {Map<string, Map<string, number>>} */
const _usageStore = new Map();

/**
 * Running turn counter for non-combat or fine-grained turn tracking.
 */
let _turnCounter = 0;

/**
 * Build block storage key.
 * @param {string} actorId
 * @param {string} effectId
 * @param {string} blockId
 * @returns {string}
 */
function getBlockKey(actorId, effectId, blockId) {
  return `${actorId || "none"}:${effectId || "none"}:${blockId || "none"}`;
}

/**
 * Get the current period identifier based on the cooldown definition.
 * @param {string} per - 'turn' | 'round' | 'combat'
 * @returns {string|null}
 */
function getPeriodKey(per) {
  const combat = game.combat;
  if (!combat) {
    // If no combat is active, cooldowns are not enforced for combat-based periods
    return null;
  }

  const combatId = combat.id || "active";
  switch (per) {
    case "turn": {
      const roundNum = combat.round ?? 0;
      const turnNum = combat.turn ?? 0;
      return `turn:${combatId}:${roundNum}:${turnNum}:${_turnCounter}`;
    }
    case "round": {
      const roundNum = combat.round ?? 0;
      return `round:${combatId}:${roundNum}`;
    }
    case "combat": {
      return `combat:${combatId}`;
    }
    default:
      return null;
  }
}

/**
 * Check if a block can still be used in its current cooldown period.
 * @param {string} actorId
 * @param {string} effectId
 * @param {string} blockId
 * @param {object|null} cooldown - { uses: Number, per: 'turn'|'round'|'combat' }
 * @returns {boolean}
 */
export function canUseBlock(actorId, effectId, blockId, cooldown) {
  if (!cooldown || !cooldown.uses || cooldown.uses <= 0 || !cooldown.per) {
    return true;
  }

  const periodKey = getPeriodKey(cooldown.per);
  if (!periodKey) {
    return true; // No active combat, cooldown not enforced
  }

  const blockKey = getBlockKey(actorId, effectId, blockId);
  const periodMap = _usageStore.get(blockKey);
  const currentUses = periodMap?.get(periodKey) ?? 0;

  return currentUses < cooldown.uses;
}

/**
 * Record a use of a block.
 * @param {string} actorId
 * @param {string} effectId
 * @param {string} blockId
 * @param {object|null} cooldown - { uses: Number, per: 'turn'|'round'|'combat' }
 */
export function recordBlockUse(actorId, effectId, blockId, cooldown) {
  if (!cooldown || !cooldown.uses || !cooldown.per) return;

  const periodKey = getPeriodKey(cooldown.per);
  if (!periodKey) return;

  const blockKey = getBlockKey(actorId, effectId, blockId);
  if (!_usageStore.has(blockKey)) {
    _usageStore.set(blockKey, new Map());
  }

  const periodMap = _usageStore.get(blockKey);
  const currentUses = periodMap.get(periodKey) ?? 0;
  periodMap.set(periodKey, currentUses + 1);
}

/**
 * Get remaining uses for a block in its current cooldown period.
 * @param {string} actorId
 * @param {string} effectId
 * @param {string} blockId
 * @param {object|null} cooldown - { uses: Number, per: 'turn'|'round'|'combat' }
 * @returns {number}
 */
export function getRemainingUses(actorId, effectId, blockId, cooldown) {
  if (!cooldown || !cooldown.uses || cooldown.uses <= 0 || !cooldown.per) {
    return Infinity;
  }

  const periodKey = getPeriodKey(cooldown.per);
  if (!periodKey) {
    return cooldown.uses;
  }

  const blockKey = getBlockKey(actorId, effectId, blockId);
  const periodMap = _usageStore.get(blockKey);
  const currentUses = periodMap?.get(periodKey) ?? 0;

  return Math.max(0, cooldown.uses - currentUses);
}

/**
 * Reset all cooldowns for a given period boundary.
 * Call on round-start, turn-start, combat-start as appropriate.
 * @param {'turn'|'round'|'combat'} period
 */
export function resetCooldowns(period) {
  if (period === "turn") {
    _turnCounter++;
  }

  for (const [blockKey, periodMap] of _usageStore.entries()) {
    for (const pKey of periodMap.keys()) {
      if (pKey.startsWith(`${period}:`)) {
        periodMap.delete(pKey);
      }
    }
    if (periodMap.size === 0) {
      _usageStore.delete(blockKey);
    }
  }
}

/**
 * Clear all tracked cooldowns (e.g. on combat end).
 */
export function clearAllCooldowns() {
  _usageStore.clear();
  _turnCounter = 0;
}
