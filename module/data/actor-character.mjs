import { TrespasserCombatantData } from "./actor-combatant.mjs";
import { DEFAULT_PROGRESSION_TABLE } from "./progression-default.mjs";

/**
 * Data model for the Trespasser TTRPG Character actor type.
 * Extends TrespasserCombatantData with Calling progression, Resolve, Skills, States, and Deed capacity.
 */
export class TrespasserCharacterData extends TrespasserCombatantData {

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),

      // Identity
      calling: new fields.StringField({ required: true, blank: true }),
      crafts: new fields.ArrayField(new fields.StringField()),
      lineage: new fields.StringField({ blank: true }),
      past_life: new fields.StringField({ blank: true }),
      alignment: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ blank: true }),
        leftBoxes: new fields.ArrayField(new fields.BooleanField({ initial: false }), { initial: [false, false, false] }),
        rightBoxes: new fields.ArrayField(new fields.BooleanField({ initial: false }), { initial: [false, false, false] }),
      }), { initial: [
        { name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] },
        { name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] }
      ]}),

      // Character-specific Progression
      xp: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      xp_to_next_level: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      resolve: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Skills (boolean proficiencies)
      skills: new fields.SchemaField({
        acrobatics: new fields.BooleanField({ initial: false }),
        alchemy: new fields.BooleanField({ initial: false }),
        athletics: new fields.BooleanField({ initial: false }),
        crafting: new fields.BooleanField({ initial: false }),
        folklore: new fields.BooleanField({ initial: false }),
        letters: new fields.BooleanField({ initial: false }),
        magic: new fields.BooleanField({ initial: false }),
        nature: new fields.BooleanField({ initial: false }),
        perception: new fields.BooleanField({ initial: false }),
        speech: new fields.BooleanField({ initial: false }),
        stealth: new fields.BooleanField({ initial: false }),
        tinkering: new fields.BooleanField({ initial: false }),
      }),

      // States intensity tracking
      states: new fields.SchemaField({
        guarded: new fields.NumberField({ integer: true, initial: 0 }),
        fortified: new fields.NumberField({ integer: true, initial: 0 }),
        willfull: new fields.NumberField({ integer: true, initial: 0 }),
        hastened: new fields.NumberField({ integer: true, initial: 0 }),
        mending: new fields.NumberField({ integer: true, initial: 0 }),
        accurate: new fields.NumberField({ integer: true, initial: 0 }),
        strong: new fields.NumberField({ integer: true, initial: 0 }),
        swift: new fields.NumberField({ integer: true, initial: 0 }),
        bleeding: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        blinded: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        burning: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        delirious: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        sleeping: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        toppled: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      }),

      injuries: new fields.ArrayField(new fields.StringField()),

      // Deeds capacity
      deed_slots: new fields.SchemaField({
        light: new fields.NumberField({ integer: true, initial: 0 }),
        heavy: new fields.NumberField({ integer: true, initial: 0 }),
        mighty: new fields.NumberField({ integer: true, initial: 0 }),
        special: new fields.NumberField({ integer: true, initial: 0 }),
      }),
      deed_max: new fields.SchemaField({
        light: new fields.NumberField({ integer: true, initial: 6 }),
        heavy: new fields.NumberField({ integer: true, initial: 4 }),
        mighty: new fields.NumberField({ integer: true, initial: 4 }),
        special: new fields.NumberField({ integer: true, initial: 2 }),
      }),
      attribute_points_spent: new fields.NumberField({ integer: true, initial: 0 }),
      attribute_points_max: new fields.NumberField({ integer: true, initial: 0 }),
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    const actor = this.parent;
    const level = this.level;

    // --- Progression Table Access ---
    const callingItem = actor.items?.find(i => i.type === "calling");
    const progression = callingItem?.system?.progression || DEFAULT_PROGRESSION_TABLE;
    const currentTableData = progression[Math.min(level, progression.length - 1)];

    // 1. Progression Advancement
    this.xp_to_next_level = currentTableData?.xp ?? (level >= 9 || level === 0 ? 0 : (level + 1) * 10);
    this.skill = currentTableData?.skillBonus ?? (2 + Math.floor(level / 3));
    this.skill_die = currentTableData?.skillDie || "d6";

    // 2. Resources (using total attributes including bonuses)
    const baseHP = currentTableData?.hp || ((level + 1) * 5);
    const totalMighty = (this.attributes.mighty || 0) + (this.bonuses.mighty || 0);
    const totalSpirit = (this.attributes.spirit || 0) + (this.bonuses.spirit || 0);

    this.max_health = baseHP + (level + 1) * totalMighty + (this.bonuses.max_health || 0);
    this.max_endurance = 10 + totalSpirit + (this.bonuses.max_endurance || 0);
    this.max_recovery_dice = this.max_endurance;

    // 3. Combat Derived Stats (Totals including bonuses)
    const keyAttrValue = (this.attributes[this.key_attribute] ?? this.attributes.mighty ?? 0) + (this.bonuses[this.key_attribute] || 0);
    const totalAgility = (this.attributes.agility || 0) + (this.bonuses.agility || 0);
    const totalIntellect = (this.attributes.intellect || 0) + (this.bonuses.intellect || 0);

    this.combat.initiative = totalAgility + this.skill + (this.bonuses.initiative || 0);
    this.combat.accuracy = keyAttrValue + this.skill + (this.bonuses.accuracy || 0);
    this.combat.guard = totalAgility + this.armor + (this.bonuses.guard || 0);
    this.combat.resist = totalSpirit + this.skill + (this.bonuses.resist || 0);
    this.combat.prevail = totalIntellect + this.skill + (this.bonuses.prevail || 0);
    this.combat.tenacity = totalMighty + totalSpirit + (this.bonuses.tenacity || 0);
    this.combat.speed = 5 + (this.bonuses.speed || 0);
    this.combat.speed_bonus = Math.max(totalAgility, 2) + (this.bonuses.speed_bonus || 0);
    this.combat.focus = (this.combat.focus || 0) + (this.bonuses.focus || 0);

    // 4. Passive States
    const isDefeated = Boolean(
      actor?.statuses?.has("defeated") ||
      actor?.statuses?.has(CONFIG.specialStatusEffects?.DEFEATED) ||
      actor?.items?.some(i => i.type === "effect" && (i.getFlag("trespasser", "statusEffectId") === "defeated" || i.name?.toLowerCase() === "defeated"))
    );

    this.passiveStates.tenacious = (this.health <= 0) && !isDefeated;

    // Encumbrance: armor rating (from equipped armor pieces, before effect bonuses) >= 6
    let equippedArmorRating = 0;
    if (actor && actor.items) {
      const equippedArmor = actor.items.filter(i => i.type === "armor" && i.system?.equipped);
      equippedArmorRating = equippedArmor.reduce((acc, item) => acc + (item.system?.armorRating || 0), 0);
    }
    this.passiveStates.encumbered = equippedArmorRating >= 6;

    const applyEncumbranceRules = game.settings?.get?.("trespasser", "applyEncumbranceRules");
    if (this.passiveStates.encumbered && applyEncumbranceRules) {
      this.combat.guard = this.armor + (this.bonuses.guard || 0);
      this.combat.speed_bonus = 2 + (this.bonuses.speed_bonus || 0);
    }

    // 5. Deeds Capacity
    this.deed_slots.light = 0;
    this.deed_slots.heavy = 0;
    this.deed_slots.mighty = 0;
    this.deed_slots.special = 0;

    if (actor && actor.items) {
      actor.items.forEach(item => {
        if (item.type === "deed") {
          const tier = item.system?.tier;
          if (this.deed_slots[tier] !== undefined) {
            this.deed_slots[tier]++;
          }
        }
      });
    }

    this.inventory_max = 5 + (this.attributes.mighty || 0);
    if (this.hasPlight("enfeebled")) {
      this.inventory_max = Math.floor(this.inventory_max / 2);
    }

    // 6. Deed Max and Attribute Points
    this.deed_max.light = currentTableData?.deedsLight ?? 6;
    this.deed_max.heavy = currentTableData?.deedsHeavy ?? 4;
    this.deed_max.mighty = currentTableData?.deedsMighty ?? 4;
    this.attribute_points_max = currentTableData?.attributePoints ?? 0;
  }
}
