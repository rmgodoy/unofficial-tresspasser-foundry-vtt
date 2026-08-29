import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { buildFormulaContext, evaluateFormula } from "../helpers/companion-formula.mjs";

/**
 * Data model for the Trespasser TTRPG Companion actor type.
 * Companions are player-controlled summons/pets bound to a Character.
 * Their attributes are derived from GM-configurable formulas.
 */
export class TrespasserCompanionData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Identity — bound character reference (Actor ID or UUID)
      boundCharacterId: new fields.StringField({ blank: true }),

      // Level
      level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),

      // Resources
      health:     new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      max_health: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),

      // Damage Die (e.g. "d6", "2d8")
      damageDie: new fields.StringField({ initial: "d6" }),

      // GM-configurable formulas for each attribute
      formulas: new fields.SchemaField({
        hp:         new fields.StringField({ initial: "10+5*(<lvl>)" }),
        speed:      new fields.StringField({ initial: "5" }),
        initiative: new fields.StringField({ initial: "<lvl>" }),
        accuracy:   new fields.StringField({ initial: "<lvl>+<c.skill>" }),
        guard:      new fields.StringField({ initial: "<lvl>+<c.agility>" }),
        resist:     new fields.StringField({ initial: "<lvl>+<c.spirit>" }),
        prevail:    new fields.StringField({ initial: "<lvl>+<c.intellect>" }),
      }),

      // Derived combat stats (computed from formulas in prepareDerivedData)
      combat: new fields.SchemaField({
        speed:       new fields.NumberField({ integer: true, initial: 5 }),
        speed_bonus: new fields.NumberField({ integer: true, initial: 2 }),
        initiative:  new fields.NumberField({ integer: true, initial: 0 }),
        accuracy:    new fields.NumberField({ integer: true, initial: 0 }),
        guard:       new fields.NumberField({ integer: true, initial: 0 }),
        resist:      new fields.NumberField({ integer: true, initial: 0 }),
        prevail:     new fields.NumberField({ integer: true, initial: 0 }),
      }),

      // Dynamic Bonuses (from effects)
      bonuses: new fields.SchemaField({
        speed:       new fields.NumberField({ integer: true, initial: 0 }),
        speed_bonus: new fields.NumberField({ integer: true, initial: 0 }),
        initiative:  new fields.NumberField({ integer: true, initial: 0 }),
        accuracy:    new fields.NumberField({ integer: true, initial: 0 }),
        guard:       new fields.NumberField({ integer: true, initial: 0 }),
        resist:      new fields.NumberField({ integer: true, initial: 0 }),
        prevail:     new fields.NumberField({ integer: true, initial: 0 }),
        health:      new fields.NumberField({ integer: true, initial: 0 }),
        max_health:  new fields.NumberField({ integer: true, initial: 0 }),
        damage:      new fields.NumberField({ integer: true, initial: 0 }),
      }),

      // Inventory capacity (GM-configurable)
      inventory_max: new fields.NumberField({ integer: true, initial: 3 }),

      // Notes
      notes: new fields.HTMLField({ initial: "" }),
    };
  }

  /**
   * Resolve the bound character Actor document.
   * @returns {Actor|null}
   */
  getBoundCharacter() {
    if (!this.boundCharacterId) return null;
    return game.actors?.get(this.boundCharacterId) ?? (typeof fromUuidSync === "function" ? fromUuidSync(this.boundCharacterId) : null) ?? null;
  }

  /** @override */
  prepareDerivedData() {
    const actor = this.parent;
    const boundChar = this.getBoundCharacter();
    const ctx = buildFormulaContext(actor, boundChar);

    // Effect bonuses
    const trackedKeys = ["speed", "speed_bonus", "initiative", "accuracy", "guard", "resist", "prevail", "health", "max_health", "damage"];
    for (const key of trackedKeys) {
      this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
    }

    // Evaluate formulas → combat stats
    this.max_health        = evaluateFormula(this.formulas.hp, ctx) + this.bonuses.max_health;
    this.combat.speed      = evaluateFormula(this.formulas.speed, ctx) + this.bonuses.speed;
    this.combat.speed_bonus = 2 + this.bonuses.speed_bonus;
    this.combat.initiative = evaluateFormula(this.formulas.initiative, ctx) + this.bonuses.initiative;
    this.combat.accuracy   = evaluateFormula(this.formulas.accuracy, ctx) + this.bonuses.accuracy;
    this.combat.guard      = evaluateFormula(this.formulas.guard, ctx) + this.bonuses.guard;
    this.combat.resist     = evaluateFormula(this.formulas.resist, ctx) + this.bonuses.resist;
    this.combat.prevail    = evaluateFormula(this.formulas.prevail, ctx) + this.bonuses.prevail;

    // Passive states
    this.passiveStates = {};
    this.passiveStates.bloody = this.health < (this.max_health / 2);
  }
}
