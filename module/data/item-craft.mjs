/**
 * Data model for the Trespasser TTRPG Craft item type.
 *
 * A Craft bundles a set of Deeds, Features, and a key attribute
 * that can be granted to a Character.
 */
export class TrespasserCraftData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description:  new fields.HTMLField(),
      keyAttribute: new fields.StringField({
        initial: "mighty",
        choices: ["mighty", "agility", "intellect", "spirit"],
        blank: false
      }),
      // Array of { uuid, name, img } pointing to existing Deed items
      deeds:    new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      // Array of { uuid, name, img } pointing to existing Feature items
      features: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
    };
  }
}
