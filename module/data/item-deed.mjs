import { convertOldDeedSystem, migrateToGraph } from "../helpers/migration-deed.mjs";
import { PHASE_KEYS } from "./node-port-config.mjs";
/**
 * Data model for the Trespasser TTRPG Deed item type (Behavior-Driven Deed).
 */

export const BEHAVIOR_TYPES = [
  "start",
  "rollAccuracy",
  "selectTarget",
  "selectArea",
  "roll",
  "applyDamage",
  "healTarget",
  "grantRecovery",
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
      }),
      graph: new fields.SchemaField({
        nodes: new fields.ArrayField(
          new fields.SchemaField({
            id: new fields.StringField({
              required: true,
              initial: () => foundry.utils.randomID()
            }),
            type: new fields.StringField({
              required: true,
              choices: BEHAVIOR_TYPES
            }),
            phase: new fields.StringField({
              initial: "base",
              choices: PHASE_KEYS
            }),
            params: new fields.ObjectField({ initial: {} }),
            x: new fields.NumberField({ initial: 0 }),
            y: new fields.NumberField({ initial: 0 })
          }),
          { initial: [] }
        ),
        connections: new fields.ArrayField(
          new fields.SchemaField({
            id: new fields.StringField({
              required: true,
              initial: () => foundry.utils.randomID()
            }),
            sourceId: new fields.StringField({ required: true }),
            sourcePort: new fields.StringField({ initial: "out" }),
            targetId: new fields.StringField({ required: true }),
            targetPort: new fields.StringField({ initial: "in" }),
            type: new fields.StringField({ initial: "flow", choices: ["flow", "reference"] })
          }),
          { initial: [] }
        )
      }),
      graphVersion: new fields.NumberField({
        initial: 0,
        integer: true,
        min: 0
      }),
      legacyPhases: new fields.ObjectField({
        initial: null,
        nullable: true
      })
    };
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    if (this.phases) {
      _sanitizeEffectsInPhases(this.phases);
    }
    if (this.graph) {
      _sanitizeEffectsInGraph(this.graph);
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
    const graph = changes.system?.graph ?? changes.graph;
    if (graph) {
      _sanitizeEffectsInGraph(graph);
    }
  }

  /* -------------------------------------------- */
  /* Migration                                     */
  /* -------------------------------------------- */

  /** @override */
  static migrateData(source) {
    if (!source || typeof source !== "object") return super.migrateData(source);

    // If already graphVersion >= 1 or graph has nodes, do not re-migrate!
    if (source.graphVersion >= 1 || (source.graph?.nodes && source.graph.nodes.length > 0)) {
      return super.migrateData(source);
    }

    // Only migrate if phases with actual behaviors exist in source
    const hasLegacyBehaviors = source.phases && Object.values(source.phases).some(p => {
      if (!p?.behaviors) return false;
      return Array.isArray(p.behaviors) ? p.behaviors.length > 0 : Object.keys(p.behaviors).length > 0;
    });

    if (!hasLegacyBehaviors) {
      return super.migrateData(source);
    }

    const converted = convertOldDeedSystem(source);
    const migrated = migrateToGraph(converted);
    foundry.utils.mergeObject(source, migrated);
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

/**
 * Helper to ensure params.effects in graph nodes is always a Javascript Array.
 * @param {object} graph
 */
function _sanitizeEffectsInGraph(graph) {
  if (!graph?.nodes || !Array.isArray(graph.nodes)) return;
  for (const node of graph.nodes) {
    if (node?.params?.effects) {
      if (!Array.isArray(node.params.effects) && typeof node.params.effects === "object") {
        node.params.effects = Object.values(node.params.effects);
      }
    }
  }
}

