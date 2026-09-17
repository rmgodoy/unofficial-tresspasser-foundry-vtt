import { TargetClassifier } from "./target-classifier.mjs";
import { DeedIntentFormula } from "./deed-intent-formula.mjs";
import { migrateToGraph } from "../helpers/migration-graph.mjs";
import { getActorRelevantModifiers, combineModifierFormulas } from "../effects/effects-aggregate.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * DeedIntentResolver — Pure, non-destructive analyzer for Deed behavior graphs.
 * Evaluates what damage, healing, or effects each token will receive "Anyway" (base/always/miss)
 * vs "On Hit" vs "On Spark", supporting multi-stage target scoping and runtime evaluated rolls.
 */
export class DeedIntentResolver {

  /**
   * Determine if a behavior node is an interactive target selection prompt.
   * @param {object} node
   * @returns {boolean}
   */
  static isInteractiveTargetNode(node) {
    if (!node) return false;
    if (node.type === "selectArea") return true;
    if (node.type === "selectTarget") {
      const p = node.params || {};
      const mode = p.targetMode || "creatures";
      if (mode === "creatures") return true;
      if ((mode === "aoe" || mode === "area") && p.chooseCreatures) return true;
    }
    return false;
  }

  /**
   * Resolve outcome previews for a list of tokens given a caster and deed.
   * Automatically evaluates the caster token for self-actions if provided.
   * @param {Array<Token|TokenDocument>} tokens - Targeted or AoE-hovered tokens
   * @param {Token|TokenDocument} casterToken - The caster token
   * @param {Item} deedItem - The deed item document
   * @param {object} [options]
   * @returns {Map<string, object>} Map of tokenId -> TokenDeedOutcomePreview
   */
  static resolveTargetsOutcome(tokens, casterToken, deedItem, options = {}) {
    const outcomeMap = new Map();
    if (!deedItem) return outcomeMap;

    let graph = deedItem.system?.graph;
    if (!graph?.nodes?.length && deedItem.system?.phases) {
      const migrated = migrateToGraph(deedItem.system);
      graph = migrated?.graph;
    }

    const nodes = graph?.nodes || [];
    const connections = graph?.connections || [];
    const nodesById = new Map(nodes.map(n => [n.id, n]));
    const evaluatedTokenIds = new Set();
    const tokenList = Array.isArray(tokens) ? [...tokens] : (tokens ? [tokens] : []);

    for (const token of tokenList) {
      const tokenId = token.id || token.document?.id;
      if (!tokenId) continue;
      evaluatedTokenIds.add(tokenId);

      const preview = this.resolveSingleTokenOutcome(token, casterToken, deedItem, {
        nodes,
        connections,
        nodesById,
        isExplicitTarget: true,
        ...options
      });
      if (preview && preview.hasAnyOutcome && preview.role !== "unaffected") {
        outcomeMap.set(tokenId, preview);
      }
    }

    // Automatically evaluate caster token for self-actions if not already in tokens
    if (casterToken) {
      const casterId = casterToken.id || casterToken.document?.id;
      if (casterId && !evaluatedTokenIds.has(casterId)) {
        const casterPreview = this.resolveSingleTokenOutcome(casterToken, casterToken, deedItem, {
          nodes,
          connections,
          nodesById,
          isExplicitTarget: false,
          ...options
        });
        if (casterPreview && casterPreview.hasAnyOutcome && casterPreview.role !== "unaffected") {
          outcomeMap.set(casterId, casterPreview);
        }
      }
    }

    return outcomeMap;
  }

  /**
   * Resolve outcome preview for a single token.
   * @param {Token|TokenDocument} targetToken
   * @param {Token|TokenDocument} casterToken
   * @param {Item} deedItem
   * @param {object} context - Indexed graph data and options
   * @returns {object} TokenDeedOutcomePreview
   */
  static resolveSingleTokenOutcome(targetToken, casterToken, deedItem, context) {
    const { nodes = [], connections = [], nodesById = new Map(), isExplicitTarget = true, activeNodeId = null, runtimeContext = null } = context;
    const targetId = targetToken?.id || targetToken?.document?.id || null;
    const casterId = casterToken?.id || casterToken?.document?.id || null;
    const isSelf = Boolean(targetId && casterId && targetId === casterId);

    const outcomes = {
      anyway: { damage: [], healing: [], effects: [] },
      onHit:  { damage: [], healing: [], effects: [] },
      onSpark:{ damage: [], healing: [], effects: [] },
      onMiss: { damage: [], healing: [], effects: [] }
    };

    // Check airborne targeting validity
    const isJump = context?.params?.isJump ?? context?.isJump ?? false;
    const airborneCheck = RangeHelper.canTargetAirborne(casterToken, targetToken, deedItem, {
      actor: context?.actor,
      params: context?.params,
      isJump,
      aoeSize: context?.aoeSize,
      aoeType: context?.aoeType
    });

    if (!airborneCheck.valid) {
      return {
        tokenId: targetToken.id || targetToken.document?.id,
        tokenName: targetToken.name || targetToken.document?.name || "Target",
        role: "unaffected",
        intent: "neutral",
        hasAnyOutcome: false,
        outcomes,
        style: { color: 0x888888, fillAlpha: 0.05, lineWidth: 1, lineAlpha: 0.3 }
      };
    }

    // Index flow and reference connections
    const outgoing = new Map();
    const incomingRefs = new Map();
    for (const conn of connections) {
      if (conn.type === "reference" || (conn.targetPort && conn.targetPort !== "in")) {
        if (!incomingRefs.has(conn.targetId)) incomingRefs.set(conn.targetId, []);
        incomingRefs.get(conn.targetId).push(conn);
      }
      if (conn.type !== "reference" && (!conn.targetPort || conn.targetPort === "in" || conn.targetPort === "out")) {
        if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
        outgoing.get(conn.sourceId).push(conn);
      }
    }

    // Graph actions collected per branch
    const branchActions = {
      anyway:  [],
      onHit:   [],
      onSpark: [],
      onMiss:  []
    };

    // 1. Stage-Aware Traversal: Start from activeNodeId if provided, else from start node
    if (activeNodeId && nodesById.has(activeNodeId)) {
      const activeNode = nodesById.get(activeNodeId);
      let initialFilter = null;
      if (activeNode.type === "selectTarget") {
        const p = activeNode.params || {};
        initialFilter = {
          targetMode: p.targetMode || "creatures",
          disposition: p.disposition || "any",
          ignoreSelf: Boolean(p.ignoreSelf)
        };
      }
      const initialBranch = "anyway";
      const visited = new Set();
      this._walkBranch(activeNode.id, initialBranch, outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, initialFilter, activeNode.id, runtimeContext);
    } else {
      const startNode = nodes.find(n => n.type === "start") || nodes[0];
      if (startNode) {
        const visited = new Set();
        this._walkBranch(startNode.id, "anyway", outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, null, null, runtimeContext);
      }
    }

    // Fallback if no flow connections exist
    const hasFlowConnections = connections.some(c => c.type !== "reference" && (!c.targetPort || c.targetPort === "in" || c.targetPort === "out"));
    if (!hasFlowConnections && !branchActions.anyway.length && !branchActions.onHit.length && !branchActions.onSpark.length) {
      this._fallbackExtractBehaviors(nodes, isSelf, branchActions, targetToken, casterToken, runtimeContext);
    }

    // 2. Resolve Hit vs Spark branching and deduplicate shared nodes
    const accNode = nodes.find(n => n.type === "rollAccuracy");
    const branchingMode = accNode?.params?.branchingMode || "hitThenSpark";

    this._distributeActionsToOutcomes(branchActions, outcomes, branchingMode);

    // 3. Incorporate modifiers from active effects
    const targetActor = targetToken?.actor 
      || (targetToken instanceof Actor ? targetToken : null)
      || (canvas.tokens?.get(targetToken?.id || targetToken)?.actor ?? null);

    const casterActor = casterToken?.actor 
      || (casterToken instanceof Actor ? casterToken : null)
      || (context?.actor ?? null)
      || (deedItem?.actor ?? null)
      || (canvas.tokens?.get(casterToken?.id || casterToken)?.actor ?? null);

    const casterDamageMods = getActorRelevantModifiers(casterActor, "damage_given");
    const casterHealMods   = getActorRelevantModifiers(casterActor, "heal_given");
    const targetDamageMods = getActorRelevantModifiers(targetActor, "damage_received");
    const targetHealMods   = getActorRelevantModifiers(targetActor, "heal_received");

    const allDamageMods = [...casterDamageMods, ...targetDamageMods];
    const allHealMods   = [...casterHealMods, ...targetHealMods];

    if (allDamageMods.length > 0 || allHealMods.length > 0) {
      for (const section of Object.values(outcomes)) {
        if (section.damage.length > 0 && allDamageMods.length > 0) section.damage = combineModifierFormulas(section.damage, allDamageMods);
        if (section.healing.length > 0 && allHealMods.length > 0) section.healing = combineModifierFormulas(section.healing, allHealMods);
      }
    }

    // 4. Determine overall token intent & classification
    const hasAnyDamage = outcomes.anyway.damage.length > 0 || outcomes.onHit.damage.length > 0 || outcomes.onSpark.damage.length > 0 || outcomes.onMiss.damage.length > 0;
    const hasAnyHeal = outcomes.anyway.healing.length > 0 || outcomes.onHit.healing.length > 0 || outcomes.onSpark.healing.length > 0 || outcomes.onMiss.healing.length > 0;
    const hasAnyEffects = outcomes.anyway.effects.length > 0 || outcomes.onHit.effects.length > 0 || outcomes.onSpark.effects.length > 0 || outcomes.onMiss.effects.length > 0;
    const hasAnyOutcome = hasAnyDamage || hasAnyHeal || hasAnyEffects;

    let intent = "harmful";
    if (hasAnyHeal && !hasAnyDamage) intent = "beneficial";
    else if (hasAnyHeal && hasAnyDamage) intent = "mixed";
    else if (!hasAnyOutcome) intent = "neutral";

    let classification = TargetClassifier.classifyToken(targetToken, casterToken, {
      intent,
      filterDisposition: "any",
      ignoreSelf: false
    });

    if (!hasAnyOutcome) {
      classification = TargetClassifier.classifyToken(null, casterToken, {});
    }

    const targetIsSunken = RangeHelper.isSunken(targetActor);

    return {
      tokenId: targetToken.id || targetToken.document?.id,
      tokenName: targetToken.name || targetToken.document?.name || "Target",
      role: classification.role,
      style: classification.style,
      label: classification.label,
      intent,
      hasAnyOutcome,
      isSunken: targetIsSunken,
      anyway:  { ...outcomes.anyway,  html: DeedIntentFormula.formatSectionHtml(outcomes.anyway, targetIsSunken, casterActor) },
      onHit:   { ...outcomes.onHit,   html: DeedIntentFormula.formatSectionHtml(outcomes.onHit, targetIsSunken, casterActor) },
      onSpark: { ...outcomes.onSpark, html: DeedIntentFormula.formatSectionHtml(outcomes.onSpark, targetIsSunken, casterActor) },
      onMiss:  { ...outcomes.onMiss,  html: DeedIntentFormula.formatSectionHtml(outcomes.onMiss, targetIsSunken, casterActor) },
      modifiers: {
        casterDamage: casterDamageMods,
        targetDamage: targetDamageMods,
        casterHealing: casterHealMods,
        targetHealing: targetHealMods
      }
    };
  }

  static _walkBranch(nodeId, currentBranch, outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, activeFilter = null, activeNodeId = null, runtimeContext = null) {
    const visitKey = `${nodeId}:${currentBranch}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const node = nodesById.get(nodeId);
    if (!node) return;

    let currentFilter = activeFilter;
    if (node.type === "selectTarget") {
      const p = node.params || {};
      currentFilter = {
        targetMode: p.targetMode || "creatures",
        disposition: p.disposition || "any",
        ignoreSelf: Boolean(p.ignoreSelf)
      };
    }

    // Evaluate action nodes
    if (node.type === "applyDamage" || node.type === "healTarget" || node.type === "applyEffects" || node.type === "grantRecovery") {
      const appliesToThisToken = DeedIntentFormula.doesNodeApplyToToken(node, isSelf, targetToken, casterToken, currentFilter, isExplicitTarget);
      if (appliesToThisToken) {
        const p = node.params || {};
        let refId = p.rollBehaviorId?.trim();
        if (!refId && incomingRefs.has(node.id)) {
          const refConn = incomingRefs.get(node.id).find(c => c.targetPort === "rollRef");
          if (refConn) refId = refConn.sourceId;
        }

        const refNode = refId ? nodesById.get(refId) : null;
        const isAccuracySwitch = refNode && refNode.type === "switch" && !runtimeContext?.evaluatedRolls?.has(refId);

        if (isAccuracySwitch && currentBranch === "anyway") {
          const hitExpr = DeedIntentFormula.resolveNodeFormula(node, nodesById, incomingRefs, "onHit", runtimeContext);
          const sparkExpr = DeedIntentFormula.resolveNodeFormula(node, nodesById, incomingRefs, "onSpark", runtimeContext);
          const missExpr = DeedIntentFormula.resolveNodeFormula(node, nodesById, incomingRefs, "onMiss", runtimeContext);

          const cat = (node.type === "applyDamage") ? "damage" : "healing";
          if (hitExpr) branchActions.onHit.push({ nodeId: node.id, type: node.type, category: cat, value: hitExpr, node });
          if (sparkExpr && sparkExpr !== hitExpr) branchActions.onSpark.push({ nodeId: node.id, type: node.type, category: cat, value: sparkExpr, node });
          if (missExpr) branchActions.anyway.push({ nodeId: node.id, type: node.type, category: cat, value: missExpr, node });
        } else {
          const dest = branchActions[currentBranch] || branchActions.anyway;
          if (node.type === "applyDamage") {
            const expr = DeedIntentFormula.resolveNodeFormula(node, nodesById, incomingRefs, currentBranch, runtimeContext);
            if (expr) dest.push({ nodeId: node.id, type: "applyDamage", category: "damage", value: expr, node });
          } else if (node.type === "healTarget") {
            const expr = DeedIntentFormula.resolveNodeFormula(node, nodesById, incomingRefs, currentBranch, runtimeContext);
            if (expr) dest.push({ nodeId: node.id, type: "healTarget", category: "healing", value: expr, node });
          } else if (node.type === "grantRecovery") {
            const intensity = parseInt(node.params?.intensity) || 1;
            dest.push({ nodeId: node.id, type: "grantRecovery", category: "healing", value: `${intensity}<sd>`, node });
          } else if (node.type === "applyEffects") {
            const effList = DeedIntentFormula.extractNodeEffects(node);
            for (const eff of effList) {
              dest.push({ nodeId: node.id, type: "applyEffects", category: "effects", value: eff, node });
            }
          }
        }
      }
    }

    const outConns = outgoing.get(nodeId) || [];
    for (const conn of outConns) {
      const childNode = nodesById.get(conn.targetId);
      if (!childNode) continue;

      // Scope Boundary: If activeNodeId is set, do not traverse past a different interactive targeting node or clearTargets
      if (activeNodeId && childNode.id !== activeNodeId) {
        if (this.isInteractiveTargetNode(childNode) || childNode.type === "clearTargets") {
          continue;
        }
      }

      let nextBranch = currentBranch;
      if (node.type === "rollAccuracy") {
        if (conn.sourcePort === "onHit") nextBranch = "onHit";
        else if (conn.sourcePort === "onSpark") nextBranch = "onSpark";
        else if (conn.sourcePort === "onMiss") nextBranch = "onMiss";
        else if (conn.sourcePort === "always" || conn.sourcePort === "out") nextBranch = "anyway";
      }
      this._walkBranch(conn.targetId, nextBranch, outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, currentFilter, activeNodeId, runtimeContext);
    }
  }

  static _distributeActionsToOutcomes(branchActions, outcomes, branchingMode) {
    for (const act of branchActions.anyway) {
      if (act.category === "damage") outcomes.anyway.damage.push(act.value);
      else if (act.category === "healing") outcomes.anyway.healing.push(act.value);
      else if (act.category === "effects") outcomes.anyway.effects.push(act.value);
    }

    for (const act of branchActions.onMiss) {
      if (act.category === "damage") outcomes.onMiss.damage.push(act.value);
      else if (act.category === "healing") outcomes.onMiss.healing.push(act.value);
      else if (act.category === "effects") outcomes.onMiss.effects.push(act.value);
    }

    const hitDamageValues = new Set();
    const hitEffectKeys = new Set();
    const hitHealingValues = new Set();
    for (const act of branchActions.onHit) {
      if (act.category === "damage") {
        hitDamageValues.add(act.value);
        outcomes.onHit.damage.push(act.value);
      } else if (act.category === "healing") {
        hitHealingValues.add(act.value);
        outcomes.onHit.healing.push(act.value);
      } else if (act.category === "effects") {
        const effKey = typeof act.value === "string" ? act.value.toLowerCase() : `${(act.value?.name || "").toLowerCase()}:${act.value?.intensity || 0}`;
        hitEffectKeys.add(effKey);
        outcomes.onHit.effects.push(act.value);
      }
    }

    for (const act of branchActions.onSpark) {
      if (branchingMode === "hitOrSpark") {
        if (act.category === "damage" && hitDamageValues.has(act.value)) continue;
        if (act.category === "healing" && hitHealingValues.has(act.value)) continue;
        if (act.category === "effects") {
          const effKey = typeof act.value === "string" ? act.value.toLowerCase() : `${(act.value?.name || "").toLowerCase()}:${act.value?.intensity || 0}`;
          if (hitEffectKeys.has(effKey)) continue;
        }
      }
      if (act.category === "damage") outcomes.onSpark.damage.push(act.value);
      else if (act.category === "healing") outcomes.onSpark.healing.push(act.value);
      else if (act.category === "effects") outcomes.onSpark.effects.push(act.value);
    }
  }

  static _fallbackExtractBehaviors(nodes, isSelf, branchActions, targetToken, casterToken, runtimeContext = null) {
    for (const n of nodes) {
      if (!DeedIntentFormula.doesNodeApplyToToken(n, isSelf, targetToken, casterToken, null)) continue;
      const phase = n.phase || "base";
      const targetBranch = phase === "hit" ? "onHit" : phase === "spark" ? "onSpark" : phase === "miss" ? "onMiss" : "anyway";
      const dest = branchActions[targetBranch] || branchActions.anyway;
      const expr = DeedIntentFormula.resolveNodeFormula(n, new Map(nodes.map(node => [node.id, node])), new Map(), targetBranch, runtimeContext) || n.params?.expression?.trim();

      if (n.type === "applyDamage" && expr) dest.push({ nodeId: n.id, type: "applyDamage", category: "damage", value: expr, node: n });
      else if (n.type === "healTarget" && expr) dest.push({ nodeId: n.id, type: "healTarget", category: "healing", value: expr, node: n });
      else if (n.type === "applyEffects") {
        for (const eff of DeedIntentFormula.extractNodeEffects(n)) dest.push({ nodeId: n.id, type: "applyEffects", category: "effects", value: eff, node: n });
      }
    }
  }
}
