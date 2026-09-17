import { DeedBehaviorUtils } from "../helpers/deed-behaviors/deed-behavior-utils.mjs";
import { formatEffectBadge } from "../helpers/effect-badge-helper.mjs";
import { matchesDisposition } from "./targeting-geometry.mjs";

/**
 * Helper utilities for formula resolution, effect extraction, and HTML formatting in DeedIntentResolver.
 */
export class DeedIntentFormula {

  /**
   * Determine if a behavior node applies to the given token.
   */
  static doesNodeApplyToToken(node, isSelf, targetToken, casterToken, activeFilter, isExplicitTarget = true) {
    const p = node.params || {};
    const targetScope = p.targetScope || p.target || "";
    const isExplicitSelfAction = targetScope === "self" || targetScope === "source" 
      || activeFilter?.targetMode === "self" || activeFilter?.targetMode === "personal";

    if (activeFilter?.targetMode === "self" || activeFilter?.targetMode === "personal") {
      return isSelf;
    }

    if (isExplicitSelfAction) {
      return isSelf;
    }

    if (isSelf && !isExplicitTarget) {
      return Boolean(isExplicitSelfAction);
    }

    if (!isSelf) {
      if (activeFilter?.disposition && activeFilter.disposition !== "any") {
        if (!matchesDisposition(targetToken, activeFilter.disposition, casterToken)) {
          return false;
        }
      }
      return true;
    }

    if (activeFilter?.ignoreSelf) return false;
    if (activeFilter?.disposition && activeFilter.disposition !== "any") {
      if (!matchesDisposition(targetToken, activeFilter.disposition, casterToken)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolve node formula, taking into account runtime evaluated rolls and mathematical modifiers.
   */
  static resolveNodeFormula(node, nodesById, incomingRefs = new Map(), currentBranch = "anyway", runtimeContext = null) {
    const p = node.params || {};
    let raw = p.expression?.trim() || "";

    let refId = p.rollBehaviorId?.trim();
    if (!refId && incomingRefs.has(node.id)) {
      const refConn = incomingRefs.get(node.id).find(c => c.targetPort === "rollRef");
      if (refConn) refId = refConn.sourceId;
    }

    // 1. Evaluate from runtimeContext if evaluated roll is available
    if (refId && runtimeContext?.evaluatedRolls?.has(refId)) {
      const refRoll = runtimeContext.evaluatedRolls.get(refId);
      if (refRoll && typeof refRoll.total === "number") {
        const total = refRoll.total;
        if (!raw) return `${total}`;
        if (raw === "/2" || raw === "/ 2") return `${Math.max(0, Math.floor(total / 2))}`;
        if (raw === "*2" || raw === "* 2") return `${total * 2}`;
        if (raw.startsWith("/")) {
          const denom = parseFloat(raw.slice(1).trim()) || 2;
          return `${Math.max(0, Math.floor(total / denom))}`;
        }
        if (raw.startsWith("*")) {
          const mult = parseFloat(raw.slice(1).trim()) || 1;
          return `${Math.floor(total * mult)}`;
        }
        if (raw.startsWith("+")) {
          const add = parseFloat(raw.slice(1).trim()) || 0;
          return `${total + add}`;
        }
        if (raw.startsWith("-")) {
          const sub = parseFloat(raw.slice(1).trim()) || 0;
          return `${Math.max(0, total - sub)}`;
        }
        return `${total}`;
      }
    }

    // 2. Static graph expression resolution
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

  /**
   * Extract effects array from behavior node params.
   */
  static extractNodeEffects(node) {
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

  /**
   * Format HTML outcome chips for preview display.
   */
  static formatSectionHtml(section, isTargetSunken = false, casterActor = null) {
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
