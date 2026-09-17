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
    if (!executor._isResolved(sourceNode, "result")) {
      const ok = await executor._executeReferenceNode(sourceNode, new Set());
      if (ok === false) {
        return { winningOption: null, branchConn: null, branchSourceNode: null };
      }
    }

    // 3. Determine winning option based on source node type
    let winningOption = null;
    let branchingMode = "hitThenSpark";

    if (sourceNode.type === "rollAccuracy") {
      branchingMode = sourceNode.params?.branchingMode || "hitThenSpark";
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

    // 4. Find the incoming connection plugged into the winning option port
    // Connections into option ports may be flow or reference depending on connection mode
    const allConns = executor._allConnections || executor.system?.graph?.connections || [];
    let branchConn = allConns.find(
      c => c.targetId === switchNode.id && c.targetPort === winningOption
    ) || null;

    // Automatic fallback in hitThenSpark mode: If onSpark was chosen but has no plugged connection, fallback to onHit
    if (!branchConn && winningOption === "onSpark" && branchingMode === "hitThenSpark" && context.isHit) {
      const hitConn = allConns.find(
        c => c.targetId === switchNode.id && c.targetPort === "onHit"
      );
      if (hitConn) {
        branchConn = hitConn;
        winningOption = "onHit";
      }
    }

    // Record chosen branch in context for card logging / debugging
    if (!context.activeSwitchBranches) context.activeSwitchBranches = new Map();
    context.activeSwitchBranches.set(switchNode.id, winningOption);

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

    const incomingRefs = executor._getIncomingReferenceConnections?.(behavior.id) || [];
    const sourceConn = incomingRefs.find(c => c.targetPort === "source");
    const sourceNode = sourceConn ? executor._getNode(sourceConn.sourceId) : null;
    const branchingMode = sourceNode?.params?.branchingMode || "hitThenSpark";

    if (sourceNode?.type === "rollAccuracy" && branchingMode === "hitThenSpark" && context.isHit && context.isSpark) {
      const allConns = executor._allConnections || executor.system?.graph?.connections || [];
      const hitConn = allConns.find(c => c.targetId === behavior.id && c.targetPort === "onHit");
      const sparkConn = allConns.find(c => c.targetId === behavior.id && c.targetPort === "onSpark");

      if (hitConn) {
        const hitNode = executor._getNode(hitConn.sourceId);
        if (hitNode && !executor._isResolved(hitNode)) {
          await executor._executeBehavior(hitNode, hitNode.phase || phaseKey || "hit");
          hitNode._alreadyExecuted = true;
          executor._executedNodes.add(hitNode.id);
        }
      }
      if (sparkConn && sparkConn.sourceId !== hitConn?.sourceId) {
        const sparkNode = executor._getNode(sparkConn.sourceId);
        if (sparkNode && !executor._isResolved(sparkNode)) {
          await executor._executeBehavior(sparkNode, sparkNode.phase || phaseKey || "spark");
          sparkNode._alreadyExecuted = true;
          executor._executedNodes.add(sparkNode.id);
        }
      }
      return true;
    }

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
