import { DeedBehaviorHandler } from "./deed-behavior-handler.mjs";
import { migrateToGraph } from "./migration-graph.mjs";
import {
  validateResources,
  commitResourceUsage,
  handleThrownWeapons
} from "./deed-executor/deed-executor-resources.mjs";
import {
  hasOutputsToPost,
  postPhaseCard,
  postAllPhaseCards
} from "./deed-executor/deed-executor-cards.mjs";

export {
  validateResources,
  commitResourceUsage,
  handleThrownWeapons,
  hasOutputsToPost,
  postPhaseCard,
  postAllPhaseCards
};

/**
 * DeedExecutor — Graph-based runtime pipeline executor for Behavior-Driven Deeds in Trespasser TTRPG.
 * Traverses behavior graph nodes starting from "start", evaluating condition ports (onHit, onMiss, onSpark, always),
 * lazily resolving reference nodes, and consolidating chat cards grouped by phase.
 */
export class DeedExecutor {
  /**
   * @param {Item} bdeedItem - The BDeed Item document.
   * @param {Actor} [actor]  - The owning Actor document.
   * @param {object} [options] - Additional options (e.g. apSpent from HUD)
   */
  constructor(bdeedItem, actor, options = {}) {
    this.item = bdeedItem;
    this.actor = actor || bdeedItem.actor || canvas.tokens?.controlled[0]?.actor || game.user?.character || null;
    this.system = bdeedItem.system;
    this.options = options || {};
    this.sourceToken = options.token || this.actor?.token?.object || canvas.tokens?.controlled.find(t => t.actor?.id === this.actor?.id) || this.actor?.getActiveTokens?.()[0] || null;

    /** Shared runtime context passed across all behavior executions. */
    this.context = {
      executor: this,
      sourceToken: this.sourceToken,
      callStack: this.options.callStack || new Set(),
      sourcePosition: this.options.sourcePosition || null,
      targets: [],
      area: null,
      areas: new Map(),
      spawnedTerrains: [],
      activePhases: [],
      evaluatedRolls: new Map(),
      rollResult: null,
      isHit: false,
      isSpark: false,
      maxSparks: 0,
      sparkChoices: null,
      accuracyResults: [],
      accuracyResolved: false,
      currentPhaseOutputs: null,
      activeChatMessage: null,
      currentBranch: "out",
      apSpent: 1,
      apBonus: 0
    };

    this._currentPhaseKey = null;
    this._activePhases = new Set();
    this._phaseOutputs = new Map();
    this._executedNodes = new Set();
    this._nodesById = new Map();
    this._outgoingFlow = new Map();
    this._incomingRefs = new Map();
  }

  async _validateResources() {
    return validateResources(this);
  }

  async _commitResourceUsage() {
    return commitResourceUsage(this);
  }

  async _handleThrownWeapons() {
    return handleThrownWeapons(this);
  }

  async _postAllPhaseCards() {
    return postAllPhaseCards(this);
  }

  _hasOutputsToPost(phaseKey) {
    return hasOutputsToPost(this, phaseKey);
  }

  async _postPhaseCard(phaseKey, phase, outputs = null) {
    return postPhaseCard(this, phaseKey, phase, outputs);
  }

  /**
   * Execute the deed behavior graph natively.
   */
  async execute() {
    const valid = await this._validateResources();
    if (valid === false) return;

    let graph = this.system.graph;
    if (!graph?.nodes?.length && this.system.phases) {
      const migrated = migrateToGraph(this.system);
      graph = migrated?.graph;
    }
    if (!graph?.nodes?.length) return;

    this._buildAdjacencyList(graph);
    const startNode = graph.nodes.find(n => n.type === "start") || graph.nodes[0];
    if (!startNode) return;

    this._activePhases.clear();
    this._phaseOutputs.clear();

    const visited = new Set();
    const cancelled = await this._traverseNode(startNode.id, visited, null, "start");

    if (!cancelled) {
      await this._handleThrownWeapons();
      await this._postAllPhaseCards();
      await this._commitResourceUsage();
    }

    this.context.targets = [];
    if (game.user?.targets?.size > 0) {
      await game.user.updateTokenTargets([]);
    }
    DeedBehaviorHandler.clearAreaHighlight(this.context);
  }

  /**
   * Index nodes and connections for fast lookup.
   * @param {object} graph
   * @protected
   */
  _buildAdjacencyList(graph) {
    this._nodesById = new Map(graph.nodes.map(n => [n.id, n]));
    this._outgoingFlow = new Map();
    this._incomingRefs = new Map();

    for (const conn of graph.connections || []) {
      if (conn.type === "reference") {
        if (!this._incomingRefs.has(conn.targetId)) this._incomingRefs.set(conn.targetId, []);
        this._incomingRefs.get(conn.targetId).push(conn);
      } else {
        if (!this._outgoingFlow.has(conn.sourceId)) this._outgoingFlow.set(conn.sourceId, []);
        this._outgoingFlow.get(conn.sourceId).push(conn);
      }
    }
  }

  _getNode(nodeId) {
    return this._nodesById.get(nodeId) || null;
  }

  _getOutgoingConnections(nodeId) {
    return this._outgoingFlow.get(nodeId) || [];
  }

  _getIncomingReferenceConnections(nodeId) {
    return this._incomingRefs.get(nodeId) || [];
  }

  _evaluateCondition(port, branchingMode = "hitThenSpark") {
    if (port === "always" || port === "out") return true;
    if (port === "onMiss") return Boolean(!this.context.isHit);
    if (branchingMode === "hitOrSpark") {
      if (port === "onSpark") return Boolean(this.context.isSpark);
      if (port === "onHit") return Boolean(this.context.isHit && !this.context.isSpark);
    } else {
      if (port === "onHit") return Boolean(this.context.isHit);
      if (port === "onSpark") return Boolean(this.context.isSpark);
    }
    return false;
  }

  _isResolved(node, targetPort) {
    if (!node) return true;
    if (this._executedNodes.has(node.id) || node._alreadyExecuted) return true;
    if (targetPort === "rollRef" && this.context.evaluatedRolls?.has(node.id)) return true;
    if (targetPort === "areaRef" && this.context.areas?.has(node.id)) return true;
    return false;
  }

  async _executeReferenceNode(refNode, visited) {
    if (visited.has(refNode.id) || this._isResolved(refNode)) return;
    visited.add(refNode.id);
    await this._resolveReferences(refNode, visited);
    await this._executeBehavior(refNode, refNode.phase || "base");
    refNode._alreadyExecuted = true;
    this._executedNodes.add(refNode.id);
  }

  async _resolveReferences(node, visited) {
    const refConnections = this._getIncomingReferenceConnections(node.id);
    for (const refConn of refConnections) {
      const refNode = this._getNode(refConn.sourceId);
      if (!refNode) continue;

      if (!this._isResolved(refNode, refConn.targetPort)) {
        await this._executeReferenceNode(refNode, visited);
      }

      node.params = node.params || {};
      if (refConn.targetPort === "rollRef") {
        node.params.rollBehaviorId = refNode.id;
      } else if (refConn.targetPort === "areaRef") {
        node.params.areaBehaviorId = refNode.id;
      } else if (refConn.targetPort === "terrainRef") {
        node.params.terrainBehaviorId = refNode.id;
      }
    }
  }

  async _traverseNode(nodeId, visited, incomingPort = null, incomingPhase = null) {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);

    const node = this._getNode(nodeId);
    if (!node) return false;

    if (incomingPort) {
      this.context.currentBranch = incomingPort;
    }

    await this._resolveReferences(node, visited);

    let effectivePhase = node.phase;
    if (!effectivePhase || effectivePhase === "inherit") {
      effectivePhase = incomingPhase || "base";
    }

    if (node.type !== "start") {
      await this._switchPhase(effectivePhase);

      const result = await this._executeBehavior(node, effectivePhase);
      this._executedNodes.add(node.id);
      node._alreadyExecuted = true;
      if (result === false) return true;
    } else if (this.system.phases?.start?.description?.trim() && !this.system.phases?.start?.skipPhase) {
      await this._switchPhase("start");
    }

    const outgoing = this._getOutgoingConnections(nodeId);
    if (node.type === "rollAccuracy") {
      const branchingMode = node.params?.branchingMode || "hitThenSpark";
      const portPriority = { onHit: 1, onSpark: 2, onMiss: 3, always: 4, out: 5 };
      const sortedOutgoing = [...outgoing].sort((a, b) => {
        const pA = portPriority[a.sourcePort] ?? 99;
        const pB = portPriority[b.sourcePort] ?? 99;
        return pA - pB;
      });

      for (const conn of sortedOutgoing) {
        if (this._evaluateCondition(conn.sourcePort, branchingMode)) {
          let branchPhase = effectivePhase;
          if (conn.sourcePort === "onHit") branchPhase = "hit";
          else if (conn.sourcePort === "onSpark") branchPhase = "spark";
          else if (conn.sourcePort === "onMiss") branchPhase = "after";

          const cancelled = await this._traverseNode(conn.targetId, visited, conn.sourcePort, branchPhase);
          if (cancelled) return true;
        }
      }
    } else {
      for (const conn of outgoing) {
        const cancelled = await this._traverseNode(conn.targetId, visited, conn.sourcePort, effectivePhase);
        if (cancelled) return true;
      }
    }

    return false;
  }

  async _executeBehavior(node, phaseKey) {
    console.log(`[DeedExecutor] Phase "${phaseKey}" — Executing behavior "${node.type}" (${node.id}):`, node.params);
    return await DeedBehaviorHandler.dispatch(node, this.context, this.actor, this.item, phaseKey);
  }

  async _switchPhase(newPhaseKey) {
    this._currentPhaseKey = newPhaseKey;
    this._activePhases.add(newPhaseKey);
    if (!this._phaseOutputs.has(newPhaseKey)) {
      this._phaseOutputs.set(newPhaseKey, { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" });
    }
    this.context.currentPhaseOutputs = this._phaseOutputs.get(newPhaseKey);
  }
}
