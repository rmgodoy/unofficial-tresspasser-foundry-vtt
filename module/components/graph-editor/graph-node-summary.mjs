import { formatDiceIcons } from "../../helpers/dice-icon-helper.mjs";

/** Formats a short human-readable tag for an area node. */
export function formatAreaSummary(node) {
  if (!node) return "";
  const p = node.params || {};
  if (p.targetMode === "squares") {
    const count = p.targetCount || 1;
    const sq = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Squares") || "sq";
    return `${count} ${sq}`;
  }
  if (p.aoeType) return `${p.aoeType} ${p.aoeSize || 1}`;
  if (p.targetMode === "aoe") return `blast ${p.aoeSize || 1}`;
  return p.targetMode || "area";
}

/**
 * Generates a short informative text summary for the node card.
 * @param {object} node - Node data object
 * @param {Function} getIncomingReference - Function to resolve incoming references
 * @returns {string} HTML markup string
 */
export function getNodeSummary(node, getIncomingReference) {
  const params = node.params || {};
  switch (node.type) {
    case "start": {
      const tag = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Root") || "Root";
      return `<span class="summary-tag">${tag}</span>`;
    }
    case "rollAccuracy": {
      const parts = [];
      if (params.actionType) {
        const actKey = params.actionType.charAt(0).toUpperCase() + params.actionType.slice(1);
        parts.push(game.i18n.localize(`TRESPASSER.Sheet.Item.Details.ActionTypeChoices.${actKey}`) || params.actionType);
      }
      if (params.abilityType) {
        const abKey = params.abilityType.charAt(0).toUpperCase() + params.abilityType.slice(1);
        parts.push(game.i18n.localize(`TRESPASSER.Sheet.Item.Details.TypeChoices.${abKey}`) || params.abilityType);
      }
      if (params.versus) {
        const vsLabel = params.versus === "10" ? "10" : (game.i18n.localize(`TRESPASSER.Sheet.Combat.${params.versus}`) || params.versus);
        parts.push(`vs ${vsLabel}`);
      }
      if (params.branchingMode === "hitOrSpark") {
        parts.push(game.i18n.localize("TRESPASSER.Sheet.Deed.Params.HitOrSparkTag") || "Hit/Spark");
      }
      const tag = parts.length > 0
        ? parts.join(" · ")
        : (game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Branching") || "Branching");
      return `<span class="summary-tag">${tag}</span>`;
    }
    case "applyDamage":
    case "healTarget":
    case "roll": {
      const ref = getIncomingReference?.("rollRef");
      const refExpr = ref?.sourceNode?.params?.expression?.trim();
      const expr = params.expression?.trim();

      if (ref?.sourceId) {
        const displayRef = refExpr ? `(${formatDiceIcons(refExpr)})` : `(#${ref.sourceId.slice(0, 6)})`;
        if (!expr) return `<span class="summary-ref-val">${displayRef}</span>`;
        const formattedExpr = formatDiceIcons(expr);
        if (/^[\/*+-]/.test(expr)) {
          return `<span class="summary-ref-val">${displayRef}</span> <span class="summary-formula">${formattedExpr}</span>`;
        }
        if (/@roll/i.test(expr)) {
          const replaced = formattedExpr.replace(/@roll/gi, `<span class="summary-ref-val">${displayRef}</span>`);
          return `<span class="summary-formula">${replaced}</span>`;
        }
        return `<span class="summary-ref-val">${displayRef} +</span> <span class="summary-formula">${formattedExpr}</span>`;
      }
      return expr ? `<span class="summary-formula">${formatDiceIcons(expr)}</span>` : `<span class="summary-muted">—</span>`;
    }
    case "selectTarget": {
      if (params.targetMode === "area") {
        const ref = getIncomingReference?.("areaRef");
        const areaTag = formatAreaSummary(ref?.sourceNode);
        const rel = params.areaRelation || "inside";
        return areaTag
          ? `<span class="summary-tag">${rel} <span class="summary-ref-val">(${areaTag})</span></span>`
          : `<span class="summary-tag">area</span>`;
      }
      if (params.targetMode === "self") {
        const selfLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Params.TargetModeChoices.Personal") || "self";
        return `<span class="summary-tag">${selfLabel}</span>`;
      }
      if (params.targetMode === "aoe") {
        return `<span class="summary-tag">${params.aoeType || "blast"} ${params.aoeSize || 1}</span>`;
      }
      const count = params.targetCount || 1;
      const tgtLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Targets") || "targets";
      return `<span class="summary-tag">${count} ${tgtLabel}</span>`;
    }
    case "moveSource": {
      if (params.destinationMode === "selectedArea") {
        const ref = getIncomingReference?.("areaRef");
        const areaTag = formatAreaSummary(ref?.sourceNode);
        return areaTag
          ? `<span class="summary-tag">move &rarr; <span class="summary-ref-val">(${areaTag})</span></span>`
          : `<span class="summary-tag">move &rarr; area</span>`;
      }
      return `<span class="summary-tag">${params.movementType || "walk"} ${params.distance || 1} sq</span>`;
    }
    case "spawnTerrain": {
      const name = params.terrainName || "";
      const intStr = (params.intensity !== undefined && params.intensity !== null && params.intensity !== "") ? ` (Int ${params.intensity})` : "";
      if (params.placement === "selected_area") {
        const ref = getIncomingReference?.("areaRef");
        const areaTag = formatAreaSummary(ref?.sourceNode);
        return name
          ? `<span class="summary-tag">${name}${intStr} <span class="summary-ref-val">(${areaTag || "area"})</span></span>`
          : `<span class="summary-muted">—</span>`;
      }
      return name ? `<span class="summary-tag">${name}${intStr}</span>` : `<span class="summary-muted">—</span>`;
    }
    case "moveTerrain": {
      const ref = getIncomingReference?.("terrainRef");
      const terrainName = ref?.sourceNode?.params?.terrainName || "";
      const dist = params.distance || 1;
      return terrainName
        ? `<span class="summary-tag">move <span class="summary-ref-val">(${terrainName})</span> ${dist} sq</span>`
        : `<span class="summary-tag">move terrain ${dist} sq</span>`;
    }
    case "selectArea": {
      if (params.targetMode === "aoe") {
        return `<span class="summary-tag">${params.aoeType || "blast"} ${params.aoeSize || 1}</span>`;
      }
      const count = params.targetCount || 1;
      const sqLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Squares") || "sq";
      return `<span class="summary-tag">${count} ${sqLabel}</span>`;
    }
    case "applyEffects": {
      const effLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Effects") || "effects";
      return params.effects?.length ? `<span class="summary-tag">${params.effects.length} ${effLabel}</span>` : `<span class="summary-muted">—</span>`;
    }
    default:
      return "";
  }
}
