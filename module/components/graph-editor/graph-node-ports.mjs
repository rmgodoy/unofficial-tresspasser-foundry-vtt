/**
 * Helper to create a port row DOM element with pin and visible label.
 * @param {string} nodeId - Target node ID
 * @param {string} direction - "in" or "out"
 * @param {string} portName - Identifier of port
 * @param {string} portType - "flow" or "reference"
 * @param {Map<string, HTMLElement>} portElements - Registry map for created pins
 * @returns {HTMLElement}
 */
export function createPortRow(nodeId, direction, portName, portType, portElements) {
  const row = document.createElement("div");
  row.className = `graph-port-row port-row-${direction} port-row-${portName} ${portType === "reference" ? "port-row-ref" : "port-row-flow"}`;

  const pinEl = document.createElement("div");
  const portClass = `port-${direction} port-${portName} ${portType === "reference" ? "port-ref" : "port-flow"}`;
  pinEl.className = `graph-port ${portClass}`;
  pinEl.dataset.nodeId = nodeId;
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
  portElements.set(key, pinEl);
  return row;
}

/**
 * Computes center coordinates of a port relative to the canvas coordinate space.
 * @param {HTMLElement} element - Node DOM element
 * @param {object} nodeData - Node data object
 * @param {Map<string, HTMLElement>} portElements - Port elements map
 * @param {string} portName
 * @param {string} [direction="out"]
 * @param {number} [editorZoom=1]
 * @returns {{x: number, y: number}}
 */
export function computePortCoordinates(element, nodeData, portElements, portName, direction = "out", editorZoom = 1) {
  let portEl = portElements.get(`${direction}:${portName}`);
  if (!portEl) {
    for (const [k, el] of portElements.entries()) {
      if (k.endsWith(`:${portName}`)) {
        portEl = el;
        break;
      }
    }
  }

  if (!portEl || !element) {
    return { x: nodeData.x ?? 0, y: nodeData.y ?? 0 };
  }

  const nodeX = nodeData.x ?? 0;
  const nodeY = nodeData.y ?? 0;
  const portRect = portEl.getBoundingClientRect();
  const nodeRect = element.getBoundingClientRect();

  const scale = (element.offsetWidth > 0 && nodeRect.width > 0)
    ? (nodeRect.width / element.offsetWidth)
    : (editorZoom || 1);

  const relX = ((portRect.left + portRect.width / 2) - nodeRect.left) / scale;
  const relY = ((portRect.top + portRect.height / 2) - nodeRect.top) / scale;

  return {
    x: Math.round(nodeX + relX),
    y: Math.round(nodeY + relY)
  };
}
