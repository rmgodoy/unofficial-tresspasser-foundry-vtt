import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

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
      skill:          new fields.NumberField({ required: true, integer: true, initial: 2 }),
      skill_die:      new fields.StringField({ initial: "d6" }),
      key_attribute:  new fields.StringField({ initial: "mighty", choices: ["mighty", "agility", "intellect", "spirit"] }),

      // Resources
      health:     new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),
      max_health: new fields.NumberField({ required: true, integer: true, initial: 5, min: 0 }),

      armor:            new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      armorDieAmmount:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Derived combat stats
      combat: new fields.SchemaField({
        initiative:  new fields.NumberField({ integer: true, initial: 0 }),
        accuracy:    new fields.NumberField({ integer: true, initial: 0 }),
        guard:       new fields.NumberField({ integer: true, initial: 0 }),
        resist:      new fields.NumberField({ integer: true, initial: 0 }),
        prevail:     new fields.NumberField({ integer: true, initial: 0 }),
        tenacity:    new fields.NumberField({ integer: true, initial: 0 }),
        focus:       new fields.NumberField({ integer: true, initial: 0 }),
        speed:       new fields.NumberField({ integer: true, initial: 5 }),
        speed_bonus: new fields.NumberField({ integer: true, initial: 2 }),
        weaponMode:  new fields.StringField({ initial: "main", choices: ["main", "off", "dual"] }),
        equipment_snapshot: new fields.SchemaField({
          head:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          arms:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          body:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          legs:   new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          outer:  new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          shield: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          weapon: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
          off_hand: new fields.SchemaField({ die: new fields.StringField({ initial: "" }), effect: new fields.StringField({ initial: "" }), used: new fields.BooleanField({ initial: false }) }),
        })
      }),

      inventory_max: new fields.NumberField({ integer: true, initial: 5 }),

      // Equipment slots
      equipment: new fields.SchemaField({
        head:      new fields.StringField({ blank: true }),
        arms:      new fields.StringField({ blank: true }),
        body:      new fields.StringField({ blank: true }),
        legs:      new fields.StringField({ blank: true }),
        outer:     new fields.StringField({ blank: true }),
        shield:    new fields.StringField({ blank: true }),
        main_hand: new fields.StringField({ blank: true }),
        off_hand:  new fields.StringField({ blank: true }),
        amulet:    new fields.StringField({ blank: true }),
        ring:      new fields.StringField({ blank: true }),
        talisman:  new fields.StringField({ blank: true }),
      }),

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
      carried_items: new fields.StringField({ blank: true }),

      // Dynamic Bonuses (derived, needed for skill rolls and effects)
      bonuses: new fields.SchemaField({
        mighty:     new fields.NumberField({ integer: true, initial: 0 }),
        agility:    new fields.NumberField({ integer: true, initial: 0 }),
        intellect:  new fields.NumberField({ integer: true, initial: 0 }),
        spirit:     new fields.NumberField({ integer: true, initial: 0 }),
        initiative: new fields.NumberField({ integer: true, initial: 0 }),
        accuracy:   new fields.NumberField({ integer: true, initial: 0 }),
        guard:      new fields.NumberField({ integer: true, initial: 0 }),
        resist:     new fields.NumberField({ integer: true, initial: 0 }),
        prevail:    new fields.NumberField({ integer: true, initial: 0 }),
        tenacity:   new fields.NumberField({ integer: true, initial: 0 }),
        focus:      new fields.NumberField({ integer: true, initial: 0 }),
        speed:      new fields.NumberField({ integer: true, initial: 0 }),
        speed_bonus: new fields.NumberField({ integer: true, initial: 0 }),
        armor:      new fields.NumberField({ integer: true, initial: 0 }),
        health:     new fields.NumberField({ integer: true, initial: 0 }),
        max_health: new fields.NumberField({ integer: true, initial: 0 }),
      })
    };
  }

  /** @override */
  prepareDerivedData() {
    const actor = this.parent;
    this.skill = 2;
    this.skill_die = "d6";

    // 1. Fetch and store Effect Bonuses in the document field
    const allTrackedKeys = [
      "mighty", "agility", "intellect", "spirit",
      "initiative", "accuracy", "guard", "resist", "prevail", "tenacity", "speed",
      "speed_bonus", "armor", "health", "max_health", "endurance", "max_endurance", "damage", "focus"
    ];
    for (const key of allTrackedKeys) {
      this.bonuses[key] = TrespasserEffectsHelper.getAttributeBonus(actor, key);
    }

    // Key Attribute: Higher of Might or Agility
    const mgt = this.attributes.mighty || 0;
    const agi = this.attributes.agility || 0;
    const int = this.attributes.intellect || 0;
    const spi = this.attributes.spirit || 0;

    this.key_attribute = mgt >= agi ? "mighty" : "agility";

    // Total attributes including bonuses
    const totalMighty = mgt + (this.bonuses.mighty || 0);
    const totalAgility = agi + (this.bonuses.agility || 0);
    const totalIntellect = int + (this.bonuses.intellect || 0);
    const totalSpirit = spi + (this.bonuses.spirit || 0);
    const keyAttrValue = (this.attributes[this.key_attribute] ?? mgt) + (this.bonuses[this.key_attribute] || 0);

    // Hit Points: 5 + Might (plus health bonuses)
    this.max_health = 5 + totalMighty + (this.bonuses.max_health || 0);
    if (this.health > this.max_health) {
      this.health = this.max_health;
    }

    // Armor Calculation from equipped items
    let totalArmor = 0;
    let armorDieAmmount = 0;
    if (actor && actor.items) {
      const equippedArmor = actor.items.filter(i => i.type === "armor" && i.system.equipped);
      totalArmor = equippedArmor.reduce((acc, item) => acc + (item.system.armorRating || 0), 0);
      armorDieAmmount = equippedArmor.filter(i => !i.system.broken).length;
    }
    this.armor = totalArmor + (this.bonuses.armor || 0);
    this.armorDieAmmount = armorDieAmmount;

    // Derived Combat Stats (Totals including bonuses)
    this.combat.initiative = totalAgility + this.skill + (this.bonuses.initiative || 0);
    this.combat.accuracy   = keyAttrValue + this.skill + (this.bonuses.accuracy || 0);
    this.combat.guard      = totalAgility + this.armor + (this.bonuses.guard || 0);
    this.combat.resist     = totalSpirit  + this.skill + (this.bonuses.resist || 0);
    this.combat.prevail    = totalIntellect + this.skill + (this.bonuses.prevail || 0);
    this.combat.tenacity   = totalMighty  + totalSpirit + (this.bonuses.tenacity || 0);
    this.combat.speed      = 5 + (this.bonuses.speed || 0);
    this.combat.speed_bonus = Math.max(totalAgility, 2) + (this.bonuses.speed_bonus || 0);
    this.combat.focus      = (this.combat.focus || 0) + (this.bonuses.focus || 0);

    // Passive States / Encumbrance
    this.passiveStates = {
      bloody: this.health < (this.max_health / 2),
      encumbered: totalArmor >= 6
    };

    const applyEncumbranceRules = game.settings.get("trespasser", "applyEncumbranceRules");
    if (this.passiveStates.encumbered && applyEncumbranceRules) {
      this.combat.guard = this.armor + (this.bonuses.guard || 0);
      this.combat.speed_bonus = 2 + (this.bonuses.speed_bonus || 0);
    }

    // Speed display helper structure
    this.speed = {
      base: 5,
      bonus: this.combat.speed_bonus,
      total: 5 + this.combat.speed_bonus
    };
  }

  /**
   * Check if the commoner has a specific common plight.
   * @param {string} plightId - Key from COMMON_PLIGHTS config
   * @returns {boolean}
   */
  hasPlight(plightId) {
    return this.parent.items.some(
      i => i.type === "plight" && i.system.plightId === plightId
    );
  }

  /**
   * Get all plight items on this commoner.
   * @returns {Item[]}
   */
  getPlights() {
    return this.parent.items.filter(i => i.type === "plight");
  }
}
