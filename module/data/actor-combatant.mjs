import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Base data model for all Trespasser combatant actor types (Character, Commoner, Companion, Creature).
 * Defines the shared superset schema, effect bonus derivation, armor calculation, and common query helpers.
 */
export class TrespasserCombatantData extends foundry.abstract.TypeDataModel {

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      schemaVersion: new fields.NumberField({ integer: true, initial: 1 }),

      // Progression / Level
      level: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      skill: new fields.NumberField({ required: true, integer: true, initial: 2, min: 0 }),
      skill_die: new fields.StringField({ initial: "d6" }),
      key_attribute: new fields.StringField({ initial: "mighty", choices: ["mighty", "agility", "intellect", "spirit"] }),

      // Resources
      health: new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      max_health: new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      endurance: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      max_endurance: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      recovery_dice: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      max_recovery_dice: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Core Attributes
      attributes: new fields.SchemaField({
        mighty: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        agility: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        intellect: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spirit: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      }),

      // Derived Combat Stats & snapshots
      combat: new fields.SchemaField({
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        accuracy: new fields.NumberField({ integer: true, initial: 0 }),
        guard: new fields.NumberField({ integer: true, initial: 0 }),
        resist: new fields.NumberField({ integer: true, initial: 0 }),
        prevail: new fields.NumberField({ integer: true, initial: 0 }),
        tenacity: new fields.NumberField({ integer: true, initial: 0 }),
        focus: new fields.NumberField({ integer: true, initial: 0 }),
        speed: new fields.NumberField({ integer: true, initial: 5 }),
        speed_bonus: new fields.NumberField({ integer: true, initial: 2 }),
        weaponMode: new fields.StringField({ initial: "main", choices: ["main", "off", "dual"] }),
        engagement_range: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
        damage_die: new fields.StringField({ initial: "d6" }),
        weapon_die: new fields.StringField({ initial: "d6" }),
        weaponDie: new fields.StringField({ initial: "d6" }),
        equipment_snapshot: new fields.SchemaField({
          head: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          arms: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          body: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          legs: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          outer: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          shield: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          weapon: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          off_hand: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
        })
      }),

      // Equipment Slots
      equipment: new fields.SchemaField({
        head: new fields.StringField({ blank: true }),
        arms: new fields.StringField({ blank: true }),
        body: new fields.StringField({ blank: true }),
        legs: new fields.StringField({ blank: true }),
        outer: new fields.StringField({ blank: true }),
        shield: new fields.StringField({ blank: true }),
        main_hand: new fields.StringField({ blank: true }),
        off_hand: new fields.StringField({ blank: true }),
        amulet: new fields.StringField({ blank: true }),
        ring: new fields.StringField({ blank: true }),
        talisman: new fields.StringField({ blank: true }),
      }),

      armor: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      armorDieAmmount: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      inventory_max: new fields.NumberField({ integer: true, initial: 5 }),
      notes: new fields.HTMLField({ initial: "" }),

      // Dynamic Bonuses (derived from active effects and states)
      bonuses: new fields.SchemaField({
        mighty: new fields.NumberField({ integer: true, initial: 0 }),
        agility: new fields.NumberField({ integer: true, initial: 0 }),
        intellect: new fields.NumberField({ integer: true, initial: 0 }),
        spirit: new fields.NumberField({ integer: true, initial: 0 }),
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        accuracy: new fields.NumberField({ integer: true, initial: 0 }),
        guard: new fields.NumberField({ integer: true, initial: 0 }),
        resist: new fields.NumberField({ integer: true, initial: 0 }),
        prevail: new fields.NumberField({ integer: true, initial: 0 }),
        tenacity: new fields.NumberField({ integer: true, initial: 0 }),
        focus: new fields.NumberField({ integer: true, initial: 0 }),
        speed: new fields.NumberField({ integer: true, initial: 0 }),
        speed_bonus: new fields.NumberField({ integer: true, initial: 0 }),
        armor: new fields.NumberField({ integer: true, initial: 0 }),
        health: new fields.NumberField({ integer: true, initial: 0 }),
        max_health: new fields.NumberField({ integer: true, initial: 0 }),
        endurance: new fields.NumberField({ integer: true, initial: 0 }),
        max_endurance: new fields.NumberField({ integer: true, initial: 0 }),
        damage: new fields.NumberField({ integer: true, initial: 0 }),
        inventory_max: new fields.NumberField({ integer: true, initial: 0 }),
      }),
    };
  }

  /**
   * Migrate legacy data structures to current combatant schema.
   * @param {object} source
   * @returns {object}
   */
  static migrateData(source) {
    if (!source || typeof source !== "object") return super.migrateData(source);

    // Legacy HP structure migration: { hp: { value, max } } or { hp: 10 }
    if (source.hp !== undefined && source.hp !== null) {
      if (typeof source.hp === "object") {
        if (source.health === undefined && source.hp.value !== undefined) {
          source.health = source.hp.value;
        }
        if (source.max_health === undefined && source.hp.max !== undefined) {
          source.max_health = source.hp.max;
        }
      } else if (typeof source.hp === "number") {
        if (source.health === undefined) source.health = source.hp;
        if (source.max_health === undefined) source.max_health = source.hp;
      }
      delete source.hp;
    }

    if (source.max_hp !== undefined) {
      if (source.max_health === undefined) source.max_health = source.max_hp;
      delete source.max_hp;
    }

    if (source.maxHealth !== undefined) {
      if (source.max_health === undefined) source.max_health = source.maxHealth;
      delete source.maxHealth;
    }

    if (source.inventoryMax !== undefined) {
      if (source.inventory_max === undefined) source.inventory_max = source.inventoryMax;
      delete source.inventoryMax;
    }

    return super.migrateData(source);
  }

  /**
   * Return dictionary of modifiable attribute dot-paths for effect targeting validation.
   * @returns {Record<string, string>}
   */
  static getModifiableAttributes() {
    return {
      "attributes.mighty": "TRESPASSER.Terms.Attribute.Mighty",
      "attributes.agility": "TRESPASSER.Terms.Attribute.Agility",
      "attributes.intellect": "TRESPASSER.Terms.Attribute.Intellect",
      "attributes.spirit": "TRESPASSER.Terms.Attribute.Spirit",
      "combat.initiative": "TRESPASSER.Terms.Combat.Initiative",
      "combat.accuracy": "TRESPASSER.Terms.Combat.Accuracy",
      "combat.guard": "TRESPASSER.Terms.Combat.Guard",
      "combat.resist": "TRESPASSER.Terms.Combat.Resist",
      "combat.prevail": "TRESPASSER.Terms.Combat.Prevail",
      "combat.tenacity": "TRESPASSER.Terms.Combat.Tenacity",
      "combat.focus": "TRESPASSER.Terms.Combat.Focus",
      "combat.speed": "TRESPASSER.Terms.Combat.Speed",
      "combat.speed_bonus": "TRESPASSER.Terms.Combat.SpeedBonus",
      "health": "TRESPASSER.Terms.Combat.Health",
      "max_health": "TRESPASSER.Terms.Combat.MaxHealth",
      "endurance": "TRESPASSER.Terms.Combat.Endurance",
      "max_endurance": "TRESPASSER.Terms.Combat.MaxEndurance",
      "armor": "TRESPASSER.Terms.Combat.Armor",
      "damage": "TRESPASSER.Terms.Combat.Damage",
      "inventory_max": "TRESPASSER.Terms.Attribute.SlotCapacity",
    };
  }

  /**
   * Shared derived data preparation for all combatant types.
   */
  prepareDerivedData() {
    const actor = this.parent;

    // 1. Fetch and store Effect Bonuses in the document field
    const allTrackedKeys = [
      "mighty", "agility", "intellect", "spirit",
      "initiative", "accuracy", "guard", "resist", "prevail", "tenacity", "speed",
      "speed_bonus", "armor", "health", "max_health", "endurance", "max_endurance", "damage", "focus", "elevation",
      "inventory_max"
    ];
    for (const key of allTrackedKeys) {
      if (this.bonuses && key in this.bonuses) {
        this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
      }
    }

    // 2. Armor Calculation from items (base only)
    let totalArmor = 0;
    let armorDieAmmount = 0;
    if (actor && actor.items) {
      const equippedArmor = actor.items.filter(i => i.type === "armor" && i.system?.equipped);
      totalArmor = equippedArmor.reduce((acc, item) => acc + (item.system?.armorRating || 0), 0);
      armorDieAmmount = equippedArmor.filter(i => !i.system?.broken).length;
    }
    this.armor = totalArmor + (this.bonuses?.armor || 0);
    this.armorDieAmmount = armorDieAmmount;

    // 3. Base Passive States
    this.passiveStates = this.passiveStates || {};
    this.passiveStates.bloody = this.health <= (this.max_health / 2);
  }

  /**
   * Check if the actor has a specific common plight.
   * @param {string} plightId - Key from COMMON_PLIGHTS config
   * @returns {boolean}
   */
  hasPlight(plightId) {
    return this.parent?.items?.some(i => i.type === "plight" && i.system?.plightId === plightId) ?? false;
  }

  /**
   * Get all plight items on this actor.
   * @returns {Item[]}
   */
  getPlights() {
    return this.parent?.items?.filter(i => i.type === "plight") || [];
  }
}
