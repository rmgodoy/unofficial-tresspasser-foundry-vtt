/**
 * party-member-context.mjs
 * Context resolution and resource calculation for party members.
 */

/**
 * Build context data for a single party member.
 * @param {Actor} actor
 * @param {string[]} lightTags
 * @returns {Object}
 */
export function buildMemberContext(actor, lightTags) {
  const s = actor.system;

  // Count rations (total quantity of all 'rations' type items)
  const rations = actor.items
    .filter(i => i.type === "rations")
    .reduce((sum, i) => sum + (i.system.quantity ?? 1), 0);

  // Count injuries (total number of 'injury' type items)
  const injuries = actor.items.filter(i => i.type === "injury").length;

  // Light sources (sub-type of light source or weapons with light source property)
  const lightSources = [];
  for (const item of actor.items) {
    let isLight = false;

    if (item.type === "item" && item.system.subType === "light_source") isLight = true;
    else if (item.type === "weapon" && item.system.isLightSource) isLight = true;
    else if (item.system.isLightFuel) isLight = true;

    if (isLight) {
      lightSources.push({
        name: item.name,
        depletionDie: item.system.depletionDie ?? "",
        quantity: item.system.quantity ?? 1
      });
    }
  }

  return {
    _id: actor.id,
    name: actor.name,
    img: actor.img,
    level: actor.type === "commoner" ? 0 : (s.level ?? 1),
    hp: s.health ?? 0,
    hpMax: s.max_health ?? 0,
    endurance: s.endurance ?? 0,
    enduranceMax: s.max_endurance ?? 0,
    recoveryDice: s.recovery_dice ?? 0,
    recoveryDiceMax: s.max_recovery_dice ?? 0,
    resolve: s.resolve ?? 0,
    armor: s.armorDieAmmount ?? 0,
    armorMax: actor.items.filter(i => i.type === "armor" && i.system.equipped).length,
    rations,
    injuries,
    lightSources
  };
}

/**
 * Get the DC from the currently active dungeon session, if any.
 * @returns {number|null}
 */
export function getActiveDungeonDC() {
  try {
    const { DungeonTracker } = foundry.utils.getType(globalThis.trespasser?.DungeonTracker) === "function"
      ? globalThis.trespasser
      : {};
    const tracker = DungeonTracker?._instance;
    if (tracker?.dungeon && tracker.sessionState === "active") {
      const tier = tracker.dungeon.system.hostilityTier ?? 1;
      return CONFIG.TRESPASSER?.dungeon?.hostilityTiers?.[tier]?.dc ?? null;
    }
  } catch { /* no tracker available */ }
  return null;
}
