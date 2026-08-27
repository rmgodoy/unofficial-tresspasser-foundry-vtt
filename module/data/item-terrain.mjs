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

      // ── Behaviors: structured terrain actions ────────────────────
      behaviors: new ArrayField(new SchemaField({
        trigger: new StringField({
          initial: "onEnter",
          choices: ["onEnter", "onMove", "onStartTurn", "onCreation", "whileInside"]
        }),

        // ── Action type ──────────────────────────────────────────
        action: new StringField({
          initial: "applyEffect",
          choices: ["applyEffect", "forcedMovement", "damage", "script"]
        }),

        // ── For applyEffect (supports multiple effects list) ───────
        effects: new ArrayField(new SchemaField({
          uuid: new StringField({ initial: "" }),
          name: new StringField({ initial: "" }),
          img: new StringField({ initial: "" }),
          intensity: new StringField({ initial: "1" })
        }), { initial: [] }),

        // Legacy single-effect fields for backward compatibility
        effectUuid: new StringField({ initial: "" }),
        effectName: new StringField({ initial: "" }),
        effectImg: new StringField({ initial: "" }),
        effectIntensity: new StringField({ initial: "1" }),

        // ── For forcedMovement ───────────────────────────────────
        forcedMovementType: new StringField({
          initial: "", blank: true,
          choices: ["", "push", "pull", "sweep", "shove", "drag"]
        }),
        // String: can be "2", "<Int>", etc.
        forcedMovementDistance: new StringField({ initial: "0" }),
        forcedMovementDirection: new StringField({
          initial: "away_from_origin",
          choices: [
            "away_from_origin",
            "along_terrain_path",
            "toward_origin",
            "caster_choice",
            "path_direction"
          ]
        }),

        // ── For damage ───────────────────────────────────────────
        // Supports "<sd>", "<wd>", "<Int>", "2d6", etc.
        damageFormula: new StringField({ initial: "" }),

        // ── For script (escape hatch) ────────────────────────────
        script: new StringField({ initial: "" }),

        // ── Condition ────────────────────────────────────────────
        // Whether this behavior only fires once per turn per creature
        onlyOnFirstEntry: new BooleanField({ initial: true })
      })),

      // ── Interactability (for moveable terrains) ──────────────────
      interactable: new BooleanField({ initial: false }),
      interactAction: new SchemaField({
        label: new StringField({ initial: "" }),
        actionCost: new NumberField({ initial: 1, min: 0, integer: true }),
        actionType: new StringField({
          initial: "", blank: true,
          choices: ["", "moveTerrain", "destroyTerrain", "script"]
        }),
        moveDistance: new NumberField({ initial: 0, min: 0, integer: true }),
        moveEffect: new StringField({
          initial: "", blank: true,
          choices: ["", "push", "shove"]
        })
      }),

      // ── Dynamic intensity / linked effect source ──────────────────
      // Terrain reads <Int> from the caster's effect with this UUID.
      // When the linked effect is removed (prevailed), terrain auto-deletes.
      linkedEffects: new ArrayField(new SchemaField({
        uuid: new StringField({ initial: "" }),
        name: new StringField({ initial: "" }),
        img: new StringField({ initial: "" }),
        intensity: new StringField({ initial: "1" })
      }), { initial: [] }),

      linkedEffect: new SchemaField({
        uuid: new StringField({ initial: "" }),
        name: new StringField({ initial: "" }),
        img: new StringField({ initial: "" })
      }),
      linkedEffectKey: new StringField({ initial: "" }),

      regionColor: new StringField({ initial: "" })
    };
  }
}
