import { CanvasInputSession } from "./canvas-input-session.mjs";
import { MovementPathfinder } from "./movement/movement-pathfinder.mjs";
import { StandardMovementMode } from "./movement/standard-movement.mjs";
import { VaultMovementMode } from "./movement/vault-movement.mjs";

/**
 * MovementOverlay facade — Coordinates token movement and vault/jump modes.
 * Delegates specialized logic to focused sub-modules in `module/canvas/movement/`.
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
    static selectedDestination = null;
    static options = null;
    static _isCompleting = false;

    static init() {
        Hooks.on("canvasReady", () => {
            if (this.graphics && !this.graphics.destroyed) {
                this.graphics.destroy();
            }
            this.graphics = new PIXI.Graphics();
            canvas.controls.addChild(this.graphics);
        });

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

    static showInformativeOverlay(token, baseMove, moveCost, availableAP = 3) {
        if (!token) return;
        this.clearInformativeOverlay();

        this.graphics = this.graphics || new PIXI.Graphics();
        canvas.controls.addChild(this.graphics);

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        const extraAP = Math.min(2, Math.max(0, availableAP - 1));
        const maxRange = baseMove + extraAP * moveCost;

        const visited = MovementPathfinder.calculateDistancesFrom(token.x, token.y, maxRange, token);

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
                color = 0xFF8800;
            } else if (val.dist > baseMove) {
                if (extraAP < 1) continue;
                color = 0xFFFF00;
            }

            this.graphics.beginFill(color, alpha);
            this.graphics.lineStyle(2, color, 0.5);
            this.graphics.drawRect(x, y, sizeX, sizeY);
            this.graphics.endFill();
        }
    }

    static clearInformativeOverlay() {
        if (this.mode === "vault" || this.mode === "move") return;
        if (this.graphics) this.graphics.clear();
        if (this.pathLineGraphics) this.pathLineGraphics.clear();
    }

    static async activateMoveMode(token, movePoints) {
        await StandardMovementMode.activate(this, token, movePoints);
    }

    static activateVaultMode(token, maxRange, options = {}) {
        VaultMovementMode.activate(this, token, maxRange, options);
    }

    static deactivate() {
        const prevMode = this.mode;
        const targetToken = this.token;
        const isCompleting = this._isCompleting;

        if (CanvasInputSession.activeSession) {
            const session = CanvasInputSession.activeSession;
            CanvasInputSession.activeSession = null;
            session._cleanup();
        }

        this.mode = null;
        this.token = null;
        this.maxRange = null;
        this.options = null;
        this.movePoints = 0;
        this.isValidTarget = false;
        this.validVaultSquares = [];
        this.waypoints = [];
        this.currentPath = [];
        this.selectedDestination = null;
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

    static _calculateDistancesFrom(startX, startY, maxRange) {
        return MovementPathfinder.calculateDistancesFrom(startX, startY, maxRange, this.token);
    }

    static _calculateValidVaultSquares() {
        this.validVaultSquares = MovementPathfinder.calculateValidVaultSquares(this.token, this.maxRange, this.options);
    }

    static _drawInteractiveMoveOverlay() {
        StandardMovementMode.drawInteractiveMoveOverlay(this);
    }

    static _recalculateWaypoints() {
        StandardMovementMode.recalculateWaypoints(this);
    }

    static _drawPathLine() {
        StandardMovementMode.drawPathLine(this);
    }

    static _drawVaultRange() {
        VaultMovementMode.drawVaultRange(this);
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

        if (this.mode === "vault") {
            VaultMovementMode.onMouseMove(this, destination);
        } else if (this.mode === "move") {
            StandardMovementMode.onMouseMove(this, ev);
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

        if (this.mode === "vault") {
            await VaultMovementMode.onClickLeft(this, destination);
        } else if (this.mode === "move") {
            StandardMovementMode.onClickLeft(this, ev);
        }
    }

    static _onClickRight(ev) {
        if (this.isActive && this.mode === "vault") {
            ev.preventDefault();
            this.deactivate();
        }
    }

    static _onUndoWaypoint() {
        StandardMovementMode.onUndoWaypoint(this);
    }

    static async _executeMove() {
        await StandardMovementMode.executeMove(this);
    }
}
