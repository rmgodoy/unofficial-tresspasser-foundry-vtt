import { TerrainHelper } from "./terrain-helper.mjs";

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
      targets: this.targets.map(t => ({ id: t.id, name: t.name, img: t.document.texture.src }))
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
    if (!targets || targets.length === 0 || distance <= 0) return;

    // sourceToken can be null if direction is caster_choice or along_terrain_path
    if (!sourceToken && (!options.direction || (options.direction !== "caster_choice" && options.direction !== "along_terrain_path"))) return;

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
        if (result.path.length > 0) {
          ui.notifications.info(`Path selected for ${movingToken.name} with ${result.path.length} steps.`);
          
          const gridSize = canvas.scene.grid.size;
          
          const movingInitialX = Math.floor(movingToken.center.x / gridSize);
          const movingInitialY = Math.floor(movingToken.center.y / gridSize);
          
          // Calculate the explicit step-by-step path for moving token
          const movingPath = result.path.map(sq => ({
            x: movingToken.document.x + ((sq.x - movingInitialX) * gridSize),
            y: movingToken.document.y + ((sq.y - movingInitialY) * gridSize)
          }));

          let otherToken = null;
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

          await this.#animateTokenAlongPath(movingToken, movingPath, otherToken, compoundPath);
        }

        await this.#postCollisionDamage(targetToken, result.collisions, result.totalDamage);
      }
    }
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

      await canvas.scene.updateEmbeddedDocuments("Token", updates);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  static async #postCollisionDamage(targetToken, collisions, totalDamage) {
    if (!collisions || collisions.length === 0 || totalDamage <= 0) return;

    const actor = targetToken.actor;
    if (!actor) return;

    const newHp = Math.max(0, actor.system.health - totalDamage);
    await actor.update({ "system.health": newHp });

    const lines = collisions.map(c => {
      if (c.type === "wall") {
        return `<li><span style="color:var(--trp-red, #c44);">⚡ ${c.damage} Damage</span> — Wall Collision</li>`;
      } else if (c.type === "obstacle") {
        return `<li><span style="color:var(--trp-red, #c44);">⚡ ${c.damage} Damage</span> — Obstacle Collision (${c.region.name})</li>`;
      }
      return "";
    }).filter(Boolean);

    const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;
    
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flavor: `💥 Forced Movement Collision (${totalDamage} Total Damage)`
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
      
      const gridSize = canvas.scene.grid.size;
      const initialPos = { 
        x: Math.floor(movingToken.center.x / gridSize), 
        y: Math.floor(movingToken.center.y / gridSize) 
      };
      let currentPos = { ...initialPos };

      const typeKey = Object.values(this.TYPES).includes(movementType) ? movementType : "push";

      const bannerHtml = await foundry.applications.handlebars.renderTemplate("systems/trespasser/templates/hud/forced-movement-banner.hbs", {
        title: game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerTitle", {
          type: game.i18n.localize(`TRESPASSER.HUD.ForcedMovement.Types.${typeKey}`),
          name: movingToken.name,
          remaining: remainingSquares
        }),
        damageText: game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerDamage", { damage: totalDamage })
      });
      
      const bannerEl = $(bannerHtml);
      $("body").append(bannerEl);

      const updateBanner = () => {
        bannerEl.find(".fm-title").text(game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerTitle", {
          type: game.i18n.localize(`TRESPASSER.HUD.ForcedMovement.Types.${typeKey}`),
          name: movingToken.name,
          remaining: remainingSquares
        }));
        bannerEl.find(".fm-damage").text(game.i18n.format("TRESPASSER.HUD.ForcedMovement.BannerDamage", { damage: totalDamage }));
      };

      // Graphics for overlay
      const overlay = new PIXI.Graphics();
      // Make overlay interactive to catch clicks before they hit tokens
      overlay.eventMode = "static";
      overlay.interactive = true; 
      overlay.zIndex = 9999;
      canvas.interface.addChild(overlay);

      const drawOverlay = () => {
        overlay.clear();

        // Draw invisible background to capture all clicks
        if (canvas.dimensions) {
          overlay.beginFill(0x000000, 0.0);
          overlay.drawRect(0, 0, canvas.dimensions.width, canvas.dimensions.height);
          overlay.endFill();
        }

        if (remainingSquares <= 0) return;

        const validSquares = this.#getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken, options);
        
        overlay.beginFill(0x00ff00, 0.3);
        overlay.lineStyle(2, 0x00ff00, 0.8);
        
        for (const sq of validSquares) {
          overlay.drawRect(sq.x * gridSize, sq.y * gridSize, gridSize, gridSize);
        }
        overlay.endFill();
        
        // Draw the path so far
        if (path.length > 0) {
          overlay.beginFill(0x0000ff, 0.4);
          overlay.lineStyle(2, 0x0000ff, 0.8);
          for (const sq of path) {
             overlay.drawRect(sq.x * gridSize, sq.y * gridSize, gridSize, gridSize);
          }
          overlay.endFill();
        }
      };

      const cleanup = () => {
        bannerEl.remove();
        canvas.interface.removeChild(overlay);
        overlay.destroy();
        canvas.app.view.removeEventListener("contextmenu", onRightClick);
      };

      const onClick = async (event) => {
        event.stopPropagation(); // Stop click from reaching tokens below

        if (remainingSquares <= 0) return;
        
        const pos = event.data.getLocalPosition(canvas.app.stage);
        const gridX = Math.floor(pos.x / gridSize);
        const gridY = Math.floor(pos.y / gridSize);

        const validSquares = this.#getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken, options);
        const isValid = validSquares.some(sq => sq.x === gridX && sq.y === gridY);
        
        if (isValid) {
          const collision = this.#checkCollisionAtSquare(gridX, gridY, gridSize, movingToken.id);

          if (collision.type === "wall") {
            const damage = Math.min(10 - totalDamage, 2 * remainingSquares);
            totalDamage += damage;
            collisions.push({ type: "wall", damage });
            remainingSquares = 0; // stop path here
          } else if (collision.type === "creature") {
            collisions.push({ type: "creature", token: collision.token });
            remainingSquares = 0; // stop path here
          } else {
            path.push({x: gridX, y: gridY});
            currentPos = {x: gridX, y: gridY};
            remainingSquares--;

            if (collision.type === "obstacle") {
              const damage = Math.min(10 - totalDamage, 2);
              totalDamage += damage;
              collisions.push({ type: "obstacle", damage, region: collision.region });
              await TerrainHelper.transformObstacleToRubble(collision.region);
            }
          }

          updateBanner();
          drawOverlay();
          
          if (remainingSquares <= 0) {
            cleanup();
            resolve({ path, collisions, totalDamage });
          }
        }
      };

      const onRightClick = (event) => {
        event.preventDefault();
        if (path.length > 0) {
          path.pop();
          if (path.length > 0) {
            currentPos = path[path.length - 1];
          } else {
            currentPos = { ...initialPos };
          }
          remainingSquares++;
          updateBanner();
          drawOverlay();
        } else {
          // If path is empty, cancel the movement
          cleanup();
          resolve({ path: [], collisions: [], totalDamage: 0 });
        }
      };

      drawOverlay();
      
      // Setup listeners
      overlay.on("pointerdown", onClick);
      canvas.app.view.addEventListener("contextmenu", onRightClick);
    });
  }

  static #getValidSquares(movingToken, currentPos, movementType, existingPath, targetInitialPos, referenceToken, options = {}) {
    const valid = [];
    const gridSize = canvas.scene.grid.size;
    
    // Some modes don't have a reference token (like along_terrain_path if caster is null)
    const refPos = referenceToken ? {
      x: Math.floor(referenceToken.center.x / gridSize),
      y: Math.floor(referenceToken.center.y / gridSize)
    } : null;

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

  static #checkCollisionAtSquare(x, y, gridPx, movingTokenId) {
    const cx = (x + 0.5) * gridPx;
    const cy = (y + 0.5) * gridPx;
    
    const tokens = canvas.scene.tokens.filter(t => t.id !== movingTokenId && !t.hidden);
    for (const t of tokens) {
      const tw = (t.width || 1) * gridPx;
      const th = (t.height || 1) * gridPx;
      if (cx >= t.x && cx <= t.x + tw && cy >= t.y && cy <= t.y + th) {
        return { type: "creature", token: t };
      }
    }

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
