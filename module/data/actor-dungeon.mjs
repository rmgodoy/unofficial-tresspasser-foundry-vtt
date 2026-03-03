/**
 * TypeDataModel for the Dungeon actor type.
 *
 * Converted from template.json schema to modern Foundry v13 TypeDataModel.
 * Tracks dungeon properties, exploration state, and session data.
 */
export class TrespasserDungeonData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      location: new fields.StringField({ initial: "" }),
      form: new fields.StringField({ initial: "" }),
      traits: new fields.ArrayField(new fields.StringField()),
      hostilityTier: new fields.NumberField({
        required: true, initial: 1, min: 1, max: 5, integer: true
      }),
      sizeCategory: new fields.StringField({
        initial: "medium",
        choices: ["small", "medium", "large", "massive"]
      }),
      alarm: new fields.NumberField({
        required: true, initial: 0, min: 0, integer: true
      }),
      currentRound: new fields.NumberField({
        required: true, initial: 0, min: 0, integer: true
      }),
      actionsRemaining: new fields.NumberField({
        required: true, initial: 3, min: 0, integer: true
      }),
      currentRoomId: new fields.StringField({ initial: "" }),
      roundLog: new fields.ArrayField(new fields.SchemaField({
        round: new fields.NumberField({ integer: true }),
        action: new fields.StringField(),
        detail: new fields.StringField({ initial: "" })
      })),
      encounterTableId: new fields.StringField({ initial: "" }),
      mapImage: new fields.StringField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" })
    };
  }
}
