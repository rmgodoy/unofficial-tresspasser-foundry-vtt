/**
 * Data model for the Trespasser TTRPG Talent item type.
 */
export class TrespasserTalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField(),
      type: new fields.StringField({ initial: "none", choices: ["none", "action", "reaction"] }),
      usable: new fields.BooleanField({ initial: false }),
      rollDice: new fields.StringField({ initial: "" }),
      focusCost: new fields.NumberField({ initial: null, nullable: true }),
      focusIncrease: new fields.NumberField({ initial: null, nullable: true }),
      bonusCost: new fields.NumberField({ initial: null, nullable: true }),
      uses: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      effects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] })
    };
  }
}
