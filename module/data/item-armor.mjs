/**
 * Data model for the Trespasser TTRPG Armor item type.
 */
export class TrespasserArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      armorRating: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      armorDie: new fields.StringField({ initial: "d6" }),
      slotOccupancy: new fields.NumberField({ initial: 1, min: 0 }),
      price: new fields.NumberField({ initial: 0, min: 0 }),
      placement: new fields.StringField({ 
        initial: "body", 
        choices: ["head", "body", "arms", "legs", "outer", "shield"] 
      }),
      weight: new fields.StringField({ 
        required: true,
        initial: "L",
        choices: ["L", "H"]
      }),
      depletionDie: new fields.StringField({ initial: "d4" }),
      broken: new fields.BooleanField({ initial: false }),
      effects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] }),
      description: new fields.HTMLField({ blank: true }),
      equipped: new fields.BooleanField({ initial: false })
    };
  }
}
