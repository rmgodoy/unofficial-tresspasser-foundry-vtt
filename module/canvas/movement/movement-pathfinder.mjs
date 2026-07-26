/**
 * Calculates distances, paths, collision checks, and valid squares for movement.
 */
export class MovementPathfinder {

    /**
     * Calculate Dijkstra / A* distance map from a start position on the grid.
     * @param {number} startX Pixel X position
     * @param {number} startY Pixel Y position
     * @param {number} maxRange Maximum range in movement points
     * @param {Token} token Moving token for collision checks
     * @returns {Map<string, {dist: number, pathLen: number, turns: number, parent: object|null}>}
     */
    static calculateDistancesFrom(startX, startY, maxRange, token) {
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
                    wallCollision = CONFIG.Canvas.polygonBackends.move.testCollision(p1, p2, { type: "move", mode: "any" });
                } else if (canvas.walls?.checkCollision) {
                    const RayClass = foundry.canvas.geometry.Ray || globalThis.Ray;
                    wallCollision = canvas.walls.checkCollision(new RayClass(p1, p2), { type: "move", mode: "any" });
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

                if (token) {
                    const tokens = canvas.scene.tokens.filter(t => t.id !== token.id && !t.hidden);
                    for (const t of tokens) {
                        const tw = (t.width || 1) * sizeX;
                        const th = (t.height || 1) * sizeY;
                        if (p2.x >= t.x && p2.x <= t.x + tw && p2.y >= t.y && p2.y <= t.y + th) {
                            if (t.disposition !== token.document.disposition) {
                                wallCollision = true; break;
                            }
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

    /**
     * Calculate valid vault destination squares based on movement type (jump, walk, teleport).
     * @param {Token} token
     * @param {number} maxRange
     * @param {object} options
     * @returns {Array<{x: number, y: number, distance: number}>}
     */
    static calculateValidVaultSquares(token, maxRange, options = {}) {
        if (!token) return [];
        const tokenCenter = token.center;
        const sizeX = canvas.grid.sizeX || canvas.grid.size;
        const sizeY = canvas.grid.sizeY || canvas.grid.size;

        const validSquares = [];
        const movementType = (options.movementType || "jump").toLowerCase();

        if (movementType === "teleport") {
            const startGx = Math.floor(tokenCenter.x / sizeX);
            const startGy = Math.floor(tokenCenter.y / sizeY);

            for (let dx = -maxRange; dx <= maxRange; dx++) {
                for (let dy = -maxRange; dy <= maxRange; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    if (dist <= maxRange) {
                        const destPoint = {
                            x: (startGx + dx + 0.5) * sizeX,
                            y: (startGy + dy + 0.5) * sizeY
                        };
                        validSquares.push({
                            x: destPoint.x,
                            y: destPoint.y,
                            distance: dist
                        });
                    }
                }
            }
        } else if (movementType === "walk") {
            const visited = this.calculateDistancesFrom(token.x, token.y, maxRange, token);
            for (const [key, val] of visited.entries()) {
                if (val.dist === 0) continue;
                const [gxStr, gyStr] = key.split(",");
                const gx = parseInt(gxStr);
                const gy = parseInt(gyStr);
                validSquares.push({
                    x: (gx + 0.5) * sizeX,
                    y: (gy + 0.5) * sizeY,
                    distance: val.dist
                });
            }
        } else {
            // "jump" or straight-line rays
            const directions = [
                {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1},
                {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}
            ];
            
            for (const dir of directions) {
                for (let d = 1; d <= maxRange; d++) {
                    const destPoint = {
                        x: tokenCenter.x + dir.dx * d * sizeX,
                        y: tokenCenter.y + dir.dy * d * sizeY
                    };
                    
                    validSquares.push({
                        x: destPoint.x,
                        y: destPoint.y,
                        distance: d
                    });
                }
            }
        }

        return validSquares;
    }
}
