/**
 * Data model for the Trespasser TTRPG Injury item type.
 */
export class TrespasserInjuryData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),

      // Clock tracking
      injuryClock: new fields.NumberField({ initial: 4, integer: true, min: 2, max: 12 }),
      currentClock: new fields.NumberField({ initial: 0, integer: true, min: 0 }),

      // Effects linked to this injury (drop-zone, same pattern as weapon effects)
      effects: new fields.ArrayField(new fields.SchemaField({
        uuid:      new fields.StringField({ required: true }),
        type:      new fields.StringField({ required: true }),
        name:      new fields.StringField({ required: true }),
        img:       new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] })
    };
  }
}
