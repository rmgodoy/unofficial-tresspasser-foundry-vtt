/**
 * Data model for the Trespasser TTRPG Weapon item type.
 */
export class TrespasserWeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      weaponDie: new fields.StringField({ initial: "d6" }),
      type: new fields.StringField({ 
        initial: "melee", 
        choices: ["melee", "missile", "spell"] 
      }),
      range: new fields.StringField({ initial: "" }),
      needsAmmo: new fields.BooleanField({ initial: false }),
      properties: new fields.SchemaField({
        twoHanded: new fields.BooleanField({ initial: false }),
        thrown: new fields.BooleanField({ initial: false }),
        fragile: new fields.BooleanField({ initial: false })
      }),
      isLightSource: new fields.BooleanField({ initial: false }),
      radius: new fields.NumberField({ initial: 0, min: 0 }),
      active: new fields.BooleanField({ initial: false }),
      usesFuel: new fields.BooleanField({ initial: false }),
      depletionDie: new fields.StringField({ initial: "d4" }),
      slotOccupancy: new fields.NumberField({ initial: 1, min: 0 }),
      price: new fields.NumberField({ initial: 0, min: 0 }),
      equipped: new fields.BooleanField({ initial: false }),
      effects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] }),
      enhancementEffects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] }),
      extraDeeds: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] })
    };
  }
}
