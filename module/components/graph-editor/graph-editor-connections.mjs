/**
 * graph-editor-connections.mjs
 * Connection rendering and management for GraphEditor.
 */
import { renderConnectionPath } from "./graph-connection.mjs";
import { applyReferenceConnection, removeReferenceConnection } from "./graph-interactions.mjs";

/**
 * Renders all SVG connection paths.
 * @param {object} editor - GraphEditor instance
 */
export function renderAllConnections(editor) {
  editor.svg.querySelectorAll("path:not(.connection-temp)").forEach(p => p.remove());
  for (const conn of editor.connections) {
    const srcNode = editor.nodeMap.get(conn.sourceId);
    const tgtNode = editor.nodeMap.get(conn.targetId);
    if (!srcNode || !tgtNode) continue;
    const p1 = srcNode.getPortCoordinates(conn.sourcePort, "out");
    const p2 = tgtNode.getPortCoordinates(conn.targetPort, "in");
    editor.svg.appendChild(renderConnectionPath(null, conn, p1, p2));
  }
}

/**
 * Adds a connection between two ports.
 * @param {object} editor - GraphEditor instance
 * @param {string} sourceId
 * @param {string} sourcePort
 * @param {string} targetId
 * @param {string} targetPort
 * @param {string} [type="flow"]
 */
export function addGraphConnection(editor, sourceId, sourcePort, targetId, targetPort, type = "flow") {
  if (sourceId === targetId) return;

  if (type === "reference" || targetPort.endsWith("Ref")) {
    const oldIdx = editor.connections.findIndex(c => c.targetId === targetId && c.targetPort === targetPort);
    if (oldIdx !== -1) {
      const old = editor.connections.splice(oldIdx, 1)[0];
      removeReferenceConnection(editor, old.targetId, old.targetPort);
    }
  } else {
    const exists = editor.connections.some(c =>
      c.sourceId === sourceId && c.sourcePort === sourcePort &&
      c.targetId === targetId && c.targetPort === targetPort
    );
    if (exists) return;
  }

  editor.connections.push({ id: foundry.utils.randomID(), sourceId, sourcePort, targetId, targetPort, type });
  if (type === "flow" && targetPort === "in") {
    const targetNode = editor.nodeMap.get(targetId);
    if (targetNode && targetNode.data.type !== "start" && (!targetNode.data.phase || targetNode.data.phase === "base")) {
      targetNode.setPhase("inherit");
    }
  } else if (type === "reference" || targetPort.endsWith("Ref")) {
    applyReferenceConnection(editor, sourceId, targetId, targetPort);
  }
  editor._renderConnections();
  editor._notifyChange();
}
