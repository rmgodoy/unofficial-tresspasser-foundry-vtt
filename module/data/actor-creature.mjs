import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Data model for the Trespasser TTRPG Creature actor type.
 */
export class TrespasserCreatureData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      role: new fields.StringField({ 
        initial: "guardian", 
        choices: ["archer", "enchanter", "enforcer", "guardian", "harrier", "hellion", "stalker", "sorcerer"] 
      }),
      template: new fields.StringField({ 
        initial: "normal", 
        choices: ["underling", "normal", "paragon", "tyrant"] 
      }),
      health: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      max_health: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),

      // Core Attributes & Combat Values
      speed: new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      guard: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      resist: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      initiative: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      accuracy: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      roll_bonus: new fields.NumberField({ required: true, integer: true, initial: 0 }),

      // Dynamic Bonuses (derived from states/effects)
      bonuses: new fields.SchemaField({
        speed:     new fields.NumberField({ integer: true, initial: 0 }),
        guard:     new fields.NumberField({ integer: true, initial: 0 }),
        resist:    new fields.NumberField({ integer: true, initial: 0 }),
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        health:    new fields.NumberField({ integer: true, initial: 0 }),
        max_health:new fields.NumberField({ integer: true, initial: 0 }),
        damage:    new fields.NumberField({ integer: true, initial: 0 }),
        roll_bonus:new fields.NumberField({ integer: true, initial: 0 })
      }),

      // Internal states
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

      combat: new fields.SchemaField({
        guard: new fields.NumberField({ integer: true, initial: 10 }),
        resist: new fields.NumberField({ integer: true, initial: 10 }),
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        speed: new fields.NumberField({ integer: true, initial: 5 }),
        accuracy: new fields.NumberField({ integer: true, initial: 0 }),
        roll_bonus: new fields.NumberField({ integer: true, initial: 0 })
      })
    };
  }

  /**
   * Compute all derived values.
   */
  prepareDerivedData() {
    const actor  = this.parent;
    const st     = this.states;

    const allTrackedKeys = [
      "speed", "guard", "resist", "initiative", "accuracy", "health", "max_health", "damage", "roll_bonus"
    ]; 

    for (const key of allTrackedKeys) {
      if (typeof TrespasserEffectsHelper.getAttributeBonus === "function") {
        this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
      }
    }

    // Creature 'roll_bonus' usually stands in for its global combat Accuracy for deeds. 
    // If an effect targets 'accuracy', let's apply it to roll_bonus as well for consistency.
    const effectiveRollBonus = this.bonuses.roll_bonus + this.bonuses.accuracy + (st.accurate || 0);

    this.combat.guard = this.guard + (st.guarded || 0) + this.bonuses.guard;
    this.combat.resist = this.resist + (st.willfull || 0) + this.bonuses.resist;
    this.combat.initiative = this.initiative + (st.hastened || 0) + this.bonuses.initiative;
    this.combat.accuracy = this.accuracy + (st.accurate || 0) + this.bonuses.accuracy; 
    this.combat.speed = this.speed + (st.swift || 0) + this.bonuses.speed;
    this.combat.roll_bonus = this.roll_bonus + effectiveRollBonus;
  }
}
