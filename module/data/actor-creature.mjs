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
    // const st     = this.states;

    const allTrackedKeys = [
      "speed", "guard", "resist", "initiative", "accuracy", "health", "max_health", "damage", "roll_bonus"
    ]; 

    for (const key of allTrackedKeys) {
      this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
    }

    // Creature stats stay as pure base values.
    // Summing for display is handled by get-data.mjs or simple helper logic.
    this.combat.guard = this.guard;
    this.combat.resist = this.resist;
    this.combat.initiative = this.initiative;
    this.combat.accuracy = this.accuracy; 
    this.combat.speed = this.speed;
    this.combat.roll_bonus = this.roll_bonus;
  }
}
