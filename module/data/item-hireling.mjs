export class TrespasserHirelingData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      cost: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      required_building: new fields.StringField({ blank: true }),
      description: new fields.HTMLField({ blank: true })
    };
  }
}
