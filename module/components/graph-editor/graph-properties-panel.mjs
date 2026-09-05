/**
 * graph-properties-panel.mjs
 * Right-side docked properties panel component for editing node phase and parameters.
 */
import { BEHAVIOR_ICONS } from "./graph-node.mjs";
import { renderBehaviorParamsHtml } from "./graph-properties-context.mjs";
import {
  handlePropertiesDrop,
  removeEffectFromNode,
  clearTerrainFromNode,
  clearDeedFromNode
} from "./graph-properties-drops.mjs";

export class GraphPropertiesPanel {
  /**
   * @param {HTMLElement} container - DOM container element
   * @param {object} options
   * @param {object} options.sheet  - Parent TrespasserDeedSheet instance
   * @param {object} options.editor - GraphEditor instance
   * @param {boolean} [options.readOnly=false]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.sheet = options.sheet;
    this.editor = options.editor;
    this.readOnly = !!options.readOnly;
    this.currentNodeId = null;
    this._renderVersion = 0;
    this._isRendering = false;

    this.render();
  }

  /**
   * Sets the currently active node and renders its properties.
   * @param {string|null} nodeId
   */
  async setNode(nodeId) {
    const nextId = nodeId || null;
    if (this.currentNodeId === nextId && (this._isRendering || this.container.querySelector(".properties-node-card"))) {
      return;
    }
    this.currentNodeId = nextId;
    await this.render();
  }

  /**
   * Renders the properties panel contents.
   */
  async render() {
    if (!this.container) return;
    const version = ++this._renderVersion;
    this._isRendering = true;

    try {
      if (!this.currentNodeId) {
        this._renderEmptyState();
        return;
      }

      const graph = this.editor ? this.editor.getGraph() : (this.sheet.document.system.graph || { nodes: [] });
      const nodeIndex = graph.nodes.findIndex(n => n.id === this.currentNodeId);
      const node = nodeIndex >= 0 ? graph.nodes[nodeIndex] : null;

      if (!node) {
        this._renderEmptyState();
        return;
      }

      const panelEl = document.createElement("div");
      panelEl.className = "graph-properties-panel-content";

      // Panel Header
      const panelHeader = document.createElement("div");
      panelHeader.className = "properties-panel-header";
      panelHeader.innerHTML = `
        <div class="panel-header-title">
          <i class="fas fa-sliders"></i>
          <span>${game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Properties") || "Properties"}</span>
        </div>
      `;
      panelEl.appendChild(panelHeader);

      // Node Info Card
      const typeLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Behavior.Type.${node.type}`) || node.type;
      const iconClass = BEHAVIOR_ICONS[node.type] || "fa-cube";
      const phaseKeys = node.type === "start"
        ? ["start"]
        : ["inherit", "start", "before", "base", "hit", "spark", "after", "end"];

      const phaseOptionsHtml = phaseKeys.map(key => {
        const selected = (node.phase || "inherit") === key ? "selected" : "";
        const label = key === "inherit"
          ? (game.i18n.localize("TRESPASSER.Sheet.Deed.Phase.Inherit") || "Inherit")
          : game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${key.charAt(0).toUpperCase() + key.slice(1)}`);
        return `<option value="${key}" ${selected}>${label}</option>`;
      }).join("");

      const copyTitle = game.i18n.format("TRESPASSER.Sheet.Deed.Graph.CopyNodeId", { id: node.id }) || `Copy Node ID: ${node.id}`;
      const nodeCard = document.createElement("div");
      nodeCard.className = `properties-node-card phase-border-${node.phase || "inherit"}`;
      nodeCard.innerHTML = `
        <div class="node-card-header">
          <div class="node-card-title">
            <i class="fas ${iconClass}"></i>
            <span>${typeLabel}</span>
          </div>
          <button type="button" class="btn-copy-id" title="${copyTitle}" data-node-id="${node.id}">
            <i class="fas fa-copy"></i> #${node.id.slice(0, 6)}
          </button>
        </div>
        <div class="node-card-fields">
          <div class="field-row">
            <label>${game.i18n.localize("TRESPASSER.Sheet.Deed.Params.NodePhase") || "Phase"}</label>
            <select name="system.graph.nodes.${nodeIndex}.phase" class="node-phase-select" ${this.readOnly || node.type === "start" ? "disabled" : ""}>
              ${phaseOptionsHtml}
            </select>
          </div>
        </div>
      `;
      panelEl.appendChild(nodeCard);

      // Behavior Parameters Form Partial
      const paramsContainer = document.createElement("div");
      paramsContainer.className = "properties-param-section";

      try {
        const paramsHtml = await renderBehaviorParamsHtml({
          node,
          nodeIndex,
          sheet: this.sheet,
          editor: this.editor,
          readOnly: this.readOnly,
          graph
        });
        paramsContainer.innerHTML = paramsHtml;
      } catch (err) {
        console.error("Trespasser | Failed to render behavior-params.hbs in properties panel:", err);
        paramsContainer.innerHTML = `<p class="error-text">${game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.ParamsLoadError") || "Failed to load parameters editor."}</p>`;
      }

      panelEl.appendChild(paramsContainer);

      // Guard: Discard stale renders if a newer render was requested while awaiting template
      if (version !== this._renderVersion) return;

      // Clear container and append single new panel element
      this.container.innerHTML = "";
      this.container.appendChild(panelEl);
      this._attachEvents(panelEl, node, nodeIndex);
    } finally {
      if (version === this._renderVersion) {
        this._isRendering = false;
      }
    }
  }

  /**
   * Renders the empty placeholder state when no node is selected.
   * @protected
   */
  _renderEmptyState() {
    this.container.innerHTML = `
      <div class="properties-empty-state">
        <div class="empty-icon"><i class="fas fa-arrow-pointer"></i></div>
        <p class="empty-prompt">${game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.SelectNodePrompt") || "Select a node in the graph to edit its properties."}</p>
      </div>
    `;
  }

  /**
   * Attaches interaction and form events to the panel elements.
   * @param {HTMLElement} panelEl
   * @param {object} node
   * @param {number} nodeIndex
   * @protected
   */
  _attachEvents(panelEl, node, nodeIndex) {
    // Copy node ID button
    panelEl.querySelector(".btn-copy-id")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = e.currentTarget.dataset.nodeId;
      if (!id) return;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(id);
      } else if (game.clipboard?.copyPlainText) {
        game.clipboard.copyPlainText(id);
      }
      ui.notifications?.info(game.i18n.format("TRESPASSER.Sheet.Deed.Graph.CopiedNodeId", { id }) || `Copied node ID "${id}" to clipboard.`);
    });

    // Phase selector change -> immediately update canvas visuals and persist
    const phaseSelect = panelEl.querySelector(".node-phase-select");
    phaseSelect?.addEventListener("change", async (e) => {
      const newPhase = e.target.value;
      if (this.editor) {
        this.editor.updateNodePhase(node.id, newPhase);
      }
      const card = panelEl.querySelector(".properties-node-card");
      if (card) {
        const oldPhaseClass = Array.from(card.classList).find(c => c.startsWith("phase-border-"));
        if (oldPhaseClass) card.classList.remove(oldPhaseClass);
        card.classList.add(`phase-border-${newPhase}`);
      }
      if (this.sheet?.isEditable) {
        await this.sheet.submit();
      }
    });

    // Listen for changes in params section (selects, inputs, checkboxes)
    const paramSection = panelEl.querySelector(".properties-param-section");
    paramSection?.addEventListener("change", async (e) => {
      const target = e.target;
      const name = target.name;
      if (!name) return;

      const match = name.match(/^system\.graph\.nodes\.(\d+)\.params\.(.+)$/);
      if (!match) return;

      const propPath = match[2];
      let val;
      if (target.type === "checkbox") {
        val = target.checked;
      } else if (target.type === "number") {
        val = target.value === "" ? null : Number(target.value);
      } else {
        val = target.value;
      }

      // Update node params in graphEditor
      const graph = this.editor ? this.editor.getGraph() : this.sheet.document.system.graph;
      const targetNode = graph.nodes.find(n => n.id === this.currentNodeId);
      if (targetNode) {
        targetNode.params = foundry.utils.deepClone(targetNode.params || {});
        foundry.utils.setProperty(targetNode.params, propPath, val);
        if (this.editor) {
          this.editor.updateNodeParams(this.currentNodeId, targetNode.params, { notify: false });
        }
      }

      // If this property triggers conditional UI branches, re-render the panel immediately
      const conditionalProps = ["targetMode", "placement", "destinationMode", "chooseCreatures", "property", "aoeType", "dieRecovery", "hpRecovery"];
      if (conditionalProps.includes(propPath)) {
        await this.render();
      }

      // Submit to document
      if (this.sheet?.isEditable) {
        await this.sheet.submit();
      }
    });

    paramSection?.addEventListener("input", (e) => {
      const target = e.target;
      if (target.tagName !== "INPUT" || target.type === "checkbox") return;
      const match = target.name?.match(/^system\.graph\.nodes\.(\d+)\.params\.(.+)$/);
      if (!match) return;
      const propPath = match[2];
      const val = target.type === "number" ? (target.value === "" ? null : Number(target.value)) : target.value;
      const graph = this.editor?.getGraph();
      const targetNode = graph?.nodes?.find(n => n.id === this.currentNodeId);
      if (targetNode && this.editor) {
        targetNode.params = foundry.utils.deepClone(targetNode.params || {});
        foundry.utils.setProperty(targetNode.params, propPath, val);
        this.editor.updateNodeParams(this.currentNodeId, targetNode.params, { notify: false });
      }
    });

    // Drop zones (Effects, Terrain, Deed)
    const dropZones = panelEl.querySelectorAll(".drop-zone");
    for (const zone of dropZones) {
      zone.addEventListener("dragover", (ev) => ev.preventDefault());
      zone.addEventListener("drop", (ev) => handlePropertiesDrop({
        event: ev,
        currentNodeId: this.currentNodeId,
        editor: this.editor,
        sheet: this.sheet,
        onUpdated: () => this.render()
      }));
    }

    // Remove effect buttons
    const removeEffectBtns = panelEl.querySelectorAll(".remove-effect-btn");
    for (const btn of removeEffectBtns) {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const effIndex = parseInt(btn.dataset.effectIndex);
        if (!isNaN(effIndex)) {
          removeEffectFromNode({
            currentNodeId: this.currentNodeId,
            effectIndex: effIndex,
            editor: this.editor,
            sheet: this.sheet,
            onUpdated: () => this.render()
          });
        }
      });
    }

    // Clear terrain button
    panelEl.querySelector(".clear-terrain-btn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      clearTerrainFromNode({
        currentNodeId: this.currentNodeId,
        editor: this.editor,
        sheet: this.sheet,
        onUpdated: () => this.render()
      });
    });

    // Clear deed button
    panelEl.querySelector(".clear-deed-btn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      clearDeedFromNode({
        currentNodeId: this.currentNodeId,
        editor: this.editor,
        sheet: this.sheet,
        onUpdated: () => this.render()
      });
    });

    // Auto-select text on focus for number/text inputs
    const selectOnFocus = panelEl.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }
  }

  /** Cleans up listeners and clears container DOM. */
  destroy() {
    this._renderVersion++;
    this._isRendering = false;
    if (this.container) this.container.innerHTML = "";
  }
}
