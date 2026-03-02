/**
 * Item Data Model for Features.
 */
export class TrespasserFeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField(),
      type: new fields.StringField({ initial: "none", choices: ["none", "action", "reaction"] }),
      effects: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      deeds: new fields.ArrayField(new fields.ObjectField(), { initial: [] })
    };
  }
}
