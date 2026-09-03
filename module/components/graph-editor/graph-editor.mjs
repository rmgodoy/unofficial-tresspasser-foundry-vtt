/**
 * graph-editor.mjs
 * Main node graph editor controller managing canvas viewport, pan/zoom, nodes, and connections.
 */
import { GraphNode } from "./graph-node.mjs";
import { renderConnectionPath } from "./graph-connection.mjs";
import { GraphContextMenu } from "./graph-context-menu.mjs";
import { startCanvasPan, startNodeDrag, startNoodleDrag, applyReferenceConnection, removeReferenceConnection, getShortcutsTooltipHtml } from "./graph-interactions.mjs";

export class GraphEditor {
  /**
   * @param {HTMLElement} container - DOM container element
   * @param {object} [options] - Configuration options, initial viewport, and callbacks
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;

    this.panX = typeof options.panX === "number" ? options.panX : 40;
    this.panY = typeof options.panY === "number" ? options.panY : 40;
    this.zoom = typeof options.zoom === "number" ? options.zoom : 1.0;

    this.nodeMap = new Map();
    this.connections = [];
    this.selectedNodeId = options.selectedNodeId || null;

    this.dragState = null;
    this._boundListeners = {};

    this._buildDOM();
    this._attachEvents();
  }

  /** Returns current viewport state (pan, zoom, selected node). */
  getViewportState() {
    return { panX: this.panX, panY: this.panY, zoom: this.zoom, selectedNodeId: this.selectedNodeId };
  }

  /** Restores viewport state (pan, zoom, selected node). */
  setViewportState(state) {
    if (!state) return;
    if (typeof state.panX === "number") this.panX = state.panX;
    if (typeof state.panY === "number") this.panY = state.panY;
    if (typeof state.zoom === "number") this.zoom = state.zoom;
    if (state.selectedNodeId !== undefined) this.selectNode(state.selectedNodeId);
    this._updateTransform();
  }

  /**
   * Builds the DOM structure for the graph editor.
   * @protected
   */
  _buildDOM() {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "graph-editor-root";

    // Toolbar
    this.toolbar = document.createElement("div");
    this.toolbar.className = "graph-toolbar";
    const fitTitle = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.FitView") || "Fit to View";
    const layoutTitle = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.AutoLayout") || "Auto Layout";
    const shortcutsTitle = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.ShortcutsTitle") || "Shortcuts & Controls";
    this.toolbar.innerHTML = `<div class="toolbar-group">` +
      `<button type="button" class="btn-fit" title="${fitTitle}"><i class="fas fa-expand"></i></button>` +
      `<button type="button" class="btn-layout" title="${layoutTitle}"><i class="fas fa-wand-magic-sparkles"></i></button>` +
      `<button type="button" class="btn-shortcuts" data-tooltip-direction="DOWN" aria-label="${shortcutsTitle}"><i class="fas fa-keyboard"></i></button>` +
      `</div><div class="toolbar-group"><span class="zoom-label">100%</span></div>`;
    const btnShortcuts = this.toolbar.querySelector(".btn-shortcuts");
    if (btnShortcuts) btnShortcuts.dataset.tooltip = getShortcutsTooltipHtml();

    this.viewport = document.createElement("div");
    this.viewport.className = "graph-viewport";

    this.content = document.createElement("div");
    this.content.className = "graph-content";

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "graph-svg-layer");

    this.tempNoodle = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.tempNoodle.setAttribute("class", "graph-connection connection-temp");
    this.tempNoodle.style.display = "none";
    this.svg.appendChild(this.tempNoodle);

    this.nodesLayer = document.createElement("div");
    this.nodesLayer.className = "graph-nodes-layer";

    this.content.appendChild(this.svg);
    this.content.appendChild(this.nodesLayer);
    this.viewport.appendChild(this.content);
    this.root.appendChild(this.toolbar);
    this.root.appendChild(this.viewport);
    this.container.appendChild(this.root);
    this._updateTransform();
  }

  /**
   * Loads graph data into the editor.
   * @param {Array<object>} nodesData
   * @param {Array<object>} connectionsData
   */
  setGraph(nodesData = [], connectionsData = []) {
    this.nodesLayer.innerHTML = "";
    this.nodeMap.clear();
    this._rawNodesData = nodesData;

    for (const data of nodesData) {
      const node = new GraphNode(data, { editor: this });
      this.nodeMap.set(data.id, node);
      this.nodesLayer.appendChild(node.element);
    }

    // Keep only connections whose endpoints and ports still exist
    this.connections = (connectionsData || []).filter(c => {
      const src = this.nodeMap.get(c.sourceId);
      const tgt = this.nodeMap.get(c.targetId);
      return src?.portElements.has(`out:${c.sourcePort}`) && tgt?.portElements.has(`in:${c.targetPort}`);
    });

    if (this.selectedNodeId && this.nodeMap.has(this.selectedNodeId)) {
      this.nodeMap.get(this.selectedNodeId).setSelected(true);
    }

    for (const node of this.nodeMap.values()) {
      node.updateSummary();
    }

    this._updateTransform();
    this._renderConnections();
  }

  /**
   * Returns current graph data.
   * @returns {{ nodes: Array<object>, connections: Array<object> }}
   */
  getGraph() {
    const nodes = Array.from(this.nodeMap.values()).map(n => foundry.utils.deepClone(n.data));
    return {
      nodes,
      connections: foundry.utils.deepClone(this.connections)
    };
  }

  /**
   * Renders all SVG connection paths.
   * @protected
   */
  _renderConnections() {
    const existing = this.svg.querySelectorAll("path:not(.connection-temp)");
    for (const p of existing) p.remove();

    for (const conn of this.connections) {
      const srcNode = this.nodeMap.get(conn.sourceId);
      const tgtNode = this.nodeMap.get(conn.targetId);
      if (!srcNode || !tgtNode) continue;

      const p1 = srcNode.getPortCoordinates(conn.sourcePort, "out");
      const p2 = tgtNode.getPortCoordinates(conn.targetPort, "in");

      const pathEl = renderConnectionPath(null, conn, p1, p2);
      this.svg.appendChild(pathEl);
    }
  }

  /**
   * Updates canvas CSS transform based on pan and zoom.
   * @protected
   */
  _updateTransform() {
    this.content.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const zoomLabel = this.toolbar?.querySelector(".zoom-label");
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  /**
   * Converts viewport client coordinates to canvas space coordinates.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x: number, y: number}}
   */
  clientToCanvas(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    const vx = clientX - rect.left;
    const vy = clientY - rect.top;
    return {
      x: Math.round((vx - this.panX) / this.zoom),
      y: Math.round((vy - this.panY) / this.zoom)
    };
  }

  /** Selects a node by ID. @param {string|null} nodeId */
  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    for (const [id, node] of this.nodeMap.entries()) {
      node.setSelected(id === nodeId);
    }
    this._notifyViewportChange();
    if (typeof this.options.onNodeSelect === "function") {
      const selected = nodeId ? this.nodeMap.get(nodeId)?.data ?? null : null;
      this.options.onNodeSelect(selected);
    }
  }

  /** Adds a new behavior node to the graph. */
  addNode(type, x = 100, y = 100, params = {}) {
    const id = foundry.utils.randomID();
    const nodeData = {
      id,
      type,
      phase: type === "start" ? "start" : "inherit",
      params: foundry.utils.deepClone(params),
      x: Math.round(x),
      y: Math.round(y)
    };

    const node = new GraphNode(nodeData, { editor: this });
    this.nodeMap.set(id, node);
    this.nodesLayer.appendChild(node.element);

    this.selectNode(id);
    this._notifyChange();
  }

  /** Deletes a node and its connections. @param {string} nodeId */
  deleteNode(nodeId) {
    if (!nodeId) return;
    const node = this.nodeMap.get(nodeId);
    if (!node || node.data.type === "start") {
      ui.notifications?.warn(game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.CannotDeleteStart") || "Cannot delete Start node.");
      return;
    }

    node.element?.remove();
    this.nodeMap.delete(nodeId);

    // Clean up reference parameters for nodes referencing this deleted node
    for (const c of this.connections) {
      if (c.sourceId === nodeId && (c.type === "reference" || c.targetPort.endsWith("Ref"))) {
        removeReferenceConnection(this, c.targetId, c.targetPort);
      }
    }

    // Remove connected edges
    this.connections = this.connections.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId);
    this._renderConnections();

    if (this.selectedNodeId === nodeId) {
      this.selectNode(null);
    }
    this._notifyChange();
  }

  /** Updates a node's phase and refreshes its visuals. */
  updateNodePhase(nodeId, newPhase) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    node.setPhase(newPhase);
    this._notifyChange();
  }

  /** Updates a node's params and refreshes its card summary. */
  updateNodeParams(nodeId, params, { notify = true } = {}) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    node.setParams(params);
    for (const [id, other] of this.nodeMap.entries()) {
      if (id !== nodeId && (
        this.connections.some(c => c.sourceId === nodeId && c.targetId === id) ||
        other.data.params?.rollBehaviorId === nodeId ||
        other.data.params?.areaBehaviorId === nodeId ||
        other.data.params?.terrainBehaviorId === nodeId
      )) {
        other.updateSummary();
      }
    }
    if (notify) this._notifyChange();
  }

  /** Adds a connection between two ports. */
  addConnection(sourceId, sourcePort, targetId, targetPort, type = "flow") {
    if (sourceId === targetId) return;

    if (type === "reference" || targetPort.endsWith("Ref")) {
      const oldIdx = this.connections.findIndex(c => c.targetId === targetId && c.targetPort === targetPort);
      if (oldIdx !== -1) {
        const old = this.connections.splice(oldIdx, 1)[0];
        removeReferenceConnection(this, old.targetId, old.targetPort);
      }
    } else {
      const exists = this.connections.some(c =>
        c.sourceId === sourceId && c.sourcePort === sourcePort &&
        c.targetId === targetId && c.targetPort === targetPort
      );
      if (exists) return;
    }

    this.connections.push({ id: foundry.utils.randomID(), sourceId, sourcePort, targetId, targetPort, type });
    if (type === "flow" && targetPort === "in") {
      const targetNode = this.nodeMap.get(targetId);
      if (targetNode && targetNode.data.type !== "start" && (!targetNode.data.phase || targetNode.data.phase === "base")) {
        targetNode.setPhase("inherit");
      }
    } else if (type === "reference" || targetPort.endsWith("Ref")) {
      applyReferenceConnection(this, sourceId, targetId, targetPort);
    }
    this._renderConnections();
    this._notifyChange();
  }

  /** Auto-layouts nodes topologically left-to-right. */
  autoLayout() {
    let currentX = 60;
    const startNode = Array.from(this.nodeMap.values()).find(n => n.data.type === "start");
    if (startNode) {
      startNode.setPosition(currentX, 180);
      currentX += 280;
    }

    const otherNodes = Array.from(this.nodeMap.values()).filter(n => n.data.type !== "start");
    otherNodes.sort((a, b) => (a.data.x ?? 0) - (b.data.x ?? 0));

    let row = 0;
    for (const node of otherNodes) {
      const y = 80 + (row % 3) * 140;
      node.setPosition(currentX, y);
      currentX += 280;
      row++;
    }

    this._renderConnections();
    this._notifyChange();
  }

  /** Adjusts pan and zoom to fit all nodes inside the viewport. */
  fitToView() {
    if (this.nodeMap.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const node of this.nodeMap.values()) {
      minX = Math.min(minX, node.data.x ?? 0);
      minY = Math.min(minY, node.data.y ?? 0);
      maxX = Math.max(maxX, (node.data.x ?? 0) + 240);
      maxY = Math.max(maxY, (node.data.y ?? 0) + 120);
    }

    const rect = this.viewport.getBoundingClientRect();
    const padding = 60;
    const graphW = Math.max(maxX - minX, 200) + padding * 2;
    const graphH = Math.max(maxY - minY, 200) + padding * 2;

    const scaleX = rect.width / graphW;
    const scaleY = rect.height / graphH;
    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.2);

    this.panX = Math.round((rect.width - (maxX + minX) * this.zoom) / 2);
    this.panY = Math.round((rect.height - (maxY + minY) * this.zoom) / 2);

    this._updateTransform();
    this._notifyViewportChange();
  }

  /**
   * Notifies consumer of changes to nodes or connections.
   * @protected
   */
  _notifyChange() {
    if (typeof this.options.onGraphChange === "function") {
      this.options.onGraphChange(this.getGraph());
    }
  }

  /**
   * Notifies consumer of viewport state changes (pan, zoom, selected node).
   * @protected
   */
  _notifyViewportChange() {
    if (typeof this.options.onViewportChange === "function") {
      this.options.onViewportChange(this.getViewportState());
    }
  }

  /**
   * Attaches pointer and keyboard events.
   * @protected
   */
  _attachEvents() {
    this.toolbar?.querySelector(".btn-fit")?.addEventListener("click", () => this.fitToView());
    this.toolbar?.querySelector(".btn-layout")?.addEventListener("click", () => this.autoLayout());

    // Wheel zoom
    this.viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(this.zoom * delta, 0.3), 2.0);

      const rect = this.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this._updateTransform();
      this._notifyViewportChange();
    }, { passive: false });

    // Pointer down
    this.viewport.addEventListener("pointerdown", this._onPointerDown.bind(this));

    // Right-click context menu
    this.viewport.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const coords = this.clientToCanvas(e.clientX, e.clientY);
      GraphContextMenu.show({
        x: e.clientX,
        y: e.clientY,
        canvasX: coords.x,
        canvasY: coords.y,
        parentEl: document.body,
        onSelect: (type, cx, cy) => this.addNode(type, cx, cy)
      });
    });

    // Delete keyboard shortcut
    this._boundListeners.onKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;
        if (this.selectedNodeId) {
          e.preventDefault();
          this.deleteNode(this.selectedNodeId);
        }
      }
    };
    window.addEventListener("keydown", this._boundListeners.onKeyDown);
  }

  /**
   * Global pointerdown handler.
   * @protected
   */
  _onPointerDown(e) {
    if (e.button === 2) return;

    // 1. Port click / drag
    const portEl = e.target.closest(".graph-port") || e.target.closest(".graph-port-row")?.querySelector(".graph-port");
    if (portEl) {
      e.stopPropagation();
      startNoodleDrag(this, e, portEl);
      return;
    }

    // 2. Node Header drag
    const nodeHeader = e.target.closest(".graph-node-header");
    if (nodeHeader) {
      e.stopPropagation();
      const nodeEl = nodeHeader.closest(".graph-node");
      const nodeId = nodeEl?.dataset?.nodeId;
      if (nodeId) {
        this.selectNode(nodeId);
        startNodeDrag(this, e, nodeId);
      }
      return;
    }

    // 3. Node Card selection
    const nodeEl = e.target.closest(".graph-node");
    if (nodeEl) {
      e.stopPropagation();
      this.selectNode(nodeEl.dataset.nodeId);
      return;
    }

    // 4. Canvas Pan
    this.selectNode(null);
    startCanvasPan(this, e);
  }

  /**
   * Destroys the editor and cleans up global event listeners.
   */
  destroy() {
    if (this._boundListeners.onKeyDown) {
      window.removeEventListener("keydown", this._boundListeners.onKeyDown);
    }
    GraphContextMenu.close();
    this.container.innerHTML = "";
  }
}
