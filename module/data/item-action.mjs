import { BEHAVIOR_TYPES } from "./item-deed.mjs";
import { PHASE_KEYS } from "./node-port-config.mjs";

/**
 * Creates the default behavior graph structure for new Actions:
 * Only the root start node, no connections.
 * @returns {{ nodes: Array<object>, connections: Array<object> }}
 */
export function createDefaultActionGraph() {
  const startId = foundry.utils.randomID();
  return {
    nodes: [
      {
        id: startId,
        type: "start",
        phase: "start",
        params: {},
        x: 60,
        y: 180
      }
    ],
    connections: []
  };
}

/**
 * Data model for the Trespasser TTRPG Action item type.
 */
export class TrespasserActionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      apCost: new fields.NumberField({
        initial: 1,
        min: 0,
        integer: true
      }),
      description: new fields.HTMLField({ initial: "" }),
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
      })
    };
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    if (this.graph?.nodes) {
      for (const node of this.graph.nodes) {
        if (node?.params?.effects) {
          if (!Array.isArray(node.params.effects) && typeof node.params.effects === "object") {
            node.params.effects = Object.values(node.params.effects);
          }
        }
      }
    }
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;

    const existingNodes = data.system?.graph?.nodes ?? this.graph?.nodes;
    if (!existingNodes || existingNodes.length === 0) {
      const defaultGraph = createDefaultActionGraph();
      this.parent.updateSource({ "system.graph": defaultGraph });
    }
  }
}
