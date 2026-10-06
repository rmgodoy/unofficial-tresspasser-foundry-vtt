/**
 * scripts/mcp/handlers/deed-validator.mjs
 * Graph linter and validator for Trespasser Deeds in Foundry V14.
 * Evaluates node placement, port integrity, reference isolation, and descriptive heuristics.
 */
import { NODE_PORT_CONFIG } from "../../../module/data/node-port-config.mjs";

/**
 * Validate a Deed document or Deed system object.
 * @param {object} deedOrSystem - Full Deed item document or deed.system
 * @returns {object} { valid: boolean, errors: Array<object>, warnings: Array<object>, summary: string }
 */
export function handleValidateDeedGraph(deedOrSystem = {}) {
  const sys = deedOrSystem.system || deedOrSystem;
  const graph = sys.graph || { nodes: [], connections: [] };
  const nodes = graph.nodes || [];
  const connections = graph.connections || [];

  const errors = [];
  const warnings = [];

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeTypes = new Set(nodes.map(n => n.type));

  // 1. Mandatory Root 'start' node
  const startNodes = nodes.filter(n => n.type === "start");
  if (startNodes.length === 0) {
    errors.push({
      code: "MISSING_START_NODE",
      message: "The deed graph lacks a 'start' root node."
    });
  } else if (startNodes.length > 1) {
    warnings.push({
      code: "MULTIPLE_START_NODES",
      message: `Found ${startNodes.length} 'start' nodes. Only one root start node is expected.`
    });
  }

  // 2. Reference Nodes in Flow Check
  // 'selectArea' and 'roll' must be isolated reference nodes, never in the main flow line
  const flowConns = connections.filter(c => c.type === "flow");
  for (const node of nodes) {
    if (node.type === "selectArea" || node.type === "roll") {
      const inFlow = flowConns.filter(c => c.targetId === node.id);
      const outFlow = flowConns.filter(c => c.sourceId === node.id);
      if (inFlow.length > 0 || outFlow.length > 0) {
        errors.push({
          code: "REF_NODE_IN_FLOW",
          nodeId: node.id,
          nodeType: node.type,
          message: `${node.type} (${node.id}) has flow connections (${inFlow.length} in, ${outFlow.length} out). It must be an isolated reference node linked only via reference ports (y: 40).`
        });
      }
    }
  }

  // 3. Broken or Dangling Connections
  for (const conn of connections) {
    if (!nodeMap.has(conn.sourceId)) {
      errors.push({
        code: "BROKEN_SOURCE_CONNECTION",
        connId: conn.id,
        sourceId: conn.sourceId,
        message: `Connection ${conn.id} points to non-existent sourceId: ${conn.sourceId}.`
      });
    }
    if (!nodeMap.has(conn.targetId)) {
      errors.push({
        code: "BROKEN_TARGET_CONNECTION",
        connId: conn.id,
        targetId: conn.targetId,
        message: `Connection ${conn.id} points to non-existent targetId: ${conn.targetId}.`
      });
    }
  }

  // 4. Port Validity Checks
  for (const conn of connections) {
    const sourceNode = nodeMap.get(conn.sourceId);
    const targetNode = nodeMap.get(conn.targetId);
    if (!sourceNode || !targetNode) continue;

    const sourceConfig = NODE_PORT_CONFIG[sourceNode.type];
    const targetConfig = NODE_PORT_CONFIG[targetNode.type];

    if (sourceConfig) {
      const validOuts = conn.type === "reference"
        ? (sourceConfig.refOutputs || [])
        : (sourceConfig.outputs || []);
      // Special: switch and condition can expose outputs dynamically
      if (validOuts.length > 0 && !validOuts.includes(conn.sourcePort) && sourceNode.type !== "switch") {
        warnings.push({
          code: "UNEXPECTED_SOURCE_PORT",
          connId: conn.id,
          nodeType: sourceNode.type,
          port: conn.sourcePort,
          message: `Source node '${sourceNode.type}' does not declare port '${conn.sourcePort}'. Expected: [${validOuts.join(", ")}].`
        });
      }
    }

    if (targetConfig) {
      const validIns = conn.type === "reference"
        ? (targetConfig.refInputs || [])
        : (targetConfig.inputs || []);
      if (validIns.length > 0 && !validIns.includes(conn.targetPort) && targetNode.type !== "switch") {
        warnings.push({
          code: "UNEXPECTED_TARGET_PORT",
          connId: conn.id,
          nodeType: targetNode.type,
          port: conn.targetPort,
          message: `Target node '${targetNode.type}' does not declare port '${conn.targetPort}'. Expected: [${validIns.join(", ")}].`
        });
      }
    }
  }

  // 5. Node Visual Overlaps Check
  const coordMap = new Map();
  for (const node of nodes) {
    const key = `${node.x},${node.y}`;
    if (coordMap.has(key)) {
      warnings.push({
        code: "COORDINATE_OVERLAP",
        nodeId: node.id,
        otherNodeId: coordMap.get(key).id,
        coordinates: key,
        message: `Node '${node.type}' overlaps with '${coordMap.get(key).type}' at coordinates (${key}). Offset coordinates to avoid UI overlap.`
      });
    } else {
      coordMap.set(key, node);
    }
  }

  // 6. Descriptive Natural Language Heuristics
  const phaseTexts = [];
  if (sys.description) phaseTexts.push(sys.description);
  for (const p of Object.values(sys.phases || {})) {
    if (p?.description) phaseTexts.push(p.description);
  }
  const cleanText = phaseTexts.join(" ").replace(/<[^>]*>/g, " ");

  // Self-damage check
  if (/(?:damage to yourself|take\s+(\d+|<sd>|skill die).*?damage|suffer\s+(\d+|<sd>|skill die).*?damage)/i.test(cleanText)) {
    const hasSelfTarget = nodes.some(n => n.type === "selectTarget" && n.params?.targetMode === "self");
    if (!hasSelfTarget) {
      warnings.push({
        code: "MISSING_SELF_TARGET",
        message: "Deed text mentions self-damage, but no 'selectTarget (self)' node was found before applyDamage."
      });
    }
  }

  // Terrain creation text check
  if (/(?:create a field of|creates? difficult terrain|create a wall of|place a \d+x\d+)/i.test(cleanText)) {
    if (!nodeTypes.has("spawnTerrain")) {
      warnings.push({
        code: "MISSING_SPAWN_TERRAIN",
        message: "Deed text mentions creating terrain, but no 'spawnTerrain' node exists in graph."
      });
    }
  }

  // Summon creature text check
  if (/(?:summon\s+(\d+|a|an)\s+|summons?\s+creatures?)/i.test(cleanText)) {
    if (!nodeTypes.has("summonCreature")) {
      warnings.push({
        code: "MISSING_SUMMON_CREATURE",
        message: "Deed text mentions summoning creature(s), but no 'summonCreature' node exists in graph."
      });
    }
  }

  // Spark text check
  if (/spark[:\s]/i.test(cleanText) || /on a spark/i.test(cleanText)) {
    const hasSparkBranch = connections.some(c => c.sourcePort === "onSpark");
    const hasSparkPhaseNode = nodes.some(n => n.phase === "spark");
    if (!hasSparkBranch && !hasSparkPhaseNode) {
      warnings.push({
        code: "MISSING_SPARK_HANDLING",
        message: "Deed text mentions spark behavior, but no node is wired to 'onSpark' or in phase 'spark'."
      });
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    summary: valid
      ? (warnings.length > 0 ? `Valid with ${warnings.length} warning(s).` : "Graph is completely valid and clean.")
      : `Invalid: ${errors.length} error(s) found.`
  };
}
