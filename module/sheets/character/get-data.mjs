/**
 * Character Sheet — getData helper
 * Exports: getCharacterData(sheet, options)
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

export async function getCharacterData(sheet, options = {}) {
  const context = await foundry.appv1.sheets.ActorSheet.prototype.getData.call(sheet, options);
  const actor   = sheet.actor;
  context.system = actor.system;
  context.flags  = actor.flags;

  // Categorize effects using helper
  context.activeEffects = TrespasserEffectsHelper.getActorEffects(actor);
  context.durationModes = TrespasserEffectsHelper.DURATION_LABELS;

  // Skill labels for the sheet
  const skills = context.system.skills || {};
  context.skillList = Object.entries(skills).map(([key, value]) => ({
    key,
    label: game.i18n.localize(`TRESPASSER.Sheet.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`),
    value,
  }));

  // Calculate total attributes and combat stats including effect bonuses
  const bonuses = context.system.bonuses || {};
  context.totalAttributes = {};
  for (const attr of ["mighty", "agility", "intellect", "spirit"]) {
    const base = context.system.attributes[attr] ?? 0;
    const bon  = bonuses[attr] ?? 0;
    const eff  = TrespasserEffectsHelper.getAttributeBonus(actor, attr, "use");
    context.totalAttributes[attr] = base + bon + eff;
  }

  context.totalCombat = {};
  const combatStats = ["initiative", "accuracy", "guard", "resist", "prevail", "tenacity", "focus", "speed"];
  for (const stat of combatStats) {
    const base = context.system.combat[stat] ?? 0;
    const eff  = TrespasserEffectsHelper.getAttributeBonus(actor, stat, "use");
    context.totalCombat[stat] = base + eff;
  }

  // Fixed 3-slot craft array
  const crafts = context.system.crafts ?? [];
  context.craftsSlots = [crafts[0] ?? "", crafts[1] ?? "", crafts[2] ?? ""];

  // Always show exactly 2 alignment rows
  const emptyAlignment = () => ({ name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] });
  const rawAlignment   = Array.isArray(context.system.alignment) ? context.system.alignment : [];
  context.system.alignment = [
    (rawAlignment[0] && typeof rawAlignment[0] === "object") ? rawAlignment[0] : emptyAlignment(),
    (rawAlignment[1] && typeof rawAlignment[1] === "object") ? rawAlignment[1] : emptyAlignment()
  ];

  const injuryItems = actor.items.filter(i => i.type === "injury");
  for (const inj of injuryItems) {
    const total  = Math.max(2, inj.system.injuryClock);
    const filled = Math.min(inj.system.currentClock, total);
    inj.clockSegments = buildClockSegments(total, filled);
  }
  context.injurySlots = [injuryItems[0] ?? null, injuryItems[1] ?? null, injuryItems[2] ?? null];
  context.injuryCount = injuryItems.length;

  // Items by category
  context.features  = actor.items.filter(i => i.type === "feature");
  context.talents   = actor.items.filter(i => i.type === "talent").map(t => {
    const talentData = t.toObject ? t.toObject(false) : t.toJSON();
    talentData.id = t.id;
    const baseCost  = talentData.system.focusCost || 0;
    const bonusCost = talentData.system.bonusCost || 0;
    talentData.displayCost = baseCost + bonusCost;
    const callingSource = t.flags?.trespasser?.callingSource;
    if (callingSource) talentData.callingSource = callingSource;
    return talentData;
  });
  context.incantations = actor.items.filter(i => i.type === "incantation");

  // Actions and Reactions for Combat Tab
  const combatActions = [];
  const combatReactions = [];

  context.features.forEach(f => {
    if (f.system.type === "action") combatActions.push(f);
    else if (f.system.type === "reaction") combatReactions.push(f);
  });

  context.talents.forEach(t => {
    if (t.system.type === "action") combatActions.push(t);
    else if (t.system.type === "reaction") combatReactions.push(t);
  });

  context.combatActions = combatActions;
  context.combatReactions = combatReactions;
  context.hasCombatActionsOrReactions = combatActions.length > 0 || combatReactions.length > 0;

  const sourceMapByUuid = {};
  for (const item of actor.items) {
    if (item.type === "feature") {
      (item.system.deeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
      (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    } else if (item.type === "weapon" && item.system.equipped) {
      (item.system.extraDeeds || []).forEach(d => { if (d.uuid) sourceMapByUuid[d.uuid] = item.name; });
      (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
      (item.system.enhancementEffects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    } else if (item.type === "armor" && item.system.equipped) {
      (item.system.effects || []).forEach(e => { if (e.uuid) sourceMapByUuid[e.uuid] = item.name; });
    }
    const callingSource = item.flags?.trespasser?.callingSource;
    if (callingSource) item.callingSource = callingSource;
  }

  // Group deeds by tier
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
    const uses      = deedData.system.uses || 0;
    deedData.displayCost = baseCost + bonusCost;
    deedData.showCost    = deedData.displayCost > 0;
    deedData.hasUses     = costIncrease > 0;

    if (deedData.hasUses) {
      deedData.usesCheckboxes = Array.from({ length: 3 }, (_, i) => ({ index: i + 1, checked: i < uses }));
    }

    const linkedSource = d.flags?.trespasser?.linkedSource;
    if (linkedSource && sourceMapByUuid[linkedSource]) {
      deedData.sourceName = sourceMapByUuid[linkedSource];
    }

    return deedData;
  });

  context.deedsGrouped = {
    light:   allDeeds.filter(d => d.system.tier === "light"),
    heavy:   allDeeds.filter(d => d.system.tier === "heavy"),
    mighty:  allDeeds.filter(d => d.system.tier === "mighty"),
    special: allDeeds.filter(d => d.system.tier === "special")
  };
  context.deeds = allDeeds;

  // Inventory
  const allInventoryItems = actor.items.filter(i =>
    !["deed", "feature", "talent", "incantation", "effect", "state", "injury"].includes(i.type)
  );
  context.unequippedItems = allInventoryItems.filter(i => !i.system.equipped);
  context.equippedItems   = allInventoryItems.filter(i => i.system.equipped);

  const totalOccupancy = context.unequippedItems.reduce((acc, i) => {
    const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
    return acc + (isNaN(val) ? 1 : val);
  }, 0);
  context.inventorySlotsUsed = totalOccupancy % 1 === 0 ? totalOccupancy : totalOccupancy.toFixed(1);
  context.inventory = context.unequippedItems;

  // Equipped Armor
  context.equippedArmor = {};
  const armorSlots = ["head", "body", "arms", "legs", "outer", "shield"];
  for (const slot of armorSlots) {
    const item = actor.items.find(i => (i.type === "armor" || (i.type === "item" && i.system.equippable)) && i.system.equipped && i.system.placement === slot);
    if (item) {
        if (item.type === "armor") {
            item.effectSummary = (item.system.effects || []).map(e => e.name).join(", ") || "—";
        } else {
            // Generic item effect summary
            item.effectSummary = [
                ...(item.system.talents  || []).map(e => e.name),
                ...(item.system.features || []).map(e => e.name),
                ...(item.system.deeds    || []).map(e => e.name),
                ...(item.system.effects  || []).map(e => e.name),
                ...(item.system.incantations || []).map(e => e.name)
            ].join(", ") || "—";
        }
    }
    context.equippedArmor[slot] = item || null;
  }

  // Equipped Accessories
  context.equippedAccessories = {};
  const accessorySlots = ["amulet", "ring", "talisman"];
  for (const slot of accessorySlots) {
    const item = actor.items.find(i => (i.type === "accessory" || (i.type === "item" && i.system.equippable)) && i.system.equipped && i.system.placement === slot);
    if (item) {
      item.effectSummary = [
        ...(item.system.talents  || []).map(e => e.name),
        ...(item.system.features || []).map(e => e.name),
        ...(item.system.deeds    || []).map(e => e.name),
        ...(item.system.effects  || []).map(e => e.name),
        ...(item.system.incantations || []).map(e => e.name)
      ].join(", ") || "—";
    }
    context.equippedAccessories[slot] = item || null;
  }

  // Equipped Weapons
  const mainHandId = context.system.equipment?.main_hand;
  const offHandId  = context.system.equipment?.off_hand;
  context.equippedWeapon = {
    main_hand: mainHandId ? actor.items.get(mainHandId) : null,
    off_hand:  offHandId  ? actor.items.get(offHandId)  : null
  };

  if (context.equippedWeapon.main_hand) {
    const item = context.equippedWeapon.main_hand;
    item.effectSummary = [
      ...(item.system.effects || []).map(e => e.name),
      ...(item.system.enhancementEffects || []).map(e => e.name),
      ...(item.system.talents || []).map(e => e.name),
      ...(item.system.features || []).map(e => e.name),
      ...(item.system.deeds    || []).map(e => e.name),
      ...(item.system.incantations || []).map(e => e.name)
    ].join(", ") || "—";
  }
  if (context.equippedWeapon.off_hand) {
    const item = context.equippedWeapon.off_hand;
    item.effectSummary = [
      ...(item.system.effects || []).map(e => e.name),
      ...(item.system.enhancementEffects || []).map(e => e.name),
      ...(item.system.talents || []).map(e => e.name),
      ...(item.system.features || []).map(e => e.name),
      ...(item.system.deeds    || []).map(e => e.name),
      ...(item.system.incantations || []).map(e => e.name)
    ].join(", ") || "—";
  }

  context.inventoryMax = context.system.inventory_max ?? 5;

  // Weapon Modes
  const weaponModes = [];
  const mainWeapon = context.equippedWeapon.main_hand?.type === "weapon" ? context.equippedWeapon.main_hand : null;
  const offWeapon  = context.equippedWeapon.off_hand?.type  === "weapon" ? context.equippedWeapon.off_hand  : null;

  if (mainWeapon && offWeapon && mainWeapon.id === offWeapon.id) {
    weaponModes.push({ key: "main", label: `${game.i18n.localize("TRESPASSER.Sheet.Combat.TwoHanded")}: ${mainWeapon.name}` });
  } else {
    if (mainWeapon) weaponModes.push({ key: "main", label: `${game.i18n.localize("TRESPASSER.Sheet.Combat.MainHand")}: ${mainWeapon.name}` });
    if (offWeapon)  weaponModes.push({ key: "off",  label: `${game.i18n.localize("TRESPASSER.Sheet.Combat.OffHand")}: ${offWeapon.name}` });
    if (mainWeapon && offWeapon) weaponModes.push({ key: "dual", label: game.i18n.localize("TRESPASSER.Sheet.Combat.DualWield") });
  }
  context.weaponModes = weaponModes;

  // Active Weapon Snapshot
  let activeWeapon = { die: "—", effect: "—", name: "—" };
  const mode = context.system.combat.weaponMode || "main";

  if (mode === "dual" && mainWeapon && offWeapon) {
    const mainDie = mainWeapon.system.weaponDie || "d4";
    const offDie  = offWeapon.system.weaponDie  || "d4";
    const mainDieValue = parseInt(String(mainDie).replace("d", "")) || 0;
    const offDieValue  = parseInt(String(offDie).replace("d", ""))  || 0;
    activeWeapon.die    = mainDieValue >= offDieValue ? mainDie : offDie;
    activeWeapon.name   = `${mainWeapon.name} & ${offWeapon.name}`;
    activeWeapon.effect = `${mainWeapon.effectSummary} / ${offWeapon.effectSummary}`;
  } else if (mode === "off" && offWeapon) {
    activeWeapon.die    = offWeapon.system.weaponDie;
    activeWeapon.name   = offWeapon.name;
    activeWeapon.effect = offWeapon.effectSummary;
  } else if (mainWeapon) {
    activeWeapon.die    = mainWeapon.system.weaponDie;
    activeWeapon.name   = mainWeapon.name;
    activeWeapon.effect = mainWeapon.effectSummary;
  } else if (offWeapon) {
    activeWeapon.die    = offWeapon.system.weaponDie;
    activeWeapon.name   = offWeapon.name;
    activeWeapon.effect = offWeapon.effectSummary;
  }
  context.activeWeapon = activeWeapon;

  context.keyAttribute = context.system.key_attribute ?? "mighty";

  return context;
}

/**
 * Build SVG clock segment paths for an injury item.
 * Exported so handlers-misc can reuse it.
 */
export function buildClockSegments(total, filled) {
  const cx = 50, cy = 50, r = 44;
  const segments = [];
  const angleStep  = (2 * Math.PI) / total;
  const startOffset = -Math.PI / 2;

  for (let i = 0; i < total; i++) {
    const a1 = startOffset + i * angleStep;
    const a2 = startOffset + (i + 1) * angleStep;
    const gap = 0.06;
    const x4 = (cx + r * Math.cos(a1 + gap)).toFixed(2);
    const y4 = (cy + r * Math.sin(a1 + gap)).toFixed(2);
    const x3 = (cx + r * Math.cos(a2 - gap)).toFixed(2);
    const y3 = (cy + r * Math.sin(a2 - gap)).toFixed(2);
    const largeArc = (a2 - a1) > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x4} ${y4} A ${r} ${r} 0 ${largeArc} 1 ${x3} ${y3} Z`;
    segments.push({ path, filled: i < filled });
  }
  return segments;
}
