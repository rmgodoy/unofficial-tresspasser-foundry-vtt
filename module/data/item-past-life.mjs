/**
 * Data model for the Trespasser TTRPG Past Life item type.
 */
export class TrespasserPastLifeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      
      // Attribute bonuses
      attributes: new fields.SchemaField({
        mighty:    new fields.NumberField({ integer: true, initial: 0 }),
        agility:   new fields.NumberField({ integer: true, initial: 0 }),
        intellect: new fields.NumberField({ integer: true, initial: 0 }),
        spirit:    new fields.NumberField({ integer: true, initial: 0 }),
      }),

      // Selectable skills (boolean toggles)
      skills: new fields.SchemaField({
        acrobatics: new fields.BooleanField({ initial: false }),
        alchemy:    new fields.BooleanField({ initial: false }),
        athletics:  new fields.BooleanField({ initial: false }),
        crafting:   new fields.BooleanField({ initial: false }),
        folklore:   new fields.BooleanField({ initial: false }),
        letters:    new fields.BooleanField({ initial: false }),
        magic:      new fields.BooleanField({ initial: false }),
        nature:     new fields.BooleanField({ initial: false }),
        perception: new fields.BooleanField({ initial: false }),
        speech:     new fields.BooleanField({ initial: false }),
        stealth:    new fields.BooleanField({ initial: false }),
        tinkering:  new fields.BooleanField({ initial: false }),
      }),

      // List of items (inventory template)
      items: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        quantity: new fields.NumberField({ initial: 1, integer: true, min: 0 })
      }), { initial: [] }),
    };
  }
}
