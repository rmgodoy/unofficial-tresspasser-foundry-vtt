import { TrespasserCombat } from "../documents/combat.mjs";

/**
 * Handles rendering of movement and jump overlays.
 */
export class MovementOverlay {
    static mode = null;
    static token = null;
    static maxRange = null;
    static graphics = null;
    static textTag = null;
    static isValidTarget = false;
    static validVaultSquares = [];
    static waypoints = [];
    static pathLineGraphics = null;
    static movePoints = 0;
    static hoveredSquare = null;
    static currentPath = [];

    static showInformativeOverlay(token, baseMove, moveCost, availableAP = 3) {
        if (!token) return;
        this.clearInformativeOverlay();

        this.graphics = this.graphics || new PIXI.Graphics();
        canvas.controls.addChild(this.graphics);

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        const extraAP = Math.min(2, Math.max(0, availableAP - 1));
        const maxRange = baseMove + extraAP * moveCost;

        // Temporary set token for collision checks inside the calculation
        const prevToken = this.token;
        this.token = token;

        const visited = this._calculateDistancesFrom(token.x, token.y, maxRange);

        this.token = prevToken;

        this.graphics.clear();
        for (const [key, val] of visited.entries()) {
            if (val.dist === 0) continue;
            const [xStr, yStr] = key.split(",");
            const x = parseInt(xStr) * sizeX;
            const y = parseInt(yStr) * sizeY;

            let color = 0x00FF00;
            let alpha = 0.2;

            if (val.dist > baseMove + moveCost) {
                if (extraAP < 2) continue;
                color = 0xFF8800; // Orange
            } else if (val.dist > baseMove) {
                if (extraAP < 1) continue;
                color = 0xFFFF00; // Yellow
            }

            this.graphics.beginFill(color, alpha);
            this.graphics.lineStyle(2, color, 0.5);
            this.graphics.drawRect(x, y, sizeX, sizeY);
            this.graphics.endFill();
        }
    }

    static clearInformativeOverlay() {
        if (this.mode === "vault" || this.mode === "move") return; 
        if (this.graphics) {
            this.graphics.clear();
        }
        if (this.pathLineGraphics) {
            this.pathLineGraphics.clear();
        }
    }

    static activateMoveMode(token, movePoints) {
        if (!token) return;
        this.mode = "move";
        this.token = token;
        this.movePoints = movePoints;
        this.waypoints = [];
        this.isValidTarget = false;
        this.hoveredSquare = null;
        this.currentPath = [];

        document.body.style.cursor = "crosshair";

        if (this.graphics) this.graphics.clear();
        if (!this.pathLineGraphics) {
            this.pathLineGraphics = new PIXI.Graphics();
            canvas.controls.addChild(this.pathLineGraphics);
        } else {
            this.pathLineGraphics.clear();
        }

        // Bind canvas listeners
        canvas.stage.on("pointerdown", this._onClickLeft);
        canvas.stage.on("pointermove", this._onMouseMove);
        canvas.app.view.addEventListener("contextmenu", this._onClickRight);

        ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.MoveModeActivated") || "Move Mode Activated. CTRL+Click for waypoints. Right-click to cancel.");

        this._drawInteractiveMoveOverlay();
    }

    static _calculateDistancesFrom(startX, startY, maxRange) {
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        const gridX = Math.floor(startX / sizeX);
        const gridY = Math.floor(startY / sizeY);

        const queue = [{ gx: gridX, gy: gridY, dist: 0, pathLen: 0, turns: 0, dir: null }];
        const visited = new Map();
        visited.set(`${gridX},${gridY}`, { dist: 0, pathLen: 0, turns: 0, parent: null });

        const directions = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
        ];

        while (queue.length > 0) {
            queue.sort((a, b) => {
                if (a.dist !== b.dist) return a.dist - b.dist;
                if (Math.abs(a.pathLen - b.pathLen) > 0.001) return a.pathLen - b.pathLen;
                return a.turns - b.turns;
            });
            const current = queue.shift();

            // Skip if we already found a strictly better path to this node
            const v = visited.get(`${current.gx},${current.gy}`);
            if (v && (
                v.dist < current.dist || 
                (v.dist === current.dist && v.pathLen < current.pathLen - 0.001) ||
                (v.dist === current.dist && Math.abs(v.pathLen - current.pathLen) <= 0.001 && v.turns < current.turns)
            )) {
                continue;
            }

            if (current.dist >= maxRange) continue;

            for (const dir of directions) {
                const nx = current.gx + dir.dx;
                const ny = current.gy + dir.dy;
                const p1 = { x: (current.gx + 0.5) * sizeX, y: (current.gy + 0.5) * sizeY };
                const p2 = { x: (nx + 0.5) * sizeX, y: (ny + 0.5) * sizeY };

                let wallCollision = false;
                if (CONFIG.Canvas.polygonBackends?.move?.testCollision) {
                    wallCollision = CONFIG.Canvas.polygonBackends.move.testCollision(p1, p2, { mode: "any" });
                } else if (canvas.walls?.checkCollision) {
                    wallCollision = canvas.walls.checkCollision(new Ray(p1, p2), { type: "move", mode: "any" });
                }
                if (wallCollision) continue;

                let stepCost = 1;
                if (game.trespasser?.TerrainHelper) {
                    const regions = game.trespasser.TerrainHelper.getTerrainAtSquare(nx, ny, sizeX);
                    for (const r of regions) {
                        const sys = r.flags?.trespasser?.terrain?.system;
                        const cat = sys?.category;
                        if (cat === "wall" || cat === "obstacle") {
                            wallCollision = true;
                            break;
                        }
                        if (cat === "difficult_terrain") stepCost += 1;
                        else if (cat === "field" && sys?.extraMovementCost > 0) stepCost += sys.extraMovementCost;
                    }
                }
                if (wallCollision) continue;

                const tokens = canvas.scene.tokens.filter(t => t.id !== this.token.id && !t.hidden);
                for (const t of tokens) {
                    const tw = (t.width || 1) * sizeX;
                    const th = (t.height || 1) * sizeY;
                    if (p2.x >= t.x && p2.x <= t.x + tw && p2.y >= t.y && p2.y <= t.y + th) {
                        if (t.disposition !== this.token.document.disposition) {
                            wallCollision = true; break;
                        }
                    }
                }
                if (wallCollision) continue;

                const newDist = current.dist + stepCost;
                
                const stepLen = (dir.dx !== 0 && dir.dy !== 0) ? Math.SQRT2 : 1;
                const newPathLen = current.pathLen + stepLen;

                let isTurn = false;
                if (current.dir) {
                    isTurn = (current.dir.dx !== dir.dx || current.dir.dy !== dir.dy);
                }
                const newTurns = current.turns + (isTurn ? 1 : 0);

                const key = `${nx},${ny}`;
                if (newDist <= maxRange) {
                    const existing = visited.get(key);
                    const betterPath = !existing ||
                        (newDist < existing.dist) ||
                        (newDist === existing.dist && newPathLen < existing.pathLen - 0.001) ||
                        (newDist === existing.dist && Math.abs(newPathLen - existing.pathLen) <= 0.001 && newTurns < existing.turns);

                    if (betterPath) {
                        visited.set(key, { dist: newDist, pathLen: newPathLen, turns: newTurns, parent: { gx: current.gx, gy: current.gy } });
                        queue.push({ gx: nx, gy: ny, dist: newDist, pathLen: newPathLen, turns: newTurns, dir: dir });
                    }
                }
            }
        }
        return visited;
    }

    static _drawInteractiveMoveOverlay() {
        if (!this.graphics || !this.token) return;
        this.graphics.clear();
        
        let startX = this.token.x;
        let startY = this.token.y;
        let usedPoints = 0;

        // Traverse waypoints to find current start and used points
        // In a more robust system we would compute actual path costs between waypoints
        // Here we just use the simple sum of distances between waypoints for usedPoints
        if (this.waypoints.length > 0) {
            const lastWp = this.waypoints[this.waypoints.length - 1];
            startX = lastWp.x;
            startY = lastWp.y;
            usedPoints = lastWp.accumulatedCost;
        }

        const remainingRange = this.movePoints - usedPoints;
        if (remainingRange <= 0) return;

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        this.visitedMoveMap = this._calculateDistancesFrom(startX, startY, remainingRange);

        for (const [key, val] of this.visitedMoveMap.entries()) {
            if (val.dist === 0 && this.waypoints.length === 0) continue; 
            const [xStr, yStr] = key.split(",");
            const x = parseInt(xStr) * sizeX;
            const y = parseInt(yStr) * sizeY;

            this.graphics.beginFill(0x00FF00, 0.2);
            this.graphics.lineStyle(2, 0x00FF00, 0.5);
            this.graphics.drawRect(x, y, sizeX, sizeY);
            this.graphics.endFill();
        }
    }

    static _recalculateWaypoints() {
        // Redo all path costs if a waypoint is deleted
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        let currX = this.token.x;
        let currY = this.token.y;
        let totalCost = 0;
        
        for (let i = 0; i < this.waypoints.length; i++) {
            const wp = this.waypoints[i];
            const map = this._calculateDistancesFrom(currX, currY, this.movePoints - totalCost);
            const gridX = Math.floor(wp.x / sizeX);
            const gridY = Math.floor(wp.y / sizeY);
            const key = `${gridX},${gridY}`;
            
            if (map.has(key)) {
                totalCost += map.get(key).dist;
                wp.accumulatedCost = totalCost;
                
                // Reconstruct full grid path for the waypoint
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
                // Waypoint is unreachable, remove it and subsequent ones
                this.waypoints.splice(i);
                break;
            }
        }
        this._drawInteractiveMoveOverlay();
        this._drawPathLine();
    }

    static _drawPathLine() {
        if (!this.pathLineGraphics || !this.token) return;
        this.pathLineGraphics.clear();

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        const tCx = this.token.x + (this.token.document.width * sizeX) / 2;
        const tCy = this.token.y + (this.token.document.height * sizeY) / 2;

        this.pathLineGraphics.lineStyle(4, 0x004400, 0.8);
        this.pathLineGraphics.moveTo(tCx, tCy);

        // Draw waypoints
        for (const wp of this.waypoints) {
            if (wp.path && wp.path.length > 0) {
                for (const pt of wp.path) {
                    this.pathLineGraphics.lineTo(pt.x + sizeX / 2, pt.y + sizeY / 2);
                }
            } else {
                const wx = wp.x + sizeX / 2;
                const wy = wp.y + sizeY / 2;
                this.pathLineGraphics.lineTo(wx, wy);
            }

            const wx = wp.x + sizeX / 2;
            const wy = wp.y + sizeY / 2;

            // Draw WP marker
            this.pathLineGraphics.beginFill(0x006600, 1.0);
            this.pathLineGraphics.drawCircle(wx, wy, 8);
            this.pathLineGraphics.endFill();
            
            // Draw X in WP marker
            this.pathLineGraphics.lineStyle(2, 0xFFFFFF, 1.0);
            this.pathLineGraphics.moveTo(wx - 4, wy - 4);
            this.pathLineGraphics.lineTo(wx + 4, wy + 4);
            this.pathLineGraphics.moveTo(wx + 4, wy - 4);
            this.pathLineGraphics.lineTo(wx - 4, wy + 4);
            this.pathLineGraphics.lineStyle(4, 0x004400, 0.8);
            this.pathLineGraphics.moveTo(wx, wy); // Reset to line style
        }

        // Draw current path to hovered square
        if (this.currentPath && this.currentPath.length > 0) {
            for (const pt of this.currentPath) {
                this.pathLineGraphics.lineTo(pt.x + sizeX / 2, pt.y + sizeY / 2);
            }
        }
    }

    static init() {
        Hooks.on("canvasReady", () => {
            if (this.graphics && !this.graphics.destroyed) {
                this.graphics.destroy();
            }
            this.graphics = new PIXI.Graphics();
            canvas.controls.addChild(this.graphics);
        });

        // Setup global cancel listener for ESC key
        document.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape" && this.isActive) {
                this.deactivate();
            }
        });

        this._onClickLeft = this._onClickLeft.bind(this);
        this._onClickRight = this._onClickRight.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
    }

    static get isActive() {
        return this.mode !== null;
    }

    static activateVaultMode(token, maxRange, options = {}) {
        if (!token) return;
        if (this.isActive) this.deactivate();
        this.mode = "vault";
        this.token = token;
        this.maxRange = maxRange;
        this.options = options;
        this.isValidTarget = false;
        this._isCompleting = false;

        document.body.style.cursor = "crosshair";

        this._calculateValidVaultSquares();

        // Bind canvas listeners
        canvas.stage.on("pointerdown", this._onClickLeft);
        canvas.stage.on("pointermove", this._onMouseMove);
        canvas.app.view.addEventListener("contextmenu", this._onClickRight);

        ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.VaultModeActivated") || "Vault Mode Activated. Click a destination or right-click to cancel.");

        this._drawVaultRange();
    }

    static deactivate() {
        const prevMode = this.mode;
        const targetToken = this.token;
        const isCompleting = this._isCompleting;

        this.mode = null;
        this.token = null;
        this.maxRange = null;
        this.options = null;
        this.movePoints = 0;
        this.isValidTarget = false;
        this.validVaultSquares = [];
        this.waypoints = [];
        this.currentPath = [];
        this._isCompleting = false;

        if (this.graphics) this.graphics.clear();
        if (this.pathLineGraphics) this.pathLineGraphics.clear();
        if (this.textTag) {
            this.textTag.destroy();
            this.textTag = null;
        }

        document.body.style.cursor = "default";

        if (canvas.stage) {
            canvas.stage.off("pointerdown", this._onClickLeft);
            canvas.stage.off("pointermove", this._onMouseMove);
        }
        if (canvas.app && canvas.app.view) {
            canvas.app.view.removeEventListener("contextmenu", this._onClickRight);
        }

        if (prevMode === "vault" && !isCompleting && targetToken) {
            Hooks.callAll("trespasserVaultCancelled", targetToken);
        }
    }

    static _calculateValidVaultSquares() {
        const tokenCenter = this.token.center;
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        
        const directions = [
            {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1},
            {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}
        ];
        
        this.validVaultSquares = [];
        
        for (const dir of directions) {
            for (let d = 1; d <= this.maxRange; d++) {
                const destPoint = {
                    x: tokenCenter.x + dir.dx * d * sizeX,
                    y: tokenCenter.y + dir.dy * d * sizeY
                };
                
                this.validVaultSquares.push({
                    x: destPoint.x,
                    y: destPoint.y,
                    distance: d
                });
            }
        }
    }

    static _drawVaultRange() {
        if (!this.graphics || !this.token || !this.validVaultSquares) return;
        this.graphics.clear();
        
        this.graphics.beginFill(0x00FF00, 0.2);
        this.graphics.lineStyle(2, 0x00FF00, 0.5);
        
        const sizeW = this.token.document.width * (canvas.grid.sizeX || canvas.grid.size);
        const sizeH = this.token.document.height * (canvas.grid.sizeY || canvas.grid.size);
        
        for (const sq of this.validVaultSquares) {
            const tlx = sq.x - sizeW / 2;
            const tly = sq.y - sizeH / 2;
            this.graphics.drawRect(tlx, tly, sizeW, sizeH);
        }
        
        this.graphics.endFill();
    }

    static _onMouseMove(ev) {
        if (!this.isActive || !this.token) return;

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

        if (this.mode === "vault") {
            let hoveredSquare = null;
            for (const sq of this.validVaultSquares) {
                const dx = Math.abs(destination.x - sq.x);
                const dy = Math.abs(destination.y - sq.y);
                if (dx <= sizeX / 2 && dy <= sizeY / 2) {
                    hoveredSquare = sq;
                    break;
                }
            }
            
            this.isValidTarget = hoveredSquare !== null;
            this._drawVaultRange();

            if (hoveredSquare) {
                this.graphics.beginFill(0x00FF00, 0.4);
                this.graphics.lineStyle(2, 0x00FF00, 1.0);
                const sizeW = this.token.document.width * sizeX;
                const sizeH = this.token.document.height * sizeY;
                this.graphics.drawRect(hoveredSquare.x - sizeW/2, hoveredSquare.y - sizeH/2, sizeW, sizeH);
                this.graphics.endFill();

                const textStyle = { fill: 0xFFFFFF, fontSize: 16, stroke: 0x000000, strokeThickness: 4 };
                if (this.textTag) this.textTag.destroy();
                this.textTag = new PIXI.Text(`${hoveredSquare.distance} / ${this.maxRange}`, textStyle);
                this.textTag.position.set(hoveredSquare.x + 15, hoveredSquare.y - 15);
                this.graphics.addChild(this.textTag);
            } else {
                if (this.textTag) {
                    this.textTag.destroy();
                    this.textTag = null;
                }
            }
        } else if (this.mode === "move") {
            const key = `${gridX},${gridY}`;
            this.isValidTarget = this.visitedMoveMap && this.visitedMoveMap.has(key);
            
            // Check for waypoint hover
            let hoverWpIdx = -1;
            for (let i = 0; i < this.waypoints.length; i++) {
                const wp = this.waypoints[i];
                if (Math.abs(destination.x - (wp.x + sizeX/2)) <= 12 && 
                    Math.abs(destination.y - (wp.y + sizeY/2)) <= 12) {
                    hoverWpIdx = i; break;
                }
            }

            this.hoveredSquare = this.isValidTarget ? { gx: gridX, gy: gridY } : null;
            
            this.currentPath = [];
            if (this.hoveredSquare && hoverWpIdx === -1) {
                let curr = this.hoveredSquare;
                while (curr && this.visitedMoveMap.has(`${curr.gx},${curr.gy}`)) {
                    this.currentPath.unshift({ x: curr.gx * sizeX, y: curr.gy * sizeY });
                    curr = this.visitedMoveMap.get(`${curr.gx},${curr.gy}`).parent;
                }
            }

            this._drawInteractiveMoveOverlay();
            if (this.isValidTarget && hoverWpIdx === -1) {
                this.graphics.beginFill(0x00FF00, 0.4);
                this.graphics.lineStyle(2, 0x00FF00, 1.0);
                this.graphics.drawRect(gridX * sizeX, gridY * sizeY, sizeX, sizeY);
                this.graphics.endFill();
            }

            this._drawPathLine();

            // Highlight waypoint for deletion
            if (hoverWpIdx !== -1) {
                const wp = this.waypoints[hoverWpIdx];
                this.pathLineGraphics.beginFill(0xFF0000, 1.0);
                this.pathLineGraphics.drawCircle(wp.x + sizeX/2, wp.y + sizeY/2, 10);
                this.pathLineGraphics.endFill();
                document.body.style.cursor = "pointer";
            } else {
                document.body.style.cursor = "crosshair";
            }
        }
    }

    static async _onClickLeft(ev) {
        if (!this.isActive) return;
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

        if (this.mode === "vault") {
            let hoveredSquare = null;
            for (const sq of this.validVaultSquares) {
                const dx = Math.abs(destination.x - sq.x);
                const dy = Math.abs(destination.y - sq.y);
                if (dx <= sizeX / 2 && dy <= sizeY / 2) {
                    hoveredSquare = sq; break;
                }
            }

            if (!hoveredSquare) {
                ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidJump") || "Invalid jump destination.");
                return;
            }

            const snapped = {
                x: hoveredSquare.x - (this.token.document.width * sizeX) / 2,
                y: hoveredSquare.y - (this.token.document.height * sizeY) / 2
            };

            const tokenDoc = this.token.document;
            const combatant = game.combat?.combatants.find(c => c.tokenId === tokenDoc.id);

            if (combatant && !this.options?.free) {
                const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
                await combatant.update({
                    "flags.trespasser.actionPoints": Math.max(0, currentAP - 1),
                    "flags.trespasser.isVaulting": true,
                    "flags.trespasser.vaultStartPos": { x: tokenDoc.x, y: tokenDoc.y }
                });

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ token: this.token }),
                    content: game.i18n.format("TRESPASSER.Chat.Action.VaultMessage", {
                        name: this.token.name,
                        action: game.i18n.localize("TRESPASSER.HUD.Action.Vault"),
                        range: this.maxRange
                    })
                });
                await TrespasserCombat.recordHUDAction(this.token.actor, "vault");
            }

            if (!this.options?.phaseAction) {
                await tokenDoc.update({x: snapped.x, y: snapped.y}, { 
                    animation: { movement: "jump" },
                    movementAction: "jump",
                    trespasserPhaseAction: !!(this.options?.phaseAction || this.options?.free)
                });
            }
            
            if (game.trespasser && game.trespasser.tokenHUD) game.trespasser.tokenHUD.render();
            const targetToken = this.token;
            this._isCompleting = true;
            this.deactivate();
            Hooks.callAll("trespasserVaultComplete", targetToken, snapped);

        } else if (this.mode === "move") {
            const gridX = Math.floor(destination.x / sizeX);
            const gridY = Math.floor(destination.y / sizeY);
            
            // Check waypoint deletion
            for (let i = 0; i < this.waypoints.length; i++) {
                const wp = this.waypoints[i];
                if (Math.abs(destination.x - (wp.x + sizeX/2)) <= 12 && 
                    Math.abs(destination.y - (wp.y + sizeY/2)) <= 12) {
                    this.waypoints.splice(i, 1);
                    this._recalculateWaypoints();
                    return;
                }
            }

            const isCtrl = ev.data?.originalEvent?.ctrlKey || ev.ctrlKey;
            
            if (isCtrl) {
                // Add Waypoint
                if (this.isValidTarget && this.visitedMoveMap.has(`${gridX},${gridY}`)) {
                    const node = this.visitedMoveMap.get(`${gridX},${gridY}`);
                    let lastCost = 0;
                    if (this.waypoints.length > 0) {
                        lastCost = this.waypoints[this.waypoints.length - 1].accumulatedCost;
                    }
                    this.waypoints.push({
                        x: gridX * sizeX,
                        y: gridY * sizeY,
                        accumulatedCost: lastCost + node.dist,
                        path: Array.from(this.currentPath)
                    });
                    this._recalculateWaypoints();
                } else {
                    ui.notifications.warn("Invalid waypoint location.");
                }
            } else {
                // Execute move (Task 5 hook)
                if (this.isValidTarget) {
                    const fullPath = [];
                    for (const wp of this.waypoints) {
                        if (wp.path) fullPath.push(...wp.path);
                    }
                    if (this.currentPath) fullPath.push(...this.currentPath);

                    // Filter out consecutive duplicates and the starting position
                    const uniquePath = [];
                    const startX = this.token.x;
                    const startY = this.token.y;

                    for (const pt of fullPath) {
                        // Skip the very first position if it's where we already are
                        if (uniquePath.length === 0 && pt.x === startX && pt.y === startY) continue;
                        
                        if (uniquePath.length > 0) {
                            const last = uniquePath[uniquePath.length - 1];
                            if (last.x === pt.x && last.y === pt.y) continue;
                        }
                        uniquePath.push(pt);
                    }

                    const node = this.visitedMoveMap.get(`${gridX},${gridY}`);
                    const lastCost = this.waypoints.length > 0 ? this.waypoints[this.waypoints.length - 1].accumulatedCost : 0;
                    const totalCost = lastCost + node.dist;

                    const tokenRef = this.token;
                    const tokenDoc = this.token.document;
                    const combatant = game.combat?.combatants.find(c => c.tokenId === tokenDoc.id);

                    this.deactivate();

                    (async () => {
                        // Temporarily bypass the preUpdateToken hook to avoid false positive blocks during intermediate path steps
                        globalThis._trespasserUndoSet ??= new Set();
                        globalThis._trespasserUndoSet.add(tokenDoc.id);
                        
                        try {
                            for (const pt of uniquePath) {
                                await tokenDoc.update({x: pt.x, y: pt.y});
                                
                                // Wait for animation to complete
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
                                await combatant.update({
                                    "flags.trespasser.movementUsed": newUsed,
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
                            globalThis._trespasserUndoSet.delete(tokenDoc.id);
                        }
                    })();
                }
            }
        }
    }

    static _onClickRight(ev) {
        if (this.isActive) {
            ev.preventDefault();
            this.deactivate();
        }
    }
}
