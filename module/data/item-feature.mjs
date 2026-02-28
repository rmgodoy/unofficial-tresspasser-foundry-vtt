/**
 * Item Data Model for Features.
 */
export class TrespasserFeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField(),
      effects: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      deeds: new fields.ArrayField(new fields.ObjectField(), { initial: [] })
    };
  }
}
