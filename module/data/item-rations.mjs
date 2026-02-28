/**
 * Data model for the Trespasser TTRPG Rations item type.
 */
export class TrespasserRationsData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      depletionDie: new fields.StringField({ 
        initial: "d4", 
        choices: ["d4", "d6", "d8", "d10", "d12", "d20"] 
      }),
      description: new fields.HTMLField({ blank: true }),
      price: new fields.NumberField({ initial: 0, min: 0 }),
      weight: new fields.StringField({ initial: "L", choices: ["L", "H"] }),
      broken: new fields.BooleanField({ initial: false }),
      effects: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
    };
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;

    // Set default name based on depletion die quality if name is "New Item" or empty
    const currentName = this.parent.name;
    if ( !currentName || currentName === "New rations" || currentName === "New Item" ) {
      const quality = this.getQualityName(this.depletionDie);
      this.parent.updateSource({ name: `${quality} Ration` });
    }
  }

  /**
   * Get the quality name based on the depletion die.
   * @param {string} die 
   * @returns {string}
   */
  getQualityName(die) {
    const qualities = {
      "d4": "Crude",
      "d6": "Normal",
      "d8": "Fine",
      "d10": "Excellent",
      "d12": "Enchanted",
      "d20": "Legendary"
    };
    return qualities[die] || "Common";
  }
}
