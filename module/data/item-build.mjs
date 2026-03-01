export class TrespasserBuildData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      clock: new fields.SchemaField({
        value: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ integer: true, initial: 6, min: 1 }),
      }),
      completed: new fields.BooleanField({ initial: false }),
      attribute_granted: new fields.StringField({ blank: true, choices: ["", "military", "efficiency", "resources", "expertise", "allegiance", "appeal"] }),
      skill_granted: new fields.StringField({ blank: true }),
      is_upgrade: new fields.BooleanField({ initial: false }),
      upgrades_from: new fields.StringField({ blank: true }),
      description: new fields.HTMLField({ blank: true })
    };
  }
}
