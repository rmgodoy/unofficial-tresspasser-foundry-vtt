import { MovementPathfinder } from "./movement-pathfinder.mjs";
import { TrespasserCombat } from "../../documents/combat.mjs";

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
    static activate(host, token, maxRange, options = {}) {
        if (!token) return;
        if (host.isActive) host.deactivate();

        host.mode = "vault";
        host.token = token;
        host.maxRange = maxRange;
        host.options = options;
        host.isValidTarget = false;
        host._isCompleting = false;

        document.body.style.cursor = "crosshair";

        host.validVaultSquares = MovementPathfinder.calculateValidVaultSquares(token, maxRange, options);

        // Bind canvas listeners for vault mode
        canvas.stage.on("pointerdown", host._onClickLeft);
        canvas.stage.on("pointermove", host._onMouseMove);
        if (canvas.app && canvas.app.view) {
            canvas.app.view.addEventListener("contextmenu", host._onClickRight);
        }

        ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.VaultModeActivated") || "Vault Mode Activated. Click a destination or right-click to cancel.");

        this.drawVaultRange(host);
    }

    /**
     * Draw valid vault destination squares.
     */
    static drawVaultRange(host) {
        if (!host.graphics || !host.token || !host.validVaultSquares) return;
        host.graphics.clear();

        host.graphics.beginFill(0x00FF00, 0.2);
        host.graphics.lineStyle(2, 0x00FF00, 0.5);

        const sizeW = host.token.document.width * (canvas.grid.sizeX || canvas.grid.size);
        const sizeH = host.token.document.height * (canvas.grid.sizeY || canvas.grid.size);

        for (const sq of host.validVaultSquares) {
            const tlx = sq.x - sizeW / 2;
            const tly = sq.y - sizeH / 2;
            host.graphics.drawRect(tlx, tly, sizeW, sizeH);
        }

        host.graphics.endFill();
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
            host.graphics.beginFill(0x00FF00, 0.4);
            host.graphics.lineStyle(2, 0x00FF00, 1.0);
            const sizeW = host.token.document.width * sizeX;
            const sizeH = host.token.document.height * sizeY;
            host.graphics.drawRect(hoveredSquare.x - sizeW / 2, hoveredSquare.y - sizeH / 2, sizeW, sizeH);
            host.graphics.endFill();

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
    }

    /**
     * Handle click during vault mode.
     */
    static async onClickLeft(host, destination) {
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
