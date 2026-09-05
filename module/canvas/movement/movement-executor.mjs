import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

/**
 * Executes token movement step-by-step with animation and effect triggering.
 * @param {object} host - MovementOverlay instance
 */
export async function executeTokenMovement(host) {
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
    const movementType = TrespasserEffectsHelper.getMovementType(tokenRef.actor);
    const actionName = movementType === "jump" ? "jump" : "walk";

    host.deactivate();

    globalThis._trespasserOverlaySet ??= new Set();
    globalThis._trespasserOverlaySet.add(tokenDoc.id);

    // When jumping: leap from waypoint to waypoint (or directly to end if no waypoints)
    // When walking: step square-by-square along uniquePath
    let stepsToAnimate = uniquePath;
    if (movementType === "jump") {
        const destPt = uniquePath.length > 0 ? uniquePath[uniquePath.length - 1] : { x: gridX * sizeX, y: gridY * sizeY };
        const wpSteps = host.waypoints.map(wp => ({ x: wp.x, y: wp.y }));
        stepsToAnimate = [...wpSteps, destPt].filter(pt => !(pt.x === startX && pt.y === startY));
        if (stepsToAnimate.length === 0) stepsToAnimate = [destPt];
    }

    try {
        for (const pt of stepsToAnimate) {
            await tokenDoc.update({x: pt.x, y: pt.y}, {
                movementAction: actionName,
                animation: { movement: actionName }
            });

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

            if (movementType === "jump") {
                const msgKey = "TRESPASSER.Chat.Action.MoveJumpMessage";
                const defaultMsg = `<strong>${tokenRef.name}</strong> jumps ${totalCost} sq.`;
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ token: tokenRef }),
                    content: game.i18n.format(msgKey, { name: tokenRef.name, distance: totalCost }) || defaultMsg
                });
            }
        }
    } finally {
        globalThis._trespasserOverlaySet.delete(tokenDoc.id);
    }
}
