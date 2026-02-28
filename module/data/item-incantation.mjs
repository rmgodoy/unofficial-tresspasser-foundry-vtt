/**
 * Data model for the Trespasser TTRPG Incantation item type.
 */
export class TrespasserIncantationData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField(),
      enduranceCost: new fields.NumberField({ initial: 1, min: 0, integer: true })
    };
  }
}
