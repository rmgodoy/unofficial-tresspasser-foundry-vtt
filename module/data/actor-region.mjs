/**
 * TypeDataModel for the Region actor type.
 *
 * Tracks region properties, session state, and travel log data.
 */
export class TrespasserRegionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // ── Region Configuration (set on the Region Sheet) ──
      hostilityTier: new fields.NumberField({ required: true, initial: 1, min: 0, max: 5, integer: true }),
      weather: new fields.StringField({ initial: "clear", choices: ["clear", "poor", "extreme"] }),
      defaultTerrain: new fields.StringField({ initial: "flat", choices: ["flat", "mixed", "rough"] }),
      encounterTableId: new fields.StringField({ initial: "" }),
      mapImage: new fields.StringField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" }),

      // ── Session State (managed by Travel Tracker at runtime) ──
      sessionState: new fields.StringField({ initial: "idle", choices: ["idle", "active", "paused"] }),
      currentDay: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      currentPeriod: new fields.StringField({ initial: "morning", choices: ["morning", "evening", "night"] }),
      travelPointsRemaining: new fields.NumberField({ required: true, initial: 6, min: 0, integer: true }),
      onRoad: new fields.BooleanField({ initial: false }),
      isDisoriented: new fields.BooleanField({ initial: false }),

      // ── Day Log ──
      dayLog: new fields.ArrayField(new fields.SchemaField({
        day: new fields.NumberField({ integer: true }),
        action: new fields.StringField(),
        detail: new fields.StringField({ initial: "" })
      }))
    };
  }
}
