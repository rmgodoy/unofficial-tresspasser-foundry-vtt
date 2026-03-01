export class TrespasserHavenData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      level: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 10 }),
      population_rank: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      wealth: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      
      attributes: new fields.SchemaField({
        military: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 5 }),
        efficiency: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 5 }),
        resources: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 5 }),
        expertise: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 5 }),
        allegiance: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 5 }),
        appeal: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 5 }),
      }),

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

      // Derived
      skill_bonus: new fields.NumberField({ integer: true, initial: 2 }),
      build_slots_max: new fields.NumberField({ integer: true, initial: 1 }),
      building_limit: new fields.NumberField({ integer: true, initial: 1 }),
      weekly_expenses: new fields.NumberField({ integer: true, initial: 0 }),
      notes: new fields.HTMLField({ blank: true }),
      active_events: new fields.HTMLField({ blank: true }),
      population_decline: new fields.SchemaField({
        active: new fields.BooleanField({ initial: false }),
        notes: new fields.StringField({ blank: true })
      })
    };
  }

  prepareDerivedData() {
    const level = this.level;
    const actor = this.parent;

    // Derived skill bonus
    if (level === 0 || level === 1 || level === 2) this.skill_bonus = 2;
    else if (level >= 3 && level <= 5) this.skill_bonus = 3;
    else if (level >= 6 && level <= 8) this.skill_bonus = 4;
    else if (level >= 9) this.skill_bonus = 5;

    // Build slots
    if (level <= 2) this.build_slots_max = 1;
    else if (level >= 3 && level <= 5) this.build_slots_max = 2;
    else if (level >= 6 && level <= 8) this.build_slots_max = 3;
    else if (level >= 9) this.build_slots_max = 4;

    // Building limit
    const limits = [1, 2, 4, 6, 8, 12, 16, 20, 24, 28, 28]; // Arbitrary max at lvl 10 matching logic
    this.building_limit = limits[level] || 1;

    // Calculate weekly expenses from hirelings
    let expenses = 0;
    if (actor && actor.items) {
      // Find all hirelings
      actor.items.forEach(item => {
        if (item.type === "hireling") {
          const qty = item.system.quantity || 1;
          const cost = item.system.cost || 0;
          expenses += (qty * cost);
        }
      });
    }
    this.weekly_expenses = expenses;
  }
}
