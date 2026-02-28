/**
 * Data model for the Trespasser TTRPG Deed item type.
 */
export class TrespasserDeedData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      tier: new fields.StringField({ 
        initial: "light", 
        choices: ["light", "heavy", "mighty", "special"] 
      }),
      actionType: new fields.StringField({
        initial: "attack",
        choices: ["attack", "support"]
      }),
      type: new fields.StringField({ 
        initial: "innate", 
        choices: ["innate", "melee", "missile", "spell", "tool", "unharmed", "versatile"] 
      }),
      target: new fields.StringField({ 
        initial: "1 Creature" 
      }),
      accuracyTest: new fields.StringField({ initial: "Guard" }), 
      focusCost: new fields.NumberField({ initial: null, nullable: true }),
      focusIncrease: new fields.NumberField({ initial: null, nullable: true }),
      bonusCost: new fields.NumberField({ initial: null, nullable: true }),
      uses: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      effects: new fields.SchemaField({
        start: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        }),
        before: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        }),
        base: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        }),
        hit: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        }),
        spark: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        }),
        after: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        }),
        end: new fields.SchemaField({
          description: new fields.StringField({ initial: "" }),
          damage: new fields.StringField({ initial: "" }),
          appliedEffects: new fields.ArrayField(new fields.SchemaField({
            uuid: new fields.StringField({ required: true }),
            type: new fields.StringField({ required: true }),
            name: new fields.StringField({ required: true }),
            img: new fields.StringField({ required: true }),
            intensity: new fields.NumberField({ initial: 1, min: 0 })
          }), { initial: [] }),
          appliesWeaponEffects: new fields.BooleanField({ initial: false })
        })
      })
    };
  }
}
