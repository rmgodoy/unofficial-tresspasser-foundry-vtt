import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * Helper to persist graph state and viewport to the item document.
 * @param {object} options
 * @param {object} options.sheet
 * @param {object} options.editor
 * @param {object} options.graph
 */
export async function persistGraphData({ sheet, editor, graph }) {
  await sheet.document.update({
    "system.graph": graph,
    "system.graphVersion": 1,
    "flags.trespasser.graphViewport": editor ? editor.getViewportState() : undefined
  });
}

/**
 * Handles dropping Items (effects, terrains, deeds) onto drop zones.
 * @param {object} options
 * @param {DragEvent} options.event
 * @param {string} options.currentNodeId
 * @param {object} options.editor
 * @param {object} options.sheet
 * @param {Function} options.onUpdated
 */
export async function handlePropertiesDrop({ event, currentNodeId, editor, sheet, onUpdated }) {
  event.preventDefault();
  const zone = event.currentTarget;
  const isEffect = zone.classList.contains("behavior-effect-drop");
  const isTerrain = zone.classList.contains("behavior-terrain-drop");
  const isDeed = zone.classList.contains("behavior-deed-drop");
  if (!isEffect && !isTerrain && !isDeed) return;

  let data;
  try {
    data = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (data.type !== "Item") return;

  const item = await resolveItem(data);
  if (!item) return;

  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node) return;
  node.params = foundry.utils.deepClone(node.params || {});

  if (isEffect) {
    if (item.type !== "effect" && item.type !== "state") {
      ui.notifications?.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnlyEffects") || "Only effects or states can be dropped here.");
      return;
    }
    node.params.effects = Array.isArray(node.params.effects) ? [...node.params.effects] : [];
    if (node.params.effects.some(e => e.uuid === item.uuid || e.name === item.name)) {
      ui.notifications?.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: item.name }) || `${item.name} is already added.`);
      return;
    }
    node.params.effects.push({
      uuid: item.uuid,
      name: item.name,
      img: item.img || "icons/svg/aura.svg",
      intensity: 1
    });
  } else if (isTerrain) {
    if (item.type !== "terrain") {
      ui.notifications?.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropTerrainsOnly") || "Only Terrain items can be dropped here.");
      return;
    }
    node.params.terrainUuid = item.uuid;
    node.params.terrainName = item.name;
    node.params.terrainImg = item.img || "icons/svg/mountain.svg";
    const sys = item.system;
    const hasLinked = Boolean((sys?.linkedEffects && sys.linkedEffects.length > 0) || sys?.linkedEffect?.uuid || sys?.linkedEffectKey);
    node.params.intensity = hasLinked ? (parseInt(sys?.linkedEffects?.[0]?.intensity, 10) || 1) : null;
  } else if (isDeed) {
    if (item.type !== "deed") {
      ui.notifications?.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnly") || "Only Deeds can be dropped here.");
      return;
    }
    node.params.deedUuid = item.uuid;
    node.params.deedName = item.name;
    node.params.deedImg = item.img || "icons/svg/lightning.svg";
  }

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}

/**
 * Removes an effect chip from an applyEffects node.
 * @param {object} options
 */
export async function removeEffectFromNode({ currentNodeId, effectIndex, editor, sheet, onUpdated }) {
  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node || !Array.isArray(node.params?.effects)) return;

  node.params = foundry.utils.deepClone(node.params);
  node.params.effects.splice(effectIndex, 1);

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}

/**
 * Clears the referenced terrain from a spawnTerrain node.
 * @param {object} options
 */
export async function clearTerrainFromNode({ currentNodeId, editor, sheet, onUpdated }) {
  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node || !node.params) return;

  node.params = foundry.utils.deepClone(node.params);
  node.params.terrainUuid = "";
  node.params.terrainName = "";
  node.params.terrainImg = "";
  node.params.intensity = null;

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}

/**
 * Clears the referenced deed from an executeDeed node.
 * @param {object} options
 */
export async function clearDeedFromNode({ currentNodeId, editor, sheet, onUpdated }) {
  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node || !node.params) return;

  node.params = foundry.utils.deepClone(node.params);
  node.params.deedUuid = "";
  node.params.deedName = "";
  node.params.deedImg = "";

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}
