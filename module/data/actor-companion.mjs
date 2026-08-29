import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { buildFormulaContext, evaluateFormula, evaluateDieFormula } from "../helpers/companion-formula.mjs";

/**
 * Data model for the Trespasser TTRPG Companion actor type.
 * Companions are player-controlled summons/pets bound to a Character.
 * Their attributes, level, and damage die are derived from GM-configurable formulas.
 */
export class TrespasserCompanionData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Identity — bound character reference (Actor ID or UUID)
      boundCharacterId: new fields.StringField({ blank: true }),

      // Level (derived / stored)
      level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),

      // Resources
      health:     new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      max_health: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),

      // Skill Die (derived / stored, e.g. "d6", "1d8")
      skill_die: new fields.StringField({ initial: "d6" }),

      // GM-configurable formulas for level, skill die, and each attribute
      formulas: new fields.SchemaField({
        level:       new fields.StringField({ initial: "<c.lvl>" }),
        skill_die:   new fields.StringField({ initial: "<c.skill_die>" }),
        damageDie:   new fields.StringField({ initial: "<c.skill_die>" }),
        hp:          new fields.StringField({ initial: "10+5*(<lvl>)" }),
        speed:       new fields.StringField({ initial: "5" }),
        speed_bonus: new fields.StringField({ initial: "2" }),
        initiative:  new fields.StringField({ initial: "<lvl>" }),
        accuracy:    new fields.StringField({ initial: "<lvl>+<c.skill>" }),
        guard:       new fields.StringField({ initial: "<lvl>+<c.agility>" }),
        resist:      new fields.StringField({ initial: "<lvl>+<c.spirit>" }),
        prevail:     new fields.StringField({ initial: "<lvl>+<c.intellect>" }),
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
   * Backwards-compatibility alias for skill_die.
   * @type {string}
   */
  get damageDie() {
    return this.skill_die;
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

    // 1. Evaluate Level formula
    const levelFormula = this.formulas?.level || "<c.lvl>";
    const evaluatedLevel = evaluateFormula(levelFormula, ctx);
    this.level = evaluatedLevel >= 0 ? evaluatedLevel : (boundChar?.system?.level ?? 1);
    ctx["lvl"] = this.level;

    // 2. Evaluate Skill Die formula
    const dieFormula = this.formulas?.skill_die || this.formulas?.damageDie || "<c.skill_die>";
    this.skill_die = evaluateDieFormula(dieFormula, ctx);

    // 3. Effect bonuses
    const trackedKeys = ["speed", "speed_bonus", "initiative", "accuracy", "guard", "resist", "prevail", "health", "max_health", "damage"];
    for (const key of trackedKeys) {
      this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
    }

    // 4. Evaluate formulas → combat stats & health
    const f = this.formulas ?? {};
    this.max_health        = evaluateFormula(f.hp || "10+5*(<lvl>)", ctx) + this.bonuses.max_health;
    this.combat.speed      = evaluateFormula(f.speed || "5", ctx) + this.bonuses.speed;
    this.combat.speed_bonus = evaluateFormula(f.speed_bonus || "2", ctx) + this.bonuses.speed_bonus;
    this.combat.initiative = evaluateFormula(f.initiative || "<lvl>", ctx) + this.bonuses.initiative;
    this.combat.accuracy   = evaluateFormula(f.accuracy || "<lvl>+<c.skill>", ctx) + this.bonuses.accuracy;
    this.combat.guard      = evaluateFormula(f.guard || "<lvl>+<c.agility>", ctx) + this.bonuses.guard;
    this.combat.resist     = evaluateFormula(f.resist || "<lvl>+<c.spirit>", ctx) + this.bonuses.resist;
    this.combat.prevail    = evaluateFormula(f.prevail || "<lvl>+<c.intellect>", ctx) + this.bonuses.prevail;

    // Passive states
    this.passiveStates = {};
    this.passiveStates.bloody = this.health < (this.max_health / 2);
  }
}
