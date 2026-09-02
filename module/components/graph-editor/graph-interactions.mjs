/**
 * graph-interactions.mjs
 * Mouse and pointer drag interactions for the graph editor (canvas pan, node drag, and wire connection).
 */
import { calculateBezierPath } from "./graph-connection.mjs";
import { isReferencePort } from "../../data/node-port-config.mjs";

/**
 * Handles canvas pan dragging.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {PointerEvent} e
 */
export function startCanvasPan(editor, e) {
  editor.dragState = {
    type: "pan",
    startX: e.clientX,
    startY: e.clientY,
    initPanX: editor.panX,
    initPanY: editor.panY
  };

  const onMove = (ev) => {
    if (editor.dragState?.type !== "pan") return;
    editor.panX = editor.dragState.initPanX + (ev.clientX - editor.dragState.startX);
    editor.panY = editor.dragState.initPanY + (ev.clientY - editor.dragState.startY);
    editor._updateTransform();
    editor._notifyViewportChange();
  };

  const onUp = () => {
    editor.dragState = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/**
 * Handles dragging a node to move its position.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {PointerEvent} e
 * @param {string} nodeId
 */
export function startNodeDrag(editor, e, nodeId) {
  const node = editor.nodeMap.get(nodeId);
  if (!node) return;

  editor.dragState = {
    type: "node",
    nodeId,
    startX: e.clientX,
    startY: e.clientY,
    initNodeX: node.data.x ?? 0,
    initNodeY: node.data.y ?? 0
  };

  const onMove = (ev) => {
    if (editor.dragState?.type !== "node") return;
    const dx = (ev.clientX - editor.dragState.startX) / editor.zoom;
    const dy = (ev.clientY - editor.dragState.startY) / editor.zoom;
    node.setPosition(editor.dragState.initNodeX + dx, editor.dragState.initNodeY + dy);
    editor._renderConnections();
  };

  const onUp = () => {
    if (editor.dragState?.type === "node") {
      editor._notifyChange();
    }
    editor.dragState = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

/**
 * Handles drawing a connection noodle from an output port or disconnecting an input port.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {PointerEvent} e
 * @param {HTMLElement} portEl
 */
export function startNoodleDrag(editor, e, portEl) {
  const nodeId = portEl.dataset.nodeId;
  const portName = portEl.dataset.portName;
  const portDirection = portEl.dataset.portDirection;
  const portType = portEl.dataset.portType;

  // Disconnect existing if dragging from an input port
  if (portDirection === "in") {
    const connIdx = editor.connections.findIndex(c => c.targetId === nodeId && c.targetPort === portName);
    if (connIdx !== -1) {
      const removed = editor.connections.splice(connIdx, 1)[0];
      editor._renderConnections();
      editor._notifyChange();

      // Re-initiate drag from the removed connection's source port
      const srcNode = editor.nodeMap.get(removed.sourceId);
      if (srcNode) {
        const srcPortEl = srcNode.portElements.get(`out:${removed.sourcePort}`);
        if (srcPortEl) {
          startNoodleDrag(editor, e, srcPortEl);
          return;
        }
      }
    }
    return;
  }

  const node = editor.nodeMap.get(nodeId);
  if (!node) return;

  const startPos = node.getPortCoordinates(portName, "out");
  editor.tempNoodle.style.display = "block";

  const onMove = (ev) => {
    const cur = editor.clientToCanvas(ev.clientX, ev.clientY);
    const d = calculateBezierPath(startPos.x, startPos.y, cur.x, cur.y);
    editor.tempNoodle.setAttribute("d", d);
  };

  const onUp = (ev) => {
    editor.tempNoodle.style.display = "none";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    // Check drop target port
    const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
    const targetPortEl = dropTarget?.closest(".graph-port") || dropTarget?.closest(".graph-port-row")?.querySelector(".graph-port");
    if (targetPortEl && targetPortEl.dataset.portDirection === "in") {
      const targetNodeId = targetPortEl.dataset.nodeId;
      const targetPortName = targetPortEl.dataset.portName;
      const targetPortType = targetPortEl.dataset.portType;

      // Ensure flow connects to flow and ref connects to ref
      const connType = isReferencePort(targetPortName) || portType === "reference" ? "reference" : "flow";
      editor.addConnection(nodeId, portName, targetNodeId, targetPortName, connType);
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
