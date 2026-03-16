import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { DEFAULT_PROGRESSION_TABLE } from "./progression-default.mjs";
/**
 * Data model for the Trespasser TTRPG Character actor type.
 */
export class TrespasserCharacterData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Identity
      calling:   new fields.StringField({ required: true, blank: true }),
      crafts:    new fields.ArrayField(new fields.StringField()),
      lineage:   new fields.StringField({ blank: true }),
      past_life: new fields.StringField({ blank: true }),
      alignment: new fields.ArrayField(new fields.SchemaField({
        name:       new fields.StringField({ blank: true }),
        leftBoxes:  new fields.ArrayField(new fields.BooleanField({ initial: false }), { initial: [false, false, false] }),
        rightBoxes: new fields.ArrayField(new fields.BooleanField({ initial: false }), { initial: [false, false, false] }),
      }), { initial: [
        { name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] },
        { name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] }
      ]}),

      // Progression
      xp:               new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      xp_to_next_level: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      skill:            new fields.NumberField({ required: true, integer: true, initial: 2, min: 0 }),
      skill_die:        new fields.StringField({ initial: "d6" }),
      key_attribute:    new fields.StringField({ initial: "mighty", choices: ["mighty", "agility", "intellect", "spirit"] }),
      level:            new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 9 }),

      // Resources
      health:              new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      max_health:          new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      recovery_dice:       new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      max_recovery_dice:   new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      endurance:           new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      max_endurance:       new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      resolve:             new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Core Attributes
      attributes: new fields.SchemaField({
        mighty:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        agility:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        intellect: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spirit:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      }),

      // Skills (boolean toggles)
      skills: new fields.SchemaField({
        acrobatics: new fields.BooleanField({ initial: false }),
        alchemy:    new fields.BooleanField({ initial: false }),
        athletics:  new fields.BooleanField({ initial: false }),
        crafting:   new fields.BooleanField({ initial: false }),
        folklore:   new fields.BooleanField({ initial: false }),
        letters:    new fields.BooleanField({ initial: false }),
        magic:      new fields.BooleanField({ initial: false }),
        nature:     new fields.BooleanField({ initial: false }),
        perception: new fields.BooleanField({ initial: false }),
        speech:     new fields.BooleanField({ initial: false }),
        stealth:    new fields.BooleanField({ initial: false }),
        tinkering:  new fields.BooleanField({ initial: false }),
      }),

      // States
      states: new fields.SchemaField({
        guarded:   new fields.NumberField({ integer: true, initial: 0 }),
        fortified: new fields.NumberField({ integer: true, initial: 0 }),
        willfull:  new fields.NumberField({ integer: true, initial: 0 }),
        hastened:  new fields.NumberField({ integer: true, initial: 0 }),
        mending:   new fields.NumberField({ integer: true, initial: 0 }),
        accurate:  new fields.NumberField({ integer: true, initial: 0 }),
        strong:    new fields.NumberField({ integer: true, initial: 0 }),
        swift:     new fields.NumberField({ integer: true, initial: 0 }),
        bleeding:  new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        blinded:   new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        burning:   new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        delirious: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        sleeping:  new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        toppled:   new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      }),

      injuries: new fields.ArrayField(new fields.StringField()),

      // Equipment slots
      equipment: new fields.SchemaField({
        head:      new fields.StringField({ blank: true }),
        arms:      new fields.StringField({ blank: true }),
        body:      new fields.StringField({ blank: true }),
        legs:      new fields.StringField({ blank: true }),
        outer:     new fields.StringField({ blank: true }),
        shield:    new fields.StringField({ blank: true }),
        main_hand: new fields.StringField({ blank: true }),
        off_hand:  new fields.StringField({ blank: true }),
        // Accessories with name and die
        amulet:    new fields.StringField({ blank: true }),
        ring:      new fields.StringField({ blank: true }),
        talisman:  new fields.StringField({ blank: true }),
      }),

      armor: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      armorDieAmmount: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Derived combat stats
      combat: new fields.SchemaField({
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        accuracy:   new fields.NumberField({ integer: true, initial: 0 }),
        guard:      new fields.NumberField({ integer: true, initial: 0 }),
        resist:     new fields.NumberField({ integer: true, initial: 0 }),
        prevail:    new fields.NumberField({ integer: true, initial: 0 }),
        tenacity:   new fields.NumberField({ integer: true, initial: 0 }),
        focus:      new fields.NumberField({ integer: true, initial: 0 }),
        speed:      new fields.NumberField({ integer: true, initial: 5 }),
        weaponMode: new fields.StringField({ initial: "main", choices: ["main", "off", "dual"] }),
        equipment_snapshot: new fields.SchemaField({
          head:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          arms:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          body:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          legs:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          outer:  new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          shield: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          weapon: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          off_hand: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
        })
      }),

      inventory_max: new fields.NumberField({ integer: true, initial: 5 }),

      // Dynamic Bonuses (derived)
      bonuses: new fields.SchemaField({
        mighty:    new fields.NumberField({ integer: true, initial: 0 }),
        agility:   new fields.NumberField({ integer: true, initial: 0 }),
        intellect: new fields.NumberField({ integer: true, initial: 0 }),
        spirit:    new fields.NumberField({ integer: true, initial: 0 }),
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        accuracy:  new fields.NumberField({ integer: true, initial: 0 }),
        guard:     new fields.NumberField({ integer: true, initial: 0 }),
        resist:    new fields.NumberField({ integer: true, initial: 0 }),
        prevail:   new fields.NumberField({ integer: true, initial: 0 }),
        tenacity:  new fields.NumberField({ integer: true, initial: 0 }),
        speed:     new fields.NumberField({ integer: true, initial: 0 }),
        armor:     new fields.NumberField({ integer: true, initial: 0 }),
        health:    new fields.NumberField({ integer: true, initial: 0 }),
        max_health:new fields.NumberField({ integer: true, initial: 0 }),
        endurance: new fields.NumberField({ integer: true, initial: 0 }),
        max_endurance: new fields.NumberField({ integer: true, initial: 0 }),
        damage:    new fields.NumberField({ integer: true, initial: 0 }),
      }),

      // Deeds capacity
      deed_slots: new fields.SchemaField({
        light:   new fields.NumberField({ integer: true, initial: 0 }),
        heavy:   new fields.NumberField({ integer: true, initial: 0 }),
        mighty:  new fields.NumberField({ integer: true, initial: 0 }),
        special: new fields.NumberField({ integer: true, initial: 0 }),
      }),
      deed_max: new fields.SchemaField({
        light:   new fields.NumberField({ integer: true, initial: 6 }),
        heavy:   new fields.NumberField({ integer: true, initial: 4 }),
        mighty:  new fields.NumberField({ integer: true, initial: 4 }),
        special: new fields.NumberField({ integer: true, initial: 2 }),
      }),
      attribute_points_spent: new fields.NumberField({ integer: true, initial: 0 }),
      attribute_points_max:   new fields.NumberField({ integer: true, initial: 0 }),

      notes: new fields.HTMLField({ initial: "" }),
    };
  }

  /**
   * Compute all derived values.
   */
  prepareDerivedData() {
    const actor  = this.parent;
    const level  = this.level;

    // --- Progression Table Access ---
    const callingItem = actor.items.find(i => i.type === "calling");
    const progression = callingItem?.system?.progression || DEFAULT_PROGRESSION_TABLE;
    const currentTableData = progression[Math.min(level, progression.length - 1)];

    // 1. Progression Advancement (Needs to happen before bonuses if effects use <sb>)
    this.xp_to_next_level = currentTableData.xp || (level * 10);
    this.skill = currentTableData.skillBonus || (2 + Math.floor(level / 3));

    // 2. Fetch and store Effect Bonuses in the document field
    const allTrackedKeys = [
      "mighty", "agility", "intellect", "spirit",
      "initiative", "accuracy", "guard", "resist", "prevail", "tenacity", "speed",
      "armor", "health", "max_health", "endurance", "max_endurance", "damage", "focus"
    ];
    for (const key of allTrackedKeys) {
      this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
    }
    // 2. Resources (using total attributes including bonuses)
    const baseHP = currentTableData.hp || ((level + 1) * 5);
    const totalMighty = this.attributes.mighty + this.bonuses.mighty;
    const totalSpirit = this.attributes.spirit + this.bonuses.spirit;

    this.max_health = baseHP + (level + 1) * totalMighty + this.bonuses.max_health;
    this.max_endurance = 10 + totalSpirit + this.bonuses.max_endurance;
    this.max_recovery_dice = this.max_endurance;

    // 3. Armor Calculation from items (base only)
    let totalArmor = 0;
    let armorDieAmmount = 0;
    if (actor && actor.items) {
      const equippedArmor = actor.items.filter(i => i.type === "armor" && i.system.equipped);
      totalArmor = equippedArmor.reduce((acc, item) => acc + (item.system.armorRating || 0), 0);
      armorDieAmmount = equippedArmor.filter(i => !i.system.broken).length;
    }
    this.armor = totalArmor + this.bonuses.armor;
    this.armorDieAmmount = armorDieAmmount;

    // 4. Combat Derived Stats (Totals including bonuses)
    const keyAttrValue = (this.attributes[this.key_attribute] ?? this.attributes.mighty) + this.bonuses[this.key_attribute];
    const totalAgility = this.attributes.agility + this.bonuses.agility;
    const totalIntellect = this.attributes.intellect + this.bonuses.intellect;

    this.combat.initiative = totalAgility + this.skill + this.bonuses.initiative;
    this.combat.accuracy   = keyAttrValue + this.skill + this.bonuses.accuracy;
    this.combat.guard      = totalAgility + this.armor + this.bonuses.guard;
    this.combat.resist     = totalSpirit  + this.skill + this.bonuses.resist;
    this.combat.prevail    = totalIntellect + this.skill + this.bonuses.prevail;
    this.combat.tenacity   = totalMighty  + totalSpirit + this.bonuses.tenacity;
    this.combat.speed      = 5 + this.bonuses.speed;
    this.combat.focus      = this.bonuses.focus; // Base focus usually starts at 0

    // 6. Deeds Capacity
    this.deed_slots.light = 0;
    this.deed_slots.heavy = 0;
    this.deed_slots.mighty = 0;
    this.deed_slots.special = 0;

    if (actor && actor.items) {
      actor.items.forEach(item => {
        if (item.type === "deed") {
          const tier = item.system.tier;
          if (this.deed_slots[tier] !== undefined) {
            this.deed_slots[tier]++;
          }
        }
      });
    }

    this.inventory_max = 5 + this.attributes.mighty;

    // 7. Deed Max and Attribute Points
    this.deed_max.light  = currentTableData.deedsLight  ?? 6;
    this.deed_max.heavy  = currentTableData.deedsHeavy  ?? 4;
    this.deed_max.mighty = currentTableData.deedsMighty ?? 4;
    this.attribute_points_max = currentTableData.attributePoints ?? 0;
  }
}
