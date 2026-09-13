/**
 * scripts/mcp/handlers/deed-builder.mjs
 * Declarative compiler and visual graph builder for Trespasser Deeds in Foundry V14.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFoundryId, sanitizeFileName } from "./effect-builder.mjs";
import { handleValidateDeedGraph } from "./deed-validator.mjs";
import { resolveItemInfo, registerRecentItem, invalidateCompendiumCache } from "./compendium-search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.resolve(__dirname, "../../../json-packs/trespasser-content");

const STEP_X = 320;

/**
 * Creates a flow connection between two nodes.
 */
function createFlowConnection(sourceId, sourcePort, targetId, targetPort = "in") {
  return {
    id: generateFoundryId(),
    sourceId,
    sourcePort,
    targetId,
    targetPort,
    type: "flow"
  };
}

/**
 * Creates a data reference connection between two nodes.
 */
function createRefConnection(sourceId, targetId, targetPort) {
  return {
    id: generateFoundryId(),
    sourceId,
    sourcePort: "out",
    targetId,
    targetPort,
    type: "reference"
  };
}

/**
 * Normalizes and builds a graph node object.
 */
function buildNode(type, phase, params, x, y) {
  return {
    id: generateFoundryId(),
    type,
    phase: phase || "base",
    params: params || {},
    x,
    y
  };
}

/**
 * Compiles declarative deed specifications into a complete Behavior Graph.
 * @param {object} spec - High-level deed definition
 * @returns {Promise<object>} { nodes, connections, phases }
 */
async function compileDeclarativeGraph(spec) {
  const nodes = [];
  const connections = [];

  // 1. Mandatory Root Start Node
  const startNode = buildNode("start", "start", {}, 60, 180);
  nodes.push(startNode);

  let currentX = 60 + STEP_X;
  let lastMainId = startNode.id;
  let lastMainPort = "out";

  let createdAreaId = null;
  const targeting = spec.targeting || {};

  // 2. Targeting Resolution
  if (targeting.mode === "aoe") {
    // Isolated reference node at y: 40
    const areaNode = buildNode("selectArea", "base", {
      targetMode: "aoe",
      aoeType: targeting.aoeType || "blast",
      aoeSize: Number(targeting.aoeSize || 1)
    }, currentX, 40);
    nodes.push(areaNode);
    createdAreaId = areaNode.id;

    // Main flow node at y: 180 referencing selectArea
    const targetNode = buildNode("selectTarget", "base", {
      targetMode: "area",
      areaBehaviorId: areaNode.id,
      disposition: targeting.disposition || "any",
      areaRelation: "inside",
      ignoreSelf: targeting.ignoreSelf !== false
    }, currentX, 180);
    nodes.push(targetNode);

    connections.push(createFlowConnection(lastMainId, lastMainPort, targetNode.id, "in"));
    connections.push(createRefConnection(areaNode.id, targetNode.id, "areaRef"));

    lastMainId = targetNode.id;
    lastMainPort = "out";
    currentX += STEP_X;
  } else if (targeting.mode === "self") {
    const targetNode = buildNode("selectTarget", "base", {
      targetMode: "self"
    }, currentX, 180);
    nodes.push(targetNode);

    connections.push(createFlowConnection(lastMainId, lastMainPort, targetNode.id, "in"));
    lastMainId = targetNode.id;
    lastMainPort = "out";
    currentX += STEP_X;
  } else if (targeting.mode === "creatures" || !targeting.mode) {
    const targetNode = buildNode("selectTarget", "base", {
      targetMode: "creatures",
      targetCount: Number(targeting.count || 1),
      disposition: targeting.disposition || "any",
      ignoreSelf: targeting.ignoreSelf !== false
    }, currentX, 180);
    nodes.push(targetNode);

    connections.push(createFlowConnection(lastMainId, lastMainPort, targetNode.id, "in"));
    lastMainId = targetNode.id;
    lastMainPort = "out";
    currentX += STEP_X;
  }

  // 3. Helper to insert an action node
  const appendActionNode = async (action, phaseKey, x, y, incomingId, incomingPort) => {
    const nodeParams = { ...(action.params || action) };
    delete nodeParams.type;

    // Link terrain spawn to created area if in selected_area placement
    if (action.type === "spawnTerrain") {
      if (createdAreaId && (nodeParams.placement === "selected_area" || !nodeParams.placement)) {
        nodeParams.placement = "selected_area";
        nodeParams.areaBehaviorId = createdAreaId;
      }
      if (!nodeParams.terrainImg || !nodeParams.terrainImg.trim() || !nodeParams.terrainUuid) {
        const info = await resolveItemInfo(nodeParams.terrainUuid, nodeParams.terrainName, "terrain");
        if (!nodeParams.terrainImg || !nodeParams.terrainImg.trim()) nodeParams.terrainImg = info.img;
        if (!nodeParams.terrainUuid) nodeParams.terrainUuid = info.uuid;
        if (!nodeParams.terrainName) nodeParams.terrainName = info.name;
      }
    }

    // Automatically resolve missing or empty effect icons and UUIDs
    if (action.type === "applyEffects" && Array.isArray(nodeParams.effects)) {
      nodeParams.effects = await Promise.all(nodeParams.effects.map(async (eff) => {
        const info = await resolveItemInfo(eff.uuid, eff.name, "effect");
        return {
          uuid: eff.uuid || info.uuid,
          name: eff.name || info.name,
          img: eff.img || info.img,
          intensity: eff.intensity !== undefined ? eff.intensity : 1
        };
      }));
    }

    const node = buildNode(action.type, phaseKey, nodeParams, x, y);
    nodes.push(node);

    connections.push(createFlowConnection(incomingId, incomingPort, node.id, "in"));

    // Connect areaRef to spawnTerrain if applicable
    if (action.type === "spawnTerrain" && createdAreaId && nodeParams.placement === "selected_area") {
      connections.push(createRefConnection(createdAreaId, node.id, "areaRef"));
    }

    return node;
  };

  // 4. Base Phase Actions (Main Flow before Accuracy)
  const baseActions = spec.phases?.base?.actions || [];
  for (const act of baseActions) {
    const node = await appendActionNode(act, "base", currentX, 180, lastMainId, lastMainPort);
    lastMainId = node.id;
    lastMainPort = "out";
    currentX += STEP_X;
  }

  // 5. Accuracy Test Node
  const hitActions = spec.phases?.hit?.actions || [];
  const sparkActions = spec.phases?.spark?.actions || [];
  const missActions = spec.phases?.miss?.actions || [];
  const needsAccuracy = spec.actionType !== "support" || hitActions.length > 0 || sparkActions.length > 0 || missActions.length > 0;

  if (needsAccuracy) {
    const accNode = buildNode("rollAccuracy", "base", {
      actionType: spec.actionType || "attack",
      abilityType: spec.abilityType || "versatile",
      versus: spec.versus || "Guard",
      branchingMode: spec.branchingMode || "hitThenSpark"
    }, currentX, 180);
    nodes.push(accNode);

    connections.push(createFlowConnection(lastMainId, lastMainPort, accNode.id, "in"));
    currentX += STEP_X;

    // Process onHit branch (y: 80)
    let lastHitId = accNode.id;
    let lastHitPort = "onHit";
    let hitX = currentX;
    for (const act of hitActions) {
      const node = await appendActionNode(act, "hit", hitX, 80, lastHitId, lastHitPort);
      lastHitId = node.id;
      lastHitPort = "out";
      hitX += STEP_X;
    }

    // Process onSpark branch (y: 280)
    let lastSparkId = accNode.id;
    let lastSparkPort = "onSpark";
    let sparkX = currentX;
    for (const act of sparkActions) {
      const node = await appendActionNode(act, "spark", sparkX, 280, lastSparkId, lastSparkPort);
      lastSparkId = node.id;
      lastSparkPort = "out";
      sparkX += STEP_X;
    }

    // Process onMiss branch (y: 380)
    let lastMissId = accNode.id;
    let lastMissPort = "onMiss";
    let missX = currentX;
    for (const act of missActions) {
      const node = await appendActionNode(act, "base", missX, 380, lastMissId, lastMissPort);
      lastMissId = node.id;
      lastMissPort = "out";
      missX += STEP_X;
    }
  }

  return { nodes, connections };
}

/**
 * Handle creation of a complete Deed item document.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function handleCreateDeed(params = {}) {
  if (!params.name || !params.name.trim()) {
    throw new Error("Missing required field 'name' for Deed creation.");
  }

  const id = params.id?.trim() || generateFoundryId();
  const name = params.name.trim();

  // If raw graph nodes are passed, use them; otherwise compile from declarative spec
  let graphData;
  if (Array.isArray(params.graph?.nodes) && params.graph.nodes.length > 0) {
    graphData = {
      nodes: params.graph.nodes,
      connections: Array.isArray(params.graph.connections) ? params.graph.connections : []
    };
  } else {
    graphData = await compileDeclarativeGraph(params);
  }

  // Ensure all nodes in graph have valid resolved artwork and UUIDs
  if (Array.isArray(graphData.nodes)) {
    for (const node of graphData.nodes) {
      if (node.type === "applyEffects" && Array.isArray(node.params?.effects)) {
        for (const eff of node.params.effects) {
          if (!eff.img || !eff.img.trim() || !eff.uuid) {
            const info = await resolveItemInfo(eff.uuid, eff.name, "effect");
            if (!eff.img || !eff.img.trim()) eff.img = info.img;
            if (!eff.uuid) eff.uuid = info.uuid;
            if (!eff.name) eff.name = info.name;
          }
        }
      }
      if (node.type === "spawnTerrain") {
        node.params = node.params || {};
        if (!node.params.terrainImg || !node.params.terrainImg.trim() || !node.params.terrainUuid) {
          const info = await resolveItemInfo(node.params.terrainUuid, node.params.terrainName, "terrain");
          if (!node.params.terrainImg || !node.params.terrainImg.trim()) node.params.terrainImg = info.img;
          if (!node.params.terrainUuid) node.params.terrainUuid = info.uuid;
          if (!node.params.terrainName) node.params.terrainName = info.name;
        }
      }
    }
  }

  const phaseMeta = (desc = "") => ({ description: desc || "", skipPhase: false });

  const deedPhases = {
    start: phaseMeta(params.phases?.start?.description),
    before: phaseMeta(params.phases?.before?.description),
    base: phaseMeta(params.phases?.base?.description),
    hit: phaseMeta(params.phases?.hit?.description),
    spark: phaseMeta(params.phases?.spark?.description),
    after: phaseMeta(params.phases?.after?.description),
    end: phaseMeta(params.phases?.end?.description)
  };

  const now = Date.now();
  const deedDoc = {
    name,
    type: "deed",
    img: params.img || "systems/trespasser/assets/icons/deed.webp",
    system: {
      tier: ["light", "heavy", "mighty", "special"].includes(params.tier) ? params.tier : "light",
      actionType: ["attack", "support"].includes(params.actionType) ? params.actionType : "attack",
      abilityType: ["innate", "melee", "missile", "spell", "tool", "unarmed", "versatile"].includes(params.abilityType) ? params.abilityType : "versatile",
      versus: ["Guard", "Resist", "10"].includes(params.versus) ? params.versus : "Guard",
      focusCost: params.focusCost !== undefined && params.focusCost !== null ? Number(params.focusCost) : null,
      focusIncrease: params.focusIncrease !== undefined && params.focusIncrease !== null ? Number(params.focusIncrease) : null,
      bonusCost: params.bonusCost !== undefined && params.bonusCost !== null ? Number(params.bonusCost) : null,
      uses: Number(params.uses ?? 0),
      range: params.range !== undefined && params.range !== null ? Number(params.range) : null,
      description: params.description || "",
      phases: deedPhases,
      graph: graphData,
      graphVersion: 1
    },
    _id: id,
    effects: [],
    folder: null,
    flags: {},
    _stats: {
      compendiumSource: null,
      duplicateSource: null,
      exportSource: null,
      coreVersion: "14",
      systemId: "trespasser",
      systemVersion: "0.2.0-12",
      createdTime: now,
      modifiedTime: now,
      lastModifiedBy: "mcp-generator"
    },
    ownership: {
      default: 0
    },
    sort: 0,
    _key: `!items!${id}`
  };

  // Run automated graph validation
  const validation = handleValidateDeedGraph(deedDoc);

  registerRecentItem(deedDoc);

  let savedFile = null;
  if (params.saveToPack) {
    const fileName = `${sanitizeFileName(name)}_${id}.json`;
    const filePath = path.join(PACKS_DIR, fileName);
    await fs.writeFile(filePath, JSON.stringify(deedDoc, null, 2), "utf-8");
    savedFile = filePath;
    invalidateCompendiumCache();
  }

  return {
    id,
    uuid: `Compendium.trespasser.trespasser-content.Item.${id}`,
    localUuid: `Item.${id}`,
    name,
    type: "deed",
    img: deedDoc.img,
    tier: deedDoc.system.tier,
    actionType: deedDoc.system.actionType,
    abilityType: deedDoc.system.abilityType,
    nodeCount: graphData.nodes.length,
    connectionCount: graphData.connections.length,
    savedFile,
    validation,
    item: deedDoc
  };
}
