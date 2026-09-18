import { TrespasserCombatantData } from "./actor-combatant.mjs";

/**
 * Data model for the Trespasser TTRPG Creature actor type.
 * Extends TrespasserCombatantData with role, template, and creature stat mappings.
 */
export class TrespasserCreatureData extends TrespasserCombatantData {

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),

      role: new fields.StringField({ 
        initial: "guardian", 
        choices: ["archer", "enchanter", "enforcer", "guardian", "harrier", "hellion", "stalker", "sorcerer"] 
      }),
      template: new fields.StringField({ 
        initial: "normal", 
        choices: ["underling", "normal", "paragon", "tyrant"] 
      }),

      // Flat stat inputs preserved for creature authoring and backward compatibility
      speed: new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      guard: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      resist: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      initiative: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      accuracy: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      prevail: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      engagement_range: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      damage_die: new fields.StringField({ required: true, initial: "d6" }),
      weapon_die: new fields.StringField({ initial: "d6" }),
      weaponDie: new fields.StringField({ initial: "d6" }),
    };
  }

  /**
   * Migrate legacy creature data structures.
   * @param {object} source
   * @returns {object}
   */
  static migrateData(source) {
    if (!source || typeof source !== "object") return super.migrateData(source);

    if (source.damage_die === undefined) {
      if (source.weapon_die !== undefined) source.damage_die = source.weapon_die;
      else if (source.weaponDie !== undefined) source.damage_die = source.weaponDie;
    }

    return super.migrateData(source);
  }

  get skill_die() {
    return this.damage_die || "d6";
  }

  get weapon_die() {
    return this.damage_die || "d6";
  }

  get weaponDie() {
    return this.damage_die || "d6";
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Derived combat stats (including effect bonuses)
    this.combat.guard = (this.guard || 0) + (this.bonuses.guard || 0);
    this.combat.resist = (this.resist || 0) + (this.bonuses.resist || 0);
    this.combat.initiative = (this.initiative || 0) + (this.bonuses.initiative || 0);
    this.combat.accuracy = (this.accuracy || 0) + (this.bonuses.accuracy || 0); 
    this.combat.speed = Math.max(0, (this.speed || 0) + (this.bonuses.speed || 0));
    this.combat.prevail = (this.prevail || 0) + (this.bonuses.prevail || 0);
    this.combat.engagement_range = (this.engagement_range !== undefined && this.engagement_range !== null) ? this.engagement_range : 1;

    const die = this.damage_die || "d6";
    this.combat.damage_die = die;
    this.combat.skill_die = die;
    this.combat.weapon_die = die;
    this.combat.weaponDie = die;
  }
}
