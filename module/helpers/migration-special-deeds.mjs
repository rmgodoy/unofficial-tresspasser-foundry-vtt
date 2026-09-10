/**
 * migration-special-deeds.mjs
 * Custom graph builders for unique and complex deeds (e.g. Blood Gift).
 */

/**
 * Checks if a deed requires a dedicated bespoke graph layout.
 * @param {object} source - Deed system data
 * @param {object} options
 * @returns {object|null} Migrated deed system data, or null to use standard pipeline
 */
export function tryBuildSpecialDeedGraph(source, options = {}) {
  if (!source) return null;
  const name = (source.name || options.name || "").trim().toLowerCase();
  const baseDesc = (source.phases?.base?.description || source.effects?.base?.description || "").toLowerCase();

  if (name === "blood gift" || (baseDesc.includes("damage to yourself") && baseDesc.includes("restore that many hit points"))) {
    return buildBloodGiftGraph(source, options);
  }

  return null;
}

/**
 * Builds the graph for Blood Gift:
 * - Floating selectArea (Burst 6) at y: 40 (reference only)
 * - Floating roll (2<sd>) at y: 40 (reference only)
 * - Main flow: start -> selectTarget (self) -> rollAccuracy (support vs 10)
 * - On Hit: applyDamage (3<sd> to self) -> selectTarget (area, other creatures) -> healTarget (3<sd>, distributed)
 * - On Miss: applyDamage (2<sd> to self, via rollRef) -> selectTarget (area, other creatures) -> healTarget (via rollRef, distributed)
 */
function buildBloodGiftGraph(source, options = {}) {
  const nodes = [];
  const connections = [];

  const startId = foundry.utils.randomID();
  const areaId = foundry.utils.randomID();
  const rollId = foundry.utils.randomID();
  const selfTargetId = foundry.utils.randomID();
  const accuracyId = foundry.utils.randomID();

  const hitDmgId = foundry.utils.randomID();
  const hitAreaTargetId = foundry.utils.randomID();
  const hitHealId = foundry.utils.randomID();

  const missDmgId = foundry.utils.randomID();
  const missAreaTargetId = foundry.utils.randomID();
  const missHealId = foundry.utils.randomID();

  // 1. Mandatory Root Start Node
  nodes.push({
    id: startId,
    type: "start",
    phase: "start",
    params: {},
    x: 60,
    y: 180
  });

  // 2. Reference Nodes (y: 40, no flow connections)
  nodes.push({
    id: areaId,
    type: "selectArea",
    phase: "before",
    params: {
      targetMode: "aoe",
      aoeType: "burst",
      aoeSize: 6
    },
    x: 380,
    y: 40
  });

  nodes.push({
    id: rollId,
    type: "roll",
    phase: "base",
    params: {
      expression: "2<sd>",
      usePowerSparks: true
    },
    x: 700,
    y: 40
  });

  // 3. Main Pre-Accuracy Flow (Self Target -> Roll Accuracy)
  nodes.push({
    id: selfTargetId,
    type: "selectTarget",
    phase: "before",
    params: {
      targetMode: "self"
    },
    x: 380,
    y: 180
  });

  nodes.push({
    id: accuracyId,
    type: "rollAccuracy",
    phase: "base",
    params: {
      actionType: "support",
      abilityType: "spell",
      versus: "10",
      branchingMode: "hitThenSpark"
    },
    x: 700,
    y: 180
  });

  // Flow: start -> selectTarget (self) -> rollAccuracy
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: startId,
    sourcePort: "out",
    targetId: selfTargetId,
    targetPort: "in",
    type: "flow"
  });

  connections.push({
    id: foundry.utils.randomID(),
    sourceId: selfTargetId,
    sourcePort: "out",
    targetId: accuracyId,
    targetPort: "in",
    type: "flow"
  });

  // 4. Hit Branch (y: 80): Self Damage 3<sd> -> Area Targets (other creatures) -> Heal 3<sd>
  nodes.push({
    id: hitDmgId,
    type: "applyDamage",
    phase: "hit",
    params: {
      expression: "3<sd>"
    },
    x: 1020,
    y: 80
  });

  nodes.push({
    id: hitAreaTargetId,
    type: "selectTarget",
    phase: "hit",
    params: {
      targetMode: "area",
      areaBehaviorId: areaId,
      ignoreSelf: true
    },
    x: 1340,
    y: 80
  });

  nodes.push({
    id: hitHealId,
    type: "healTarget",
    phase: "hit",
    params: {
      expression: "3<sd>",
      distribute: true
    },
    x: 1660,
    y: 80
  });

  // Flow: onHit -> hitDmg -> hitAreaTarget -> hitHeal
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: accuracyId,
    sourcePort: "onHit",
    targetId: hitDmgId,
    targetPort: "in",
    type: "flow"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: hitDmgId,
    sourcePort: "out",
    targetId: hitAreaTargetId,
    targetPort: "in",
    type: "flow"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: hitAreaTargetId,
    sourcePort: "out",
    targetId: hitHealId,
    targetPort: "in",
    type: "flow"
  });

  // 5. Miss / Base Branch (y: 380): Self Damage 2<sd> (shared roll) -> Area Targets (other creatures) -> Heal (shared roll)
  nodes.push({
    id: missDmgId,
    type: "applyDamage",
    phase: "base",
    params: {
      rollBehaviorId: rollId
    },
    x: 1020,
    y: 380
  });

  nodes.push({
    id: missAreaTargetId,
    type: "selectTarget",
    phase: "base",
    params: {
      targetMode: "area",
      areaBehaviorId: areaId,
      ignoreSelf: true
    },
    x: 1340,
    y: 380
  });

  nodes.push({
    id: missHealId,
    type: "healTarget",
    phase: "base",
    params: {
      rollBehaviorId: rollId,
      distribute: true
    },
    x: 1660,
    y: 380
  });

  // Flow: onMiss -> missDmg -> missAreaTarget -> missHeal
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: accuracyId,
    sourcePort: "onMiss",
    targetId: missDmgId,
    targetPort: "in",
    type: "flow"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: missDmgId,
    sourcePort: "out",
    targetId: missAreaTargetId,
    targetPort: "in",
    type: "flow"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: missAreaTargetId,
    sourcePort: "out",
    targetId: missHealId,
    targetPort: "in",
    type: "flow"
  });

  // 6. Reference Connections
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: areaId,
    sourcePort: "out",
    targetId: hitAreaTargetId,
    targetPort: "areaRef",
    type: "reference"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: areaId,
    sourcePort: "out",
    targetId: missAreaTargetId,
    targetPort: "areaRef",
    type: "reference"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: rollId,
    sourcePort: "out",
    targetId: missDmgId,
    targetPort: "rollRef",
    type: "reference"
  });
  connections.push({
    id: foundry.utils.randomID(),
    sourceId: rollId,
    sourcePort: "out",
    targetId: missHealId,
    targetPort: "rollRef",
    type: "reference"
  });

  // Clean phases object
  const cleanedPhases = {};
  for (const pKey of ["start", "before", "base", "hit", "spark", "after", "end"]) {
    cleanedPhases[pKey] = {
      description: source.phases?.[pKey]?.description || "",
      skipPhase: !!source.phases?.[pKey]?.skipPhase,
      behaviors: []
    };
  }

  source.graph = { nodes, connections };
  source.graphVersion = 1;
  source.phases = cleanedPhases;

  return source;
}
