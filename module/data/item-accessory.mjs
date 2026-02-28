/**
 * Data model for the Trespasser TTRPG Accessory item type.
 */
export class TrespasserAccessoryData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ blank: true }),
      placement: new fields.StringField({ 
        initial: "ring", 
        choices: ["ring", "talisman", "amulet"] 
      }),
      equipped: new fields.BooleanField({ initial: false }),
      talents: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),
      features: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),
      deeds: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),
      effects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] })
    };
  }
}
