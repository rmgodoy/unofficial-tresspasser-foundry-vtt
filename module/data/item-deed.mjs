/**
 * Data model for the Trespasser TTRPG Deed item type (Behavior-Driven Deed).
 */

export const BEHAVIOR_TYPES = [
  "selectTarget",
  "selectArea",
  "applyDamage",
  "applyEffects",
  "modifyBehavior",
  "spawnTerrain",
  "moveTerrain",
  "moveSource",
  "forceMoveTargets",
  "clearTargets",
  "executeDeed"
];

export class TrespasserDeedData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    const behaviorSchema = () => new fields.SchemaField({
      id: new fields.StringField({
        required: true,
        initial: () => foundry.utils.randomID()
      }),
      type: new fields.StringField({
        required: true,
        initial: "",
        choices: BEHAVIOR_TYPES
      }),
      params: new fields.ObjectField({ initial: {} })
    });

    const phaseSchema = () => new fields.SchemaField({
      description: new fields.StringField({ initial: "" }),
      skipPhase: new fields.BooleanField({ initial: false }),
      behaviors: new fields.ArrayField(
        behaviorSchema(),
        { initial: [] }
      )
    });

    return {
      tier: new fields.StringField({
        initial: "light",
        choices: ["light", "heavy", "mighty", "special"]
      }),
      actionType: new fields.StringField({
        initial: "attack",
        choices: ["attack", "support"]
      }),
      abilityType: new fields.StringField({
        initial: "innate",
        choices: ["innate", "melee", "missile", "spell", "tool", "unarmed", "versatile"]
      }),
      versus: new fields.StringField({
        initial: "Guard",
        choices: ["Guard", "Resist", "10"]
      }),
      focusCost: new fields.NumberField({
        initial: null,
        nullable: true
      }),
      focusIncrease: new fields.NumberField({
        initial: null,
        nullable: true
      }),
      bonusCost: new fields.NumberField({
        initial: null,
        nullable: true
      }),
      uses: new fields.NumberField({
        initial: 0,
        min: 0,
        integer: true
      }),
      range: new fields.NumberField({
        initial: null,
        min: 0,
        integer: true,
        nullable: true
      }),
      phases: new fields.SchemaField({
        start: phaseSchema(),
        before: phaseSchema(),
        base: phaseSchema(),
        hit: phaseSchema(),
        spark: phaseSchema(),
        after: phaseSchema(),
        end: phaseSchema()
      })
    };
  }

  /* -------------------------------------------- */
  /* Migration                                     */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Detect legacy Deed format (presence of 'effects' schema or old top-level fields)
    if (source.effects || source.accuracyTest || (source.type && !source.abilityType) || source.targetType) {
      // 1. Rename ability type (type -> abilityType)
      if (source.type && !source.abilityType) {
        source.abilityType = source.type;
        delete source.type;
      }

      // 2. Rename accuracy test (accuracyTest -> versus)
      if (source.accuracyTest && !source.versus) {
        if (source.accuracyTest === "Resist") source.versus = "Resist";
        else if (source.accuracyTest === "Guard") source.versus = "Guard";
        else source.versus = "10";
        delete source.accuracyTest;
      }

      // 3. Convert target parameters to selectTarget behavior on BEFORE phase
      const targetType = source.targetType || "creature";
      const targetCount = source.targetCount || 1;
      const targetSize = source.targetSize || 1;

      let selectTargetParams;
      if (targetType === "creature") {
        selectTargetParams = { targetMode: "creatures", targetCount };
      } else if (targetType === "personal") {
        selectTargetParams = { targetMode: "self" };
      } else {
        selectTargetParams = { targetMode: "squares", aoeType: targetType, aoeSize: targetSize };
      }

      const selectTargetBehavior = {
        id: foundry.utils.randomID(),
        type: "selectTarget",
        params: selectTargetParams
      };

      // 4. Convert effects -> phases
      if (source.effects && !source.phases) {
        source.phases = {};
        const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];

        for (const phaseKey of phaseKeys) {
          const oldPhase = source.effects[phaseKey] || {};
          const behaviors = [];

          // selectTarget is always the first behavior on the BEFORE phase
          if (phaseKey === "before") {
            behaviors.push(selectTargetBehavior);
          }

          // Damage behavior
          if (oldPhase.damage && typeof oldPhase.damage === "string" && oldPhase.damage.trim()) {
            behaviors.push({
              id: foundry.utils.randomID(),
              type: "applyDamage",
              params: { expression: oldPhase.damage.trim() }
            });
          }

          // Applied effects behavior
          if (Array.isArray(oldPhase.appliedEffects) && oldPhase.appliedEffects.length > 0) {
            behaviors.push({
              id: foundry.utils.randomID(),
              type: "applyEffects",
              params: {
                effects: oldPhase.appliedEffects,
                appliesWeaponEffects: !!oldPhase.appliesWeaponEffects
              }
            });
          }

          // Forced movement behavior
          if (oldPhase.forcedMovement?.type) {
            behaviors.push({
              id: foundry.utils.randomID(),
              type: "forceMoveTargets",
              params: {
                type: oldPhase.forcedMovement.type,
                distance: oldPhase.forcedMovement.distance || 0
              }
            });
          }

          // Terrain spawn behavior
          if (oldPhase.terrainSpawn?.uuid) {
            behaviors.push({
              id: foundry.utils.randomID(),
              type: "spawnTerrain",
              params: {
                terrainUuid: oldPhase.terrainSpawn.uuid,
                terrainName: oldPhase.terrainSpawn.name || "",
                terrainImg: oldPhase.terrainSpawn.img || "",
                placement: oldPhase.terrainSpawn.placement || "on_target"
              }
            });
          }

          source.phases[phaseKey] = {
            description: oldPhase.description || "",
            skipPhase: false,
            behaviors
          };
        }

        delete source.effects;
      }

      delete source.target;
      delete source.targetType;
      delete source.targetCount;
      delete source.targetSize;
    }

    return super.migrateData(source);
  }
}
