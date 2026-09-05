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
  const win = editor.window;
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

  const cleanup = () => {
    editor.dragState = null;
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerup", onUp);
    win.removeEventListener("pointercancel", cleanup);
    win.removeEventListener("blur", cleanup);
  };

  const onUp = () => cleanup();

  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onUp);
  win.addEventListener("pointercancel", cleanup);
  win.addEventListener("blur", cleanup);
}

/**
 * Handles dragging a node to move its position.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {PointerEvent} e
 * @param {string} nodeId
 */
export function startNodeDrag(editor, e, nodeId) {
  const win = editor.window;
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

  const cleanup = () => {
    editor.dragState = null;
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerup", onUp);
    win.removeEventListener("pointercancel", cleanup);
    win.removeEventListener("blur", cleanup);
  };

  const onUp = () => {
    if (editor.dragState?.type === "node") {
      editor._notifyChange();
    }
    cleanup();
  };

  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onUp);
  win.addEventListener("pointercancel", cleanup);
  win.addEventListener("blur", cleanup);
}

/**
 * Handles drawing a connection noodle from an output port or disconnecting an input port.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {PointerEvent} e
 * @param {HTMLElement} portEl
 */
export function startNoodleDrag(editor, e, portEl) {
  const win = editor.window;
  const doc = editor.document;
  const nodeId = portEl.dataset.nodeId;
  const portName = portEl.dataset.portName;
  const portDirection = portEl.dataset.portDirection;
  const portType = portEl.dataset.portType;

  // Disconnect existing if dragging from an input port
  if (portDirection === "in") {
    const connIdx = editor.connections.findIndex(c => c.targetId === nodeId && c.targetPort === portName);
    if (connIdx !== -1) {
      const removed = editor.connections.splice(connIdx, 1)[0];
      if (isReferencePort(removed.targetPort) || removed.type === "reference") {
        removeReferenceConnection(editor, removed.targetId, removed.targetPort);
      }
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

  const cleanup = () => {
    editor.tempNoodle.style.display = "none";
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerup", onUp);
    win.removeEventListener("pointercancel", cleanup);
    win.removeEventListener("blur", cleanup);
  };

  const onUp = (ev) => {
    cleanup();

    // Check drop target port
    const dropTarget = doc.elementFromPoint(ev.clientX, ev.clientY);
    const targetPortEl = dropTarget?.closest(".graph-port") || dropTarget?.closest(".graph-port-row")?.querySelector(".graph-port");
    if (targetPortEl && targetPortEl.dataset.portDirection === "in") {
      const targetNodeId = targetPortEl.dataset.nodeId;
      const targetPortName = targetPortEl.dataset.portName;
      const targetPortType = targetPortEl.dataset.portType;

      // Validate reference port compatibility
      if (targetPortName === "areaRef") {
        const srcNode = editor.nodeMap.get(nodeId);
        const isAreaProvider = srcNode && (srcNode.data.type === "selectArea" || (srcNode.data.type === "selectTarget" && srcNode.data.params?.targetMode === "aoe"));
        if (!isAreaProvider) {
          ui.notifications?.warn(game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.InvalidAreaRef") || "Area reference requires an Area or AoE node.");
          return;
        }
      } else if (targetPortName === "rollRef") {
        const srcNode = editor.nodeMap.get(nodeId);
        const isRollProvider = srcNode && ["roll", "applyDamage", "healTarget", "grantRecovery"].includes(srcNode.data.type);
        if (!isRollProvider) {
          ui.notifications?.warn(game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.InvalidRollRef") || "Roll reference requires a Roll, Damage, or Heal node.");
          return;
        }
      } else if (targetPortName === "terrainRef") {
        const srcNode = editor.nodeMap.get(nodeId);
        if (srcNode?.data?.type !== "spawnTerrain") {
          ui.notifications?.warn(game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.InvalidTerrainRef") || "Terrain reference requires a Spawn Terrain node.");
          return;
        }
      }

      // Ensure flow connects to flow and ref connects to ref
      const connType = isReferencePort(targetPortName) || portType === "reference" ? "reference" : "flow";
      editor.addConnection(nodeId, portName, targetNodeId, targetPortName, connType);
    }
  };

  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onUp);
  win.addEventListener("pointercancel", cleanup);
  win.addEventListener("blur", cleanup);
}

/**
 * Applies parameter updates and auto-switches modes when a reference connection is added.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {string} sourceId
 * @param {string} targetId
 * @param {string} targetPort
 */
export function applyReferenceConnection(editor, sourceId, targetId, targetPort) {
  const targetNode = editor.nodeMap.get(targetId);
  if (!targetNode) return;
  targetNode.data.params = targetNode.data.params || {};

  if (targetPort === "rollRef") {
    targetNode.data.params.rollBehaviorId = sourceId;
  } else if (targetPort === "areaRef") {
    targetNode.data.params.areaBehaviorId = sourceId;
    if (targetNode.data.type === "moveSource") {
      targetNode.data.params.destinationMode = "selectedArea";
    } else if (targetNode.data.type === "spawnTerrain") {
      targetNode.data.params.placement = "selected_area";
    }
  } else if (targetPort === "terrainRef") {
    targetNode.data.params.terrainBehaviorId = sourceId;
  }

  targetNode.updateSummary();
  if (editor.selectedNodeId === targetId && typeof editor.options.onNodeSelect === "function") {
    editor.options.onNodeSelect(targetNode.data);
  }
}

/**
 * Clears parameter updates when a reference connection is removed.
 * @param {import("./graph-editor.mjs").GraphEditor} editor
 * @param {string} targetId
 * @param {string} targetPort
 */
export function removeReferenceConnection(editor, targetId, targetPort) {
  const targetNode = editor.nodeMap.get(targetId);
  if (!targetNode) return;
  targetNode.data.params = targetNode.data.params || {};

  if (targetPort === "rollRef") {
    targetNode.data.params.rollBehaviorId = "";
  } else if (targetPort === "areaRef") {
    targetNode.data.params.areaBehaviorId = "";
    if (targetNode.data.type === "moveSource" && targetNode.data.params.destinationMode === "selectedArea") {
      targetNode.data.params.destinationMode = "distance";
    } else if (targetNode.data.type === "spawnTerrain" && targetNode.data.params.placement === "selected_area") {
      targetNode.data.params.placement = "on_target";
    }
  } else if (targetPort === "terrainRef") {
    targetNode.data.params.terrainBehaviorId = "";
  }

  targetNode.updateSummary();
  if (editor.selectedNodeId === targetId && typeof editor.options.onNodeSelect === "function") {
    editor.options.onNodeSelect(targetNode.data);
  }
}

/**
 * Generates localized HTML tooltip for graph keyboard shortcuts and controls.
 * @returns {string}
 */
export function getShortcutsTooltipHtml() {
  const t = (k, fb) => game.i18n.localize(`TRESPASSER.Sheet.Deed.Graph.${k}`) || fb;
  return `<div class="graph-shortcuts-tooltip"><strong>${t("ShortcutsTitle", "Shortcuts & Controls")}</strong><ul>` +
    `<li>• ${t("ShortcutPan", "Pan: Drag canvas")}</li>` +
    `<li>• ${t("ShortcutZoom", "Zoom: Mouse wheel")}</li>` +
    `<li>• ${t("ShortcutAddNode", "Add Node: Right-click")}</li>` +
    `<li>• ${t("ShortcutMoveNode", "Move: Drag node header")}</li>` +
    `<li>• ${t("ShortcutConnect", "Connect: Drag port to port")}</li>` +
    `<li>• ${t("ShortcutDisconnect", "Disconnect: Drag port away")}</li>` +
    `<li>• ${t("ShortcutSelect", "Select: Click node")}</li>` +
    `<li>• ${t("ShortcutDelete", "Delete: Del / Backspace")}</li></ul></div>`;
}

/**
 * Applies default parameters for a new node based on its type.
 * @param {object} nodeData
 * @param {string} type
 * @param {object} [deedSys]
 */
export function applyNodeDefaults(nodeData, type, deedSys = {}) {
  if (type === "rollAccuracy") {
    nodeData.params.actionType ??= deedSys.actionType || "attack";
    nodeData.params.abilityType ??= deedSys.abilityType || "innate";
    nodeData.params.versus ??= deedSys.versus || "Guard";
    nodeData.params.branchingMode ??= "hitThenSpark";
  } else if (type === "selectTarget") {
    nodeData.params.targetMode ??= "creatures";
    nodeData.params.disposition ??= "any";
    nodeData.params.targetCount ??= 1;
  } else if (type === "moveSource") {
    nodeData.params.destinationMode ??= "distance";
    nodeData.params.distance ??= 1;
    nodeData.params.movementType ??= "walk";
  } else if (type === "selectArea") {
    nodeData.params.aoeType ??= "blast";
    nodeData.params.aoeSize ??= 1;
  } else if (type === "forceMoveTargets") {
    nodeData.params.type ??= "push";
    nodeData.params.distance ??= 1;
  }
}

/**
 * Binds global keyboard listeners to host window for node deletion.
 * @param {object} editor - GraphEditor instance
 */
export function bindGraphKeyboardEvents(editor) {
  unbindGraphKeyboardEvents(editor);
  const win = editor.window;
  editor._boundListeners.targetWindow = win;
  editor._boundListeners.onKeyDown = (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && editor.selectedNodeId) {
      const active = editor.document.activeElement;
      const activeTag = active?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select" || active?.isContentEditable) return;

      const appEl = editor.container.closest(".application, .window-app");
      const isFocusedOrHovered = editor.root.contains(active) ||
        appEl?.contains(active) ||
        editor.root.matches(":hover") ||
        appEl?.matches(":hover");
      if (!isFocusedOrHovered) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      editor.deleteNode(editor.selectedNodeId);
    }
  };
  win?.addEventListener("keydown", editor._boundListeners.onKeyDown, { capture: true });
}

/**
 * Unbinds global keyboard listeners from host window.
 * @param {object} editor - GraphEditor instance
 */
export function unbindGraphKeyboardEvents(editor) {
  const { targetWindow, onKeyDown } = editor._boundListeners;
  if (targetWindow && onKeyDown) {
    targetWindow.removeEventListener("keydown", onKeyDown, { capture: true });
    editor._boundListeners.targetWindow = null;
    editor._boundListeners.onKeyDown = null;
  }
}
