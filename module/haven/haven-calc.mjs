/**
 * Calculations for Haven attributes, expenses, income, and skills.
 */

/**
 * Total expenses per week (Hirelings + Completed Strongholds).
 * @param {TrespasserHavenData} data
 * @returns {number}
 */
export function calculateWeeklyExpenses(data) {
  const actor = data.parent;
  const hirelings = actor.items.filter(i => i.type === "hireling" && i.system.active);
  const completedStrongholds = actor.items.filter(i => i.type === "stronghold" && i.system.isCompleted);
  
  const hirelingCost = hirelings.reduce((total, h) => total + (h.system.cost * h.system.quantity), 0);
  const strongholdCost = completedStrongholds.reduce((total, s) => total + (s.system.weeklyCost || 0), 0);
  
  return hirelingCost + strongholdCost;
}

/**
 * Total income per week (Completed Strongholds).
 * @param {TrespasserHavenData} data
 * @returns {number}
 */
export function calculateWeeklyIncome(data) {
  const actor = data.parent;
  const completedStrongholds = actor.items.filter(i => i.type === "stronghold" && i.system.isCompleted);
  return completedStrongholds.reduce((total, s) => total + (s.system.income || 0), 0);
}

/**
 * Get calculated total attributes (Base + Bonus + Buildings + Strongholds).
 * @param {TrespasserHavenData} data
 * @returns {Record<string, number>}
 */
export function calculateTotalAttributes(data) {
  const actor = data.parent;
  const totals = {};
  const buildings = actor.items.filter(i => i.type === "build" && (i.system.progress >= i.system.buildClock));
  const strongholds = actor.items.filter(i => i.type === "stronghold" && (i.system.progress >= i.system.buildClock));

  for ( const key of ["military", "efficiency", "resources", "expertise", "allegiance", "appeal"] ) {
    const base = data.attributes[key] ?? 0;
    const bonus = (data.bonuses?.attributes?.[key] ?? 0);
    
    const buildingBonus = buildings.reduce((sum, b) => {
      const itemBonuses = b.system.bonuses || [];
      return sum + itemBonuses.filter(attr => attr.attribute === key).reduce((s, a) => s + a.value, 0);
    }, 0);

    const strongholdBonus = strongholds.reduce((sum, s) => {
      const itemBonuses = s.system.bonuses || [];
      return sum + itemBonuses.filter(attr => attr.attribute === key).reduce((s, a) => s + a.value, 0);
    }, 0);

    totals[key] = base + bonus + buildingBonus + strongholdBonus;
  }
  return totals;
}

/**
 * Returns a Set of all trained skill keys (from Haven itself or completed buildings).
 * @param {TrespasserHavenData} data
 * @returns {Set<string>}
 */
export function getTrainedSkills(data) {
  const actor = data.parent;
  const trained = new Set();
  
  for ( const [key, isTrained] of Object.entries(data.skills) ) {
    if ( isTrained ) trained.add(key);
  }

  const buildings = actor.items.filter(i => i.type === "build" && (i.system.progress >= i.system.buildClock));
  for ( const b of buildings ) {
    for ( const s of (b.system.skills || []) ) {
      trained.add(s);
    }
  }

  return trained;
}
