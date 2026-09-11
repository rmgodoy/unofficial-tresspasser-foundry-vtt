import { formatAreaSummary } from "./graph-node.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";
import { getSourceOptions } from "../../data/node-port-config.mjs";

/**
 * Resolves context data and renders the behavior parameters template.
 * @param {object} options
 * @param {object} options.node
 * @param {number} options.nodeIndex
 * @param {object} options.sheet
 * @param {object} options.editor
 * @param {boolean} options.readOnly
 * @param {object} options.graph
 * @returns {Promise<string>}
 */
export async function renderBehaviorParamsHtml({ node, nodeIndex, sheet, editor, readOnly, graph }) {
  const item = sheet?.document;
  const defaultActionType = item?.system?.actionType || "attack";
  const defaultAbilityType = item?.system?.abilityType || "innate";
  const defaultVersus = item?.system?.versus || "Guard";
  const actKey = defaultActionType ? defaultActionType.charAt(0).toUpperCase() + defaultActionType.slice(1) : "";
  const defaultActionTypeLabel = game.i18n.localize(`TRESPASSER.Sheet.Item.Details.ActionTypeChoices.${actKey}`) || defaultActionType;
  const abKey = defaultAbilityType ? defaultAbilityType.charAt(0).toUpperCase() + defaultAbilityType.slice(1) : "";
  const defaultAbilityTypeLabel = game.i18n.localize(`TRESPASSER.Sheet.Item.Details.TypeChoices.${abKey}`) || defaultAbilityType;
  const defaultVersusLabel = defaultVersus === "10" ? "10" : (game.i18n.localize(`TRESPASSER.Sheet.Combat.${defaultVersus}`) || defaultVersus);

  // Reference Context resolution for node
  const p = node.params || {};
  const conns = editor?.connections || [];
  const findRef = (port, fallback) => conns.find(c => c.targetId === node.id && c.targetPort === port)?.sourceId
    || (fallback && graph.nodes.some(n => n.id === fallback) ? fallback : "");
  const getNode = id => id ? (editor?.nodeMap?.get(id)?.data || graph.nodes.find(n => n.id === id) || null) : null;
  const refRollId = findRef("rollRef", p.rollBehaviorId);
  const refAreaId = findRef("areaRef", p.areaBehaviorId);
  const refTerrainId = findRef("terrainRef", p.terrainBehaviorId);
  const refSourceId = findRef("source", p.sourceBehaviorId);
  const refRollNode = getNode(refRollId);
  const refRollExpr = refRollNode?.params?.expression?.trim() || "";
  const refAreaSummary = formatAreaSummary(getNode(refAreaId));
  const refTerrainName = getNode(refTerrainId)?.params?.terrainName || "";
  const refSourceNode = getNode(refSourceId);

  const hasRefRoll = Boolean(refRollId && refRollNode);
  const hasRefArea = Boolean(refAreaId && getNode(refAreaId));
  const hasRefTerrain = Boolean(refTerrainId && getNode(refTerrainId));
  const hasRefSource = Boolean(refSourceId && refSourceNode);

  node.params = node.params || {};
  if (hasRefArea) {
    node.params.areaBehaviorId = refAreaId;
    if (node.type === "moveSource") node.params.destinationMode = "selectedArea";
    else if (node.type === "spawnTerrain") node.params.placement = "selected_area";
    else if (node.type === "selectTarget") node.params.targetMode = "area";
  }
  if (hasRefRoll) node.params.rollBehaviorId = refRollId;
  if (hasRefTerrain) node.params.terrainBehaviorId = refTerrainId;
  if (hasRefSource) node.params.sourceBehaviorId = refSourceId;

  let switchOptions = [];
  if (node.type === "switch" && refSourceNode) {
    const rawOptions = getSourceOptions(refSourceNode);
    switchOptions = rawOptions.map(opt => {
      const conn = conns.find(c => c.targetId === node.id && c.targetPort === opt.id);
      const connectedNode = conn ? getNode(conn.sourceId) : null;
      return {
        id: opt.id,
        label: opt.label,
        connectedId: connectedNode?.id || null,
        connectedType: connectedNode?.type || null,
        connectedShortId: connectedNode?.id ? connectedNode.id.slice(0, 6) : null
      };
    });
  }

  let terrainHasLinkedEffect = false;
  if (node.type === "spawnTerrain" && node.params?.terrainUuid) {
    try {
      const terrainDoc = await resolveItem(node.params.terrainUuid, { type: "terrain", notify: false });
      if (terrainDoc) {
        const sys = terrainDoc.system;
        terrainHasLinkedEffect = Boolean((sys?.linkedEffects && sys.linkedEffects.length > 0) || sys?.linkedEffect?.uuid || sys?.linkedEffectKey);
        if (terrainHasLinkedEffect && (node.params.intensity === undefined || node.params.intensity === null)) {
          const defaultInt = parseInt(sys.linkedEffects?.[0]?.intensity, 10);
          node.params.intensity = !isNaN(defaultInt) ? defaultInt : 1;
        }
      }
    } catch {}
  }

  const renderFn = foundry.applications?.handlebars?.renderTemplate || globalThis.renderTemplate;
  return renderFn("systems/trespasser/templates/item/deed/behavior-params.hbs", {
    type: node.type, params: node.params || {}, id: node.id, index: nodeIndex, editable: !readOnly,
    defaultActionType, defaultAbilityType, defaultVersus, defaultActionTypeLabel, defaultAbilityTypeLabel, defaultVersusLabel,
    refRollId, refRollIdShort: refRollId ? refRollId.slice(0, 6) : "", refRollExpr, hasRefRoll,
    refAreaId, refAreaIdShort: refAreaId ? refAreaId.slice(0, 6) : "", refAreaSummary, hasRefArea,
    refTerrainId, refTerrainIdShort: refTerrainId ? refTerrainId.slice(0, 6) : "", refTerrainName, hasRefTerrain,
    refSourceId, refSourceIdShort: refSourceId ? refSourceId.slice(0, 6) : "", refSourceNodeType: refSourceNode?.type || "", hasRefSource,
    switchOptions,
    terrainHasLinkedEffect
  });
}
