import { MovementPathfinder } from "./movement-pathfinder.mjs";
import { CanvasSelectionRenderer } from "../canvas-selection-renderer.mjs";

/**
 * Render the grid overlay of reachable squares.
 * @param {object} host - MovementOverlay instance
 */
export function drawInteractiveMoveOverlay(host) {
    if (!host.graphics || !host.token) return;
    host.graphics.clear();

    let startX = host.token.x;
    let startY = host.token.y;
    let usedPoints = 0;

    if (host.waypoints.length > 0) {
        const lastWp = host.waypoints[host.waypoints.length - 1];
        startX = lastWp.x;
        startY = lastWp.y;
        usedPoints = lastWp.accumulatedCost;
    }

    const remainingRange = host.movePoints - usedPoints;
    if (remainingRange <= 0) return;

    const sizeX = canvas.grid.sizeX || canvas.grid.size;
    const sizeY = canvas.grid.sizeY || canvas.grid.size;

    host.visitedMoveMap = MovementPathfinder.calculateDistancesFrom(startX, startY, remainingRange, host.token);

    const candidates = [];
    for (const [key, val] of host.visitedMoveMap.entries()) {
        if (val.dist === 0 && host.waypoints.length === 0) continue;
        const [xStr, yStr] = key.split(",");
        candidates.push({ x: parseInt(xStr) * sizeX, y: parseInt(yStr) * sizeY });
    }
    CanvasSelectionRenderer.drawCandidateSquares(host.graphics, candidates, sizeX);
}

/**
 * Recalculate waypoints path costs after adding/removing waypoints.
 * @param {object} host - MovementOverlay instance
 */
export function recalculateWaypoints(host) {
    const sizeX = canvas.grid.sizeX || canvas.grid.size;
    const sizeY = canvas.grid.sizeY || canvas.grid.size;
    let currX = host.token.x;
    let currY = host.token.y;
    let totalCost = 0;

    for (let i = 0; i < host.waypoints.length; i++) {
        const wp = host.waypoints[i];
        const map = MovementPathfinder.calculateDistancesFrom(currX, currY, host.movePoints - totalCost, host.token);
        const gridX = Math.floor(wp.x / sizeX);
        const gridY = Math.floor(wp.y / sizeY);
        const key = `${gridX},${gridY}`;

        if (map.has(key)) {
            totalCost += map.get(key).dist;
            wp.accumulatedCost = totalCost;

            let curr = { gx: gridX, gy: gridY };
            const newPath = [];
            while (curr && map.has(`${curr.gx},${curr.gy}`)) {
                newPath.unshift({ x: curr.gx * sizeX, y: curr.gy * sizeY });
                curr = map.get(`${curr.gx},${curr.gy}`).parent;
            }
            wp.path = newPath;

            currX = wp.x;
            currY = wp.y;
        } else {
            host.waypoints.splice(i);
            break;
        }
    }
    drawInteractiveMoveOverlay(host);
    drawPathLine(host);
}

/**
 * Draw the path line along waypoints and current hovered destination.
 * @param {object} host - MovementOverlay instance
 */
export function drawPathLine(host) {
    if (!host.pathLineGraphics || !host.token) return;
    host.pathLineGraphics.clear();

    const sizeX = canvas.grid.sizeX || canvas.grid.size;
    const sizeY = canvas.grid.sizeY || canvas.grid.size;
    const tCx = host.token.x + (host.token.document.width * sizeX) / 2;
    const tCy = host.token.y + (host.token.document.height * sizeY) / 2;

    host.pathLineGraphics.lineStyle(4, 0x004400, 0.8);
    host.pathLineGraphics.moveTo(tCx, tCy);

    for (const wp of host.waypoints) {
        if (wp.path && wp.path.length > 0) {
            for (const pt of wp.path) {
                host.pathLineGraphics.lineTo(pt.x + sizeX / 2, pt.y + sizeY / 2);
            }
        } else {
            const wx = wp.x + sizeX / 2;
            const wy = wp.y + sizeY / 2;
            host.pathLineGraphics.lineTo(wx, wy);
        }

        const wx = wp.x + sizeX / 2;
        const wy = wp.y + sizeY / 2;

        host.pathLineGraphics.beginFill(0x006600, 1.0);
        host.pathLineGraphics.drawCircle(wx, wy, 8);
        host.pathLineGraphics.endFill();

        host.pathLineGraphics.lineStyle(2, 0xFFFFFF, 1.0);
        host.pathLineGraphics.moveTo(wx - 4, wy - 4);
        host.pathLineGraphics.lineTo(wx + 4, wy + 4);
        host.pathLineGraphics.moveTo(wx + 4, wy - 4);
        host.pathLineGraphics.lineTo(wx - 4, wy + 4);
        host.pathLineGraphics.lineStyle(4, 0x004400, 0.8);
        host.pathLineGraphics.moveTo(wx, wy);
    }

    if (host.currentPath && host.currentPath.length > 0) {
        for (const pt of host.currentPath) {
            host.pathLineGraphics.lineTo(pt.x + sizeX / 2, pt.y + sizeY / 2);
        }
    }
}
