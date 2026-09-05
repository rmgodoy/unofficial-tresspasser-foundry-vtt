/**
 * graph-editor-layout.mjs
 * Layout algorithms and viewport fitting for GraphEditor.
 */

/**
 * Auto-layouts nodes topologically left-to-right.
 * @param {object} editor - GraphEditor instance
 */
export function autoLayoutNodes(editor) {
  let currentX = 60;
  const startNode = Array.from(editor.nodeMap.values()).find(n => n.data.type === "start");
  if (startNode) {
    startNode.setPosition(currentX, 180);
    currentX += 280;
  }
  const otherNodes = Array.from(editor.nodeMap.values())
    .filter(n => n.data.type !== "start")
    .sort((a, b) => (a.data.x ?? 0) - (b.data.x ?? 0));

  let row = 0;
  for (const node of otherNodes) {
    node.setPosition(currentX, 80 + (row % 3) * 140);
    currentX += 280;
    row++;
  }
  editor._renderConnections();
  editor._notifyChange();
}

/**
 * Adjusts pan and zoom to fit all nodes inside the viewport.
 * @param {object} editor - GraphEditor instance
 */
export function fitGraphToView(editor) {
  if (editor.nodeMap.size === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of editor.nodeMap.values()) {
    minX = Math.min(minX, node.data.x ?? 0);
    minY = Math.min(minY, node.data.y ?? 0);
    maxX = Math.max(maxX, (node.data.x ?? 0) + 240);
    maxY = Math.max(maxY, (node.data.y ?? 0) + 120);
  }

  const rect = editor.viewport.getBoundingClientRect();
  const padding = 60;
  const graphW = Math.max(maxX - minX, 200) + padding * 2;
  const graphH = Math.max(maxY - minY, 200) + padding * 2;
  const scaleX = rect.width / graphW;
  const scaleY = rect.height / graphH;
  editor.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.2);
  editor.panX = Math.round((rect.width - (maxX + minX) * editor.zoom) / 2);
  editor.panY = Math.round((rect.height - (maxY + minY) * editor.zoom) / 2);
  editor._updateTransform();
  editor._notifyViewportChange();
}
