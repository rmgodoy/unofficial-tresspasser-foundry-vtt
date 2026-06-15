/**
 * Terrain Item Data Model
 */
const { StringField, NumberField, BooleanField, FilePathField, ArrayField, SchemaField } = foundry.data.fields;

export class TrespasserTerrainData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({
        initial: "difficult_terrain",
        choices: ["difficult_terrain", "obstacle", "wall", "field", "light_cloud", "heavy_cloud"]
      }),
      width: new NumberField({ initial: 1, min: 1, integer: true }),
      height: new NumberField({ initial: 1, min: 1, integer: true }),
      terrainDamage: new NumberField({ initial: 0, min: 0 }),
      extraMovementCost: new NumberField({ initial: 0, min: 0 }),
      slippery: new BooleanField({ initial: false }),
      destructible: new BooleanField({ initial: true }),
      centerMode: new StringField({
        initial: "fixed",
        choices: ["fixed", "actor"]
      }),
      centerActorId: new StringField({ initial: "" }),
      terrainImage: new FilePathField({ categories: ["IMAGE"] }),
      
      onEnterEffects: new ArrayField(new SchemaField({
        uuid: new StringField({ initial: "" }),
        type: new StringField({ initial: "" }),
        name: new StringField({ initial: "" }),
        img: new StringField({ initial: "" }),
        intensity: new NumberField({ initial: 1, min: 1, integer: true })
      })),
      onMoveEffects: new ArrayField(new SchemaField({
        uuid: new StringField({ initial: "" }),
        type: new StringField({ initial: "" }),
        name: new StringField({ initial: "" }),
        img: new StringField({ initial: "" }),
        intensity: new NumberField({ initial: 1, min: 1, integer: true })
      })),
      
      regionColor: new StringField({ initial: "" })
    };
  }
}
