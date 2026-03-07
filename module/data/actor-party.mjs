/**
 * TypeDataModel for the Party actor type.
 *
 * The party is a shared entity representing the adventuring group.
 * It tracks membership and acts as the anchor for group checks,
 * resource tracking, and dungeon exploration.
 *
 * Only one party actor should exist per world — the dungeon tracker
 * and future travel tracker look for it via game.actors.find().
 */
export class TrespasserPartyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Party member character actor IDs
      members: new fields.ArrayField(new fields.StringField()),

      // Haven — actor ID of a future Haven actor type
      havenId: new fields.StringField({ initial: "" }),

      // Party-level notes (GM and player-visible)
      notes: new fields.HTMLField({ initial: "" })
    };
  }
}
