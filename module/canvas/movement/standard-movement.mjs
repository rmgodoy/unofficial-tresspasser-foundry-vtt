import { MovementPathfinder } from "./movement-pathfinder.mjs";
import { CanvasInputSession } from "../canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas-selection-renderer.mjs";
import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

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
     */
    static recalculateWaypoints(host) {
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
        this.drawInteractiveMoveOverlay(host);
        this.drawPathLine(host);
    }

    /**
     * Draw the path line along waypoints and current hovered destination.
     */
    static drawPathLine(host) {
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
        if (host.mode !== "move" || (!host.isValidTarget && !host.selectedDestination)) return;

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        const startX = host.token.x;
        const startY = host.token.y;

        const fullPath = [];
        for (const wp of host.waypoints) {
            if (wp.path) fullPath.push(...wp.path);
        }
        if (host.currentPath) fullPath.push(...host.currentPath);

        const uniquePath = [];
        for (const pt of fullPath) {
            if (uniquePath.length === 0 && pt.x === startX && pt.y === startY) continue;
            if (uniquePath.length > 0) {
                const last = uniquePath[uniquePath.length - 1];
                if (last.x === pt.x && last.y === pt.y) continue;
            }
            uniquePath.push(pt);
        }

        const gridX = host.selectedDestination ? host.selectedDestination.gridX : (host.hoveredSquare ? host.hoveredSquare.gx : Math.floor(startX / sizeX));
        const gridY = host.selectedDestination ? host.selectedDestination.gridY : (host.hoveredSquare ? host.hoveredSquare.gy : Math.floor(startY / sizeY));

        const node = host.visitedMoveMap ? host.visitedMoveMap.get(`${gridX},${gridY}`) : null;
        const lastCost = host.waypoints.length > 0 ? host.waypoints[host.waypoints.length - 1].accumulatedCost : 0;
        const totalCost = lastCost + (node ? node.dist : 0);

        const tokenRef = host.token;
        const tokenDoc = host.token.document;
        const combatant = game.combat?.combatants.find(c => c.tokenId === tokenDoc.id);

        host.deactivate();

        globalThis._trespasserOverlaySet ??= new Set();
        globalThis._trespasserOverlaySet.add(tokenDoc.id);

        try {
            for (const pt of uniquePath) {
                await tokenDoc.update({x: pt.x, y: pt.y});

                if (tokenRef.animationContexts?.size > 0) {
                    const promises = Array.from(tokenRef.animationContexts.values()).map(ctx => ctx.promise);
                    await Promise.allSettled(promises);
                } else if (tokenRef._animation) {
                    await tokenRef._animation;
                } else {
                    await new Promise(r => setTimeout(r, 200));
                }
            }

            if (combatant) {
                const currentUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
                const newUsed = currentUsed + totalCost;
                const moveActionMovements = Array.from(combatant.getFlag("trespasser", "moveActionMovements") ?? []);
                const endPt = uniquePath.length > 0 ? uniquePath[uniquePath.length - 1] : { x: startX, y: startY };
                moveActionMovements.push({
                    from: { x: startX, y: startY },
                    to: { x: endPt.x, y: endPt.y },
                    distance: totalCost
                });
                await combatant.update({
                    "flags.trespasser.movementUsed": newUsed,
                    "flags.trespasser.moveActionMovements": moveActionMovements,
                    "flags.trespasser.hasMovedThisTurn": true
                });

                if (combatant.actor) {
                    const isFirst = (currentUsed === 0);
                    if (isFirst && totalCost > 0) {
                        await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-first-move");
                    }
                    for (let i = 0; i < totalCost; i++) {
                        await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-move");
                    }
                }
            }
        } finally {
            globalThis._trespasserOverlaySet.delete(tokenDoc.id);
        }
    }
}
