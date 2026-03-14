/**
 * Data model for the Build (Building) item type.
 */
export class TrespasserBuildData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      // Array of attribute bonuses
      bonuses: new fields.ArrayField(new fields.SchemaField({
        attribute: new fields.StringField({ 
          initial: "military", 
          choices: ["military", "efficiency", "resources", "expertise", "allegiance", "appeal"] 
        }),
        value: new fields.NumberField({ initial: 0, integer: true })
      }), { initial: [] }),
      // Array of provided skills
      skills: new fields.ArrayField(new fields.StringField({ 
        choices: ["agriculture", "construction", "commerce", "cuisine", "entertainment", "espionage", "faith", "hospitality", "research", "seafaring", "statecraft", "warfare"] 
      }), { initial: [] }),
      buildClock: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      progress: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      upgradeTo: new fields.StringField({ initial: "", blank: true }), // UUID of another build template
      replacesId: new fields.StringField({ initial: "", blank: true }), // ID of the building this one replaces upon completion
      havenActions: new fields.ArrayField(new fields.SchemaField({
        title: new fields.StringField({ initial: "" }),
        description: new fields.StringField({ initial: "" })
      }), { initial: [] })
    };
  }
}
