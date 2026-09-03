/**
 * graph-node.mjs
 * DOM rendering and port layout for individual behavior nodes on the canvas.
 */
import { getNodePortConfig } from "../../data/node-port-config.mjs";

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
    const phaseLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${(node.phase || "base").charAt(0).toUpperCase() + (node.phase || "base").slice(1)}`);

    const header = document.createElement("div");
    header.className = `graph-node-header phase-bg-${node.phase || "base"}`;
    header.innerHTML = `
      <div class="node-title">
        <i class="fas ${iconClass}"></i>
        <span class="title-text" title="${typeLabel}">${typeLabel}</span>
      </div>
      <span class="node-phase-badge phase-badge-${node.phase || "base"}">${phaseLabel}</span>
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
    return el;
  }

  /**
   * Helper to create a port row DOM element with pin and visible label.
   * @protected
   */
  _createPortRow(direction, portName, portType) {
    const row = document.createElement("div");
    row.className = `graph-port-row port-row-${direction} port-row-${portName} ${portType === "reference" ? "port-row-ref" : "port-row-flow"}`;

    const pinEl = document.createElement("div");
    const portClass = `port-${direction} port-${portName} ${portType === "reference" ? "port-ref" : "port-flow"}`;
    pinEl.className = `graph-port ${portClass}`;
    pinEl.dataset.nodeId = this.data.id;
    pinEl.dataset.portName = portName;
    pinEl.dataset.portDirection = direction;
    pinEl.dataset.portType = portType;

    let portLabel = portName;
    let tooltip = portName;
    if (portName === "in") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.In") || "In";
      tooltip = portLabel;
    } else if (portName === "out") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.Out") || "Out";
      tooltip = portLabel;
    } else if (portName === "onHit") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.OnHit") || "Hit";
      tooltip = portLabel;
    } else if (portName === "onMiss") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.OnMiss") || "Miss";
      tooltip = portLabel;
    } else if (portName === "onSpark") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.OnSpark") || "Spark";
      tooltip = portLabel;
    } else if (portName === "always") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.Always") || "Always";
      tooltip = portLabel;
    } else if (portName === "rollRef") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.Roll") || "Roll";
      tooltip = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.RollRef") || "Roll Reference";
    } else if (portName === "areaRef") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.Area") || "Area";
      tooltip = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.AreaRef") || "Area Reference";
    } else if (portName === "terrainRef") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.Terrain") || "Terrain";
      tooltip = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.TerrainRef") || "Terrain Reference";
    } else if (portName === "targetRef") {
      portLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.Target") || "Target";
      tooltip = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Port.TargetRef") || "Target Reference";
    }

    pinEl.setAttribute("title", tooltip);

    const labelEl = document.createElement("span");
    labelEl.className = "port-label";
    labelEl.textContent = portLabel;

    if (direction === "in") {
      row.appendChild(pinEl);
      row.appendChild(labelEl);
    } else {
      row.appendChild(labelEl);
      row.appendChild(pinEl);
    }

    const key = `${direction}:${portName}`;
    this.portElements.set(key, pinEl);
    return row;
  }

  /**
   * Generates a short informative text summary for the node card.
   * @protected
   */
  _getNodeSummary(node) {
    const params = node.params || {};
    switch (node.type) {
      case "start":
        return `<span class="summary-tag">Root</span>`;
      case "rollAccuracy":
        return `<span class="summary-tag">Branching</span>`;
      case "applyDamage":
      case "healTarget":
      case "roll":
        return params.expression ? `<span class="summary-formula">${params.expression}</span>` : `<span class="summary-muted">—</span>`;
      case "selectTarget":
        return `<span class="summary-tag">${params.targetMode || "creatures"} (${params.targetCount || 1})</span>`;
      case "selectArea":
        return `<span class="summary-tag">${params.aoeType || "blast"} ${params.aoeSize || 1}</span>`;
      case "applyEffects":
        return params.effects?.length ? `<span class="summary-tag">${params.effects.length} effects</span>` : `<span class="summary-muted">—</span>`;
      case "spawnTerrain":
        return params.terrainName ? `<span class="summary-tag">${params.terrainName}</span>` : `<span class="summary-muted">—</span>`;
      default:
        return "";
    }
  }

  /**
   * Computes center coordinates of a port relative to the canvas coordinate space.
   * @param {string} portName
   * @param {string} [direction="out"]
   * @returns {{x: number, y: number}}
   */
  getPortCoordinates(portName, direction = "out") {
    let portEl = this.portElements.get(`${direction}:${portName}`);
    if (!portEl) {
      // Fallback search across registered ports
      for (const [k, el] of this.portElements.entries()) {
        if (k.endsWith(`:${portName}`)) {
          portEl = el;
          break;
        }
      }
    }

    if (!portEl || !this.element) {
      return { x: this.data.x ?? 0, y: this.data.y ?? 0 };
    }

    const nodeX = this.data.x ?? 0;
    const nodeY = this.data.y ?? 0;
    const portRect = portEl.getBoundingClientRect();
    const nodeRect = this.element.getBoundingClientRect();

    const scale = (this.element.offsetWidth > 0 && nodeRect.width > 0)
      ? (nodeRect.width / this.element.offsetWidth)
      : (this.options.editor?.zoom || 1);

    const relX = ((portRect.left + portRect.width / 2) - nodeRect.left) / scale;
    const relY = ((portRect.top + portRect.height / 2) - nodeRect.top) / scale;

    return {
      x: Math.round(nodeX + relX),
      y: Math.round(nodeY + relY)
    };
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
    const oldPhase = this.data.phase || "base";
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
        const phaseLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${newPhase.charAt(0).toUpperCase() + newPhase.slice(1)}`) || newPhase;
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
   * Refreshes the center summary label in the node card.
   */
  updateSummary() {
    if (!this.element) return;
    const summaryEl = this.element.querySelector(".node-summary");
    if (summaryEl) {
      summaryEl.innerHTML = this._getNodeSummary(this.data);
    }
  }
}
