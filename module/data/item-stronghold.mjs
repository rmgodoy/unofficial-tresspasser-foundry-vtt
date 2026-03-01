export class TrespasserStrongholdData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      owner: new fields.StringField({ blank: true }),
      clock: new fields.SchemaField({
        value: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 10 }),
        max: new fields.NumberField({ integer: true, initial: 10, min: 1 }),
      }),
      completed: new fields.BooleanField({ initial: false }),
      description: new fields.HTMLField({ blank: true })
    };
  }
}
