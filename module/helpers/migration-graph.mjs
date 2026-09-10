/**
 * migration-graph.mjs
 * Migration utility converting phase-based Deeds to the graph-based data model.
 */
import { PHASE_KEYS } from "../data/node-port-config.mjs";
import {
  detectInsteadOverrides,
  detectTargetScope,
  detectChoiceMode,
  detectSharedRoll,
  detectAoEDisposition,
  detectSparkBothInstead,
  detectMissingTerrain
} from "./migration-heuristics.mjs";
import { tryBuildSpecialDeedGraph } from "./migration-special-deeds.mjs";

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

  // Check for bespoke deed graph builder (e.g. Blood Gift)
  const specialGraph = tryBuildSpecialDeedGraph(source);
  if (specialGraph) return specialGraph;

  const nodes = [];
  const connections = [];

  const NODE_WIDTH = 240;
  const NODE_GAP_X = 80;
  const STEP_X = NODE_WIDTH + NODE_GAP_X; // 320

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

  let currentX = 60 + STEP_X;
  let lastMainNodeId = startNodeId;
  let lastMainPort = "out";

  const rawPhases = source.phases || {};
  const isAttack = source.actionType !== "support";

  // Compute full text for natural language heuristics
  const allDescs = [];
  if (source.description) allDescs.push(source.description);
  for (const [pk, pv] of Object.entries(rawPhases)) {
    if (pv?.description) allDescs.push(pv.description);
  }
  const fullDeedText = allDescs.join(" ").replace(/<[^>]*>/g, " ");

  // Natural language heuristics detection
  const insteadOverrides = detectInsteadOverrides(rawPhases);
  const sharedRoll = detectSharedRoll(rawPhases);
  const missBehaviors = [];
  let createdAreaNodeId = null;
  let sharedRollCreated = false;

  // Helper to extract behaviors from a phase (handles Array or Object map)
  const getPhaseBehaviors = (phaseKey) => {
    const p = rawPhases[phaseKey];
    if (!p || !p.behaviors) return [];
    const arr = Array.isArray(p.behaviors) ? p.behaviors : Object.values(p.behaviors);
    return foundry.utils.deepClone(arr);
  };

  // Convert modifyBehavior and enrich params if present
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

    const processed = {
      id: b.id || foundry.utils.randomID(),
      type: b.type,
      phase: phaseKey,
      params: foundry.utils.deepClone(b.params || {})
    };

    // Enrich applyEffects with targetScope and choiceMode heuristics
    if (processed.type === "applyEffects") {
      const desc = rawPhases[phaseKey]?.description || "";
      if (!processed.params.targetScope) {
        processed.params.targetScope = detectTargetScope(desc);
      }
      if (!processed.params.choiceMode) {
        processed.params.choiceMode = detectChoiceMode(desc, processed.params.effects);
      }
    }

    return processed;
  };

  // 1. Process pre-accuracy phases: start, before, base
  const preAccuracyPhases = ["start", "before", "base"];
  for (const pKey of preAccuracyPhases) {
    const behaviors = getPhaseBehaviors(pKey);
    for (const rawB of behaviors) {
      const b = processBehavior(rawB, pKey);
      if (!b) continue;

      // Split AoE selectTarget into selectArea (reference at y: 40) + selectTarget (area mode at y: 180)
      if (b.type === "selectTarget" && b.params?.targetMode === "aoe" && b.params?.aoeType !== "aura") {
        const areaId = foundry.utils.randomID();
        createdAreaNodeId = areaId;
        const areaNode = {
          id: areaId,
          type: "selectArea",
          phase: pKey,
          params: {
            targetMode: "aoe",
            aoeType: b.params.aoeType || "blast",
            aoeSize: b.params.aoeSize || 1
          },
          x: currentX,
          y: 40
        };
        nodes.push(areaNode);

        // Convert selectTarget to area mode referencing selectArea
        b.params = {
          targetMode: "area",
          areaBehaviorId: areaId
        };
        const aoeDisp = detectAoEDisposition(fullDeedText, source.actionType);
        if (aoeDisp) b.params.disposition = aoeDisp;
      }

      // Link terrain spawn to created area if applicable
      if (b.type === "spawnTerrain" && createdAreaNodeId) {
        b.params.areaBehaviorId = createdAreaNodeId;
      }

      // Shared roll for damage + healing (reference at y: 40)
      if (pKey === "base" && sharedRoll.isShared && !sharedRollCreated && b.type === "applyDamage") {
        const rollId = foundry.utils.randomID();
        sharedRollCreated = true;
        const rollNode = {
          id: rollId,
          type: "roll",
          phase: "base",
          params: {
            expression: sharedRoll.damageExpr,
            usePowerSparks: true
          },
          x: currentX,
          y: 40
        };
        nodes.push(rollNode);

        b.params.rollBehaviorId = rollId;
        delete b.params.expression;
      }

      // Mutually exclusive behavior overridden by hit "instead": route to onMiss branch
      if (pKey === "base" && (insteadOverrides.has(rawB.id) || insteadOverrides.has(b.id))) {
        b.phase = "base";
        missBehaviors.push(b);
        continue;
      }

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
      currentX += STEP_X;

      // Insert linked healTarget behavior after damage for shared roll
      if (sharedRoll.isShared && b.type === "applyDamage" && b.params.rollBehaviorId) {
        const healId = foundry.utils.randomID();
        const healNode = {
          id: healId,
          type: "healTarget",
          phase: "base",
          params: {
            rollBehaviorId: b.params.rollBehaviorId,
            expression: sharedRoll.healExpr,
            targetScope: "self"
          },
          x: currentX,
          y: 180
        };
        nodes.push(healNode);
        connections.push({
          id: foundry.utils.randomID(),
          sourceId: lastMainNodeId,
          sourcePort: lastMainPort,
          targetId: healNode.id,
          targetPort: "in",
          type: "flow"
        });
        lastMainNodeId = healNode.id;
        lastMainPort = "out";
        currentX += STEP_X;
      }
    }
  }

  // 2. Check if rollAccuracy node is needed
  const hitBehaviors = getPhaseBehaviors("hit");
  const sparkBehaviors = getPhaseBehaviors("spark");
  const needsAccuracy = isAttack || hitBehaviors.length > 0 || sparkBehaviors.length > 0 || missBehaviors.length > 0;

  let rollAccuracyNodeId = null;
  if (needsAccuracy) {
    rollAccuracyNodeId = foundry.utils.randomID();
    nodes.push({
      id: rollAccuracyNodeId,
      type: "rollAccuracy",
      phase: "base",
      params: {
        actionType: source.actionType || "attack",
        abilityType: source.abilityType || "versatile",
        versus: source.versus || "Guard",
        branchingMode: "hitThenSpark"
      },
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

    currentX += STEP_X;

    // Process 'hit' behaviors on onHit branch (y: 80)
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
      hitX += STEP_X;
    }

    // Process 'spark' behaviors on onSpark branch (y: 280)
    let lastSparkId = rollAccuracyNodeId;
    let lastSparkPort = "onSpark";
    let sparkX = currentX;
    if (sparkBehaviors.length > 0) {
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
        sparkX += STEP_X;
      }
    } else {
      const bothEffects = detectSparkBothInstead(rawPhases);
      if (bothEffects) {
        const b = {
          id: foundry.utils.randomID(),
          type: "applyEffects",
          phase: "spark",
          params: {
            effects: bothEffects,
            choiceMode: "all",
            targetScope: "target"
          },
          x: sparkX,
          y: 280
        };
        nodes.push(b);
        connections.push({
          id: foundry.utils.randomID(),
          sourceId: lastSparkId,
          sourcePort: lastSparkPort,
          targetId: b.id,
          targetPort: "in",
          type: "flow"
        });
        sparkX += STEP_X;
      }
    }

    // Process 'onMiss' behaviors for mutually exclusive "instead" base behaviors (y: 380)
    let lastMissId = rollAccuracyNodeId;
    let lastMissPort = "onMiss";
    let missX = currentX;
    for (const b of missBehaviors) {
      b.x = missX;
      b.y = 380;
      nodes.push(b);

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: lastMissId,
        sourcePort: lastMissPort,
        targetId: b.id,
        targetPort: "in",
        type: "flow"
      });

      lastMissId = b.id;
      lastMissPort = "out";
      missX += STEP_X;
    }

    currentX = Math.max(hitX, sparkX, missX, currentX);
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
      currentX += STEP_X;
    }
  }

  // 4. Missing text-only terrain creation
  if (!nodes.some(n => n.type === "spawnTerrain")) {
    const terrainSpec = detectMissingTerrain(fullDeedText);
    if (terrainSpec) {
      const terrainNode = {
        id: foundry.utils.randomID(),
        type: "spawnTerrain",
        phase: "base",
        params: {
          difficult: terrainSpec.difficult,
          areaBehaviorId: createdAreaNodeId || undefined
        },
        x: currentX,
        y: 180
      };
      nodes.push(terrainNode);
      connections.push({
        id: foundry.utils.randomID(),
        sourceId: lastMainNodeId,
        sourcePort: lastMainPort,
        targetId: terrainNode.id,
        targetPort: "in",
        type: "flow"
      });
      lastMainNodeId = terrainNode.id;
      lastMainPort = "out";
      currentX += STEP_X;
    }
  }

  // 5. Create reference connections for ID-based params
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const refTypes = [
    { param: "rollBehaviorId", port: "rollRef" },
    { param: "areaBehaviorId", port: "areaRef" },
    { param: "terrainBehaviorId", port: "terrainRef" }
  ];
  for (const node of nodes) {
    if (!node.params) continue;
    for (const { param, port } of refTypes) {
      const srcId = node.params[param];
      if (srcId && nodeMap.has(srcId)) {
        connections.push({
          id: foundry.utils.randomID(),
          sourceId: srcId,
          sourcePort: "out",
          targetId: node.id,
          targetPort: port,
          type: "reference"
        });
      }
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
