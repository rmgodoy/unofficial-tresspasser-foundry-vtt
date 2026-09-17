import { TargetClassifier } from "./target-classifier.mjs";
import { DeedBehaviorUtils } from "../helpers/deed-behaviors/deed-behavior-utils.mjs";
import { formatEffectBadge } from "../helpers/effect-badge-helper.mjs";
import { matchesDisposition } from "./targeting-geometry.mjs";
import { migrateToGraph } from "../helpers/migration-graph.mjs";
import { getActorEffects, getActorRelevantModifiers, combineModifierFormulas } from "../effects/effects-aggregate.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * DeedIntentResolver — Pure, non-destructive static analyzer for Deed behavior graphs.
 * Evaluates what damage, healing, or effects each token will receive "Anyway" (base/always/miss)
 * vs "On Hit" vs "On Spark", preserving authored formulas and rendering icons.
 */
export class DeedIntentResolver {

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
   * @param {object} context - Indexed graph data
   * @returns {object} TokenDeedOutcomePreview
   */
  static resolveSingleTokenOutcome(targetToken, casterToken, deedItem, context) {
    const { nodes = [], connections = [], nodesById = new Map(), isExplicitTarget = true } = context;
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

    // 1. Walk branches from start
    const startNode = nodes.find(n => n.type === "start") || nodes[0];
    if (startNode) {
      const visited = new Set();
      this._walkBranch(startNode.id, "anyway", outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, null);
    }

    // Fallback if no flow connections exist
    const hasFlowConnections = connections.some(c => c.type !== "reference" && (!c.targetPort || c.targetPort === "in" || c.targetPort === "out"));
    if (!hasFlowConnections && !branchActions.anyway.length && !branchActions.onHit.length && !branchActions.onSpark.length) {
      this._fallbackExtractBehaviors(nodes, isSelf, branchActions, targetToken, casterToken);
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
      anyway:  { ...outcomes.anyway,  html: this._formatSectionHtml(outcomes.anyway, targetIsSunken, casterActor) },
      onHit:   { ...outcomes.onHit,   html: this._formatSectionHtml(outcomes.onHit, targetIsSunken, casterActor) },
      onSpark: { ...outcomes.onSpark, html: this._formatSectionHtml(outcomes.onSpark, targetIsSunken, casterActor) },
      onMiss:  { ...outcomes.onMiss,  html: this._formatSectionHtml(outcomes.onMiss, targetIsSunken, casterActor) },
      modifiers: {
        casterDamage: casterDamageMods,
        targetDamage: targetDamageMods,
        casterHealing: casterHealMods,
        targetHealing: targetHealMods
      }
    };
  }

  static _walkBranch(nodeId, currentBranch, outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, activeFilter = null) {
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
      const appliesToThisToken = this._doesNodeApplyToToken(node, isSelf, targetToken, casterToken, currentFilter, isExplicitTarget);
      if (appliesToThisToken) {
        const p = node.params || {};
        let refId = p.rollBehaviorId?.trim();
        if (!refId && incomingRefs.has(node.id)) {
          const refConn = incomingRefs.get(node.id).find(c => c.targetPort === "rollRef");
          if (refConn) refId = refConn.sourceId;
        }

        const refNode = refId ? nodesById.get(refId) : null;
        const isAccuracySwitch = refNode && refNode.type === "switch";

        if (isAccuracySwitch && currentBranch === "anyway") {
          const hitExpr = this._resolveNodeFormula(node, nodesById, incomingRefs, "onHit");
          const sparkExpr = this._resolveNodeFormula(node, nodesById, incomingRefs, "onSpark");
          const missExpr = this._resolveNodeFormula(node, nodesById, incomingRefs, "onMiss");

          const cat = (node.type === "applyDamage") ? "damage" : "healing";
          if (hitExpr) branchActions.onHit.push({ nodeId: node.id, type: node.type, category: cat, value: hitExpr, node });
          if (sparkExpr && sparkExpr !== hitExpr) branchActions.onSpark.push({ nodeId: node.id, type: node.type, category: cat, value: sparkExpr, node });
          if (missExpr) branchActions.onMiss.push({ nodeId: node.id, type: node.type, category: cat, value: missExpr, node });
        } else {
          const dest = branchActions[currentBranch] || branchActions.anyway;
          if (node.type === "applyDamage") {
            const expr = this._resolveNodeFormula(node, nodesById, incomingRefs, currentBranch);
            if (expr) dest.push({ nodeId: node.id, type: "applyDamage", category: "damage", value: expr, node });
          } else if (node.type === "healTarget") {
            const expr = this._resolveNodeFormula(node, nodesById, incomingRefs, currentBranch);
            if (expr) dest.push({ nodeId: node.id, type: "healTarget", category: "healing", value: expr, node });
          } else if (node.type === "grantRecovery") {
            const intensity = parseInt(node.params?.intensity) || 1;
            dest.push({ nodeId: node.id, type: "grantRecovery", category: "healing", value: `${intensity}<sd>`, node });
          } else if (node.type === "applyEffects") {
            const effList = this._extractNodeEffects(node);
            for (const eff of effList) {
              dest.push({ nodeId: node.id, type: "applyEffects", category: "effects", value: eff, node });
            }
          }
        }
      }
    }

    const outConns = outgoing.get(nodeId) || [];
    for (const conn of outConns) {
      let nextBranch = currentBranch;
      if (node.type === "rollAccuracy") {
        if (conn.sourcePort === "onHit") nextBranch = "onHit";
        else if (conn.sourcePort === "onSpark") nextBranch = "onSpark";
        else if (conn.sourcePort === "onMiss") nextBranch = "onMiss";
        else if (conn.sourcePort === "always" || conn.sourcePort === "out") nextBranch = "anyway";
      }
      this._walkBranch(conn.targetId, nextBranch, outgoing, incomingRefs, nodesById, targetToken, casterToken, isSelf, isExplicitTarget, branchActions, visited, currentFilter);
    }
  }

  static _distributeActionsToOutcomes(branchActions, outcomes, branchingMode) {
    // 1. Anyway & On Miss actions
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

    // 2. On Hit actions
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
        const effKey = typeof act.value === "string"
          ? act.value.toLowerCase()
          : `${(act.value?.name || "").toLowerCase()}:${act.value?.intensity || 0}`;
        hitEffectKeys.add(effKey);
        outcomes.onHit.effects.push(act.value);
      }
    }

    // 3. On Spark actions
    for (const act of branchActions.onSpark) {
      if (branchingMode === "hitOrSpark") {
        // Deduplicate identical shared base actions in hitOrSpark
        if (act.category === "damage" && hitDamageValues.has(act.value)) continue;
        if (act.category === "healing" && hitHealingValues.has(act.value)) continue;
        if (act.category === "effects") {
          const effKey = typeof act.value === "string"
            ? act.value.toLowerCase()
            : `${(act.value?.name || "").toLowerCase()}:${act.value?.intensity || 0}`;
          if (hitEffectKeys.has(effKey)) continue;
        }
      }
      if (act.category === "damage") outcomes.onSpark.damage.push(act.value);
      else if (act.category === "healing") outcomes.onSpark.healing.push(act.value);
      else if (act.category === "effects") outcomes.onSpark.effects.push(act.value);
    }
  }

  static _doesNodeApplyToToken(node, isSelf, targetToken, casterToken, activeFilter, isExplicitTarget = true) {
    const p = node.params || {};
    const targetScope = p.targetScope || p.target || "";
    const isExplicitSelfAction = targetScope === "self" || targetScope === "source" 
      || activeFilter?.targetMode === "self" || activeFilter?.targetMode === "personal";

    // When evaluating caster token who was NOT explicitly targeted/in AoE,
    // only actions explicitly targeted at self should apply.
    if (isSelf && !isExplicitTarget) {
      return Boolean(isExplicitSelfAction);
    }

    if (!isSelf) {
      if (isExplicitSelfAction) return false;
      if (activeFilter?.disposition && activeFilter.disposition !== "any") {
        if (!matchesDisposition(targetToken, activeFilter.disposition, casterToken)) {
          return false;
        }
      }
      return true;
    }

    // isSelf && isExplicitTarget
    if (activeFilter?.ignoreSelf) return false;
    if (activeFilter?.disposition && activeFilter.disposition !== "any") {
      if (!matchesDisposition(targetToken, activeFilter.disposition, casterToken)) {
        return false;
      }
    }
    return true;
  }

  static _resolveNodeFormula(node, nodesById, incomingRefs = new Map(), currentBranch = "anyway") {
    const p = node.params || {};
    let raw = p.expression?.trim() || "";

    let refId = p.rollBehaviorId?.trim();
    if (!refId && incomingRefs.has(node.id)) {
      const refConn = incomingRefs.get(node.id).find(c => c.targetPort === "rollRef");
      if (refConn) refId = refConn.sourceId;
    }

    if (refId && nodesById.has(refId)) {
      let refNode = nodesById.get(refId);

      if (refNode.type === "switch") {
        const switchRefs = incomingRefs.get(refNode.id) || [];
        let candidatePorts = currentBranch === "onSpark" ? ["onSpark", "onHit", "always", "in"]
          : currentBranch === "onHit" ? ["onHit", "always", "in"]
          : currentBranch === "onMiss" ? ["onMiss", "always", "in"]
          : ["always", "onHit", "in", "onMiss", "onSpark"];

        let branchSourceId = candidatePorts.map(port => switchRefs.find(c => c.targetPort === port)?.sourceId).find(Boolean)
          || switchRefs.find(c => c.targetPort !== "source")?.sourceId;

        if (branchSourceId && nodesById.has(branchSourceId)) refNode = nodesById.get(branchSourceId);
      }

      const refExpr = refNode?.params?.expression?.trim() || "";
      if (refExpr) {
        if (!raw) raw = refExpr;
        else if (raw.startsWith("/")) raw = `½ ${refExpr}`;
        else if (raw.startsWith("*")) raw = `2× ${refExpr}`;
        else if (raw.startsWith("+") || raw.startsWith("-")) raw = `${refExpr} ${raw}`;
      }
    }
    return raw;
  }

  static _extractNodeEffects(node) {
    const p = node.params || {};
    if (Array.isArray(p.effects) && p.effects.length > 0) {
      return p.effects.filter(e => e && (e.name || e.uuid)).map(e => ({
        name: e.name || "Effect",
        intensity: parseInt(e.intensity) || 0,
        img: e.img || null,
        uuid: e.uuid || null
      }));
    }
    if (p.effectName) {
      return [{ name: p.effectName, intensity: parseInt(p.intensity) || 0, img: p.img || null }];
    }
    return [];
  }

  static _fallbackExtractBehaviors(nodes, isSelf, branchActions, targetToken, casterToken) {
    for (const n of nodes) {
      if (!this._doesNodeApplyToToken(n, isSelf, targetToken, casterToken, null)) continue;
      const phase = n.phase || "base";
      const targetBranch = phase === "hit" ? "onHit" : phase === "spark" ? "onSpark" : phase === "miss" ? "onMiss" : "anyway";
      const dest = branchActions[targetBranch] || branchActions.anyway;
      const expr = n.params?.expression?.trim();

      if (n.type === "applyDamage" && expr) dest.push({ nodeId: n.id, type: "applyDamage", category: "damage", value: expr, node: n });
      else if (n.type === "healTarget" && expr) dest.push({ nodeId: n.id, type: "healTarget", category: "healing", value: expr, node: n });
      else if (n.type === "applyEffects") {
        for (const eff of this._extractNodeEffects(n)) dest.push({ nodeId: n.id, type: "applyEffects", category: "effects", value: eff, node: n });
      }
    }
  }

  static _formatSectionHtml(section, isTargetSunken = false, casterActor = null) {
    const parts = [];
    if (section.damage?.length > 0) {
      let raw = section.damage.join(" + ");
      let res = (DeedBehaviorUtils.resolveFormulaPlaceholders(raw, casterActor) || raw).trim();
      if (res.startsWith("-") || res.startsWith("+")) res = res.slice(1).trim();
      const sunkenTag = isTargetSunken ? `<span class="outcome-sunken" style="font-size: var(--fs-10); color: #74b9ff; margin-left: 2px;">(½)</span>` : "";
      parts.push(`<span class="outcome-dmg">-${res}${sunkenTag} <i class="fa-solid fa-heart"></i></span>`);
    }
    if (section.healing?.length > 0) {
      let raw = section.healing.join(" + ");
      let res = (DeedBehaviorUtils.resolveFormulaPlaceholders(raw, casterActor) || raw).trim();
      if (res.startsWith("+") || res.startsWith("-")) res = res.slice(1).trim();
      parts.push(`<span class="outcome-heal">+${res} <i class="fa-solid fa-heart"></i></span>`);
    }
    if (section.effects?.length > 0) {
      parts.push(`<span class="outcome-eff-list">${section.effects.map(eff => formatEffectBadge(eff)).join("")}</span>`);
    }
    return parts.join(" ");
  }
}
