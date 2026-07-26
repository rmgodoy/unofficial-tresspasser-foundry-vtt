import { MovementPathfinder } from "./movement-pathfinder.mjs";
import { TrespasserCombat } from "../../documents/combat.mjs";
import { CanvasInputSession } from "../canvas-input-session.mjs";

/**
 * Encapsulates vault / jump / teleport / walk movement mode.
 */
export class VaultMovementMode {

    /**
     * Activate vault mode.
     * @param {MovementOverlay} host Parent MovementOverlay instance/class
     * @param {Token} token Caster token
     * @param {number} maxRange Max vault range
     * @param {object} options Options (free, phaseAction, movementType)
     */
    static async activate(host, token, maxRange, options = {}) {
        if (!token) return;
        if (host.isActive) host.deactivate();

        host.mode = "vault";
        host.token = token;
        host.maxRange = maxRange;
        host.options = options;
        host.isValidTarget = false;
        host.selectedVaultSquare = null;
        host._isCompleting = false;

        document.body.style.cursor = "crosshair";

        host.validVaultSquares = MovementPathfinder.calculateValidVaultSquares(token, maxRange, options);

        if (host.graphics) host.graphics.clear();

        this.drawVaultRange(host);

        const actionName = options.movementType ? (options.movementType.charAt(0).toUpperCase() + options.movementType.slice(1)) : "Vault";
        const title = game.i18n.localize(`TRESPASSER.HUD.Action.${actionName}`) || actionName;
        const details = game.i18n.format("TRESPASSER.HUD.Vault.OverlayInstruction", { range: maxRange })
            || `Range: ${maxRange} sq. Click square to select destination.`;

        await CanvasInputSession.start({
            title,
            details,
            icon: "fas fa-running",
            showConfirm: true,
            canConfirm: false,
            showUndo: false,
            canUndo: false,
            showCancel: true,
            onPointerMove: (ev) => {
                let destination;
                if (typeof ev.getLocalPosition === "function") {
                    destination = ev.getLocalPosition(canvas.app.stage);
                } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
                    destination = ev.data.getLocalPosition(canvas.app.stage);
                } else if (ev.interactionData && ev.interactionData.origin) {
                    destination = ev.interactionData.origin;
                }
                if (destination) {
                    this.onMouseMove(host, destination);
                }
            },
            onClick: (ev) => {
                let destination;
                if (typeof ev.getLocalPosition === "function") {
                    destination = ev.getLocalPosition(canvas.app.stage);
                } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
                    destination = ev.data.getLocalPosition(canvas.app.stage);
                } else if (ev.interactionData && ev.interactionData.origin) {
                    destination = ev.interactionData.origin;
                }
                if (destination) {
                    this.onClickLeft(host, destination);
                }
            },
            onConfirm: async () => {
                await this.executeVault(host);
            },
            onCancel: () => {
                host.deactivate();
            }
        });
    }

    /**
     * Draw valid vault destination squares and selected tile highlight.
     */
    static drawVaultRange(host) {
        if (!host.graphics || !host.token || !host.validVaultSquares) return;
        host.graphics.clear();

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;
        const sizeW = host.token.document.width * sizeX;
        const sizeH = host.token.document.height * sizeY;

        // Draw valid range squares
        host.graphics.beginFill(0x00FF00, 0.15);
        host.graphics.lineStyle(2, 0x00FF00, 0.4);

        for (const sq of host.validVaultSquares) {
            const tlx = sq.x - sizeW / 2;
            const tly = sq.y - sizeH / 2;
            host.graphics.drawRect(tlx, tly, sizeW, sizeH);
        }
        host.graphics.endFill();

        // Draw selected tile highlight if chosen
        if (host.selectedVaultSquare && host.selectedVaultSquare.hoveredSquare) {
            const selSq = host.selectedVaultSquare.hoveredSquare;
            const tlx = selSq.x - sizeW / 2;
            const tly = selSq.y - sizeH / 2;

            // Bright gold fill & thick border for selected tile
            host.graphics.beginFill(0xFFD700, 0.45);
            host.graphics.lineStyle(4, 0xFFD700, 1.0);
            host.graphics.drawRect(tlx, tly, sizeW, sizeH);
            host.graphics.endFill();
        }
    }

    /**
     * Handle mouse move during vault mode.
     */
    static onMouseMove(host, destination) {
        if (!host.token || !host.validVaultSquares) return;

        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        let hoveredSquare = null;
        for (const sq of host.validVaultSquares) {
            const dx = Math.abs(destination.x - sq.x);
            const dy = Math.abs(destination.y - sq.y);
            if (dx <= sizeX / 2 && dy <= sizeY / 2) {
                hoveredSquare = sq;
                break;
            }
        }

        host.isValidTarget = hoveredSquare !== null;
        this.drawVaultRange(host);

        if (hoveredSquare) {
            // Draw green hover box if not already selected
            const isSelected = host.selectedVaultSquare?.hoveredSquare?.x === hoveredSquare.x && host.selectedVaultSquare?.hoveredSquare?.y === hoveredSquare.y;
            if (!isSelected) {
                host.graphics.beginFill(0x00FF00, 0.4);
                host.graphics.lineStyle(2, 0x00FF00, 1.0);
                const sizeW = host.token.document.width * sizeX;
                const sizeH = host.token.document.height * sizeY;
                host.graphics.drawRect(hoveredSquare.x - sizeW / 2, hoveredSquare.y - sizeH / 2, sizeW, sizeH);
                host.graphics.endFill();
            }

            const textStyle = { fill: 0xFFFFFF, fontSize: 16, stroke: 0x000000, strokeThickness: 4 };
            if (host.textTag) host.textTag.destroy();
            host.textTag = new PIXI.Text(`${hoveredSquare.distance} / ${host.maxRange}`, textStyle);
            host.textTag.position.set(hoveredSquare.x + 15, hoveredSquare.y - 15);
            host.graphics.addChild(host.textTag);
        } else {
            if (host.textTag) {
                host.textTag.destroy();
                host.textTag = null;
            }
        }

        if (CanvasInputSession.activeSession) {
            CanvasInputSession.activeSession.updateOverlay({
                canConfirm: host.isValidTarget || host.selectedVaultSquare !== null
            });
        }
    }

    /**
     * Handle click during vault mode. Selects destination square and enables Confirm.
     */
    static onClickLeft(host, destination) {
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        let hoveredSquare = null;
        for (const sq of host.validVaultSquares) {
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
            x: hoveredSquare.x - (host.token.document.width * sizeX) / 2,
            y: hoveredSquare.y - (host.token.document.height * sizeY) / 2
        };

        // Check if this tile is already selected (second click on same tile -> auto-confirm!)
        const isAlreadySelected = host.selectedVaultSquare &&
            host.selectedVaultSquare.hoveredSquare &&
            host.selectedVaultSquare.hoveredSquare.x === hoveredSquare.x &&
            host.selectedVaultSquare.hoveredSquare.y === hoveredSquare.y;

        if (isAlreadySelected) {
            this.executeVault(host);
            return;
        }

        host.selectedVaultSquare = { hoveredSquare, snapped };
        this.drawVaultRange(host);

        if (CanvasInputSession.activeSession) {
            CanvasInputSession.activeSession.updateOverlay({ canConfirm: true });
        }
    }

    /**
     * Execute vault movement after user clicks Confirm.
     */
    static async executeVault(host) {
        if (!host.selectedVaultSquare) return;

        const { snapped } = host.selectedVaultSquare;
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        const tokenDoc = host.token.document;
        const combatant = game.combat?.combatants.find(c => c.tokenId === tokenDoc.id);

        if (combatant && !host.options?.free) {
            const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
            await combatant.update({
                "flags.trespasser.actionPoints": Math.max(0, currentAP - 1),
                "flags.trespasser.isVaulting": true,
                "flags.trespasser.vaultStartPos": { x: tokenDoc.x, y: tokenDoc.y }
            });

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ token: host.token }),
                content: game.i18n.format("TRESPASSER.Chat.Action.VaultMessage", {
                    name: host.token.name,
                    action: game.i18n.localize("TRESPASSER.HUD.Action.Vault"),
                    range: host.maxRange
                })
            });
            await TrespasserCombat.recordHUDAction(host.token.actor, "vault");
        }

        if (!host.options?.phaseAction) {
            await tokenDoc.update({x: snapped.x, y: snapped.y}, {
                animation: { movement: "jump" },
                movementAction: "jump",
                trespasserPhaseAction: !!(host.options?.phaseAction || host.options?.free)
            });
        }

        if (game.trespasser && game.trespasser.tokenHUD) game.trespasser.tokenHUD.render();
        const targetToken = host.token;
        host._isCompleting = true;
        host.deactivate();
        Hooks.callAll("trespasserVaultComplete", targetToken, snapped);
    }
}
