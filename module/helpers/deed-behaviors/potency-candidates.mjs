import { resolveItem } from "../item-resolver.mjs";

/**
 * Check if a terrain document or UUID defines one or more linked effects.
 * @param {Item|string} terrainItemOrUuid
 * @returns {Promise<boolean>|boolean}
 */
export async function hasLinkedEffect(terrainItemOrUuid) {
  if (!terrainItemOrUuid) return false;
  let doc = terrainItemOrUuid;
  if (typeof terrainItemOrUuid === "string") {
    try {
      doc = await resolveItem(terrainItemOrUuid, { notify: false, type: "terrain" });
    } catch {
      return false;
    }
  }
  if (!doc) return false;
  const sys = doc.system;
  return Boolean(
    (sys?.linkedEffects && sys.linkedEffects.length > 0) ||
    sys?.linkedEffect?.uuid ||
    sys?.linkedEffectKey
  );
}

/**
 * Safely parse an intensity value, supporting 0 as valid.
 * @param {any} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function parseIntensity(val, fallback = 0) {
  if (val !== undefined && val !== null && val !== "" && !isNaN(Number(val))) {
    return Number(val);
  }
  return fallback;
}

/**
 * Helper to get equipped weapons from an actor.
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function getActorEquippedWeapons(actor) {
  if (!actor?.system) return [];
  const mode = actor.system.combat?.weaponMode || "main";
  const mainHandId = actor.system.equipment?.main_hand;
  const offHandId = actor.system.equipment?.off_hand;
  const weapons = [];

  if (mode === "dual") {
    const main = mainHandId ? actor.items.get(mainHandId) : null;
    const off = offHandId ? actor.items.get(offHandId) : null;
    if (main?.type === "weapon") weapons.push(main);
    if (off?.type === "weapon" && off.id !== main?.id) weapons.push(off);
  } else if (mode === "off") {
    const off = offHandId ? actor.items.get(offHandId) : null;
    if (off?.type === "weapon") weapons.push(off);
  } else {
    const main = mainHandId ? actor.items.get(mainHandId) : null;
    if (main?.type === "weapon") weapons.push(main);
  }
  return weapons;
}

/**
 * Determine which graph nodes are reachable given the current/target roll outcome (isHit, isSpark).
 * @param {object} graph - { nodes, connections }
 * @param {object} context - Executor runtime context
 * @param {object} [options] - { isHit, isSpark }
 * @returns {Map<string, string>} Map of reachable nodeId -> effectivePhase
 */
export function getReachableNodes(graph, context = {}, options = {}) {
  const nodes = graph?.nodes || [];
  const connections = graph?.connections || [];
  const reachable = new Map();
  if (nodes.length === 0) return reachable;

  const isHit = options.isHit !== undefined ? Boolean(options.isHit) : (context.accuracyResolved ? Boolean(context.isHit) : true);
  const isSpark = options.isSpark !== undefined ? Boolean(options.isSpark) : Boolean(context.isSpark);

  const nodesById = new Map(nodes.map(n => [n.id, n]));
  const outgoingFlow = new Map();
  const incomingRefs = new Map();
  const incomingAll = new Map();

  for (const conn of connections) {
    if (!incomingAll.has(conn.targetId)) incomingAll.set(conn.targetId, []);
    incomingAll.get(conn.targetId).push(conn);

    if (conn.type === "reference") {
      if (!incomingRefs.has(conn.targetId)) incomingRefs.set(conn.targetId, []);
      incomingRefs.get(conn.targetId).push(conn);
    } else {
      if (!outgoingFlow.has(conn.sourceId)) outgoingFlow.set(conn.sourceId, []);
      outgoingFlow.get(conn.sourceId).push(conn);
    }
  }

  const evaluatePort = (port, branchingMode = "hitThenSpark") => {
    if (!port || port === "always" || port === "out" || port === "in") return true;
    if (port === "onMiss") return !isHit;
    if (branchingMode === "hitOrSpark") {
      if (port === "onSpark") return isSpark;
      if (port === "onHit") return isHit && !isSpark;
    } else {
      if (port === "onHit") return isHit;
      if (port === "onSpark") return isSpark;
    }
    return true;
  };

  const resolveSwitchBranchNode = (swNode) => {
    const swIn = incomingAll.get(swNode.id) || [];
    const pickPort = (portName) => {
      const c = swIn.find(conn => conn.targetPort === portName);
      return c ? nodesById.get(c.sourceId) : null;
    };
    if (isSpark && pickPort("onSpark")) return pickPort("onSpark");
    if (isHit && pickPort("onHit")) return pickPort("onHit");
    if (!isHit && pickPort("onMiss")) return pickPort("onMiss");
    return pickPort("default") || pickPort("onHit") || null;
  };

  const visit = (nodeId, incomingPhase = "base") => {
    if (!nodeId || reachable.has(nodeId)) return;
    const node = nodesById.get(nodeId);
    if (!node) return;

    let effectivePhase = node.phase;
    if (!effectivePhase || effectivePhase === "inherit") {
      effectivePhase = incomingPhase || "base";
    }
    reachable.set(nodeId, effectivePhase);

    // Traverse incoming reference nodes
    const refs = incomingRefs.get(nodeId) || [];
    for (const refConn of refs) {
      const refNode = nodesById.get(refConn.sourceId);
      if (!refNode) continue;
      if (refNode.type === "switch") {
        const winNode = resolveSwitchBranchNode(refNode);
        if (winNode) visit(winNode.id, effectivePhase);
      } else {
        visit(refNode.id, effectivePhase);
      }
    }

    if (node.type === "switch") {
      const winNode = resolveSwitchBranchNode(node);
      if (winNode) visit(winNode.id, effectivePhase);
    }

    const outgoing = outgoingFlow.get(nodeId) || [];
    if (node.type === "rollAccuracy") {
      const branchingMode = node.params?.branchingMode || "hitThenSpark";
      for (const conn of outgoing) {
        if (evaluatePort(conn.sourcePort, branchingMode)) {
          let branchPhase = effectivePhase;
          if (conn.sourcePort === "onHit") branchPhase = "hit";
          else if (conn.sourcePort === "onSpark") branchPhase = "spark";
          else if (conn.sourcePort === "onMiss") branchPhase = "base";
          visit(conn.targetId, branchPhase);
        }
      }
    } else {
      for (const conn of outgoing) {
        visit(conn.targetId, effectivePhase);
      }
    }
  };

  const startNode = nodes.find(n => n.type === "start") || nodes[0];
  if (startNode) {
    visit(startNode.id, "start");
  }

  return reachable;
}

/**
 * Collect all eligible effect and terrain candidates for Potency allocation across reachable graph branches,
 * aggregating identical effects into a single candidate with summed baseIntensity.
 * @param {object} context
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} [phaseKey=""]
 * @param {object} [options={}] - Optional { isHit, isSpark } override for per-target candidate evaluation
 * @returns {Promise<Array<object>>}
 */
export async function collectPotencyCandidates(context, actor, item, phaseKey = "", options = {}) {
  const rawCandidates = [];
  const graph = context.executor?.system?.graph || item?.system?.graph || {};
  const graphNodes = graph.nodes || [];
  const reachableMap = getReachableNodes(graph, context, options);
  const isSparkActive = options.isSpark !== undefined ? Boolean(options.isSpark) : Boolean(context.isSpark || phaseKey === "spark");

  for (const node of graphNodes) {
    const isExecuted = context.executor?._executedNodes?.has(node.id);
    if (reachableMap.size > 0 && !reachableMap.has(node.id) && !isExecuted) continue;

    const effectivePhase = reachableMap.get(node.id) || ((!node.phase || node.phase === "inherit") ? (phaseKey || "base") : node.phase);
    const isGlobalScope = node.params?.targetScope === "self" || node.params?.targetScope === "source";

    if (node.type === "applyEffects") {
      const rawEffects = node.params?.effects || [];
      const effects = Array.isArray(rawEffects) ? rawEffects : Object.values(rawEffects);
      for (const eff of effects) {
        if (!eff) continue;
        const effectItem = await resolveItem(eff, { notify: false, type: "effect" });
        if (!effectItem) continue;
        rawCandidates.push({
          type: "effect",
          nodeId: node.id,
          nodeIds: [node.id],
          uuid: eff.uuid || effectItem.uuid,
          item: effectItem,
          name: effectItem.name,
          displayName: effectItem.name,
          img: eff.img || effectItem.img || "icons/svg/aura.svg",
          baseIntensity: parseIntensity(eff.intensity, effectItem.system?.intensity ?? 0),
          source: "deed",
          isGlobal: isGlobalScope
        });
      }

      if (node.params?.appliesWeaponEffects && actor) {
        const weapons = getActorEquippedWeapons(actor);
        for (const weapon of weapons) {
          const wEffects = weapon.system?.effects;
          if (Array.isArray(wEffects)) {
            for (const wEff of wEffects) {
              if (!wEff) continue;
              const effectItem = await resolveItem(wEff, { notify: false, type: "effect" });
              if (!effectItem) continue;
              rawCandidates.push({
                type: "effect",
                nodeId: node.id,
                nodeIds: [node.id],
                uuid: wEff.uuid || effectItem.uuid,
                item: effectItem,
                name: effectItem.name,
                displayName: `${effectItem.name} (${weapon.name})`,
                img: wEff.img || effectItem.img || "icons/svg/aura.svg",
                baseIntensity: parseIntensity(wEff.intensity, effectItem.system?.intensity ?? 0),
                source: weapon.name,
                isGlobal: isGlobalScope
              });
            }
          }
          if (isSparkActive && effectivePhase === "spark" && Array.isArray(weapon.system?.enhancementEffects)) {
            for (const wEff of weapon.system.enhancementEffects) {
              if (!wEff) continue;
              const effectItem = await resolveItem(wEff, { notify: false, type: "effect" });
              if (!effectItem) continue;
              rawCandidates.push({
                type: "effect",
                nodeId: node.id,
                nodeIds: [node.id],
                uuid: wEff.uuid || effectItem.uuid,
                item: effectItem,
                name: effectItem.name,
                displayName: `${effectItem.name} (${weapon.name} Enhancement)`,
                img: wEff.img || effectItem.img || "icons/svg/aura.svg",
                baseIntensity: parseIntensity(wEff.intensity, effectItem.system?.intensity ?? 0),
                source: `${weapon.name} (Enhancement)`,
                isGlobal: isGlobalScope
              });
            }
          }
        }
      }
    } else if (node.type === "modifyEffects") {
      const op = node.params?.operation || "increase";
      if (op === "increase" || op === "decrease" || op === "reduce") {
        const baseIntensity = parseIntensity(node.params?.intensityDelta, 1);
        const modLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.modifyEffects") || "Modify Effects";
        rawCandidates.push({
          type: "modifyEffects",
          nodeId: node.id,
          nodeIds: [node.id],
          uuid: `modify_${node.id}`,
          name: modLabel,
          displayName: `${modLabel} (${(op === "reduce" || op === "decrease") ? "-" : "+"}${baseIntensity})`,
          img: "icons/svg/regen.svg",
          baseIntensity,
          source: "modifyEffects",
          isGlobal: isGlobalScope
        });
      }
    } else if (node.type === "spawnTerrain") {
      if (!node.params?.terrainUuid) continue;
      const terrainItem = await resolveItem(node.params.terrainUuid, { notify: false, type: "terrain" });
      if (!terrainItem) continue;
      const hasLinked = await hasLinkedEffect(terrainItem);
      if (!hasLinked) continue;

      const defaultTerrainInt = parseIntensity(terrainItem.system?.linkedEffects?.[0]?.intensity, 1);
      const baseIntensity = parseIntensity(node.params.intensity, defaultTerrainInt);
      const terrainLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.spawnTerrain") || "Terrain";

      rawCandidates.push({
        type: "terrain",
        nodeId: node.id,
        nodeIds: [node.id],
        uuid: terrainItem.uuid,
        item: terrainItem,
        name: terrainItem.name,
        displayName: `${terrainItem.name} (${terrainLabel})`,
        img: node.params.terrainImg || terrainItem.img || "icons/svg/mountain.svg",
        baseIntensity: baseIntensity,
        source: "terrain",
        isGlobal: true
      });
    } else if (node.type === "grantRecovery") {
      const baseIntensity = parseIntensity(node.params?.intensity, 1);
      const recoveryLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.grantRecovery") || "Grant Recovery";
      rawCandidates.push({
        type: "recovery",
        nodeId: node.id,
        nodeIds: [node.id],
        displayName: `${recoveryLabel} (${baseIntensity})`,
        img: "icons/svg/heal.svg",
        baseIntensity: baseIntensity,
        source: "recovery",
        isGlobal: true
      });
    }
  }

  // Aggregate identical effect candidates (by scope + uuid/name) so e.g. two Frail 2 nodes appear as one Frail 4 option
  const aggregated = [];
  const effectGroupMap = new Map();

  for (const cand of rawCandidates) {
    if (cand.type === "effect") {
      const scopePrefix = cand.isGlobal ? "self" : "target";
      const effectKey = `${scopePrefix}_${(cand.uuid || cand.name || "").toLowerCase().trim()}`;
      const existing = effectGroupMap.get(effectKey);
      if (existing) {
        existing.baseIntensity += cand.baseIntensity;
        if (!existing.nodeIds.includes(cand.nodeId)) {
          existing.nodeIds.push(cand.nodeId);
        }
        existing.displayName = existing.name;
      } else {
        const cloned = { ...cand, nodeIds: [...(cand.nodeIds || [cand.nodeId])] };
        effectGroupMap.set(effectKey, cloned);
        aggregated.push(cloned);
      }
    } else {
      aggregated.push(cand);
    }
  }

  return aggregated;
}
