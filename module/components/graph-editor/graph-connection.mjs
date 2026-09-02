/**
 * graph-connection.mjs
 * SVG connection path generation and styling for the Deed Behavior Graph.
 */

/**
 * Calculates a smooth cubic bezier path between two 2D points.
 * @param {number} x1 - Source X
 * @param {number} y1 - Source Y
 * @param {number} x2 - Target X
 * @param {number} y2 - Target Y
 * @returns {string} SVG path d attribute
 */
export function calculateBezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const curvature = Math.max(dx * 0.5, 40);

  const cx1 = x1 + curvature;
  const cy1 = y1;
  const cx2 = x2 - curvature;
  const cy2 = y2;

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

/**
 * Returns the CSS class and stroke style for a connection.
 * @param {object} connection - Connection schema object
 * @returns {{ className: string, stroke: string, isDashed: boolean }}
 */
export function getConnectionStyle(connection) {
  const isRef = connection.type === "reference" || (connection.targetPort && connection.targetPort.endsWith("Ref"));
  const sourcePort = connection.sourcePort || "out";

  let stroke = "#ddd0aa"; // Default light text color
  let conditionClass = "port-default";

  if (isRef) {
    stroke = "#4fc3f7"; // Cyan for reference
    conditionClass = "port-ref";
  } else if (sourcePort === "onHit") {
    stroke = "#e8c96b"; // Gold for Hit
    conditionClass = "port-hit";
  } else if (sourcePort === "onMiss") {
    stroke = "#ff5252"; // Red for Miss
    conditionClass = "port-miss";
  } else if (sourcePort === "onSpark") {
    stroke = "#ab47bc"; // Purple for Spark
    conditionClass = "port-spark";
  } else if (sourcePort === "always") {
    stroke = "#8bc34a"; // Greenish for Always
    conditionClass = "port-always";
  }

  return {
    className: `graph-connection ${isRef ? "connection-ref" : "connection-flow"} ${conditionClass}`,
    stroke,
    isDashed: isRef
  };
}

/**
 * Creates or updates an SVG path element representing a connection.
 * @param {SVGElement} pathEl - Existing path element or null to create a new one
 * @param {object} connection - Connection schema object
 * @param {{x: number, y: number}} p1 - Source port coordinates
 * @param {{x: number, y: number}} p2 - Target port coordinates
 * @returns {SVGPathElement}
 */
export function renderConnectionPath(pathEl, connection, p1, p2) {
  const el = pathEl || document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = calculateBezierPath(p1.x, p1.y, p2.x, p2.y);
  const style = getConnectionStyle(connection);

  el.setAttribute("d", d);
  el.setAttribute("class", style.className);
  el.setAttribute("stroke", style.stroke);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke-width", "2.5");
  if (style.isDashed) {
    el.setAttribute("stroke-dasharray", "5,5");
  } else {
    el.removeAttribute("stroke-dasharray");
  }
  el.dataset.connectionId = connection.id || "";
  el.dataset.sourceId = connection.sourceId || "";
  el.dataset.targetId = connection.targetId || "";

  return el;
}
