import {
  calculateWeeklyExpenses,
  calculateWeeklyIncome,
  calculateTotalAttributes,
  getTrainedSkills
} from "../haven/haven-calc.mjs";
import {
  isItemMatch,
  processHirelingProduction,
  syncStrongholdBenefit
} from "../haven/haven-production.mjs";
import {
  weeksRest,
  resolveHirelings,
  populationCheck,
  eventCheck
} from "../haven/haven-upkeep.mjs";

/**
 * Data model for the Haven actor type.
 */
export class TrespasserHavenData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      leaderId: new fields.StringField({ initial: "" }),
      treasury: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      
      // Core Attributes
      attributes: new fields.SchemaField({
        military: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        efficiency: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        resources: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        expertise: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        allegiance: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        appeal: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      }),

      populationRank: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      populationState: new fields.StringField({ initial: "growth", choices: ["growth", "decline"] }),
      level: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

      bonuses: new fields.SchemaField({
        attributes: new fields.SchemaField({
          military: new fields.NumberField({ initial: 0, integer: true }),
          efficiency: new fields.NumberField({ initial: 0, integer: true }),
          resources: new fields.NumberField({ initial: 0, integer: true }),
          expertise: new fields.NumberField({ initial: 0, integer: true }),
          allegiance: new fields.NumberField({ initial: 0, integer: true }),
          appeal: new fields.NumberField({ initial: 0, integer: true })
        })
      }),

      // Skills
      skills: new fields.SchemaField({
        agriculture: new fields.BooleanField({ initial: false }),
        construction: new fields.BooleanField({ initial: false }),
        commerce: new fields.BooleanField({ initial: false }),
        cuisine: new fields.BooleanField({ initial: false }),
        entertainment: new fields.BooleanField({ initial: false }),
        espionage: new fields.BooleanField({ initial: false }),
        faith: new fields.BooleanField({ initial: false }),
        hospitality: new fields.BooleanField({ initial: false }),
        research: new fields.BooleanField({ initial: false }),
        seafaring: new fields.BooleanField({ initial: false }),
        statecraft: new fields.BooleanField({ initial: false }),
        warfare: new fields.BooleanField({ initial: false })
      }),

      notes: new fields.HTMLField({ initial: "" }),
      
      productionChains: new fields.ArrayField(new fields.SchemaField({
        id: new fields.StringField({ initial: () => foundry.utils.randomID() }),
        name: new fields.StringField({ initial: "New Production Chain" }),
        active: new fields.BooleanField({ initial: true }),
        hirelings: new fields.ArrayField(new fields.StringField(), { initial: [] })
      }), { initial: [] }),

      inventory: new fields.ArrayField(new fields.SchemaField({
        item: new fields.ObjectField(),
        quantity: new fields.NumberField({ initial: 1, integer: true, min: 0 })
      }), { initial: [] }),

      event: new fields.SchemaField({
        title: new fields.StringField({ initial: "" }),
        description: new fields.HTMLField({ initial: "" }),
        clock: new fields.NumberField({ initial: 4, integer: true, min: 2, max: 12 }),
        current: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      }),
      projects: new fields.ArrayField(new fields.SchemaField({
        id: new fields.StringField({ initial: () => foundry.utils.randomID() }),
        name: new fields.StringField({ initial: "New Project" }),
        clock: new fields.NumberField({ initial: 4, integer: true, min: 2, max: 12 }),
        current: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      }), { initial: [] }),
      arrivals: new fields.HTMLField({ initial: "" })
    };
  }

  get totalWeeklyExpenses() {
    return calculateWeeklyExpenses(this);
  }

  get totalWeeklyIncome() {
    return calculateWeeklyIncome(this);
  }

  get weeklyBalance() {
    return this.totalWeeklyIncome - this.totalWeeklyExpenses;
  }

  get totalAttributes() {
    return calculateTotalAttributes(this);
  }

  get populationThresholds() {
    return [0, 5, 10, 20, 30, 40, 50, 60, 80, 100];
  }

  get skillBonus() {
    const lvl = this.level;
    if (lvl >= 9) return 5;
    if (lvl >= 6) return 4;
    if (lvl >= 3) return 3;
    return 2;
  }

  get maxBuildSlots() {
    const lvl = this.level;
    if (lvl >= 9) return 4;
    if (lvl >= 6) return 3;
    if (lvl >= 3) return 2;
    return 1;
  }

  get maxBuildingLimit() {
    return (this.level + 1) * 3;
  }

  get isStagnant() {
    if (this.level >= 9) return false;
    const thresholds = this.populationThresholds;
    const requiredRank = thresholds[this.level + 1];
    return this.populationRank >= requiredRank;
  }

  get trainedSkills() {
    return getTrainedSkills(this);
  }

  async weeksRest() {
    return weeksRest(this);
  }

  async resolveHirelings() {
    return resolveHirelings(this);
  }

  async populationCheck() {
    return populationCheck(this);
  }

  async eventCheck() {
    return eventCheck(this);
  }

  async _processHirelingProduction(hireling, inventory) {
    return processHirelingProduction(this, hireling, inventory);
  }

  _isItemMatch(item1, item2) {
    return isItemMatch(item1, item2);
  }

  async syncStrongholdBenefit(stronghold, delta = {}) {
    return syncStrongholdBenefit(this, stronghold, delta);
  }
}
