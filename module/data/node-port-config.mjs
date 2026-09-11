/**
 * node-port-config.mjs
 * Static registry of behavior node types and their available flow/reference ports in the Trespasser graph system.
 */

export const PHASE_KEYS = [
  "start",
  "before",
  "base",
  "hit",
  "spark",
  "after",
  "end"
];

export const FLOW_CONDITION_PORTS = [
  "out",
  "onHit",
  "onMiss",
  "onSpark",
  "always",
  "onTrue",
  "onFalse"
];

export const REF_PORT_KEYS = [
  "rollRef",
  "areaRef",
  "terrainRef",
  "targetRef",
  "result",
  "source"
];

/**
 * Port configuration registry per behavior type.
 * - inputs: Flow input ports
 * - outputs: Flow output ports (conditions or default "out")
 * - refInputs: Data reference input ports (dashed connection lines)
 * - refOutputs: Data reference output ports (e.g. result for switch source)
 */
export const NODE_PORT_CONFIG = {
  start: {
    inputs: [],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  rollAccuracy: {
    inputs: ["in"],
    outputs: ["out", "onMiss", "onHit", "onSpark"],
    refInputs: [],
    refOutputs: ["result"]
  },
  selectTarget: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["areaRef"],
    refOutputs: []
  },
  selectArea: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  roll: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["rollRef"],
    refOutputs: []
  },
  applyDamage: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["rollRef"],
    refOutputs: []
  },
  healTarget: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["rollRef"],
    refOutputs: []
  },
  grantRecovery: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  applyEffects: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  spawnTerrain: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["areaRef"],
    refOutputs: []
  },
  moveTerrain: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["terrainRef"],
    refOutputs: []
  },
  moveSource: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["areaRef"],
    refOutputs: []
  },
  forceMoveTargets: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  clearTargets: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  executeDeed: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  },
  condition: {
    inputs: ["in"],
    outputs: ["onTrue", "onFalse"],
    refInputs: ["rollRef", "areaRef"],
    refOutputs: ["result"]
  },
  switch: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["source"],
    refOutputs: []
  }
};

/**
 * Returns the available options provided by an option provider source node.
 * @param {object} sourceNode - Node data object
 * @returns {Array<{id: string, label: string}>}
 */
export function getSourceOptions(sourceNode) {
  if (!sourceNode) return [];
  const i18n = globalThis.game?.i18n;
  if (sourceNode.type === "rollAccuracy") {
    return [
      { id: "onMiss", label: i18n?.localize?.("TRESPASSER.Sheet.Deed.Graph.Port.OnMiss") || "Miss" },
      { id: "onHit", label: i18n?.localize?.("TRESPASSER.Sheet.Deed.Graph.Port.OnHit") || "Hit" },
      { id: "onSpark", label: i18n?.localize?.("TRESPASSER.Sheet.Deed.Graph.Port.OnSpark") || "Spark" }
    ];
  }
  if (sourceNode.type === "condition") {
    return [
      { id: "onTrue", label: i18n?.localize?.("TRESPASSER.Sheet.Deed.Graph.Port.OnTrue") || "True" },
      { id: "onFalse", label: i18n?.localize?.("TRESPASSER.Sheet.Deed.Graph.Port.OnFalse") || "False" }
    ];
  }
  return [];
}

/**
 * Returns the port config for a specific node or node type.
 * For switch nodes, dynamically resolves inputs based on the connected source.
 * @param {string|object} typeOrNode - Type string or node object
 * @param {object} [graph] - Full graph data { nodes, connections }
 * @returns {{inputs: string[], outputs: string[], refInputs: string[], refOutputs: string[]}}
 */
export function getNodePortConfig(typeOrNode, graph = null) {
  const isNodeObj = typeof typeOrNode === "object" && typeOrNode !== null;
  const type = isNodeObj ? typeOrNode.type : typeOrNode;
  const baseConfig = NODE_PORT_CONFIG[type] ?? {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: [],
    refOutputs: []
  };

  const config = {
    inputs: [...(baseConfig.inputs || ["in"])],
    outputs: [...(baseConfig.outputs || ["out"])],
    refInputs: [...(baseConfig.refInputs || [])],
    refOutputs: [...(baseConfig.refOutputs || [])]
  };

  if (type === "switch" && isNodeObj && graph) {
    const conns = Array.isArray(graph.connections)
      ? graph.connections
      : Array.from(graph.connections?.values?.() || []);
    const sourceConn = conns.find(
      c => c.targetId === typeOrNode.id && c.targetPort === "source"
    );
    const sourceId = sourceConn ? sourceConn.sourceId : typeOrNode.params?.sourceBehaviorId;
    if (sourceId) {
      let sourceNode = null;
      if (Array.isArray(graph.nodes)) {
        sourceNode = graph.nodes.find(n => (n.id || n.data?.id) === sourceId);
      } else if (graph.nodes instanceof Map) {
        sourceNode = graph.nodes.get(sourceId);
      }
      if (sourceNode?.data) sourceNode = sourceNode.data;
      if (sourceNode) {
        const options = getSourceOptions(sourceNode);
        config.inputs = ["in", ...options.map(o => o.id)];
      }
    }
  }

  return config;
}

/**
 * Checks whether a port is a reference port.
 * @param {string} portName
 * @returns {boolean}
 */
export function isReferencePort(portName) {
  return REF_PORT_KEYS.includes(portName);
}
