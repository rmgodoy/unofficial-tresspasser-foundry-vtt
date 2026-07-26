import { TerrainHelper } from "./terrain-helper.mjs";
import { MovementHelper } from "./movement-helper.mjs";
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api || {};

class TargetOrderingPanel extends (HandlebarsApplicationMixin ? HandlebarsApplicationMixin(ApplicationV2) : class {}) {
  constructor(targets, resolvePromise) {
    super();
    this.targets = [...targets];
    this.resolvePromise = resolvePromise;
    this.ordered = [];
  }

  static DEFAULT_OPTIONS = {
    id: "forced-movement-targets",
    classes: ["trespasser", "forced-movement"],
    tag: "div",
    window: {
      title: "TRESPASSER.HUD.ForcedMovement.TargetsTitle",
      icon: "fas fa-bullseye"
    },
    position: {
      width: 300,
      height: "auto"
    }
  };

  static PARTS = {
    panel: {
      template: "systems/trespasser/templates/hud/forced-movement-targets.hbs"
    }
  };

  async _prepareContext(options) {
    return {
      targets: this.targets.map(t => ({ id: t.id, name: t.actor?.name || t.name, img: t.document?.texture?.src || t.texture?.src || "icons/svg/mystery-man.svg" }))
    };
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    
    // Hover to highlight
    const items = htmlElement.querySelectorAll(".target-item");
    for (const item of items) {
      item.addEventListener("pointerenter", (e) => {
        const id = e.currentTarget.dataset.targetId;
        const token = canvas.tokens.get(id);
        if (token && !token.controlled) {
          token.hover = true;
          token.refresh();
        }
      });
      item.addEventListener("pointerleave", (e) => {
        const id = e.currentTarget.dataset.targetId;
        const token = canvas.tokens.get(id);
        if (token && !token.controlled) {
          token.hover = false;
          token.refresh();
        }
      });
    }

    // Drag and drop for reordering
    const list = htmlElement.querySelector(".target-list");
    let draggedItem = null;

    list.addEventListener("dragstart", (e) => {
      draggedItem = e.target.closest(".target-item");
      if (draggedItem) {
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => draggedItem.classList.add("dragging"), 0);
      }
    });

    list.addEventListener("dragend", (e) => {
      if (draggedItem) {
        draggedItem.classList.remove("dragging");
        draggedItem = null;
      }
    });

    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggedItem) return;
      const afterElement = getDragAfterElement(list, e.clientY);
      if (afterElement == null) {
        list.appendChild(draggedItem);
      } else {
        list.insertBefore(draggedItem, afterElement);
      }
    });

    function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('.target-item:not(.dragging)')];
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // Confirm button
    const confirmBtn = htmlElement.querySelector(".confirm-btn");
    confirmBtn.addEventListener("click", () => {
      const currentItems = htmlElement.querySelectorAll(".target-item");
      this.ordered = Array.from(currentItems).map(item => {
        const id = item.dataset.targetId;
        return this.targets.find(t => t.id === id);
      }).filter(Boolean);
      
      this.targets = []; // clear to prevent close() from appending original targets
      this.resolvePromise(this.ordered);
      this.close();
    });
  }

  async close(options) {
    if (this.targets.length > 0) {
      this.ordered.push(...this.targets);
      this.resolvePromise(this.ordered);
      this.targets = [];
    }
    return super.close(options);
  }
}

export class ForcedMovementHelper {
  static TYPES = { PUSH: "push", PULL: "pull", SWEEP: "sweep", SHOVE: "shove", DRAG: "drag" };

  static async executeForcedMovement(sourceToken, targets, movementType, distance, options = {}) {
    return MovementHelper.withFreeMovement(async () => {
      if (!targets || targets.length === 0 || distance <= 0) return;

      // sourceToken can be null if direction or terrainRegion is provided
      if (!sourceToken && !options.direction && !options.terrainRegion) return;

      let orderedTargets = targets;
      if (targets.length > 1 && ApplicationV2) {
        orderedTargets = await this.#showTargetOrderPanel(targets);
      }

      if (!orderedTargets || orderedTargets.length === 0) return;

      for (const targetToken of orderedTargets) {
        let movingToken = targetToken;
        let referenceToken = sourceToken;

        if (movementType === this.TYPES.DRAG) {
          movingToken = sourceToken;
          referenceToken = targetToken;
        }

        const result = await this.#selectForcedPath(movingToken, referenceToken, movementType, distance, options);
        if (result) {
          let otherToken = null;
          if (result.path.length > 0) {
            ui.notifications.info(`Path selected for ${movingToken.actor?.name || movingToken.name} with ${result.path.length} steps.`);
            
            const gridSize = canvas.scene.grid.size;
            
            const movingInitialX = Math.floor(movingToken.center.x / gridSize);
            const movingInitialY = Math.floor(movingToken.center.y / gridSize);
            
            // Calculate the explicit step-by-step path for moving token
            const movingPath = result.path.map(sq => ({
              x: movingToken.document.x + ((sq.x - movingInitialX) * gridSize),
              y: movingToken.document.y + ((sq.y - movingInitialY) * gridSize)
            }));

            let compoundPath = null;

            if (movementType === this.TYPES.SHOVE || movementType === this.TYPES.DRAG) {
              otherToken = (movementType === this.TYPES.SHOVE) ? sourceToken : targetToken;
              
              // The other token follows the exact same relative step-by-step path
              compoundPath = result.path.map(sq => ({
                x: otherToken.document.x + ((sq.x - movingInitialX) * gridSize),
                y: otherToken.document.y + ((sq.y - movingInitialY) * gridSize)
              }));
            }

            // Add explicit paths to result for future tasks (e.g. step-by-step animation and collision)
            result.movingPath = movingPath;
            if (compoundPath) result.compoundPath = compoundPath;
          }

          const ownsTarget = targetToken.isOwner;
          const ownsSource = !sourceToken || sourceToken.isOwner;

          if (ownsTarget && ownsSource) {
            if (result.path && result.path.length > 0) {
              await this.#animateTokenAlongPath(movingToken, result.movingPath, otherToken, result.compoundPath);
            }
            await this.#postCollisionDamage(targetToken, result.collisions, result.totalDamage);
          } else {
            const { emitDeedActionAndWait } = await import("./socket/deed-socket-handler.mjs");
            await emitDeedActionAndWait("forceMoveTokens", {
              movingTokenId: movingToken.id,
              movingPath: result.movingPath || [],
              otherTokenId: otherToken?.id || null,
              compoundPath: result.compoundPath || null,
              targetTokenId: targetToken.id,
              collisions: result.collisions || [],
              totalDamage: result.totalDamage || 0
            });
          }
        }
      }
    });
  }

  static async #animateTokenAlongPath(movingToken, movingPath, otherToken = null, compoundPath = null) {
    if (!movingPath || movingPath.length === 0) return;

    for (let i = 0; i < movingPath.length; i++) {
      const updates = [{
        _id: movingToken.id,
        x: movingPath[i].x,
        y: movingPath[i].y
      }];

      if (otherToken && compoundPath && compoundPath[i]) {
        updates.push({
          _id: otherToken.id,
          x: compoundPath[i].x,
          y: compoundPath[i].y
        });
      }

      await canvas.scene.updateEmbeddedDocuments("Token", updates, { trespasserForcedMovement: true });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  static async #postCollisionDamage(targetToken, collisions, totalDamage) {
    if (!collisions || collisions.length === 0 || totalDamage <= 0) return;

    const actor = targetToken.actor;
    if (!actor) return;

    if (typeof actor.applyDamage === "function") {
      await actor.applyDamage(totalDamage);
    } else {
      const newHp = Math.max(0, actor.system.health - totalDamage);
      await actor.update({ "system.health": newHp });
    }

    const lines = collisions.map(c => {
      const dmgStr = game.i18n.format("TRESPASSER.Chat.Collision.Damage", { damage: c.damage }) || `${c.damage} Damage`;
      if (c.type === "wall") {
        const wallLabel = game.i18n.localize("TRESPASSER.Chat.Collision.Wall") || "Wall Collision";
        return `<li><span style="color:var(--trp-red, #c44);">⚡ ${dmgStr}</span> — ${wallLabel}</li>`;
      } else if (c.type === "obstacle") {
        const obstacleLabel = game.i18n.format("TRESPASSER.Chat.Collision.Obstacle", { name: c.region?.name || "Obstacle" }) || `Obstacle Collision (${c.region?.name || "Obstacle"})`;
        return `<li><span style="color:var(--trp-red, #c44);">⚡ ${dmgStr}</span> — ${obstacleLabel}</li>`;
      }
      return "";
    }).filter(Boolean);

    const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;
    const flavor = game.i18n.format("TRESPASSER.Chat.Collision.Flavor", { total: totalDamage }) || `💥 Forced Movement Collision (${totalDamage} Total Damage)`;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flavor
    });
  }

  static async #showTargetOrderPanel(targets) {
    return new Promise((resolve) => {
      const panel = new TargetOrderingPanel(targets, resolve);
      panel.render(true);
    });
  }

  static async #selectForcedPath(movingToken, referenceToken, movementType, distance, options = {}) {
    return new Promise(async (resolve) => {
      let remainingSquares = distance;
      let path = [];
      let totalDamage = 0;
      let collisions = [];
      const historyStack = [];

      const gridSize = canvas.scene.grid.size;
      const initialPos = { 
        x: Math.floor(movingToken.center.x / gridSize), 
        y: Math.floor(movingToken.center.y / gridSize) 
      };
      let currentPos = { ...initialPos };

      const typeKey = Object.values(this.TYPES).includes(movementType) ? movementType : "push";
      const typeLabel = game.i18n.localize(`TRESPASSER.HUD.ForcedMovement.Types.${typeKey}`);

      const overlayGraphics = new PIXI.Graphics();
      canvas.controls.addChild(overlayGraphics);

      const drawOverlay = () => {
        overlayGraphics.clear();

        // 1. Draw valid next steps if remainingSquares > 0
        if (remainingSquares > 0) {
          const validSquares = this.#getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken, options);
          const pixelSquares = validSquares.map(sq => ({ x: sq.x * gridSize, y: sq.y * gridSize }));
          CanvasSelectionRenderer.drawCandidateSquares(overlayGraphics, pixelSquares, gridSize);
        }

        // 2. ALWAYS draw the path selected so far
        if (path.length > 0) {
          const pixelPath = path.map(sq => ({ x: sq.x * gridSize, y: sq.y * gridSize }));
          CanvasSelectionRenderer.drawPath(overlayGraphics, pixelPath, gridSize, { drawArrows: false });
        }

        // 3. Highlight collision tile in red if present
        if (collisions.length > 0 && historyStack.length > 0) {
          const lastRecord = historyStack[historyStack.length - 1];
          if (lastRecord.pos && (lastRecord.damageAdded > 0 || lastRecord.collisionsAdded.some(c => c.type === "creature" || c.type === "wall"))) {
            CanvasSelectionRenderer.drawBlockedSquare(overlayGraphics, { x: lastRecord.pos.x * gridSize, y: lastRecord.pos.y * gridSize }, gridSize);
          }
        }
      };

      const cleanupGraphics = () => {
        if (overlayGraphics && !overlayGraphics.destroyed) {
          overlayGraphics.clear();
          overlayGraphics.destroy();
        }
      };

      const updateOverlayText = () => {
        if (CanvasInputSession.activeSession) {
          const title = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerTitle", {
            type: typeLabel,
            name: movingToken.name,
            remaining: remainingSquares
          });
          const details = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerDamage", { damage: totalDamage });
          CanvasInputSession.activeSession.updateOverlay({
            title,
            details,
            showUndo: historyStack.length > 0,
            canUndo: historyStack.length > 0,
            canConfirm: true
          });
        }
      };

      drawOverlay();

      const initialTitle = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerTitle", {
        type: typeLabel,
        name: movingToken.name,
        remaining: remainingSquares
      });
      const initialDetails = game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerDamage", { damage: totalDamage });

      await CanvasInputSession.start({
        title: initialTitle,
        details: initialDetails,
        icon: "fas fa-compress-arrows-alt",
        showConfirm: true,
        canConfirm: true,
        showUndo: false,
        canUndo: false,
        showCancel: true,
        onPointerMove: () => {
          drawOverlay();
        },
        onClick: async (ev) => {
          if (remainingSquares <= 0) return;

          let pos;
          if (typeof ev.getLocalPosition === "function") {
            pos = ev.getLocalPosition(canvas.app.stage);
          } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
            pos = ev.data.getLocalPosition(canvas.app.stage);
          } else if (ev.interactionData && ev.interactionData.origin) {
            pos = ev.interactionData.origin;
          }
          if (!pos) return;

          const gridX = Math.floor(pos.x / gridSize);
          const gridY = Math.floor(pos.y / gridSize);

          const validSquares = this.#getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken, options);
          const isValid = validSquares.some(sq => sq.x === gridX && sq.y === gridY);

          if (isValid) {
            const collision = this.#checkCollisionAtSquare(gridX, gridY, gridSize, movingToken.id, currentPos);
            const stepRecord = {
              pos: { x: gridX, y: gridY },
              damageAdded: 0,
              collisionsAdded: [],
              prevRemaining: remainingSquares,
              wasPathStep: false
            };

            if (collision.type === "wall") {
              const damage = Math.min(10 - totalDamage, 2 * remainingSquares);
              totalDamage += damage;
              const col = { type: "wall", damage };
              collisions.push(col);
              stepRecord.damageAdded = damage;
              stepRecord.collisionsAdded.push(col);
              remainingSquares = 0;
            } else if (collision.type === "creature") {
              const col = { type: "creature", token: collision.token };
              collisions.push(col);
              stepRecord.collisionsAdded.push(col);
              remainingSquares = 0;
            } else {
              path.push({ x: gridX, y: gridY });
              currentPos = { x: gridX, y: gridY };
              remainingSquares--;
              stepRecord.wasPathStep = true;

              if (collision.type === "obstacle") {
                const damage = Math.min(10 - totalDamage, 2);
                totalDamage += damage;
                const col = { type: "obstacle", damage, region: collision.region };
                collisions.push(col);
                stepRecord.damageAdded = damage;
                stepRecord.collisionsAdded.push(col);
                await TerrainHelper.transformObstacleToRubble(collision.region);
              }
            }

            historyStack.push(stepRecord);
            drawOverlay();
            updateOverlayText();
          }
        },
        onUndo: () => {
          if (historyStack.length === 0) return;
          const lastStep = historyStack.pop();
          if (lastStep.damageAdded) totalDamage -= lastStep.damageAdded;
          if (lastStep.collisionsAdded && lastStep.collisionsAdded.length > 0) {
            for (const col of lastStep.collisionsAdded) {
              const idx = collisions.indexOf(col);
              if (idx !== -1) collisions.splice(idx, 1);
            }
          }

          // Only pop from path if this step actually added a square to path
          if (lastStep.wasPathStep && path.length > 0) {
            path.pop();
          }

          if (path.length > 0) {
            currentPos = { ...path[path.length - 1] };
          } else {
            currentPos = { ...initialPos };
          }
          remainingSquares = lastStep.prevRemaining;

          drawOverlay();
          updateOverlayText();
        },
        onConfirm: () => {
          cleanupGraphics();
          resolve({ path, collisions, totalDamage });
        },
        onCancel: () => {
          cleanupGraphics();
          resolve({ path: [], collisions: [], totalDamage: 0 });
        }
      });
    });
  }

  static #getValidSquares(movingToken, currentPos, movementType, existingPath, targetInitialPos, referenceToken, options = {}) {
    const valid = [];
    const gridSize = canvas.scene.grid.size;
    
    // Determine reference position (from reference token or terrain region center)
    let refPos = null;
    if (referenceToken) {
      refPos = {
        x: Math.floor(referenceToken.center.x / gridSize),
        y: Math.floor(referenceToken.center.y / gridSize)
      };
    } else if (options.terrainRegion) {
      const region = options.terrainRegion;
      const shape = region.shapes?.[0];
      if (shape) {
        let cx = 0, cy = 0;
        if (shape.type === "rectangle") {
          cx = shape.x + (shape.width / 2);
          cy = shape.y + (shape.height / 2);
        } else if (shape.type === "emanation" && shape.base) {
          const baseW = (shape.base.width || 1) * gridSize;
          const baseH = (shape.base.height || 1) * gridSize;
          cx = shape.base.x + (baseW / 2);
          cy = shape.base.y + (baseH / 2);
        }
        refPos = {
          x: Math.floor(cx / gridSize),
          y: Math.floor(cy / gridSize)
        };
      }
    }

    const currentDist = refPos ? Math.max(Math.abs(currentPos.x - refPos.x), Math.abs(currentPos.y - refPos.y)) : 0;

    // Adjacent squares to currentPos
    const directions = [
      {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1},
      {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}
    ];

    for (const dir of directions) {
      const testPos = { x: currentPos.x + dir.dx, y: currentPos.y + dir.dy };

      // Don't go back to a square we already visited in this path
      if (existingPath.some(sq => sq.x === testPos.x && sq.y === testPos.y)) continue;
      // Don't go back to initial position
      if (testPos.x === targetInitialPos.x && testPos.y === targetInitialPos.y) continue;

      let isValid = false;

      // Check explicit direction overrides
      if (options.direction) {
        if (options.direction === "caster_choice") {
          isValid = true;
        } else if (options.direction === "along_terrain_path" && options.pathSquares) {
          const inTerrain = options.pathSquares.some(sq => sq.x === testPos.x && sq.y === testPos.y);
          if (inTerrain) {
            // Must also be away from origin if referenceToken exists
            if (refPos) {
              const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
              isValid = testDist > currentDist;
            } else {
              isValid = true;
            }
          }
        } else if (options.direction === "toward_origin" && refPos) {
          const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
          isValid = testDist < currentDist;
        } else if (options.direction === "away_from_origin" && refPos) {
          const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
          isValid = testDist > currentDist;
        } else if (options.direction === "path_direction" && options.pathSquares) {
          // Assuming pathSquares are ordered, find current index and only allow higher indices
          const currentIdx = options.pathSquares.findIndex(sq => sq.x === currentPos.x && sq.y === currentPos.y);
          const testIdx = options.pathSquares.findIndex(sq => sq.x === testPos.x && sq.y === testPos.y);
          isValid = testIdx > currentIdx;
        }
      } else {
        // Fallback to movement type if no explicit direction provided
        if (refPos) {
          const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));
          if (movementType === this.TYPES.PUSH || movementType === this.TYPES.SHOVE || movementType === this.TYPES.DRAG) {
            isValid = testDist > currentDist;
          } else if (movementType === this.TYPES.PULL) {
            isValid = testDist < currentDist;
          } else if (movementType === this.TYPES.SWEEP) {
            isValid = true; // Any adjacent is fine
          } else {
            isValid = testDist > currentDist; // Fallback to push
          }
        } else {
           isValid = true; // No reference to push/pull against
        }
      }

      if (isValid) {
        valid.push(testPos);
      }
    }
    return valid;
  }

  static #testNativeWallCollision(fromPos, toX, toY, gridPx) {
    if (!fromPos || !canvas.ready || !canvas.walls) return false;
    
    const p0 = { x: (fromPos.x + 0.5) * gridPx, y: (fromPos.y + 0.5) * gridPx };
    const p1 = { x: (toX + 0.5) * gridPx, y: (toY + 0.5) * gridPx };

    // 1. Try canvas.walls.checkCollision with mode: "any"
    try {
      const RayClass = foundry.canvas.geometry.Ray || globalThis.Ray;
      const ray = RayClass ? new RayClass(p0, p1) : { A: p0, B: p1 };
      const res = canvas.walls.checkCollision(ray, { type: "move", mode: "any" });
      if (res === true) return true;
      if (Array.isArray(res) && res.length > 0) return true;
    } catch (e) {}

    // 2. Try polygonBackends move testCollision
    try {
      const backend = CONFIG.Canvas.polygonBackends?.move || CONFIG.Canvas.polygonBackends?.sight;
      if (backend?.testCollision) {
        const res = backend.testCollision(p0, p1, { type: "move", mode: "any" });
        if (res === true) return true;
        if (Array.isArray(res) && res.length > 0) return true;
      }
    } catch (e) {}

    return false;
  }

  static #checkCollisionAtSquare(x, y, gridPx, movingTokenId, fromPos = null) {
    const cx = (x + 0.5) * gridPx;
    const cy = (y + 0.5) * gridPx;
    
    // 1. Native Foundry Wall collision check
    if (fromPos && this.#testNativeWallCollision(fromPos, x, y, gridPx)) {
      return { type: "wall", isNative: true };
    }

    // 2. Creature collision check
    const tokens = canvas.scene?.tokens?.filter(t => t.id !== movingTokenId && !t.hidden) || [];
    for (const t of tokens) {
      const tw = (t.width || 1) * gridPx;
      const th = (t.height || 1) * gridPx;
      if (cx >= t.x && cx <= t.x + tw && cy >= t.y && cy <= t.y + th) {
        return { type: "creature", token: t };
      }
    }

    // 3. Custom Terrain Region Wall & Obstacle check
    const regions = TerrainHelper.getTerrainAtSquare(x, y, gridPx);
    for (const r of regions) {
      const cat = r.flags?.trespasser?.terrain?.system?.category;
      if (cat === "wall") {
        return { type: "wall", region: r };
      }
    }
    for (const r of regions) {
      const cat = r.flags?.trespasser?.terrain?.system?.category;
      if (cat === "obstacle") {
        return { type: "obstacle", region: r };
      }
    }

    return { type: "none" };
  }
}
