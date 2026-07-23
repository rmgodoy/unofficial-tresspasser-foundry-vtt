/**
 * Data model for the Trespasser TTRPG BDeed item type (Behavior-Driven Deed).
 */

export const BEHAVIOR_TYPES = [
  "selectTarget",
  "applyDamage",
  "applyEffects",
  "modifyBehavior",
  "spawnTerrain",
  "moveTerrain",
  "moveSource",
  "forceMoveTargets",
  "clearTargets"
];

export class TrespasserBDeedData extends foundry.abstract.TypeDataModel {
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
}
