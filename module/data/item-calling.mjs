import { DEFAULT_PROGRESSION_TABLE } from "./progression-default.mjs";

/**
 * Data model for the Trespasser TTRPG Calling item type.
 *
 * A Calling bundles a set of Skills, Talents, Features and Enhancements
 * (stored as Feature items) that can be granted to a Character.
 */
export class TrespasserCallingData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField(),

      // Array of skill keys (e.g. "acrobatics", "alchemy") this Calling grants
      skills: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      // Each entry: { uuid, name, img } pointing to an existing Talent item
      talents: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),

      // Each entry: { uuid, name, img } pointing to an existing Feature item
      features: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),

      // Each entry: { uuid, name, img } pointing to an existing Feature item, displayed as Enhancements
      enhancements: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),

      // Progression Table (Array of Objects)
      progression: new fields.ArrayField(new fields.ObjectField(), { initial: DEFAULT_PROGRESSION_TABLE }),
    };
  }
}
