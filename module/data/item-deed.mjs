import { convertOldDeedSystem } from "../helpers/migration-deed.mjs";
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
      // Legacy fields (retained so Foundry DataModel validation does not prune them upon loading legacy data)
      target: new fields.StringField({ initial: null, nullable: true }),
      targetType: new fields.StringField({ initial: null, nullable: true }),
      targetCount: new fields.NumberField({ initial: null, nullable: true }),
      targetSize: new fields.NumberField({ initial: null, nullable: true }),
      accuracyTest: new fields.StringField({ initial: null, nullable: true }),
      effects: new fields.ObjectField({ initial: null, nullable: true }),
      type: new fields.StringField({ initial: "", nullable: true }),

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

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    if (this.phases) {
      _sanitizeEffectsInPhases(this.phases);
    }
  }

  /** @override */
  _preUpdate(changes, options, user) {
    const res = super._preUpdate(changes, options, user);
    if (res === false) return false;

    const phases = changes.system?.phases ?? changes.phases;
    if (phases) {
      _sanitizeEffectsInPhases(phases);
    }
  }

  /* -------------------------------------------- */
  /* Migration                                     */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    convertOldDeedSystem(source);
    return super.migrateData(source);
  }
}

/**
 * Helper to ensure params.effects in behaviors is always a Javascript Array.
 * @param {object} phases
 */
function _sanitizeEffectsInPhases(phases) {
  if (!phases || typeof phases !== "object") return;
  for (const phaseKey of Object.keys(phases)) {
    const phase = phases[phaseKey];
    if (!phase || typeof phase !== "object") continue;
    const behaviors = phase.behaviors;
    if (!behaviors) continue;
    const behaviorList = Array.isArray(behaviors) ? behaviors : Object.values(behaviors);
    for (const b of behaviorList) {
      if (b && b.params && b.params.effects) {
        if (!Array.isArray(b.params.effects) && typeof b.params.effects === "object") {
          b.params.effects = Object.values(b.params.effects);
        }
      }
    }
  }
}

