/**
 * Data model for the Trespasser TTRPG Plight item type.
 */
export class TrespasserPlightData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      plightId: new fields.StringField({ initial: "", blank: true }),
      // plightId matches a key in COMMON_PLIGHTS config.
      // Empty = custom plight (no hardcoded mechanics).
    };
  }
}
