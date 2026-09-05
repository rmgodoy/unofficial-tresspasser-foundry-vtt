import { CanvasInputSession } from "../canvas-input-session.mjs";
import { executeTokenMovement } from "./movement-executor.mjs";
import {
    drawInteractiveMoveOverlay,
    recalculateWaypoints,
    drawPathLine
} from "./movement-overlay-renderer.mjs";

/**
 * Encapsulates standard token movement mode.
 */
export class StandardMovementMode {

    /**
     * Activate interactive standard movement mode.
     * @param {MovementOverlay} host The parent MovementOverlay class reference
     * @param {Token} token Moving token
     * @param {number} movePoints Available movement points
     */
    static async activate(host, token, movePoints) {
        if (!token) return;
        if (host.isActive) host.deactivate();

        host.mode = "move";
        host.token = token;
        host.movePoints = movePoints;
        host.waypoints = [];
        host.isValidTarget = false;
        host.hoveredSquare = null;
        host.currentPath = [];
        host.selectedDestination = null;

        document.body.style.cursor = "crosshair";

        if (host.graphics) host.graphics.clear();
        if (!host.pathLineGraphics) {
            host.pathLineGraphics = new PIXI.Graphics();
            canvas.controls.addChild(host.pathLineGraphics);
        } else {
            host.pathLineGraphics.clear();
        }

        this.drawInteractiveMoveOverlay(host);

        const title = game.i18n.localize("TRESPASSER.HUD.Action.Move") || "Move Token";
        const details = game.i18n.format("TRESPASSER.HUD.Movement.OverlayInstruction", { points: movePoints })
            || `${movePoints} sq remaining. Click square to select destination, Ctrl+Click for waypoint.`;

        await CanvasInputSession.start({
            title,
            details,
            icon: "fas fa-shoe-prints",
            showConfirm: false,
            canConfirm: false,
            showUndo: false,
            canUndo: false,
            showCancel: true,
            onPointerMove: (ev) => {
                this.onMouseMove(host, ev);
            },
            onClick: (ev) => {
                this.onClickLeft(host, ev);
            },
            onConfirm: async () => {
                await this.executeMove(host);
            },
            onUndo: () => {
                this.onUndoWaypoint(host);
            },
            onCancel: () => {
                host.deactivate();
            }
        });
    }

    /**
     * Render the grid overlay of reachable squares.
     */
    static drawInteractiveMoveOverlay(host) {
        drawInteractiveMoveOverlay(host);
    }

    /**
     * Recalculate waypoints path costs after adding/removing waypoints.
     */
    static recalculateWaypoints(host) {
        recalculateWaypoints(host);
    }

    /**
     * Draw the path line along waypoints and current hovered destination.
     */
    static drawPathLine(host) {
        drawPathLine(host);
    }

    /**
     * Mouse move handler for move mode.
     */
    static onMouseMove(host, ev) {
        if (!host.isActive || !host.token || host.mode !== "move") return;

        let destination;
        if (typeof ev.getLocalPosition === "function") {
            destination = ev.getLocalPosition(canvas.app.stage);
        } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
            destination = ev.data.getLocalPosition(canvas.app.stage);
        } else if (ev.interactionData && ev.interactionData.origin) {
            destination = ev.interactionData.origin;
        }
        if (!destination) return;

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        const gridX = Math.floor(destination.x / sizeX);
        const gridY = Math.floor(destination.y / sizeY);

        const key = `${gridX},${gridY}`;
        host.isValidTarget = host.visitedMoveMap && host.visitedMoveMap.has(key);

        let hoverWpIdx = -1;
        for (let i = 0; i < host.waypoints.length; i++) {
            const wp = host.waypoints[i];
            if (Math.abs(destination.x - (wp.x + sizeX/2)) <= 12 && 
                Math.abs(destination.y - (wp.y + sizeY/2)) <= 12) {
                hoverWpIdx = i; break;
            }
        }

        host.hoveredSquare = host.isValidTarget ? { gx: gridX, gy: gridY } : null;

        host.currentPath = [];
        if (host.hoveredSquare && hoverWpIdx === -1) {
            let curr = host.hoveredSquare;
            while (curr && host.visitedMoveMap.has(`${curr.gx},${curr.gy}`)) {
                host.currentPath.unshift({ x: curr.gx * sizeX, y: curr.gy * sizeY });
                curr = host.visitedMoveMap.get(`${curr.gx},${curr.gy}`).parent;
            }
        }

        this.drawInteractiveMoveOverlay(host);
        if (host.isValidTarget && hoverWpIdx === -1) {
            host.graphics.beginFill(0x00FF00, 0.4);
            host.graphics.lineStyle(2, 0x00FF00, 1.0);
            host.graphics.drawRect(gridX * sizeX, gridY * sizeY, sizeX, sizeY);
            host.graphics.endFill();
        }

        this.drawPathLine(host);

        if (hoverWpIdx !== -1) {
            const wp = host.waypoints[hoverWpIdx];
            host.pathLineGraphics.beginFill(0xFF0000, 1.0);
            host.pathLineGraphics.drawCircle(wp.x + sizeX/2, wp.y + sizeY/2, 10);
            host.pathLineGraphics.endFill();
            document.body.style.cursor = "pointer";
        } else {
            document.body.style.cursor = "crosshair";
        }

        if (CanvasInputSession.activeSession) {
            CanvasInputSession.activeSession.updateOverlay({
                canConfirm: host.isValidTarget || host.selectedDestination !== null,
                showUndo: host.waypoints.length > 0,
                canUndo: host.waypoints.length > 0
            });
        }
    }

    /**
     * Left click handler for move mode.
     */
    static onClickLeft(host, ev) {
        if (!host.isActive || host.mode !== "move") return;
        if (ev.data && ev.data.button !== 0 && ev.data.button !== undefined) return;

        let destination;
        if (typeof ev.getLocalPosition === "function") {
            destination = ev.getLocalPosition(canvas.app.stage);
        } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
            destination = ev.data.getLocalPosition(canvas.app.stage);
        } else if (ev.interactionData && ev.interactionData.origin) {
            destination = ev.interactionData.origin;
        }
        if (!destination) return;

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        const gridX = Math.floor(destination.x / sizeX);
        const gridY = Math.floor(destination.y / sizeY);

        // Check waypoint deletion
        for (let i = 0; i < host.waypoints.length; i++) {
            const wp = host.waypoints[i];
            if (Math.abs(destination.x - (wp.x + sizeX/2)) <= 12 && 
                Math.abs(destination.y - (wp.y + sizeY/2)) <= 12) {
                host.waypoints.splice(i, 1);
                this.recalculateWaypoints(host);
                if (CanvasInputSession.activeSession) {
                    CanvasInputSession.activeSession.updateOverlay({
                        showUndo: host.waypoints.length > 0,
                        canUndo: host.waypoints.length > 0,
                        canConfirm: host.isValidTarget || host.selectedDestination !== null
                    });
                }
                return;
            }
        }

        const isCtrl = ev.data?.originalEvent?.ctrlKey || ev.ctrlKey;

        if (isCtrl) {
            // Add Waypoint
            if (host.isValidTarget && host.visitedMoveMap.has(`${gridX},${gridY}`)) {
                const node = host.visitedMoveMap.get(`${gridX},${gridY}`);
                let lastCost = 0;
                if (host.waypoints.length > 0) {
                    lastCost = host.waypoints[host.waypoints.length - 1].accumulatedCost;
                }
                host.waypoints.push({
                    x: gridX * sizeX,
                    y: gridY * sizeY,
                    accumulatedCost: lastCost + node.dist,
                    path: Array.from(host.currentPath)
                });
                this.recalculateWaypoints(host);
                if (CanvasInputSession.activeSession) {
                    CanvasInputSession.activeSession.updateOverlay({
                        showUndo: true,
                        canUndo: true,
                        canConfirm: host.isValidTarget
                    });
                }
            } else {
                ui.notifications.warn("Invalid waypoint location.");
            }
        } else {
            // Direct move execution (skips confirm button per requirement)
            if (host.isValidTarget) {
                host.selectedDestination = { gridX, gridY };
                this.executeMove(host);
            }
        }
    }

    /**
     * Undo last added waypoint.
     */
    static onUndoWaypoint(host) {
        if (host.mode !== "move" || host.waypoints.length === 0) return;
        host.waypoints.pop();
        this.recalculateWaypoints(host);
        if (CanvasInputSession.activeSession) {
            CanvasInputSession.activeSession.updateOverlay({
                showUndo: host.waypoints.length > 0,
                canUndo: host.waypoints.length > 0,
                canConfirm: host.isValidTarget || host.selectedDestination !== null
            });
        }
    }

    /**
     * Execute token movement step-by-step.
     */
    static async executeMove(host) {
        return executeTokenMovement(host);
    }
}
