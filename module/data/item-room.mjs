/**
 * TypeDataModel for the Room item type.
 *
 * Converted from template.json schema to modern Foundry v13 TypeDataModel.
 * Rooms are owned items on a Dungeon actor, representing individual locations.
 *
 * Connections are stored as an array of objects, each describing a link to
 * another room with a type and optional description. Connections are
 * bidirectional — when room A connects to room B, room B also stores the
 * reverse connection.
 */
export class TrespasserRoomData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      features: new fields.ArrayField(new fields.StringField()),
      connections: new fields.ArrayField(new fields.SchemaField({
        roomId: new fields.StringField({ required: true }),
        type: new fields.StringField({ initial: "doorway" }),
        description: new fields.StringField({ initial: "" }),
        locked: new fields.BooleanField({ initial: false }),
        hidden: new fields.BooleanField({ initial: false })
      })),
      discovered: new fields.BooleanField({ initial: false }),
      // Room trap: triggers when party enters via Explore (p.55)
      roomTrap: new fields.SchemaField({
        present: new fields.BooleanField({ initial: false }),
        hiddenValue: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        trigger: new fields.StringField({ initial: "" }),
        effect: new fields.StringField({ initial: "" }),
        magical: new fields.BooleanField({ initial: false }),
        disarmed: new fields.BooleanField({ initial: false })
      }),
      // Detail traps: associated with specific room features (poison needles, etc.)
      detailTraps: new fields.ArrayField(new fields.SchemaField({
        featureIndex: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        hiddenValue: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        trigger: new fields.StringField({ initial: "" }),
        effect: new fields.StringField({ initial: "" }),
        magical: new fields.BooleanField({ initial: false }),
        disarmed: new fields.BooleanField({ initial: false })
      })),
      hazards: new fields.HTMLField({ initial: "" }),
      loot: new fields.HTMLField({ initial: "" }),
      sortOrder: new fields.NumberField({
        required: true, initial: 0, min: 0, integer: true
      })
    };
  }
}
