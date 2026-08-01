/**
 * deed-display-helper.mjs
 * Shared helpers for formatting Deeds and BDeeds for sheet presentation.
 */

/**
 * Format BDeed target description based on selectTarget behavior count.
 * @param {object} system - BDeed item system data
 * @returns {string}
 */
export function formatBDeedTarget(system) {
  if (!system || !system.phases) return "Self";
  const selectBehaviors = [];
  const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];
  for (const pKey of phaseKeys) {
    const phase = system.phases[pKey];
    if (phase && Array.isArray(phase.behaviors)) {
      for (const b of phase.behaviors) {
        if (b.type === "selectTarget" || b.type === "selectArea") selectBehaviors.push(b);
      }
    }
  }

  if (selectBehaviors.length > 1) return "Special";
  if (selectBehaviors.length === 0) return "Self";

  const behavior = selectBehaviors[0];
  const params = behavior.params || {};
  const mode = params.targetMode || (behavior.type === "selectArea" ? "squares" : "creatures");

  if (mode === "self") return "Self";
  if (mode === "creatures") {
    const count = parseInt(params.targetCount) || 1;
    return `${count} ${count === 1 ? "Creature" : "Creatures"}`;
  }
  if (mode === "squares") {
    const count = parseInt(params.targetCount) || 1;
    return `${count} ${count === 1 ? "Square" : "Squares"}`;
  }
  if (mode === "aoe") {
    const typeMap = {
      blast: "Blast",
      close_blast: "Close Blast",
      burst: "Burst",
      melee_burst: "Melee Burst",
      path: "Path",
      close_path: "Close Path",
      aura: "Aura"
    };
    const type = typeMap[params.aoeType] || (params.aoeType || "blast").charAt(0).toUpperCase() + (params.aoeType || "blast").slice(1);
    const size = parseInt(params.aoeSize) || 1;
    return `${type} ${size}`;
  }
  if (mode === "area") {
    return "Selected Area";
  }
  return "Self";
}

/**
 * Prepare standardized display data for a Deed or BDeed item document.
 * @param {Item} d - The Item document
 * @param {object} [sourceMapByUuid] - Optional UUID to feature name map
 * @returns {object}
 */
export function prepareDeedDisplayData(d, sourceMapByUuid = {}) {
  const deedData = d.toObject ? d.toObject(false) : d.toJSON();
  deedData.id = d.id;
  deedData.isBDeed = true;

  const tier = deedData.system.tier || "light";
  let baseCost = deedData.system.focusCost;
  if (baseCost === null || baseCost === undefined) {
    if (tier === "heavy") baseCost = 2;
    else if (tier === "mighty") baseCost = 4;
    else baseCost = 0;
  }

  let costIncrease = deedData.system.focusIncrease;
  if (costIncrease === null || costIncrease === undefined) {
    if (tier === "heavy" || tier === "mighty") costIncrease = 1;
    else costIncrease = 0;
  }

  const bonusCost = deedData.system.bonusCost || 0;
  const uses = deedData.system.uses || 0;
  deedData.displayCost = baseCost + bonusCost;
  deedData.showCost = deedData.displayCost > 0;
  deedData.hasUses = costIncrease > 0;

  if (deedData.hasUses) {
    deedData.usesCheckboxes = Array.from({ length: 3 }, (_, i) => ({ index: i + 1, checked: i < uses }));
  }

  const linkedSource = d.flags?.trespasser?.linkedSource;
  if (linkedSource && sourceMapByUuid[linkedSource]) {
    deedData.sourceName = sourceMapByUuid[linkedSource];
  }

  // Normalized subheader fields
  deedData.displayType = deedData.system.abilityType || "deed";
  deedData.displayVersus = deedData.system.versus || "Guard";
  deedData.displayTarget = formatBDeedTarget(deedData.system);

  // Normalized phase descriptions map
  const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];
  deedData.phaseDescriptions = {};
  for (const pKey of phaseKeys) {
    deedData.phaseDescriptions[pKey] = deedData.system.phases?.[pKey]?.description || "";
  }

  return deedData;
}
