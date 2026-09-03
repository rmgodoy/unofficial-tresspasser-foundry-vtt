import { DeedBehaviorHandler } from "./deed-behavior-handler.mjs";
import { TrespasserCombat } from "../documents/combat.mjs";
import { askAPDialog } from "../dialogs/ap-dialog.mjs";
import { migrateToGraph } from "./migration-graph.mjs";

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

    /** Shared runtime context passed across all behavior executions. */
    this.context = {
      executor: this,
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
    this._executedNodes = new Set();
    this._nodesById = new Map();
    this._outgoingFlow = new Map();
    this._incomingRefs = new Map();
  }

  /**
   * Validate Focus and AP resources without mutating documents or deducting flags.
   * @protected
   * @returns {Promise<boolean>}
   */
  async _validateResources() {
    if (this.options.isSubDeed || !this.actor) return true;

    const combatant = TrespasserCombat.getPhaseCombatant(this.actor);
    const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
    let apSpent = 1;
    let apBonus = 0;

    if (combatant) {
      const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      if (restrictAPF && availableAP < 1) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
        return false;
      }

      if (this.options.apSpent !== undefined && this.options.apSpent !== null) {
        apSpent = Math.max(1, parseInt(this.options.apSpent) || 1);
      } else if (availableAP > 1) {
        apSpent = await askAPDialog(availableAP);
        if (apSpent === null || apSpent === undefined) return false;
      }
      apBonus = (apSpent - 1) * 2;
    }

    const usedActions = new Set(combatant?.getFlag("trespasser", "usedHUDActions") ?? []);
    const surcharge = usedActions.has("maneuver") ? 2 : 0;
    const tier = (this.system.tier || "light").toLowerCase();
    const defaultCost = tier === "heavy" ? 2 : tier === "mighty" ? 4 : 0;
    const baseCost = this.system.focusCost ?? defaultCost;
    const costIncrease = this.system.focusIncrease ?? ((tier === "heavy" || tier === "mighty") ? 1 : 0);
    const currentBonusCost = this.system.bonusCost || 0;
    const currentUses = this.system.uses || 0;
    const totalFocusCost = baseCost + currentBonusCost + surcharge;

    if (totalFocusCost > 0) {
      const currentFocus = this.actor.system.combat?.focus ?? 0;
      if (restrictAPF && currentFocus < totalFocusCost) {
        ui.notifications.error(game.i18n.format("TRESPASSER.Notification.Combat.NotEnoughFocus", {
          name: this.item.name,
          cost: totalFocusCost,
          current: currentFocus
        }));
        return false;
      }
    }

    this.context.apSpent = apSpent;
    this.context.apBonus = apBonus;
    this.context.totalFocusCost = totalFocusCost;
    this.context.costIncrease = costIncrease;
    this.context.currentBonusCost = currentBonusCost;
    this.context.currentUses = currentUses;

    return true;
  }

  /**
   * Commit AP, Focus, and Item Uses deductions to database after successful execution.
   * @protected
   */
  async _commitResourceUsage() {
    if (this.options.isSubDeed || !this.actor) return;
    const combatant = TrespasserCombat.getPhaseCombatant(this.actor);

    // 1. Deduct AP from combatant flags
    if (combatant && this.context.apSpent > 0) {
      const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      await combatant.setFlag("trespasser", "actionPoints", Math.max(0, availableAP - this.context.apSpent));
    }

    // 2. Deduct Focus from actor combat state
    if (this.context.totalFocusCost > 0) {
      const currentFocus = this.actor.system.combat?.focus ?? 0;
      await this.actor.update({ "system.combat.focus": Math.max(0, currentFocus - this.context.totalFocusCost) });
    }

    // 3. Increment uses and update bonusCost on item document
    if (this.context.costIncrease > 0) {
      await this.item.update({
        "system.uses": (this.context.currentUses || 0) + 1,
        "system.bonusCost": (this.context.currentBonusCost || 0) + this.context.costIncrease
      });
    }
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

    const visited = new Set();
    const cancelled = await this._traverseNode(startNode.id, visited);

    await this._flushPhaseCard();

    if (!cancelled) {
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

  /**
   * Evaluate whether an accuracy condition port should be followed.
   * @param {string} port
   * @returns {boolean}
   * @protected
   */
  _evaluateCondition(port) {
    if (port === "always" || port === "out") return true;
    if (port === "onSpark") return Boolean(this.context.isSpark);
    if (port === "onHit") return Boolean(this.context.isHit && !this.context.isSpark);
    if (port === "onMiss") return Boolean(!this.context.isHit);
    return false;
  }

  /**
   * Check if a reference node is already resolved in context.
   * @param {object} node
   * @param {string} targetPort
   * @returns {boolean}
   * @protected
   */
  _isResolved(node, targetPort) {
    if (!node) return true;
    if (this._executedNodes.has(node.id) || node._alreadyExecuted) return true;
    if (targetPort === "rollRef" && this.context.evaluatedRolls?.has(node.id)) return true;
    if (targetPort === "areaRef" && this.context.areas?.has(node.id)) return true;
    return false;
  }

  /**
   * Lazily execute a standalone reference node.
   * @param {object} refNode
   * @param {Set<string>} visited
   * @protected
   */
  async _executeReferenceNode(refNode, visited) {
    if (visited.has(refNode.id) || this._isResolved(refNode)) return;
    visited.add(refNode.id);
    await this._resolveReferences(refNode, visited);
    await this._executeBehavior(refNode, refNode.phase || "base");
    refNode._alreadyExecuted = true;
    this._executedNodes.add(refNode.id);
  }

  /**
   * Resolve incoming reference connections for a node before execution.
   * @param {object} node
   * @param {Set<string>} visited
   * @protected
   */
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

  /**
   * Recursive graph node traversal following connections.
   * @param {string} nodeId
   * @param {Set<string>} visited
   * @param {string} [incomingPort=null]
   * @returns {Promise<boolean>} True if pipeline was cancelled by user
   * @protected
   */
  async _traverseNode(nodeId, visited, incomingPort = null) {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);

    const node = this._getNode(nodeId);
    if (!node) return false;

    if (incomingPort) {
      this.context.currentBranch = incomingPort;
    }

    await this._resolveReferences(node, visited);

    if (node.type !== "start") {
      const phaseKey = node.phase || "base";
      await this._switchPhase(phaseKey);

      const result = await this._executeBehavior(node, phaseKey);
      this._executedNodes.add(node.id);
      node._alreadyExecuted = true;
      if (result === false) return true; // Cancelled
    } else if (this.system.phases?.start?.description?.trim() && !this.system.phases?.start?.skipPhase) {
      await this._switchPhase("start");
    }

    const outgoing = this._getOutgoingConnections(nodeId);
    if (node.type === "rollAccuracy") {
      for (const conn of outgoing) {
        if (this._evaluateCondition(conn.sourcePort)) {
          const cancelled = await this._traverseNode(conn.targetId, visited, conn.sourcePort);
          if (cancelled) return true;
        }
      }
    } else {
      for (const conn of outgoing) {
        const cancelled = await this._traverseNode(conn.targetId, visited, conn.sourcePort);
        if (cancelled) return true;
      }
    }

    return false;
  }

  async _executeBehavior(node, phaseKey) {
    console.log(`[DeedExecutor] Phase "${phaseKey}" — Executing behavior "${node.type}" (${node.id}):`, node.params);
    return await DeedBehaviorHandler.dispatch(node, this.context, this.actor, this.item, phaseKey);
  }

  /**
   * Switch phase for chat card consolidation. Flushes previous phase outputs if phase changed.
   * @param {string} newPhaseKey
   * @protected
   */
  async _switchPhase(newPhaseKey) {
    if (this._currentPhaseKey && this._currentPhaseKey !== newPhaseKey) {
      await this._flushPhaseCard();
    }
    this._currentPhaseKey = newPhaseKey;
    if (!this.context.currentPhaseOutputs) {
      this.context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }
  }

  /**
   * Post consolidated chat card for active phase and clear phase output state.
   * @protected
   */
  async _flushPhaseCard() {
    if (!this._currentPhaseKey) return;
    if (this._hasOutputsToPost(this._currentPhaseKey)) {
      const phase = this.system.phases?.[this._currentPhaseKey] || {};
      await this._postPhaseCard(this._currentPhaseKey, phase, false);
    }
    this._currentPhaseKey = null;
    this.context.currentPhaseOutputs = null;
    this.context.activeChatMessage = null;
  }

  _hasOutputsToPost(phaseKey) {
    const outputs = this.context.currentPhaseOutputs;
    if (outputs && (outputs.rolls?.length > 0 || outputs.rollEntries?.length > 0 || outputs.notes?.length > 0 || outputs.accuracyHtml)) {
      return true;
    }
    const phase = this.system.phases?.[phaseKey];
    return Boolean(phase?.description && phase.description.trim() && !phase.skipPhase);
  }

  /**
   * Post or update consolidated chat card for a phase.
   * @param {string} phaseKey
   * @param {object} phase
   * @param {boolean} [isPartial=false]
   * @protected
   */
  async _postPhaseCard(phaseKey, phase, isPartial = false) {
    if (!phase) phase = this.system.phases?.[phaseKey] || {};
    const phaseLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}`);
    const outputs = this.context.currentPhaseOutputs || { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };

    let content = `<div class="bdeed-phase-card" style="border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px; padding: 10px; background: var(--trp-bg-panel, #23201c); color: var(--trp-text, #ddd0aa);">
      <h3 style="margin: 0 0 6px 0; color: var(--trp-gold-bright, #e8c96b); font-family: var(--trp-font-header, 'Cinzel', serif); font-size: var(--fs-14); border-bottom: 1px solid var(--trp-gold-dim, #a88840); padding-bottom: 4px;">
        ${this.item.name} — ${phaseLabel}
      </h3>`;

    if (phase.description && !phase.skipPhase) {
      content += `<p style="margin: 6px 0; font-size: var(--fs-13); font-style: italic;">${phase.description}</p>`;
    }
    if (outputs.accuracyHtml) {
      content += outputs.accuracyHtml;
    }
    if (outputs.rollEntries && outputs.rollEntries.length > 0) {
      content += outputs.rollEntries.join("");
    }
    if (outputs.notes && outputs.notes.length > 0) {
      content += `<div class="phase-notes" style="margin-top: 8px; padding-top: 4px; border-top: 1px dashed var(--trp-border, #4a3f2f); font-size: var(--fs-12); color: var(--trp-text-dim, #a09070);">
        ${outputs.notes.map(n => `<div>• ${n}</div>`).join("")}
      </div>`;
    }
    content += `</div>`;

    const sourceToken = this.actor?.token?.object ||
                        canvas.tokens?.controlled.find(t => t.actor?.id === this.actor?.id) ||
                        canvas.tokens?.placeables.find(t => t.actor?.id === this.actor?.id);
    const alias = sourceToken ? DeedBehaviorHandler.getTokenDisplayName(sourceToken) : DeedBehaviorHandler.getTokenDisplayName(this.actor);
    const speaker = sourceToken
      ? ChatMessage.getSpeaker({ token: sourceToken.document || sourceToken, actor: this.actor, alias })
      : (this.actor ? ChatMessage.getSpeaker({ actor: this.actor, alias }) : ChatMessage.getSpeaker({ alias }));
    speaker.alias = alias;

    const rollData = (outputs.rolls || []).map(r => (typeof r.toJSON === "function" ? r.toJSON() : r));

    if (this.context.activeChatMessage) {
      await this._updateChatMessage(this.context.activeChatMessage, { content, rolls: rollData });
    } else {
      const msg = await ChatMessage.create({
        speaker,
        content,
        rolls: rollData,
        flags: { trespasser: { bdeedId: this.item.id, phase: phaseKey } }
      });
      this.context.activeChatMessage = msg;
    }

    if (!isPartial) {
      this.context.activeChatMessage = null;
      this.context.currentPhaseOutputs = null;
    }
  }

  /**
   * Helper to update a chat message directly or via socket if non-GM.
   * @param {ChatMessage} message
   * @param {object} updates
   * @protected
   */
  async _updateChatMessage(message, updates) {
    if (!message?.id) return;
    if (game.user.isGM) {
      await message.update(updates);
    } else {
      const { TrespasserSocket } = await import("./socket/socket.mjs");
      TrespasserSocket?.emit("UPDATE_CHAT_MESSAGE", { messageId: message.id, updates });
    }
  }
}
