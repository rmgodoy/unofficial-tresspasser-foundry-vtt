import { buildClockSegments } from "../character/get-data.mjs";

/**
 * Prepare template rendering context for TrespasserHavenSheet.
 * @param {TrespasserHavenSheet} sheet
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function prepareHavenContext(sheet, options) {
  const context = {};
  const actor = sheet.document;
  const system = actor.system;

  context.actor = actor;
  context.system = system;
  context.editable = sheet.isEditable;
  context.isGM = game.user.isGM;
  context.totalAttributes = system.totalAttributes;

  // Budget Info
  context.weeklyBalance = system.weeklyBalance;
  context.totalWeeklyExpenses = system.totalWeeklyExpenses;
  context.totalWeeklyIncome = system.totalWeeklyIncome;
  context.isOverBudget = (system.treasury + system.weeklyBalance) < 0;
  
  // Breakdown data
  context.breakdown = {
    income: [],
    expenses: []
  };
  
  // Expenses: Hirelings (Aggregated)
  const activeHirelings = actor.items.filter(i => i.type === "hireling" && i.system.active);
  const hirelingAggregation = {};
  activeHirelings.forEach(h => {
    const name = h.name;
    if (!hirelingAggregation[name]) {
      hirelingAggregation[name] = { count: 0, cost: 0 };
    }
    hirelingAggregation[name].count += (h.system.quantity || 1);
    hirelingAggregation[name].cost += (h.system.cost || 0) * (h.system.quantity || 1);
  });

  for (const [name, data] of Object.entries(hirelingAggregation)) {
    context.breakdown.expenses.push({
      label: `${name} (${data.count}x)`,
      value: data.cost
    });
  }

  // Expenses/Income: Strongholds
  const compStrongholds = actor.items.filter(i => i.type === "stronghold" && i.system.isCompleted);
  for (const s of compStrongholds) {
    if (s.system.income > 0) {
      context.breakdown.income.push({
        label: s.name,
        value: s.system.income
      });
    }
    if (s.system.weeklyCost > 0) {
      context.breakdown.expenses.push({
        label: s.name,
        value: s.system.weeklyCost
      });
    }
  }

  // Resolve Leader
  context.leader = system.leaderId ? game.actors.get(system.leaderId) : null;

  // Items
  context.hirelings = actor.items.filter(i => i.type === "hireling");

  const allBuildings = actor.items.filter(i => i.type === "build");
  context.completedBuildings = allBuildings.filter(b => b.system.progress >= b.system.buildClock);
  context.constructionBuildings = allBuildings.filter(b => b.system.progress < b.system.buildClock);

  const allStrongholds = actor.items.filter(i => i.type === "stronghold");
  context.completedStrongholds = allStrongholds.filter(s => s.system.progress >= s.system.buildClock).map(s => {
    const owner = s.system.ownerId ? game.actors.get(s.system.ownerId) : null;
    s.ownerName = owner ? owner.name : "";
    return s;
  });
  context.constructionStrongholds = allStrongholds.filter(s => s.system.progress < s.system.buildClock).map(s => {
    const owner = s.system.ownerId ? game.actors.get(s.system.ownerId) : null;
    s.ownerName = owner ? owner.name : "";
    return s;
  });

  context.attributes = {
    "military": "TRESPASSER.Terms.HavenAttribute.Military",
    "efficiency": "TRESPASSER.Terms.HavenAttribute.Efficiency",
    "resources": "TRESPASSER.Terms.HavenAttribute.Resources",
    "expertise": "TRESPASSER.Terms.HavenAttribute.Expertise",
    "allegiance": "TRESPASSER.Terms.HavenAttribute.Allegiance",
    "appeal": "TRESPASSER.Terms.HavenAttribute.Appeal"
  };

  context.inventory = system.inventory.map((entry, index) => ({
    ...entry,
    index,
    name: entry.item.name,
    img: entry.item.img,
    id: entry.item._id || index,
    system: entry.item.system
  }));

  context.projects = (system.projects || []).map((p, i) => ({
    ...p,
    index: i,
    segments: buildClockSegments(Math.max(2, p.clock), Math.min(p.current, Math.max(2, p.clock)))
  }));

  context.tabs = sheet.tabGroups;
  const allAssignedIds = new Set();
  context.system.productionChains.forEach(chain => {
    chain.resolvedHirelings = chain.hirelings
      .map(id => actor.items.get(id))
      .filter(h => !!h);
    chain.hirelings.forEach(id => allAssignedIds.add(id));
  });

  context.availableHirelings = context.hirelings.filter(h => !allAssignedIds.has(h.id));

  const trainedSet = system.trainedSkills;
  const skillList = Object.entries(system.skills).map(([key, _]) => ({
    key,
    trained: trainedSet.has(key),
    inherited: !system.skills[key] && trainedSet.has(key),
    label: game.i18n.localize(`TRESPASSER.Terms.HavenSkill.${key.charAt(0).toUpperCase() + key.slice(1)}`)
  }));
  
  context.skillColumns = [
    skillList.slice(0, Math.ceil(skillList.length / 2)),
    skillList.slice(Math.ceil(skillList.length / 2))
  ];

  context.maxBuildSlots = system.maxBuildSlots;
  context.maxBuildingLimit = system.maxBuildingLimit;
  context.numConstruction = context.constructionBuildings.length;
  context.numCompleted = context.completedBuildings.length;

  const event = system.event;
  context.enrichedEventDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    event.description ?? "",
    { async: true, relativeTo: sheet.document }
  );
  const total = Math.max(2, event.clock);
  const filled = Math.min(event.current, total);
  context.eventClockSegments = buildClockSegments(total, filled);
  context.eventClockCurrent = filled;
  context.eventClockTotal = total;

  context.enrichedArrivals = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    system.arrivals ?? "",
    { async: true, relativeTo: sheet.document }
  );

  context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    system.notes ?? "",
    { async: true, relativeTo: sheet.document }
  );

  return context;
}
