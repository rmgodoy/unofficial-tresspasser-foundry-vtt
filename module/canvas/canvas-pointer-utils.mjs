/**
 * canvas-pointer-utils.mjs
 * Centralized utility to extract canvas coordinates from various PIXI / Foundry interaction events.
 */

/**
 * Extracts stage canvas coordinates {x, y} from a pointer / mouse event.
 * @param {PIXI.FederatedEvent|PIXI.InteractionEvent|object} ev
 * @returns {{x: number, y: number}|null}
 */
export function getCanvasPointerPosition(ev) {
  if (!ev) return null;
  if (!canvas.ready || !canvas.stage) return null;

  if (typeof ev.getLocalPosition === "function") {
    return ev.getLocalPosition(canvas.stage);
  }
  if (ev.data && typeof ev.data.getLocalPosition === "function") {
    return ev.data.getLocalPosition(canvas.stage);
  }
  if (ev.interactionData?.origin) {
    return ev.interactionData.origin;
  }
  return null;
}
