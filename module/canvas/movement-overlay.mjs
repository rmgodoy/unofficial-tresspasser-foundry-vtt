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
