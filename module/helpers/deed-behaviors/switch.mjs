import { ConditionBehavior } from "./condition.mjs";

/**
 * SwitchBehavior
 * Dynamically routes references and flow execution based on the outcome of a connected
 * option provider source node (rollAccuracy or condition).
 */
export class SwitchBehavior {
  /**
   * Resolves the winning branch and its connected node for a switch node.
   * @param {object} switchNode - The switch node object
   * @param {object} context - Executor runtime context
   * @param {object} executor - DeedExecutor instance
   * @returns {Promise<{ winningOption: string|null, branchConn: object|null, branchSourceNode: object|null }>}
   */
  static async resolveWinningBranch(switchNode, context, executor) {
    if (!switchNode || !executor) {
      return { winningOption: null, branchConn: null, branchSourceNode: null };
    }

    // 1. Locate the source reference connection
    const incomingRefs = executor._getIncomingReferenceConnections?.(switchNode.id) || [];
    const sourceConn = incomingRefs.find(c => c.targetPort === "source");
    if (!sourceConn) {
      return { winningOption: null, branchConn: null, branchSourceNode: null };
    }

    const sourceNode = executor._getNode(sourceConn.sourceId);
    if (!sourceNode) {
      return { winningOption: null, branchConn: null, branchSourceNode: null };
    }

    // 2. Ensure source node has been executed / evaluated
    if (!executor._isResolved(sourceNode, "result") && !sourceNode._alreadyExecuted) {
      await executor._executeReferenceNode(sourceNode, new Set());
    }

    // 3. Determine winning option based on source node type
    let winningOption = null;

    if (sourceNode.type === "rollAccuracy") {
      const branchingMode = sourceNode.params?.branchingMode || "hitThenSpark";
      if (branchingMode === "hitOrSpark") {
        if (context.isSpark) winningOption = "onSpark";
        else if (context.isHit) winningOption = "onHit";
        else winningOption = "onMiss";
      } else {
        if (context.isSpark) winningOption = "onSpark";
        else if (context.isHit) winningOption = "onHit";
        else winningOption = "onMiss";
      }
    } else if (sourceNode.type === "condition") {
      if (!context.conditionResults) context.conditionResults = new Map();
      let condResult = context.conditionResults.get(sourceNode.id);
      if (!condResult) {
        condResult = await ConditionBehavior.execute(
          sourceNode,
          context,
          executor.actor,
          executor.item
        );
        context.conditionResults.set(sourceNode.id, condResult);
      }
      winningOption = condResult.passed ? "onTrue" : "onFalse";
    }

    if (!winningOption) {
      return { winningOption: null, branchConn: null, branchSourceNode: null };
    }

    // Record chosen branch in context for card logging / debugging
    if (!context.activeSwitchBranches) context.activeSwitchBranches = new Map();
    context.activeSwitchBranches.set(switchNode.id, winningOption);

    // 4. Find the incoming connection plugged into the winning option port
    // Connections into option ports may be flow or reference depending on connection mode
    const allConns = executor._allConnections || executor.system?.graph?.connections || [];
    const branchConn = allConns.find(
      c => c.targetId === switchNode.id && c.targetPort === winningOption
    ) || null;
    const branchSourceNode = branchConn ? executor._getNode(branchConn.sourceId) : null;

    return { winningOption, branchConn, branchSourceNode };
  }

  /**
   * Dispatches behavior execution when traversed inline.
   * @param {object} behavior - Switch node data
   * @param {object} context - Executor runtime context
   * @param {Actor} [actor] - Source actor
   * @param {Item} item - Deed item
   * @param {string} [phaseKey] - Current phase key
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const executor = context.executor;
    if (!executor) return true;

    const { winningOption, branchSourceNode } = await this.resolveWinningBranch(
      behavior,
      context,
      executor
    );

    if (branchSourceNode && !executor._isResolved(branchSourceNode)) {
      await executor._executeBehavior(branchSourceNode, branchSourceNode.phase || phaseKey || "base");
      branchSourceNode._alreadyExecuted = true;
      executor._executedNodes.add(branchSourceNode.id);
    }

    return true;
  }
}
