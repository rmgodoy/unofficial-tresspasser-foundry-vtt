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
  if (!system || !system.phases) return game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Self");
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

  if (selectBehaviors.length > 1) return game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Special");
  if (selectBehaviors.length === 0) return game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Self");

  const behavior = selectBehaviors[0];
  const params = behavior.params || {};
  const mode = params.targetMode || (behavior.type === "selectArea" ? "squares" : "creatures");

  if (mode === "self") return game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Self");
  if (mode === "creatures") {
    const count = parseInt(params.targetCount) || 1;
    const unit = count === 1
      ? game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Creature")
      : game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Creatures");
    return `${count} ${unit}`;
  }
  if (mode === "squares") {
    const count = parseInt(params.targetCount) || 1;
    const unit = count === 1
      ? game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Square")
      : game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Squares");
    return `${count} ${unit}`;
  }
  if (mode === "aoe") {
    const typeKeyMap = {
      blast: "Blast",
      close_blast: "CloseBlast",
      burst: "Burst",
      melee_burst: "MeleeBurst",
      path: "Path",
      close_path: "ClosePath",
      aura: "Aura"
    };
    const key = typeKeyMap[params.aoeType] || "Blast";
    const typeLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Target.${key}`) || params.aoeType;
    const size = parseInt(params.aoeSize) || 1;
    return `${typeLabel} ${size}`;
  }
  if (mode === "area") {
    return game.i18n.localize("TRESPASSER.Sheet.Deed.Target.SelectedArea");
  }
  return game.i18n.localize("TRESPASSER.Sheet.Deed.Target.Self");
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
  const typeRaw = deedData.system.abilityType || deedData.system.type || "deed";
  const typeKey = typeRaw ? typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1) : "";
  deedData.displayType = typeKey ? (game.i18n.localize(`TRESPASSER.Sheet.Item.Details.TypeChoices.${typeKey}`) || typeRaw) : "";

  const actionRaw = deedData.system.actionType || "attack";
  const actionKey = actionRaw ? actionRaw.charAt(0).toUpperCase() + actionRaw.slice(1) : "";
  deedData.displayActionType = actionKey ? (game.i18n.localize(`TRESPASSER.Sheet.Item.Details.ActionTypeChoices.${actionKey}`) || actionRaw) : "";

  const versusRaw = deedData.system.versus || "Guard";
  deedData.displayVersus = versusRaw === "10" ? "10" : (game.i18n.localize(`TRESPASSER.Sheet.Combat.${versusRaw}`) || versusRaw);

  deedData.displayTarget = formatBDeedTarget(deedData.system);

  // Normalized phase descriptions map
  const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];
  deedData.phaseDescriptions = {};
  for (const pKey of phaseKeys) {
    deedData.phaseDescriptions[pKey] = deedData.system.phases?.[pKey]?.description || "";
  }

  return deedData;
}
