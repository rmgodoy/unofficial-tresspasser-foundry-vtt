import { persistGraphData } from "./graph-properties-drops.mjs";

/**
 * Adds an Actor to a summonCreature node's creatures array.
 * @param {object} options
 * @param {Actor} options.actor
 * @param {string} options.currentNodeId
 * @param {object} options.editor
 * @param {object} options.sheet
 * @param {Function} [options.onUpdated]
 */
export async function addCreatureToNode({ actor, currentNodeId, editor, sheet, onUpdated }) {
  if (!actor || actor.documentName !== "Actor") return;

  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node) return;

  node.params = foundry.utils.deepClone(node.params || {});
  node.params.creatures = Array.isArray(node.params.creatures) ? [...node.params.creatures] : [];

  const size = actor.prototypeToken?.width || 1;
  const img = actor.img || actor.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";

  node.params.creatures.push({
    id: foundry.utils.randomID(),
    uuid: actor.uuid,
    name: actor.name,
    img,
    size
  });

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}

/**
 * Removes a creature entry by index from a summonCreature node.
 * @param {object} options
 * @param {string} options.currentNodeId
 * @param {number} options.index
 * @param {object} options.editor
 * @param {object} options.sheet
 * @param {Function} [options.onUpdated]
 */
export async function removeCreatureFromNode({ currentNodeId, index, editor, sheet, onUpdated }) {
  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node || !Array.isArray(node.params?.creatures)) return;

  node.params = foundry.utils.deepClone(node.params);
  node.params.creatures.splice(index, 1);

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}

/**
 * Moves a creature entry from one index to another in a summonCreature node.
 * @param {object} options
 * @param {string} options.currentNodeId
 * @param {number} options.fromIndex
 * @param {number} options.toIndex
 * @param {object} options.editor
 * @param {object} options.sheet
 * @param {Function} [options.onUpdated]
 */
export async function moveCreatureInNode({ currentNodeId, fromIndex, toIndex, editor, sheet, onUpdated }) {
  const graph = editor ? editor.getGraph() : foundry.utils.deepClone(sheet.document.system.graph || { nodes: [] });
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node || !Array.isArray(node.params?.creatures)) return;

  const list = [...node.params.creatures];
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return;

  node.params = foundry.utils.deepClone(node.params);
  const [item] = node.params.creatures.splice(fromIndex, 1);
  node.params.creatures.splice(toIndex, 0, item);

  if (editor) editor.updateNodeParams(currentNodeId, node.params);
  if (onUpdated) await onUpdated();
  await persistGraphData({ sheet, editor, graph });
}
