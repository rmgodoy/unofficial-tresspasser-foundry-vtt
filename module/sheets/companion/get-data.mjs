import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

/**
 * Data preparation for TrespasserCompanionSheet.
 * @param {TrespasserCompanionSheet} sheet
 * @param {Object} options
 * @returns {Object} Template context
 */
export async function getCompanionData(sheet, options = {}) {
  const actor = sheet.actor;
  const context = {
    actor,
    system: actor.system,
    flags: actor.flags,
    editable: sheet.isEditable,
    owner: actor.isOwner,
    isGM: game.user.isGM,
  };

  // Bound character info
  const boundChar = actor.system.getBoundCharacter();
  context.boundCharacter = boundChar;
  context.boundCharacterName = boundChar?.name ?? game.i18n.localize("TRESPASSER.Sheet.Companion.NoBoundCharacter");

  // All character actors for the dropdown selector
  context.characterActors = game.actors?.filter(a => a.type === "character").map(a => ({
    id: a.id,
    name: a.name,
    selected: a.id === actor.system.boundCharacterId
  })) ?? [];

  // Active Effects
  context.activeEffects = TrespasserEffectsHelper.getActorEffects(actor);
  context.durationModes = TrespasserEffectsHelper.DURATION_LABELS;

  // Features
  context.features = actor.items.filter(i => i.type === "feature");

  // Deeds processing & grouping for parts/deed-list.hbs
  const allDeeds = actor.items.filter(i => i.type === "deed").map(d => {
    const deedData = d.toObject ? d.toObject(false) : d.toJSON();
    deedData.id = d.id;

    const tier = deedData.system.tier;
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

    return deedData;
  });

  context.deeds = allDeeds;
  context.deedsGrouped = {
    light:   allDeeds.filter(d => d.system.tier === "light"),
    heavy:   allDeeds.filter(d => d.system.tier === "heavy"),
    mighty:  allDeeds.filter(d => d.system.tier === "mighty"),
    special: allDeeds.filter(d => d.system.tier === "special")
  };

  // Effects items
  context.effects = actor.items.filter(i => i.type === "effect");

  // Inventory (non-deed, non-feature, non-effect)
  const specialTypes = ["deed", "feature", "effect"];
  context.inventory = actor.items.filter(i => !specialTypes.includes(i.type));
  context.inventoryUsed = context.inventory.reduce((acc, i) => {
    const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
    return acc + (isNaN(val) ? 1 : val);
  }, 0);
  context.inventoryMax = actor.system.inventory_max ?? 3;

  // Combat Stats
  context.combatStats = {
    hp:         { value: actor.system.health, max: actor.system.max_health, formula: actor.system.formulas.hp },
    speed:      { value: actor.system.combat.speed, formula: actor.system.formulas.speed },
    initiative: { value: actor.system.combat.initiative, formula: actor.system.formulas.initiative },
    accuracy:   { value: actor.system.combat.accuracy, formula: actor.system.formulas.accuracy },
    guard:      { value: actor.system.combat.guard, formula: actor.system.formulas.guard },
    resist:     { value: actor.system.combat.resist, formula: actor.system.formulas.resist },
    prevail:    { value: actor.system.combat.prevail, formula: actor.system.formulas.prevail },
  };

  // Passive states
  context.passiveStates = [
    {
      key: "bloody",
      label: "TRESPASSER.State.Bloody.Label",
      description: "TRESPASSER.State.Bloody.Description",
      icon: "systems/trespasser/assets/icons/bloody.webp",
      active: actor.system.health < (actor.system.max_health / 2)
    }
  ];

  // Tabs
  context.tabs = {
    companion: { id: "companion", label: "TRESPASSER.Sheet.Companion.TabCompanion", active: true },
    deeds:     { id: "deeds",     label: "TRESPASSER.Sheet.Companion.TabDeeds" },
    effects:   { id: "effects",   label: "TRESPASSER.Sheet.Companion.TabEffects" },
    notes:     { id: "notes",     label: "TRESPASSER.Sheet.Companion.TabNotes" },
  };

  const activeTab = sheet.tabGroups?.primary ?? "companion";
  for (const [key, tab] of Object.entries(context.tabs)) {
    tab.active = key === activeTab;
  }

  return context;
}
