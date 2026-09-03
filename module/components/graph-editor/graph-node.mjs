/**
 * graph-node.mjs
 * DOM rendering and port layout for individual behavior nodes on the canvas.
 */
import { getNodePortConfig } from "../../data/node-port-config.mjs";
import { formatDiceIcons } from "../../helpers/dice-icon-helper.mjs";

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
      case "start": {
        const tag = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Root") || "Root";
        return `<span class="summary-tag">${tag}</span>`;
      }
      case "rollAccuracy": {
        const parts = [];
        if (params.actionType) {
          const actKey = params.actionType.charAt(0).toUpperCase() + params.actionType.slice(1);
          parts.push(game.i18n.localize(`TRESPASSER.Sheet.Item.Details.ActionTypeChoices.${actKey}`) || params.actionType);
        }
        if (params.abilityType) {
          const abKey = params.abilityType.charAt(0).toUpperCase() + params.abilityType.slice(1);
          parts.push(game.i18n.localize(`TRESPASSER.Sheet.Item.Details.TypeChoices.${abKey}`) || params.abilityType);
        }
        if (params.versus) {
          const vsLabel = params.versus === "10" ? "10" : (game.i18n.localize(`TRESPASSER.Sheet.Combat.${params.versus}`) || params.versus);
          parts.push(`vs ${vsLabel}`);
        }
        if (params.branchingMode === "hitOrSpark") {
          parts.push(game.i18n.localize("TRESPASSER.Sheet.Deed.Params.HitOrSparkTag") || "Hit/Spark");
        }
        const tag = parts.length > 0
          ? parts.join(" · ")
          : (game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Branching") || "Branching");
        return `<span class="summary-tag">${tag}</span>`;
      }
      case "applyDamage":
      case "healTarget":
      case "roll": {
        const ref = this.getIncomingReference("rollRef");
        const refExpr = ref?.sourceNode?.params?.expression?.trim();
        const expr = params.expression?.trim();

        if (ref?.sourceId) {
          const displayRef = refExpr ? `(${formatDiceIcons(refExpr)})` : `(#${ref.sourceId.slice(0, 6)})`;
          if (!expr) return `<span class="summary-ref-val">${displayRef}</span>`;
          const formattedExpr = formatDiceIcons(expr);
          if (/^[\/*+-]/.test(expr)) {
            return `<span class="summary-ref-val">${displayRef}</span> <span class="summary-formula">${formattedExpr}</span>`;
          }
          if (/@roll/i.test(expr)) {
            const replaced = formattedExpr.replace(/@roll/gi, `<span class="summary-ref-val">${displayRef}</span>`);
            return `<span class="summary-formula">${replaced}</span>`;
          }
          return `<span class="summary-ref-val">${displayRef} +</span> <span class="summary-formula">${formattedExpr}</span>`;
        }
        return expr ? `<span class="summary-formula">${formatDiceIcons(expr)}</span>` : `<span class="summary-muted">—</span>`;
      }
      case "selectTarget": {
        if (params.targetMode === "area") {
          const ref = this.getIncomingReference("areaRef");
          const areaTag = formatAreaSummary(ref?.sourceNode);
          const rel = params.areaRelation || "inside";
          return areaTag
            ? `<span class="summary-tag">${rel} <span class="summary-ref-val">(${areaTag})</span></span>`
            : `<span class="summary-tag">area</span>`;
        }
        if (params.targetMode === "self") {
          const selfLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Params.TargetModeChoices.Personal") || "self";
          return `<span class="summary-tag">${selfLabel}</span>`;
        }
        if (params.targetMode === "aoe") {
          return `<span class="summary-tag">${params.aoeType || "blast"} ${params.aoeSize || 1}</span>`;
        }
        const count = params.targetCount || 1;
        const tgtLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Targets") || "targets";
        return `<span class="summary-tag">${count} ${tgtLabel}</span>`;
      }
      case "moveSource": {
        if (params.destinationMode === "selectedArea") {
          const ref = this.getIncomingReference("areaRef");
          const areaTag = formatAreaSummary(ref?.sourceNode);
          return areaTag
            ? `<span class="summary-tag">move &rarr; <span class="summary-ref-val">(${areaTag})</span></span>`
            : `<span class="summary-tag">move &rarr; area</span>`;
        }
        return `<span class="summary-tag">${params.movementType || "walk"} ${params.distance || 1} sq</span>`;
      }
      case "spawnTerrain": {
        const name = params.terrainName || "";
        if (params.placement === "selected_area") {
          const ref = this.getIncomingReference("areaRef");
          const areaTag = formatAreaSummary(ref?.sourceNode);
          return name
            ? `<span class="summary-tag">${name} <span class="summary-ref-val">(${areaTag || "area"})</span></span>`
            : `<span class="summary-muted">—</span>`;
        }
        return name ? `<span class="summary-tag">${name}</span>` : `<span class="summary-muted">—</span>`;
      }
      case "moveTerrain": {
        const ref = this.getIncomingReference("terrainRef");
        const terrainName = ref?.sourceNode?.params?.terrainName || "";
        const dist = params.distance || 1;
        return terrainName
          ? `<span class="summary-tag">move <span class="summary-ref-val">(${terrainName})</span> ${dist} sq</span>`
          : `<span class="summary-tag">move terrain ${dist} sq</span>`;
      }
      case "selectArea": {
        if (params.targetMode === "aoe") {
          return `<span class="summary-tag">${params.aoeType || "blast"} ${params.aoeSize || 1}</span>`;
        }
        const count = params.targetCount || 1;
        const sqLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Squares") || "sq";
        return `<span class="summary-tag">${count} ${sqLabel}</span>`;
      }
      case "applyEffects": {
        const effLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Effects") || "effects";
        return params.effects?.length ? `<span class="summary-tag">${params.effects.length} ${effLabel}</span>` : `<span class="summary-muted">—</span>`;
      }
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

/** Formats a short human-readable tag for an area node. */
export function formatAreaSummary(node) {
  if (!node) return "";
  const p = node.params || {};
  if (p.targetMode === "squares") {
    const count = p.targetCount || 1;
    const sq = game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.Summary.Squares") || "sq";
    return `${count} ${sq}`;
  }
  if (p.aoeType) return `${p.aoeType} ${p.aoeSize || 1}`;
  if (p.targetMode === "aoe") return `blast ${p.aoeSize || 1}`;
  return p.targetMode || "area";
}
