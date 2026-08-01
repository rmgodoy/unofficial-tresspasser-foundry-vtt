/**
 * Data model for the Trespasser TTRPG Commoner actor type.
 * Commoners are Level 0 characters with simplified stats and a single default deed.
 */
export class TrespasserCommonerData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Identity
      lineage:   new fields.StringField({ blank: true }),
      past_life: new fields.StringField({ blank: true }),
      alignment: new fields.StringField({ blank: true }),

      // Generation Flag
      isGenerated: new fields.BooleanField({ initial: false }),

      // Core Attributes
      attributes: new fields.SchemaField({
        mighty:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        agility:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        intellect: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spirit:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      }),

      // Derived Skill Stats
      skill:     new fields.NumberField({ required: true, integer: true, initial: 2 }),
      skill_die: new fields.StringField({ initial: "d6" }),

      // Resources
      health:     new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      max_health: new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),

      // Skills Toggles (From Past Life)
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

      // Additional text fields
      notes:         new fields.HTMLField({ blank: true }),
      carried_items: new fields.StringField({ blank: true })
    };
  }

  /** @override */
  prepareDerivedData() {
    const attr = this.attributes;
    const mgt = attr.mighty || 0;
    const agi = attr.agility || 0;
    const int = attr.intellect || 0;
    const spi = attr.spirit || 0;

    // Key Attribute: Higher of Might or Agility
    this.key_attribute = mgt >= agi ? "mighty" : "agility";
    const keyVal = Math.max(mgt, agi);

    // Hit Points: 5 + Might
    this.max_health = 5 + mgt;
    if (this.health > this.max_health) {
      this.health = this.max_health;
    }

    // Derived Combat Stats
    this.combat = {
      initiative: agi + 2,
      accuracy:   keyVal + 2,
      guard:      agi, // Armor bonus added when equipment items calculated
      resist:     spi + 2,
      prevail:    int + 2,
      tenacity:   mgt + spi
    };

    // Speed: 5 + Agility
    this.speed = {
      base: 5,
      bonus: agi,
      total: 5 + agi
    };

    // Constant Commoner Defaults
    this.skill = 2;
    this.skill_die = "d6";
  }
}
