import { TargetClassifier } from "./target-classifier.mjs";
import { formatDiceIcons } from "../helpers/dice-icon-helper.mjs";
import { matchesDisposition } from "./targeting-geometry.mjs";
import { migrateToGraph } from "../helpers/migration-graph.mjs";
import { getActorEffects } from "../effects/effects-aggregate.mjs";
import { RangeHelper } from "../helpers/range-helper.mjs";

/**
 * DeedIntentResolver — Pure, non-destructive static analyzer for Deed behavior graphs.
 * Evaluates what damage, healing, or effects each token will receive "Anyway" (base/always/miss)
 * vs "On Hit" vs "On Spark", preserving raw formula text and rendering die icons.
 */
export class DeedIntentResolver {

  /**
   * Resolve outcome previews for a list of tokens given a caster and deed.
   * @param {Array<Token|TokenDocument>} tokens - Targeted or AoE-hovered tokens
   * @param {Token|TokenDocument} casterToken - The caster token
   * @param {Item} deedItem - The deed item document
   * @param {object} [options]
   * @returns {Map<string, object>} Map of tokenId -> TokenDeedOutcomePreview
   */
  static resolveTargetsOutcome(tokens, casterToken, deedItem, options = {}) {
    const outcomeMap = new Map();
    if (!tokens || tokens.length === 0 || !deedItem) return outcomeMap;

    let graph = deedItem.system?.graph;
    if (!graph?.nodes?.length && deedItem.system?.phases) {
      const migrated = migrateToGraph(deedItem.system);
      graph = migrated?.graph;
    }

    const nodes = graph?.nodes || [];
    const connections = graph?.connections || [];
    const nodesById = new Map(nodes.map(n => [n.id, n]));

    for (const token of tokens) {
      const tokenId = token.id || token.document?.id;
      if (!tokenId) continue;

      const preview = this.resolveSingleTokenOutcome(token, casterToken, deedItem, {
        nodes,
        connections,
        nodesById,
        ...options
      });
      outcomeMap.set(tokenId, preview);
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
    const { nodes = [], connections = [], nodesById = new Map() } = context;
    const isSelf = casterToken && (targetToken.id === casterToken.id || targetToken.document?.id === casterToken.document?.id);

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

    // Index outgoing flow connections: sourceId -> Array<{ targetId, sourcePort, targetPort }>
    const outgoing = new Map();
    for (const conn of connections) {
      if (conn.type === "reference") continue;
      if (!outgoing.has(conn.sourceId)) outgoing.set(conn.sourceId, []);
      outgoing.get(conn.sourceId).push(conn);
    }

    // 1. Identify applicable targeting nodes
    const selectNodes = nodes.filter(n => n.type === "selectTarget" || n.type === "selectArea");
    let tokenMatchesAnyTargetNode = selectNodes.length === 0; // If no select node, default true

    for (const sNode of selectNodes) {
      const p = sNode.params || {};
      const targetMode = p.targetMode || "creatures";
      if (targetMode === "self") {
        if (isSelf) tokenMatchesAnyTargetNode = true;
      } else {
        if (isSelf && p.ignoreSelf) continue;
        const disp = p.disposition || "any";
        if (matchesDisposition(targetToken, disp, casterToken)) {
          tokenMatchesAnyTargetNode = true;
        }
      }
    }

    // 2. Walk branches from start
    const startNode = nodes.find(n => n.type === "start") || nodes[0];
    if (startNode) {
      const visited = new Set();
      this._walkBranch(startNode.id, "anyway", outgoing, nodesById, targetToken, casterToken, isSelf, outcomes, visited, null);
    }

    // 3. Fallback: only if graph has NO flow connections at all
    const hasFlowConnections = connections.some(c => c.type !== "reference");
    if (!hasFlowConnections && !outcomes.anyway.damage.length && !outcomes.onHit.damage.length && !outcomes.anyway.healing.length && !outcomes.onHit.healing.length && !outcomes.onSpark.healing.length) {
      this._fallbackExtractBehaviors(nodes, isSelf, outcomes, targetToken, casterToken);
    }

    // 4. Incorporate bonus damage/healing from caster and target token effects
    const targetActor = targetToken?.actor 
      || (targetToken instanceof Actor ? targetToken : null)
      || (canvas.tokens?.get(targetToken?.id || targetToken)?.actor ?? null);

    const casterActor = casterToken?.actor 
      || (casterToken instanceof Actor ? casterToken : null)
      || (context?.actor ?? null)
      || (deedItem?.actor ?? null)
      || (canvas.tokens?.get(casterToken?.id || casterToken)?.actor ?? null);

    const casterDamageMods = this._getActorRelevantModifiers(casterActor, "damage_given");
    const casterHealMods   = this._getActorRelevantModifiers(casterActor, "heal_given");
    const targetDamageMods = this._getActorRelevantModifiers(targetActor, "damage_received");
    const targetHealMods   = this._getActorRelevantModifiers(targetActor, "heal_received");

    const allDamageMods = [...casterDamageMods, ...targetDamageMods];
    const allHealMods   = [...casterHealMods, ...targetHealMods];

    if (allDamageMods.length > 0 || allHealMods.length > 0) {
      for (const section of Object.values(outcomes)) {
        if (section.damage.length > 0 && allDamageMods.length > 0) {
          section.damage = this._combineFormulas(section.damage, allDamageMods);
        }
        if (section.healing.length > 0 && allHealMods.length > 0) {
          section.healing = this._combineFormulas(section.healing, allHealMods);
        }
      }
    }

    // 5. Determine token intent
    const hasAnyDamage = outcomes.anyway.damage.length > 0 || outcomes.onHit.damage.length > 0;
    const hasAnyHeal = outcomes.anyway.healing.length > 0 || outcomes.onHit.healing.length > 0 || outcomes.onSpark.healing.length > 0;
    const hasAnyOutcome = hasAnyDamage || hasAnyHeal || outcomes.anyway.effects.length > 0 || outcomes.onHit.effects.length > 0 || outcomes.onSpark.effects.length > 0;

    let intent = "harmful";
    if (hasAnyHeal && !hasAnyDamage) intent = "beneficial";
    else if (hasAnyHeal && hasAnyDamage) intent = "mixed";
    else if (!hasAnyOutcome) intent = "neutral";

    // 6. Classification
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
      anyway: {
        damage: outcomes.anyway.damage,
        healing: outcomes.anyway.healing,
        effects: outcomes.anyway.effects,
        html: this._formatSectionHtml(outcomes.anyway, targetIsSunken)
      },
      onHit: {
        damage: outcomes.onHit.damage,
        healing: outcomes.onHit.healing,
        effects: outcomes.onHit.effects,
        html: this._formatSectionHtml(outcomes.onHit, targetIsSunken)
      },
      onSpark: {
        damage: outcomes.onSpark.damage,
        healing: outcomes.onSpark.healing,
        effects: outcomes.onSpark.effects,
        html: this._formatSectionHtml(outcomes.onSpark, targetIsSunken)
      },
      onMiss: {
        damage: outcomes.onMiss.damage,
        healing: outcomes.onMiss.healing,
        effects: outcomes.onMiss.effects,
        html: this._formatSectionHtml(outcomes.onMiss, targetIsSunken)
      },
      modifiers: {
        casterDamage: casterDamageMods,
        targetDamage: targetDamageMods,
        casterHealing: casterHealMods,
        targetHealing: targetHealMods
      }
    };
  }

  static _walkBranch(nodeId, currentBranch, outgoing, nodesById, targetToken, casterToken, isSelf, outcomes, visited, activeFilter = null) {
    if (visited.has(`${nodeId}:${currentBranch}`)) return;
    visited.add(`${nodeId}:${currentBranch}`);

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

    // Check if node applies damage/healing
    if (node.type === "applyDamage" || node.type === "healTarget" || node.type === "applyEffects") {
      const appliesToThisToken = this._doesNodeApplyToToken(node, isSelf, targetToken, casterToken, currentFilter);
      if (appliesToThisToken) {
        const dest = outcomes[currentBranch] || outcomes.anyway;
        const expr = this._resolveNodeFormula(node, nodesById);
        if (node.type === "applyDamage" && expr) dest.damage.push(expr);
        else if (node.type === "healTarget" && expr) dest.healing.push(expr);
        else if (node.type === "applyEffects" && node.params?.effectName) dest.effects.push(node.params.effectName);
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
      this._walkBranch(conn.targetId, nextBranch, outgoing, nodesById, targetToken, casterToken, isSelf, outcomes, visited, currentFilter);
    }
  }

  static _doesNodeApplyToToken(node, isSelf, targetToken, casterToken, activeFilter) {
    const p = node.params || {};
    const targetScope = p.targetScope || p.target || "";
    if (targetScope === "self" || targetScope === "source") return isSelf;
    if (isSelf && activeFilter?.ignoreSelf) return false;

    if (activeFilter) {
      if (activeFilter.targetMode === "self") return isSelf;
      if (activeFilter.disposition && activeFilter.disposition !== "any") {
        if (!matchesDisposition(targetToken, activeFilter.disposition, casterToken)) {
          return false;
        }
      }
    }
    return true;
  }

  static _resolveNodeFormula(node, nodesById) {
    const p = node.params || {};
    let raw = p.expression?.trim() || "";

    if (p.rollBehaviorId && nodesById.has(p.rollBehaviorId)) {
      const refNode = nodesById.get(p.rollBehaviorId);
      const refExpr = refNode.params?.expression?.trim() || "";
      if (refExpr) {
        if (!raw) raw = refExpr;
        else if (raw.startsWith("/")) raw = `½ ${refExpr}`;
        else if (raw.startsWith("*")) raw = `2× ${refExpr}`;
        else if (raw.startsWith("+") || raw.startsWith("-")) raw = `${refExpr} ${raw}`;
      }
    }
    return raw || (node.type === "applyDamage" ? "<sd>" : "<sd>");
  }

  static _fallbackExtractBehaviors(nodes, isSelf, outcomes, targetToken, casterToken) {
    for (const n of nodes) {
      if (n.type === "applyDamage" || n.type === "healTarget") {
        const applies = this._doesNodeApplyToToken(n, isSelf, targetToken, casterToken, null);
        if (!applies) continue;
        const expr = n.params?.expression?.trim() || "<sd>";
        const phase = n.phase || "base";
        let targetSection = outcomes.anyway;
        if (phase === "hit") targetSection = outcomes.onHit;
        else if (phase === "spark") targetSection = outcomes.onSpark;
        else if (phase === "miss") targetSection = outcomes.onMiss;

        if (n.type === "applyDamage") targetSection.damage.push(expr);
        else targetSection.healing.push(expr);
      }
    }
  }

  static _formatSectionHtml(section, isTargetSunken = false) {
    const parts = [];
    if (section.damage.length > 0) {
      const dmgStr = section.damage.join(" + ");
      const sunkenTag = isTargetSunken
        ? `<span class="outcome-sunken" style="font-size: var(--fs-10); color: #74b9ff; margin-left: 2px;">(½)</span>`
        : "";
      parts.push(`<span class="outcome-dmg">${formatDiceIcons(dmgStr)}${sunkenTag}</span>`);
    }
    if (section.healing.length > 0) {
      const healStr = section.healing.join(" + ");
      parts.push(`<span class="outcome-heal"><i class="fa-solid fa-heart"></i> ${formatDiceIcons(healStr)}</span>`);
    }
    if (section.effects.length > 0) {
      const effStr = section.effects.join(", ");
      parts.push(`<span class="outcome-eff">${effStr}</span>`);
    }
    return parts.join(" ");
  }

  static _normalizeTargetAttribute(target) {
    if (!target) return "";
    const s = String(target).toLowerCase().replace(/-/g, "_").trim();
    if (s === "damage_dealt" || s === "damage_given" || s === "dmg_dealt" || s === "dmg_given") return "damage_given";
    if (s === "damage_received" || s === "dmg_received") return "damage_received";
    if (s === "heal_given") return "heal_given";
    if (s === "heal_received") return "heal_received";
    return s;
  }

  static _getActorRelevantModifiers(actor, targetType) {
    if (!actor) return [];
    let allEffects = [];
    try {
      const { combat = [], nonCombat = [] } = getActorEffects(actor) || {};
      allEffects = [...combat, ...nonCombat];
    } catch (err) {
      console.warn("Trespasser | Failed to getActorEffects for outcome preview", err);
    }

    const modifiers = [];
    for (const eff of allEffects) {
      if (eff.isOnlyReminder) continue;
      const normTarget = this._normalizeTargetAttribute(eff.target);
      if (normTarget === targetType) {
        const mod = eff.modifier ? String(eff.modifier).trim() : "";
        if (mod && mod !== "0") {
          modifiers.push(mod);
        }
      }
    }
    return modifiers;
  }

  static _combineFormulas(baseList, modifierList) {
    if (!baseList || baseList.length === 0) return [];
    if (!modifierList || modifierList.length === 0) return [...baseList];

    let result = baseList.join(" + ").trim();
    for (const mod of modifierList) {
      const cleanMod = String(mod).trim();
      if (!cleanMod || cleanMod === "0") continue;
      if (cleanMod.startsWith("+")) {
        result += ` + ${cleanMod.substring(1).trim()}`;
      } else if (cleanMod.startsWith("-")) {
        result += ` - ${cleanMod.substring(1).trim()}`;
      } else {
        result += ` + ${cleanMod}`;
      }
    }
    return [result];
  }
}
