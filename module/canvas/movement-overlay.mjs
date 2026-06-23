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

    static showInformativeOverlay(token, baseMove, moveCost) {
        if (!token) return;
        this.clearInformativeOverlay();

        this.graphics = this.graphics || new PIXI.Graphics();
        canvas.controls.addChild(this.graphics);

        const startX = token.x;
        const startY = token.y;
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        const maxRange = baseMove + 2 * moveCost;

        // BFS: {gridX, gridY, dist}
        const gridX = Math.floor(startX / sizeX);
        const gridY = Math.floor(startY / sizeY);

        const queue = [{ gx: gridX, gy: gridY, dist: 0 }];
        const visited = new Map();
        visited.set(`${gridX},${gridY}`, 0);

        const directions = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
        ];

        while (queue.length > 0) {
            const current = queue.shift();

            if (current.dist >= maxRange) continue;

            for (const dir of directions) {
                const nx = current.gx + dir.dx;
                const ny = current.gy + dir.dy;

                // Center points for collision
                const p1 = { x: (current.gx + 0.5) * sizeX, y: (current.gy + 0.5) * sizeY };
                const p2 = { x: (nx + 0.5) * sizeX, y: (ny + 0.5) * sizeY };

                // 1. Native Wall Collision
                let wallCollision = false;
                if (CONFIG.Canvas.polygonBackends?.move?.testCollision) {
                    wallCollision = CONFIG.Canvas.polygonBackends.move.testCollision(p1, p2, { mode: "any" });
                } else if (canvas.walls?.checkCollision) {
                    wallCollision = canvas.walls.checkCollision(new Ray(p1, p2), { type: "move", mode: "any" });
                }

                if (wallCollision) continue;

                // 2. Token Collision (cannot move through enemy tokens unless dead, for now just ignore all tokens or apply +1 cost)
                // Actually, rules say "taking tokens into account". Usually moving through token is +1 cost or blocked. Let's just say it's valid to move through but maybe costs more.
                // The requirements say "taking walls, terrain, and tokens into account".
                // We will treat difficult terrain and tokens as +1 extra move cost for simplicity, or just 1 base cost.
                // In Trespasser, difficult terrain is usually 2 squares of movement.
                let stepCost = 1;

                // Check terrain
                if (game.trespasser?.TerrainHelper) {
                    const regions = game.trespasser.TerrainHelper.getTerrainAtSquare(nx, ny, sizeX);
                    for (const r of regions) {
                        const sys = r.flags?.trespasser?.terrain?.system;
                        const cat = sys?.category;
                        if (cat === "wall" || cat === "obstacle") {
                            wallCollision = true;
                            break;
                        }
                        if (cat === "difficult_terrain") {
                            stepCost += 1;
                        } else if (cat === "field" && sys?.extraMovementCost > 0) {
                            stepCost += sys.extraMovementCost;
                        }
                    }
                }
                
                if (wallCollision) continue;

                // Check tokens
                const tokens = canvas.scene.tokens.filter(t => t.id !== token.id && !t.hidden);
                for (const t of tokens) {
                    const tw = (t.width || 1) * sizeX;
                    const th = (t.height || 1) * sizeY;
                    // p2 is the center of the destination square
                    if (p2.x >= t.x && p2.x <= t.x + tw && p2.y >= t.y && p2.y <= t.y + th) {
                        if (t.disposition !== token.document.disposition) {
                            wallCollision = true;
                            break;
                        }
                    }
                }

                if (wallCollision) continue;

                const newDist = current.dist + stepCost;
                const key = `${nx},${ny}`;

                if (newDist <= maxRange) {
                    if (!visited.has(key) || visited.get(key) > newDist) {
                        visited.set(key, newDist);
                        queue.push({ gx: nx, gy: ny, dist: newDist });
                    }
                }
            }
        }

        this.graphics.clear();
        for (const [key, dist] of visited.entries()) {
            if (dist === 0) continue;
            const [xStr, yStr] = key.split(",");
            const x = parseInt(xStr) * sizeX;
            const y = parseInt(yStr) * sizeY;

            let color = 0x00FF00;
            let alpha = 0.2;

            if (dist > baseMove + moveCost) {
                color = 0xFF8800; // Orange
            } else if (dist > baseMove) {
                color = 0xFFFF00; // Yellow
            }

            this.graphics.beginFill(color, alpha);
            this.graphics.lineStyle(2, color, 0.5);
            this.graphics.drawRect(x, y, sizeX, sizeY);
            this.graphics.endFill();
        }
    }

    static clearInformativeOverlay() {
        if (this.mode === "vault") return; // don't clear if vaulting
        if (this.graphics) {
            this.graphics.clear();
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

    static activateVaultMode(token, maxRange) {
        if (!token) return;
        this.mode = "vault";
        this.token = token;
        this.maxRange = maxRange;
        this.isValidTarget = false;

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
        this.mode = null;
        this.token = null;
        this.maxRange = null;
        this.isValidTarget = false;
        this.validVaultSquares = [];

        if (this.graphics) {
            this.graphics.clear();
        }
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
        if (this.mode !== "vault" || !this.token) return;

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
        
        let hoveredSquare = null;
        for (const sq of this.validVaultSquares) {
            const dx = Math.abs(destination.x - sq.x);
            const dy = Math.abs(destination.y - sq.y);
            // using <= size/2 will correctly bound the hovered square
            if (dx <= sizeX / 2 && dy <= sizeY / 2) {
                hoveredSquare = sq;
                break;
            }
        }
        
        this.isValidTarget = hoveredSquare !== null;

        // Re-draw base overlay
        this._drawVaultRange();

        if (hoveredSquare) {
            this.graphics.beginFill(0x00FF00, 0.4);
            this.graphics.lineStyle(2, 0x00FF00, 1.0);
            const sizeW = this.token.document.width * sizeX;
            const sizeH = this.token.document.height * sizeY;
            this.graphics.drawRect(hoveredSquare.x - sizeW/2, hoveredSquare.y - sizeH/2, sizeW, sizeH);
            this.graphics.endFill();

            const textStyle = { fill: 0xFFFFFF, fontSize: 16, stroke: 0x000000, strokeThickness: 4 };
            if (this.textTag) {
                this.textTag.destroy();
            }
            this.textTag = new PIXI.Text(`${hoveredSquare.distance} / ${this.maxRange}`, textStyle);
            this.textTag.position.set(hoveredSquare.x + 15, hoveredSquare.y - 15);
            this.graphics.addChild(this.textTag);
        } else {
            if (this.textTag) {
                this.textTag.destroy();
                this.textTag = null;
            }
        }
    }

    static async _onClickLeft(ev) {
        if (!this.isActive) return;
        
        // Must be left click (button 0) or main pointer tap
        if (ev.data && ev.data.button !== 0 && ev.data.button !== undefined) return;

        if (this.mode === "vault") {
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

            let hoveredSquare = null;
            for (const sq of this.validVaultSquares) {
                const dx = Math.abs(destination.x - sq.x);
                const dy = Math.abs(destination.y - sq.y);
                if (dx <= sizeX / 2 && dy <= sizeY / 2) {
                    hoveredSquare = sq;
                    break;
                }
            }

            if (!hoveredSquare) {
                ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidJump") || "Invalid jump destination. Path is blocked or out of range.");
                return;
            }

            const snapped = {
                x: hoveredSquare.x - (this.token.document.width * sizeX) / 2,
                y: hoveredSquare.y - (this.token.document.height * sizeY) / 2
            };

            const tokenDoc = this.token.document;
            const combatant = game.combat?.combatants.find(c => c.tokenId === tokenDoc.id);

            if (combatant) {
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

            // Move the token to the snapped location
            await tokenDoc.update({x: snapped.x, y: snapped.y}, { 
                animation: { movement: "jump" },
                movementAction: "jump"
            });
            
            // Re-render HUD
            if (game.trespasser && game.trespasser.tokenHUD) {
                game.trespasser.tokenHUD.render();
            }

            this.deactivate();
        }
    }

    static _onClickRight(ev) {
        if (this.isActive) {
            ev.preventDefault();
            this.deactivate();
        }
    }
}
