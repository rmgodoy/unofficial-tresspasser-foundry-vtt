/**
 * Data model for the Stronghold item type.
 */
export class TrespasserStrongholdData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      // Actor reference for the owner (Character Actor ID)
      ownerId: new fields.StringField({ initial: "" }), 
      
      buildClock: new fields.NumberField({ initial: 10, integer: true, min: 1 }),
      progress: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      
      // Weekly income generated for the Haven
      income: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      // Weekly maintenance cost for the Haven
      weeklyCost: new fields.NumberField({ initial: 0, integer: true, min: 0 }),

      // Array of attribute bonuses (similar to Buildings)
      bonuses: new fields.ArrayField(new fields.SchemaField({
        attribute: new fields.StringField({ 
          initial: "military", 
          choices: ["military", "efficiency", "resources", "expertise", "allegiance", "appeal"] 
        }),
        value: new fields.NumberField({ initial: 0, integer: true })
      }), { initial: [] }),

      // Array of features provided to the owner
      features: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),

      // List of Haven Actions
      havenActions: new fields.ArrayField(new fields.SchemaField({
        title: new fields.StringField({ initial: "" }),
        description: new fields.StringField({ initial: "" })
      }), { initial: [] })
    };
  }

  /**
   * Whether the stronghold is fully constructed.
   */
  get isCompleted() {
    return this.progress >= this.buildClock;
  }
}
