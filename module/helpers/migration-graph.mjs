/**
 * migration-graph.mjs
 * Migration utility converting phase-based Deeds to the graph-based data model.
 */
import { PHASE_KEYS } from "../data/node-port-config.mjs";

/**
 * Converts deed system source data to the graph data model format.
 * @param {object} source - Raw deed system data
 * @returns {object} Updated deed system data
 */
export function migrateToGraph(source) {
  if (!source || typeof source !== "object") return source;

  // Skip if already migrated
  if ((source.graphVersion && source.graphVersion >= 1) || (source.graph?.nodes && source.graph.nodes.length > 0)) {
    return source;
  }

  // Backup legacy phases for safety
  if (source.phases && !source.legacyPhases) {
    source.legacyPhases = foundry.utils.deepClone(source.phases);
  }

  const nodes = [];
  const connections = [];

  // Create mandatory Start root node
  const startNodeId = foundry.utils.randomID();
  nodes.push({
    id: startNodeId,
    type: "start",
    phase: "start",
    params: {},
    x: 60,
    y: 180
  });

  let currentX = 260;
  let lastMainNodeId = startNodeId;
  let lastMainPort = "out";

  const rawPhases = source.phases || {};
  const isAttack = source.actionType !== "support";

  // Helper to extract behaviors from a phase (handles Array or Object map)
  const getPhaseBehaviors = (phaseKey) => {
    const p = rawPhases[phaseKey];
    if (!p || !p.behaviors) return [];
    const arr = Array.isArray(p.behaviors) ? p.behaviors : Object.values(p.behaviors);
    return foundry.utils.deepClone(arr);
  };

  // Convert modifyBehavior to standalone node if present
  const processBehavior = (b, phaseKey) => {
    if (b.type === "modifyBehavior") {
      const prop = b.params?.property;
      const mod = (b.params?.modifier || "").trim();
      if (prop === "damage") {
        return {
          id: b.id || foundry.utils.randomID(),
          type: "applyDamage",
          phase: phaseKey,
          params: { expression: mod }
        };
      } else if (prop === "healing") {
        return {
          id: b.id || foundry.utils.randomID(),
          type: "healTarget",
          phase: phaseKey,
          params: { expression: mod }
        };
      }
      return null;
    }
    return {
      id: b.id || foundry.utils.randomID(),
      type: b.type,
      phase: phaseKey,
      params: foundry.utils.deepClone(b.params || {})
    };
  };

  // 1. Process pre-accuracy phases: start, before, base
  const preAccuracyPhases = ["start", "before", "base"];
  for (const pKey of preAccuracyPhases) {
    const behaviors = getPhaseBehaviors(pKey);
    for (const rawB of behaviors) {
      const b = processBehavior(rawB, pKey);
      if (!b) continue;

      b.x = currentX;
      b.y = 180;
      nodes.push(b);

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: lastMainNodeId,
        sourcePort: lastMainPort,
        targetId: b.id,
        targetPort: "in",
        type: "flow"
      });

      lastMainNodeId = b.id;
      lastMainPort = "out";
      currentX += 220;
    }
  }

  // 2. Check if rollAccuracy node is needed
  const hitBehaviors = getPhaseBehaviors("hit");
  const sparkBehaviors = getPhaseBehaviors("spark");
  const needsAccuracy = isAttack || hitBehaviors.length > 0 || sparkBehaviors.length > 0;

  let rollAccuracyNodeId = null;
  if (needsAccuracy) {
    rollAccuracyNodeId = foundry.utils.randomID();
    nodes.push({
      id: rollAccuracyNodeId,
      type: "rollAccuracy",
      phase: "base",
      params: {},
      x: currentX,
      y: 180
    });

    connections.push({
      id: foundry.utils.randomID(),
      sourceId: lastMainNodeId,
      sourcePort: lastMainPort,
      targetId: rollAccuracyNodeId,
      targetPort: "in",
      type: "flow"
    });

    currentX += 240;

    // Process 'hit' behaviors on onHit branch
    let lastHitId = rollAccuracyNodeId;
    let lastHitPort = "onHit";
    let hitX = currentX;
    for (const rawB of hitBehaviors) {
      const b = processBehavior(rawB, "hit");
      if (!b) continue;
      b.x = hitX;
      b.y = 80;
      nodes.push(b);

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: lastHitId,
        sourcePort: lastHitPort,
        targetId: b.id,
        targetPort: "in",
        type: "flow"
      });

      lastHitId = b.id;
      lastHitPort = "out";
      hitX += 220;
    }

    // Process 'spark' behaviors on onSpark branch
    let lastSparkId = rollAccuracyNodeId;
    let lastSparkPort = "onSpark";
    let sparkX = currentX;
    for (const rawB of sparkBehaviors) {
      const b = processBehavior(rawB, "spark");
      if (!b) continue;
      b.x = sparkX;
      b.y = 280;
      nodes.push(b);

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: lastSparkId,
        sourcePort: lastSparkPort,
        targetId: b.id,
        targetPort: "in",
        type: "flow"
      });

      lastSparkId = b.id;
      lastSparkPort = "out";
      sparkX += 220;
    }

    currentX = Math.max(hitX, sparkX, currentX + 220);
    lastMainNodeId = rollAccuracyNodeId;
    lastMainPort = "always";
  }

  // 3. Process post-accuracy phases: after, end
  const postAccuracyPhases = ["after", "end"];
  for (const pKey of postAccuracyPhases) {
    const behaviors = getPhaseBehaviors(pKey);
    for (const rawB of behaviors) {
      const b = processBehavior(rawB, pKey);
      if (!b) continue;

      b.x = currentX;
      b.y = 180;
      nodes.push(b);

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: lastMainNodeId,
        sourcePort: lastMainPort,
        targetId: b.id,
        targetPort: "in",
        type: "flow"
      });

      lastMainNodeId = b.id;
      lastMainPort = "out";
      currentX += 220;
    }
  }

  // 4. Create reference connections for ID-based params
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    if (!node.params) continue;

    // rollBehaviorId -> rollRef
    if (node.params.rollBehaviorId && nodeMap.has(node.params.rollBehaviorId)) {
      connections.push({
        id: foundry.utils.randomID(),
        sourceId: node.params.rollBehaviorId,
        sourcePort: "out",
        targetId: node.id,
        targetPort: "rollRef",
        type: "reference"
      });
    }

    // areaBehaviorId -> areaRef
    if (node.params.areaBehaviorId && nodeMap.has(node.params.areaBehaviorId)) {
      connections.push({
        id: foundry.utils.randomID(),
        sourceId: node.params.areaBehaviorId,
        sourcePort: "out",
        targetId: node.id,
        targetPort: "areaRef",
        type: "reference"
      });
    }

    // terrainBehaviorId -> terrainRef
    if (node.params.terrainBehaviorId && nodeMap.has(node.params.terrainBehaviorId)) {
      connections.push({
        id: foundry.utils.randomID(),
        sourceId: node.params.terrainBehaviorId,
        sourcePort: "out",
        targetId: node.id,
        targetPort: "terrainRef",
        type: "reference"
      });
    }
  }

  // Clean phases so it retains descriptions and skipPhase flags
  const cleanedPhases = {};
  for (const pKey of PHASE_KEYS) {
    cleanedPhases[pKey] = {
      description: rawPhases[pKey]?.description || "",
      skipPhase: !!rawPhases[pKey]?.skipPhase,
      behaviors: []
    };
  }

  source.graph = { nodes, connections };
  source.graphVersion = 1;
  source.phases = cleanedPhases;

  return source;
}
