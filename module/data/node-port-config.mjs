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
  "always"
];

export const REF_PORT_KEYS = [
  "rollRef",
  "areaRef",
  "terrainRef",
  "targetRef"
];

/**
 * Port configuration registry per behavior type.
 * - inputs: Flow input ports
 * - outputs: Flow output ports (conditions or default "out")
 * - refInputs: Data reference input ports (dashed connection lines)
 */
export const NODE_PORT_CONFIG = {
  start: {
    inputs: [],
    outputs: ["out"],
    refInputs: []
  },
  rollAccuracy: {
    inputs: ["in"],
    outputs: ["onHit", "onMiss", "onSpark", "always"],
    refInputs: []
  },
  selectTarget: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["areaRef"]
  },
  selectArea: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  },
  roll: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["rollRef"]
  },
  applyDamage: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["rollRef"]
  },
  healTarget: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["rollRef"]
  },
  grantRecovery: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  },
  applyEffects: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  },
  spawnTerrain: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["areaRef"]
  },
  moveTerrain: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["terrainRef"]
  },
  moveSource: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: ["areaRef"]
  },
  forceMoveTargets: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  },
  clearTargets: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  },
  executeDeed: {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  }
};

/**
 * Returns the port config for a specific node type.
 * @param {string} type
 * @returns {{inputs: string[], outputs: string[], refInputs: string[]}}
 */
export function getNodePortConfig(type) {
  return NODE_PORT_CONFIG[type] ?? {
    inputs: ["in"],
    outputs: ["out"],
    refInputs: []
  };
}

/**
 * Checks whether a port is a reference port.
 * @param {string} portName
 * @returns {boolean}
 */
export function isReferencePort(portName) {
  return REF_PORT_KEYS.includes(portName);
}
