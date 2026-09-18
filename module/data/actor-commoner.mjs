import { TrespasserCombatantData } from "./actor-combatant.mjs";

/**
 * Data model for the Trespasser TTRPG Commoner actor type.
 * Commoners are Level 0 characters with simplified stats and a single default deed.
 */
export class TrespasserCommonerData extends TrespasserCombatantData {

  /** @override */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),

      // Identity
      lineage: new fields.StringField({ blank: true }),
      past_life: new fields.StringField({ blank: true }),
      alignment: new fields.StringField({ blank: true }),

      // Generation Flag
      isGenerated: new fields.BooleanField({ initial: false }),

      // Skills Toggles (From Past Life)
      skills: new fields.SchemaField({
        acrobatics: new fields.BooleanField({ initial: false }),
        alchemy: new fields.BooleanField({ initial: false }),
        athletics: new fields.BooleanField({ initial: false }),
        crafting: new fields.BooleanField({ initial: false }),
        folklore: new fields.BooleanField({ initial: false }),
        letters: new fields.BooleanField({ initial: false }),
        magic: new fields.BooleanField({ initial: false }),
        nature: new fields.BooleanField({ initial: false }),
        perception: new fields.BooleanField({ initial: false }),
        speech: new fields.BooleanField({ initial: false }),
        stealth: new fields.BooleanField({ initial: false }),
        tinkering: new fields.BooleanField({ initial: false }),
      }),

      // Additional text fields
      carried_items: new fields.StringField({ blank: true }),
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    const actor = this.parent;
    this.skill = 2;
    this.skill_die = "d6";

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

    // Derived Combat Stats (Totals including bonuses)
    this.combat.initiative = totalAgility + this.skill + (this.bonuses.initiative || 0);
    this.combat.accuracy = keyAttrValue + this.skill + (this.bonuses.accuracy || 0);
    this.combat.guard = totalAgility + this.armor + (this.bonuses.guard || 0);
    this.combat.resist = totalSpirit + this.skill + (this.bonuses.resist || 0);
    this.combat.prevail = totalIntellect + this.skill + (this.bonuses.prevail || 0);
    this.combat.tenacity = totalMighty + totalSpirit + (this.bonuses.tenacity || 0);
    this.combat.speed = 5 + (this.bonuses.speed || 0);
    this.combat.speed_bonus = Math.max(totalAgility, 2) + (this.bonuses.speed_bonus || 0);
    this.combat.focus = (this.combat.focus || 0) + (this.bonuses.focus || 0);

    // Passive States / Encumbrance
    let equippedArmorRating = 0;
    if (actor && actor.items) {
      const equippedArmor = actor.items.filter(i => i.type === "armor" && i.system?.equipped);
      equippedArmorRating = equippedArmor.reduce((acc, item) => acc + (item.system?.armorRating || 0), 0);
    }
    this.passiveStates.encumbered = equippedArmorRating >= 6;

    const applyEncumbranceRules = game.settings?.get?.("trespasser", "applyEncumbranceRules");
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
}
