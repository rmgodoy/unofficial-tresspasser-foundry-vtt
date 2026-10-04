import { TrespasserCombatantData } from "./actor-combatant.mjs";
import { buildFormulaContext, evaluateFormula, evaluateDieFormula } from "../helpers/companion-formula.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * Data model for the Trespasser TTRPG Companion actor type.
 * Companions are player-controlled summons/pets bound to a Character.
 * Their attributes, level, and combat stats are derived from GM-configurable formulas.
 */
export class TrespasserCompanionData extends TrespasserCombatantData {

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),

      // Identity — bound character reference (Actor ID or UUID)
      boundCharacterId: new fields.StringField({ blank: true }),

      // Initiative mode: "follow" (follow bound character turn order) or "roll" (roll initiative independently)
      initiativeMode: new fields.StringField({
        initial: "follow",
        choices: ["follow", "roll"],
        blank: false
      }),

      // GM-configurable formulas for level, skill die, and each attribute
      formulas: new fields.SchemaField({
        level: new fields.StringField({ initial: "<c.lvl>" }),
        skill_die: new fields.StringField({ initial: "<c.skill_die>" }),
        damageDie: new fields.StringField({ initial: "<c.skill_die>" }),
        hp: new fields.StringField({ initial: "10+5*(<lvl>)" }),
        speed: new fields.StringField({ initial: "5" }),
        speed_bonus: new fields.StringField({ initial: "2" }),
        initiative: new fields.StringField({ initial: "<lvl>" }),
        accuracy: new fields.StringField({ initial: "<lvl>+<c.skill>" }),
        guard: new fields.StringField({ initial: "<lvl>+<c.agility>" }),
        resist: new fields.StringField({ initial: "<lvl>+<c.spirit>" }),
        prevail: new fields.StringField({ initial: "<lvl>+<c.intellect>" }),
      }),
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
    super.prepareDerivedData();
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

    // 3. Evaluate formulas → combat stats & health
    const f = this.formulas ?? {};
    this.max_health = evaluateFormula(f.hp || "10+5*(<lvl>)", ctx) + (this.bonuses.max_health || 0);
    this.combat.speed = evaluateFormula(f.speed || "5", ctx) + (this.bonuses.speed || 0);
    this.combat.speed_bonus = evaluateFormula(f.speed_bonus || "2", ctx) + (this.bonuses.speed_bonus || 0);
    this.combat.initiative = evaluateFormula(f.initiative || "<lvl>", ctx) + (this.bonuses.initiative || 0);
    this.combat.accuracy = evaluateFormula(f.accuracy || "<lvl>+<c.skill>", ctx) + (this.bonuses.accuracy || 0);
    this.combat.guard = evaluateFormula(f.guard || "<lvl>+<c.agility>", ctx) + (this.bonuses.guard || 0);
    this.combat.resist = evaluateFormula(f.resist || "<lvl>+<c.spirit>", ctx) + (this.bonuses.resist || 0);
    this.combat.prevail = evaluateFormula(f.prevail || "<lvl>+<c.intellect>", ctx) + (this.bonuses.prevail || 0);
    this.inventory_max = Math.max(0, 3 + (this.bonuses.inventory_max || 0));

    // 4. Engagement Range (derived from equipped melee weapons or natural reach 1)
    const eq = this.equipment ?? {};
    const equippedIds = [eq.main_hand, eq.off_hand].filter(Boolean);
    const equippedWeapons = equippedIds
      .map(id => actor.items?.get?.(id))
      .filter(i => i?.type === "weapon");

    const meleeWeapons = equippedWeapons.filter(w => w.system?.type === "melee");
    if (meleeWeapons.length > 0) {
      const ranges = meleeWeapons.map(w => RangeHelper.getWeaponMeleeRange(w));
      this.combat.engagement_range = Math.max(...ranges);
    } else if (equippedWeapons.length > 0 && equippedWeapons.every(w => w.system?.type === "missile" || w.system?.type === "ranged")) {
      this.combat.engagement_range = 0;
    } else {
      this.combat.engagement_range = 1;
    }
  }
}
