/**
 * Data model for the Trespasser TTRPG generic Item type.
 */
export class TrespasserItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({ initial: "" }),
      subType: new fields.StringField({ 
        initial: "miscellaneous",
        choices: ["tool", "resource", "light_source", "miscellaneous", "bombs", "oils", "powders", "potions", "scrolls", "esoteric", "artifacts"]
      }),
      price: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      quantity: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
      slotOccupancy: new fields.NumberField({ initial: 1, min: 0 }),
      equipped: new fields.BooleanField({ initial: false }),
      equippable: new fields.BooleanField({ initial: false }),
      placement: new fields.StringField({ 
        initial: "hand", 
        choices: ["hand", "head", "body", "arms", "legs", "outer", "shield"]
      }),
      active: new fields.BooleanField({ initial: false }),
      isLightFuel: new fields.BooleanField({ initial: false }),
      isAmmo: new fields.BooleanField({ initial: false }),
      usesFuel: new fields.BooleanField({ initial: false }),

      // Resource
      resourceType: new fields.StringField({ initial: "ingredients", choices: ["ingredients", "materials"] }),

      // Light Source
      radius: new fields.NumberField({ initial: 0, min: 0 }),
      depletionDie: new fields.StringField({ initial: "d4" }),

      // Consumables (Bombs, Oils, Powders, Potions)
      tier: new fields.StringField({ initial: "lesser", choices: ["lesser", "greater"] }),
      damage: new fields.StringField({ initial: "" }),

      // All Items can potentially have nested items mapped to them, particularly:
      // Effects for Bombs, Oils, Powders, Potions
      // Deeds for Scrolls and Artifacts
      // Incantations for Esoteric
      // Magic trait/Talents for Artifacts
      effects: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true }),
        intensity: new fields.NumberField({ initial: 1, min: 0 })
      }), { initial: [] }),

      deeds: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),

      incantations: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),

      talents: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] }),

      features: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ required: true }),
        type: new fields.StringField({ required: true }),
        name: new fields.StringField({ required: true }),
        img: new fields.StringField({ required: true })
      }), { initial: [] })
    };
  }
}
