import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { PASSIVE_STATES } from "../../config/state-config.mjs";
import { EngagementHelper } from "../../helpers/engagement-helper.mjs";
import { prepareDeedDisplayData } from "../../helpers/deed-display-helper.mjs";

/**
 * Data preparation for TrespasserCompanionSheet.
 * @param {TrespasserCompanionSheet} sheet
 * @param {Object} options
 * @returns {Object} Template context
 */
export async function getCompanionData(sheet, options = {}) {
  const actor = sheet.actor;
  actor.prepareData?.();

  const context = {
    actor,
    system: actor.system,
    flags: actor.flags,
    editable: sheet.isEditable,
    owner: actor.isOwner,
    isGM: game.user.isGM,
    showInitiativeStat: (actor.system.initiativeMode ?? "follow") === "roll",
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

  // Build source map for features/effects
  const sourceMapByUuid = {};
  for (const item of actor.items) {
    if (item.type === "feature") {
      (item.system.deeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
      (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    }
  }

  // Deeds processing & grouping for parts/deed-list.hbs
  const allDeeds = actor.items.filter(i => i.type === "deed").map(d => {
    return prepareDeedDisplayData(d, sourceMapByUuid);
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

  // Inventory & Equipment (non-deed, non-feature, non-effect, non-state)
  const specialTypes = ["deed", "feature", "effect", "state"];
  const physicalItems = actor.items.filter(i => !specialTypes.includes(i.type));

  context.equippedItems = physicalItems.filter(i => i.system?.equipped);
  context.inventory = physicalItems.filter(i => !i.system?.equipped);
  context.unequippedItems = context.inventory;

  const totalOccupancy = context.inventory.reduce((acc, i) => {
    const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
    return acc + (isNaN(val) ? 1 : val);
  }, 0);
  context.inventoryUsed = totalOccupancy % 1 === 0 ? totalOccupancy : totalOccupancy.toFixed(1);
  context.inventoryMax = actor.system.inventory_max ?? 3;

  // Specific hand slots & other equipped gear
  const eq = actor.system.equipment ?? {};
  const mainHandItem = eq.main_hand ? actor.items.get(eq.main_hand) : null;
  const offHandItem  = eq.off_hand ? actor.items.get(eq.off_hand) : null;
  const isTwoHanded  = mainHandItem?.type === "weapon" ? !!mainHandItem.system.properties?.twoHanded : false;

  context.equippedMainHand = mainHandItem;
  context.equippedOffHand  = offHandItem;
  context.isTwoHanded      = isTwoHanded;
  context.otherEquipped    = context.equippedItems.filter(i => i.id !== mainHandItem?.id && i.id !== offHandItem?.id);

  // Engagement Range in squares
  context.engagementRange = EngagementHelper.getActorEngagementRange(actor);

  // Transfer Target check
  const targets = game.user?.targets;
  if (targets?.size === 1) {
    const targetToken = targets.first();
    const targetActor = targetToken.actor;
    if (targetActor) {
      if (targetActor.type === "haven") {
        context.transferTarget = {
          id: targetActor.id,
          name: targetActor.name,
          type: "haven"
        };
      } else if (targetActor.id !== actor.id) {
        context.transferTarget = {
          id: targetActor.id,
          name: targetActor.name,
          type: targetActor.type
        };
      }
    }
  }

  // Combat Stats
  context.combatStats = {
    level:       { value: actor.system.level, formula: actor.system.formulas?.level },
    skill_die:   { value: actor.system.skill_die, formula: actor.system.formulas?.skill_die || actor.system.formulas?.damageDie },
    damageDie:   { value: actor.system.skill_die, formula: actor.system.formulas?.skill_die || actor.system.formulas?.damageDie },
    hp:          { value: actor.system.health, max: actor.system.max_health, formula: actor.system.formulas?.hp },
    speed:       { value: actor.system.combat.speed, formula: actor.system.formulas?.speed },
    speed_bonus: { value: actor.system.combat.speed_bonus, formula: actor.system.formulas?.speed_bonus },
    initiative:  { value: actor.system.combat.initiative, formula: actor.system.formulas?.initiative },
    accuracy:    { value: actor.system.combat.accuracy, formula: actor.system.formulas?.accuracy },
    guard:       { value: actor.system.combat.guard, formula: actor.system.formulas?.guard },
    resist:      { value: actor.system.combat.resist, formula: actor.system.formulas?.resist },
    prevail:     { value: actor.system.combat.prevail, formula: actor.system.formulas?.prevail },
  };

  // Passive states
  const isEngaged = EngagementHelper.isActorEngaged(actor);
  context.passiveStates = Object.entries(PASSIVE_STATES)
    .map(([key, cfg]) => ({
      key,
      active: key === "engaged" 
        ? isEngaged 
        : (actor.system.passiveStates?.[key] ?? (key === "bloody" ? actor.system.health < (actor.system.max_health / 2) : false)),
      icon: cfg.icon,
      label: cfg.label,
      description: cfg.description
    }))
    .filter(s => s.key !== "encumbered");

  // Tabs: Combat, Inventory, Notes
  context.tabs = {
    combat:    { id: "combat",    label: "TRESPASSER.Sheet.Tabs.Combat", active: true },
    inventory: { id: "inventory", label: "TRESPASSER.Sheet.Tabs.Inventory" },
    notes:     { id: "notes",     label: "TRESPASSER.Sheet.Tabs.Notes" },
  };

  const activeTab = sheet.tabGroups?.primary ?? "combat";
  for (const [key, tab] of Object.entries(context.tabs)) {
    tab.active = key === activeTab;
  }

  // Enriched notes for ProseMirror editor
  context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.notes ?? "", {
    secrets: actor.isOwner,
    async: true,
    relativeTo: actor
  });

  return context;
}
