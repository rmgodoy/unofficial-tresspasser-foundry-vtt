/**
 * graph-node.mjs
 * DOM rendering and port layout for individual behavior nodes on the canvas.
 */
import { getNodePortConfig } from "../../data/node-port-config.mjs";
import { getNodeSummary, formatAreaSummary } from "./graph-node-summary.mjs";
import { createPortRow, computePortCoordinates } from "./graph-node-ports.mjs";

export { formatAreaSummary };

export const BEHAVIOR_ICONS = {
  start: "fa-play",
  rollAccuracy: "fa-crosshairs",
  selectTarget: "fa-bullseye",
  selectArea: "fa-vector-square",
  roll: "fa-dice-d20",
  applyDamage: "fa-burst",
  healTarget: "fa-heart",
  grantRecovery: "fa-shield-halved",
  applyEffects: "fa-wand-magic-sparkles",
  spawnTerrain: "fa-mountain",
  moveTerrain: "fa-arrows-up-down-left-right",
  moveSource: "fa-person-running",
  forceMoveTargets: "fa-arrows-turn-right",
  clearTargets: "fa-xmark",
  executeDeed: "fa-bolt"
};

export class GraphNode {
  /**
   * @param {object} nodeData - System node schema
   * @param {object} [options]
   * @param {Function} [options.onSelect]
   */
  constructor(nodeData, options = {}) {
    this.data = nodeData;
    this.options = options;
    this.element = null;
    this.portElements = new Map();
    this.render();
  }

  /**
   * Renders the node DOM element.
   * @returns {HTMLElement}
   */
  render() {
    const node = this.data;
    const config = getNodePortConfig(node.type);

    const el = document.createElement("div");
    el.className = `graph-node node-${node.type} phase-border-${node.phase || "base"}`;
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x ?? 0}px`;
    el.style.top = `${node.y ?? 0}px`;

    // Header
    const iconClass = BEHAVIOR_ICONS[node.type] || "fa-cube";
    const typeLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Behavior.Type.${node.type}`) || node.type;
    const phaseKey = node.phase || (node.type === "start" ? "start" : "inherit");
    const phaseLabel = phaseKey === "inherit"
      ? (game.i18n.localize("TRESPASSER.Sheet.Deed.Phase.Inherit") || "Inherit")
      : (game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}`));

    const header = document.createElement("div");
    header.className = `graph-node-header phase-bg-${phaseKey}`;
    header.innerHTML = `
      <div class="node-title">
        <i class="fas ${iconClass}"></i>
        <span class="title-text" title="${typeLabel}">${typeLabel}</span>
      </div>
      <span class="node-phase-badge phase-badge-${phaseKey}">${phaseLabel}</span>
    `;

    // Node body
    const body = document.createElement("div");
    body.className = "graph-node-body";

    // Left ports column (Inputs: flow and reference)
    const leftPorts = document.createElement("div");
    leftPorts.className = "graph-ports-column graph-ports-left";

    for (const inPort of config.inputs) {
      const portRow = this._createPortRow("in", inPort, "flow");
      leftPorts.appendChild(portRow);
    }
    for (const refPort of config.refInputs) {
      const portRow = this._createPortRow("in", refPort, "reference");
      leftPorts.appendChild(portRow);
    }

    // Center content (Summary / ID)
    const content = document.createElement("div");
    content.className = "graph-node-content";
    const summary = this._getNodeSummary(node);
    content.innerHTML = `
      <div class="node-summary">${summary}</div>
      <div class="node-id-badge" title="ID: ${node.id}">#${node.id.slice(0, 6)}</div>
    `;

    // Right ports column (Outputs: flow)
    const rightPorts = document.createElement("div");
    rightPorts.className = "graph-ports-column graph-ports-right";

    for (const outPort of config.outputs) {
      const portRow = this._createPortRow("out", outPort, "flow");
      rightPorts.appendChild(portRow);
    }

    body.appendChild(leftPorts);
    body.appendChild(content);
    body.appendChild(rightPorts);

    el.appendChild(header);
    el.appendChild(body);

    this.element = el;
    this.updatePortBadges();
    return el;
  }

  /**
   * Helper to create a port row DOM element with pin and visible label.
   * @protected
   */
  _createPortRow(direction, portName, portType) {
    return createPortRow(this.data.id, direction, portName, portType, this.portElements);
  }

  /**
   * Generates a short informative text summary for the node card.
   * @protected
   */
  _getNodeSummary(node) {
    return getNodeSummary(node, (port) => this.getIncomingReference(port));
  }

  /**
   * Computes center coordinates of a port relative to the canvas coordinate space.
   * @param {string} portName
   * @param {string} [direction="out"]
   * @returns {{x: number, y: number}}
   */
  getPortCoordinates(portName, direction = "out") {
    return computePortCoordinates(
      this.element,
      this.data,
      this.portElements,
      portName,
      direction,
      this.options.editor?.zoom || 1
    );
  }

  /**
   * Updates the node's position both in memory and DOM.
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.data.x = Math.round(x);
    this.data.y = Math.round(y);
    if (this.element) {
      this.element.style.left = `${this.data.x}px`;
      this.element.style.top = `${this.data.y}px`;
    }
  }

  /**
   * Sets the visual selection state of the node.
   * @param {boolean} isSelected
   */
  setSelected(isSelected) {
    if (this.element) {
      this.element.classList.toggle("selected", !!isSelected);
    }
  }

  /**
   * Updates the node's phase both in memory and DOM classes.
   * @param {string} newPhase
   */
  setPhase(newPhase) {
    if (!newPhase) return;
    const oldPhase = this.data.phase || (this.data.type === "start" ? "start" : "inherit");
    this.data.phase = newPhase;

    if (this.element) {
      this.element.classList.remove(`phase-border-${oldPhase}`);
      this.element.classList.add(`phase-border-${newPhase}`);

      const header = this.element.querySelector(".graph-node-header");
      if (header) {
        header.classList.remove(`phase-bg-${oldPhase}`);
        header.classList.add(`phase-bg-${newPhase}`);
      }

      const badge = this.element.querySelector(".node-phase-badge");
      if (badge) {
        badge.className = `node-phase-badge phase-badge-${newPhase}`;
        const phaseLabel = newPhase === "inherit"
          ? (game.i18n.localize("TRESPASSER.Sheet.Deed.Phase.Inherit") || "Inherit")
          : (game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${newPhase.charAt(0).toUpperCase() + newPhase.slice(1)}`) || newPhase);
        badge.textContent = phaseLabel;
      }
    }
  }

  /**
   * Updates node parameters in memory and refreshes the card summary.
   * @param {object} params
   */
  setParams(params) {
    this.data.params = foundry.utils.deepClone(params || {});
    this.updateSummary();
  }

  /**
   * Resolves the incoming reference connection for a given reference port name.
   * @param {string} portName
   * @returns {{ sourceId: string, sourceNode: object|null }|null}
   */
  getIncomingReference(portName) {
    const editor = this.options.editor;
    let sourceId = "";
    if (editor) {
      const conn = editor.connections?.find(c => c.targetId === this.data.id && c.targetPort === portName);
      if (conn) sourceId = conn.sourceId;
    }
    if (!sourceId) {
      const p = this.data.params || {};
      if (portName === "rollRef") sourceId = p.rollBehaviorId;
      else if (portName === "areaRef") sourceId = p.areaBehaviorId;
      else if (portName === "terrainRef") sourceId = p.terrainBehaviorId;
    }
    if (!sourceId) return null;

    let sourceNode = null;
    if (editor?.nodeMap?.has(sourceId)) {
      sourceNode = editor.nodeMap.get(sourceId).data;
    } else if (editor) {
      sourceNode = editor.getGraph()?.nodes?.find(n => n.id === sourceId)
        || editor._rawNodesData?.find(n => n.id === sourceId) || null;
    }
    return { sourceId, sourceNode };
  }

  /**
   * Refreshes reference ID badges on reference input ports.
   */
  updatePortBadges() {
    if (!this.element) return;
    const refRows = this.element.querySelectorAll(".port-row-ref");
    for (const row of refRows) {
      const pin = row.querySelector(".graph-port");
      const portName = pin?.dataset.portName;
      if (!portName) continue;

      let badge = row.querySelector(".port-ref-badge");
      const ref = this.getIncomingReference(portName);

      if (ref?.sourceId) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "port-ref-badge";
          row.appendChild(badge);
        }
        badge.textContent = `#${ref.sourceId.slice(0, 6)}`;
        badge.title = game.i18n.format("TRESPASSER.Sheet.Deed.Graph.ReferencedSource", { id: ref.sourceId }) || `Linked: #${ref.sourceId}`;
      } else if (badge) {
        badge.remove();
      }
    }
  }

  /**
   * Refreshes the center summary label in the node card and port badges.
   */
  updateSummary() {
    if (!this.element) return;
    const summaryEl = this.element.querySelector(".node-summary");
    if (summaryEl) {
      summaryEl.innerHTML = this._getNodeSummary(this.data);
    }
    this.updatePortBadges();
  }
}
