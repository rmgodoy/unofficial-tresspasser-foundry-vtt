/**
 * Data model for the Hireling item type.
 */
export class TrespasserHirelingData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      cost: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      quantity: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
      active: new fields.BooleanField({ initial: true }),
      
      // List of serialized item data for consumption and production
      consume: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      produce: new fields.ArrayField(new fields.ObjectField(), { initial: [] })
    };
  }
}
