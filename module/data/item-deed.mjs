import { convertOldDeedSystem, migrateToGraph } from "../helpers/migration-deed.mjs";
import { PHASE_KEYS } from "./node-port-config.mjs";
import { getEffectiveDeedAttributes } from "../helpers/deed-behaviors/roll-accuracy.mjs";
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

    /**
     * Phase schema for deed phases metadata (descriptions and skip toggles).
     * Note: Behaviors are managed by the graph data model (graph.nodes & graph.connections).
     */
    const phaseSchema = () => new fields.SchemaField({
      description: new fields.StringField({ initial: "" }),
      skipPhase: new fields.BooleanField({ initial: false })
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
              initial: "inherit",
              choices: [...PHASE_KEYS, "inherit"]
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
    if (this.graph) {
      _sanitizeEffectsInGraph(this.graph);
    }
  }

  /**
   * Effective action type, taking into account any rollAccuracy node override.
   * @type {string}
   */
  get effectiveActionType() {
    return getEffectiveDeedAttributes(this).actionType;
  }

  /**
   * Effective ability type, taking into account any rollAccuracy node override.
   * @type {string}
   */
  get effectiveAbilityType() {
    return getEffectiveDeedAttributes(this).abilityType;
  }

  /**
   * Effective versus defense, taking into account any rollAccuracy node override.
   * @type {string}
   */
  get effectiveVersus() {
    return getEffectiveDeedAttributes(this).versus;
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;

    const existingNodes = data.system?.graph?.nodes ?? this.graph?.nodes;
    if (!existingNodes || existingNodes.length === 0) {
      const defaultGraph = createDefaultDeedGraph();
      this.parent.updateSource({ "system.graph": defaultGraph });
    }
  }

  /** @override */
  _preUpdate(changes, options, user) {
    const res = super._preUpdate(changes, options, user);
    if (res === false) return false;

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

/**
 * Creates the default behavior graph structure for new Deeds:
 * start -> selectTarget -> rollAccuracy -> (onHit) applyDamage
 *                                       -> (onSpark) applyEffects
 * @returns {{ nodes: Array<object>, connections: Array<object> }}
 */
export function createDefaultDeedGraph() {
  const startId = foundry.utils.randomID();
  const selectTargetId = foundry.utils.randomID();
  const rollAccuracyId = foundry.utils.randomID();
  const applyDamageId = foundry.utils.randomID();
  const applyEffectsId = foundry.utils.randomID();

  return {
    nodes: [
      {
        id: startId,
        type: "start",
        phase: "start",
        params: {},
        x: 60,
        y: 180
      },
      {
        id: selectTargetId,
        type: "selectTarget",
        phase: "inherit",
        params: {
          targetMode: "creatures",
          disposition: "any",
          targetCount: 1
        },
        x: 340,
        y: 180
      },
      {
        id: rollAccuracyId,
        type: "rollAccuracy",
        phase: "base",
        params: {
          branchingMode: "hitThenSpark"
        },
        x: 620,
        y: 180
      },
      {
        id: applyDamageId,
        type: "applyDamage",
        phase: "hit",
        params: {
          expression: ""
        },
        x: 900,
        y: 100
      },
      {
        id: applyEffectsId,
        type: "applyEffects",
        phase: "spark",
        params: {
          effects: []
        },
        x: 900,
        y: 260
      }
    ],
    connections: [
      {
        id: foundry.utils.randomID(),
        sourceId: startId,
        sourcePort: "out",
        targetId: selectTargetId,
        targetPort: "in",
        type: "flow"
      },
      {
        id: foundry.utils.randomID(),
        sourceId: selectTargetId,
        sourcePort: "out",
        targetId: rollAccuracyId,
        targetPort: "in",
        type: "flow"
      },
      {
        id: foundry.utils.randomID(),
        sourceId: rollAccuracyId,
        sourcePort: "onHit",
        targetId: applyDamageId,
        targetPort: "in",
        type: "flow"
      },
      {
        id: foundry.utils.randomID(),
        sourceId: rollAccuracyId,
        sourcePort: "onSpark",
        targetId: applyEffectsId,
        targetPort: "in",
        type: "flow"
      }
    ]
  };
}

