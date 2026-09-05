/**
 * graph-editor.mjs
 * Main node graph editor controller managing canvas viewport, pan/zoom, nodes, and connections.
 */
import { GraphNode } from "./graph-node.mjs";
import { GraphContextMenu } from "./graph-context-menu.mjs";
import {
  startCanvasPan,
  startNodeDrag,
  startNoodleDrag,
  removeReferenceConnection,
  getShortcutsTooltipHtml,
  applyNodeDefaults,
  bindGraphKeyboardEvents,
  unbindGraphKeyboardEvents
} from "./graph-interactions.mjs";
import { autoLayoutNodes, fitGraphToView } from "./graph-editor-layout.mjs";
import { renderAllConnections, addGraphConnection } from "./graph-editor-connections.mjs";

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

  /** Host document of the editor container element. */
  get document() {
    return this.container?.ownerDocument || document;
  }

  /** Host window of the editor container element. */
  get window() {
    return this.container?.ownerDocument?.defaultView || window;
  }

  /**
   * Builds the DOM structure for the graph editor.
   * @protected
   */
  _buildDOM() {
    this.container.innerHTML = "";
    const doc = this.document;
    const fitTitle = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.FitView") || "Fit to View";
    const layoutTitle = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.AutoLayout") || "Auto Layout";
    const shortcutsTitle = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.ShortcutsTitle") || "Shortcuts & Controls";

    this.root = doc.createElement("div");
    this.root.className = "graph-editor-root";
    this.root.setAttribute("tabindex", "-1");
    this.root.innerHTML = `
      <div class="graph-toolbar">
        <div class="toolbar-group">
          <button type="button" class="btn-fit" title="${fitTitle}"><i class="fas fa-expand"></i></button>
          <button type="button" class="btn-layout" title="${layoutTitle}"><i class="fas fa-wand-magic-sparkles"></i></button>
          <button type="button" class="btn-shortcuts" data-tooltip-direction="DOWN" aria-label="${shortcutsTitle}"><i class="fas fa-keyboard"></i></button>
        </div>
        <div class="toolbar-group"><span class="zoom-label">100%</span></div>
      </div>
      <div class="graph-viewport">
        <div class="graph-content">
          <svg class="graph-svg-layer">
            <path class="graph-connection connection-temp" style="display: none;"></path>
          </svg>
          <div class="graph-nodes-layer"></div>
        </div>
      </div>`;

    this.toolbar = this.root.querySelector(".graph-toolbar");
    this.viewport = this.root.querySelector(".graph-viewport");
    this.content = this.root.querySelector(".graph-content");
    this.svg = this.root.querySelector(".graph-svg-layer");
    this.tempNoodle = this.root.querySelector(".connection-temp");
    this.nodesLayer = this.root.querySelector(".graph-nodes-layer");

    const btnShortcuts = this.toolbar.querySelector(".btn-shortcuts");
    if (btnShortcuts) btnShortcuts.dataset.tooltip = getShortcutsTooltipHtml();

    this.container.appendChild(this.root);
    this._updateTransform();
  }

  /** Loads graph data into the editor. */
  setGraph(nodesData = [], connectionsData = []) {
    this.nodesLayer.innerHTML = "";
    this.nodeMap.clear();
    this._rawNodesData = nodesData;

    for (const data of nodesData) {
      const node = new GraphNode(data, { editor: this });
      this.nodeMap.set(data.id, node);
      this.nodesLayer.appendChild(node.element);
    }

    this.connections = (connectionsData || []).filter(c => {
      const src = this.nodeMap.get(c.sourceId), tgt = this.nodeMap.get(c.targetId);
      return src?.portElements.has(`out:${c.sourcePort}`) && tgt?.portElements.has(`in:${c.targetPort}`);
    });

    if (this.selectedNodeId && this.nodeMap.has(this.selectedNodeId)) {
      this.nodeMap.get(this.selectedNodeId).setSelected(true);
    }
    for (const node of this.nodeMap.values()) node.updateSummary();
    this._updateTransform();
    this._renderConnections();
  }

  /** Returns current graph data. */
  getGraph() {
    return {
      nodes: Array.from(this.nodeMap.values()).map(n => foundry.utils.deepClone(n.data)),
      connections: foundry.utils.deepClone(this.connections)
    };
  }

  /** Renders all SVG connection paths. */
  _renderConnections() {
    renderAllConnections(this);
  }

  /** Updates canvas CSS transform based on pan and zoom. */
  _updateTransform() {
    this.content.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const zoomLabel = this.toolbar?.querySelector(".zoom-label");
    if (zoomLabel) zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  /** Converts viewport client coordinates to canvas space coordinates. */
  clientToCanvas(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: Math.round((clientX - rect.left - this.panX) / this.zoom),
      y: Math.round((clientY - rect.top - this.panY) / this.zoom)
    };
  }

  /** Selects a node by ID. */
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
      id, type,
      phase: type === "start" ? "start" : "inherit",
      params: foundry.utils.deepClone(params),
      x: Math.round(x), y: Math.round(y)
    };
    applyNodeDefaults(nodeData, type, this.options?.sheet?.document?.system);
    const node = new GraphNode(nodeData, { editor: this });
    this.nodeMap.set(id, node);
    this.nodesLayer.appendChild(node.element);
    this.selectNode(id);
    this._notifyChange();
  }

  /** Deletes a node and its connections. */
  deleteNode(nodeId) {
    if (!nodeId) return;
    const node = this.nodeMap.get(nodeId);
    if (!node || node.data.type === "start") {
      ui.notifications?.warn(game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.CannotDeleteStart") || "Cannot delete Start node.");
      return;
    }
    node.element?.remove();
    this.nodeMap.delete(nodeId);

    for (const c of this.connections) {
      if (c.sourceId === nodeId && (c.type === "reference" || c.targetPort.endsWith("Ref"))) {
        removeReferenceConnection(this, c.targetId, c.targetPort);
      }
    }
    this.connections = this.connections.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId);
    this._renderConnections();
    if (this.selectedNodeId === nodeId) this.selectNode(null);
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
    addGraphConnection(this, sourceId, sourcePort, targetId, targetPort, type);
  }

  /** Auto-layouts nodes topologically left-to-right. */
  autoLayout() {
    autoLayoutNodes(this);
  }

  /** Adjusts pan and zoom to fit all nodes inside the viewport. */
  fitToView() {
    fitGraphToView(this);
  }

  /** Notifies consumer of changes to nodes or connections. */
  _notifyChange() {
    if (typeof this.options.onGraphChange === "function") {
      this.options.onGraphChange(this.getGraph());
    }
  }

  /** Notifies consumer of viewport state changes (pan, zoom, selected node). */
  _notifyViewportChange() {
    if (typeof this.options.onViewportChange === "function") {
      this.options.onViewportChange(this.getViewportState());
    }
  }

  /** Attaches pointer and keyboard events. */
  _attachEvents() {
    this.toolbar?.querySelector(".btn-fit")?.addEventListener("click", () => this.fitToView());
    this.toolbar?.querySelector(".btn-layout")?.addEventListener("click", () => this.autoLayout());

    this.viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(this.zoom * delta, 0.3), 2.0);
      const rect = this.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this._updateTransform();
      this._notifyViewportChange();
    }, { passive: false });

    this.viewport.addEventListener("pointerdown", this._onPointerDown.bind(this));

    this.viewport.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const coords = this.clientToCanvas(e.clientX, e.clientY);
      GraphContextMenu.show({
        x: e.clientX, y: e.clientY, canvasX: coords.x, canvasY: coords.y,
        parentEl: this.document.body,
        onSelect: (type, cx, cy) => this.addNode(type, cx, cy)
      });
    });

    this._bindWindowEvents();
  }

  /** Binds global keyboard listeners to current host window. */
  _bindWindowEvents() {
    bindGraphKeyboardEvents(this);
  }

  /** Unbinds global keyboard listeners from host window. */
  _unbindWindowEvents() {
    unbindGraphKeyboardEvents(this);
  }

  /** Refreshes listeners and visual transforms when host window changes. */
  onHostWindowChanged() {
    this._bindWindowEvents();
    this.dragState = null;
    if (this.tempNoodle) this.tempNoodle.style.display = "none";
    GraphContextMenu.close();
    this._updateTransform();
    this._renderConnections();
  }

  /**
   * Global pointerdown handler.
   * @protected
   */
  _onPointerDown(e) {
    if (e.button === 2) return;
    this.root?.focus({ preventScroll: true });

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
    this._unbindWindowEvents();
    GraphContextMenu.close();
    this.container.innerHTML = "";
  }
}
