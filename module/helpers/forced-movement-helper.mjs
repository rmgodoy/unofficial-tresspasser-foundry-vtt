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

  static async executeForcedMovement(sourceToken, targets, movementType, distance) {
    if (!sourceToken || !targets || targets.length === 0 || distance <= 0) return;

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

      const result = await this.#selectForcedPath(movingToken, referenceToken, movementType, distance);
      if (result && result.path.length > 0) {
        ui.notifications.info(`Path selected for ${movingToken.name} with ${result.path.length} steps.`);
        
        const gridSize = canvas.scene.grid.size;
        
        const movingInitialX = Math.floor(movingToken.center.x / gridSize);
        const movingInitialY = Math.floor(movingToken.center.y / gridSize);
        
        // Calculate the explicit step-by-step path for moving token
        const movingPath = result.path.map(sq => ({
          x: movingToken.document.x + ((sq.x - movingInitialX) * gridSize),
          y: movingToken.document.y + ((sq.y - movingInitialY) * gridSize)
        }));

        const lastMovingSq = movingPath[movingPath.length - 1];

        const updates = [{
          _id: movingToken.id,
          x: lastMovingSq.x,
          y: lastMovingSq.y
        }];

        let compoundPath = null;

        if (movementType === this.TYPES.SHOVE || movementType === this.TYPES.DRAG) {
          const otherToken = (movementType === this.TYPES.SHOVE) ? sourceToken : targetToken;
          
          // The other token follows the exact same relative step-by-step path
          compoundPath = result.path.map(sq => ({
            x: otherToken.document.x + ((sq.x - movingInitialX) * gridSize),
            y: otherToken.document.y + ((sq.y - movingInitialY) * gridSize)
          }));
          
          const lastOtherSq = compoundPath[compoundPath.length - 1];
          
          updates.push({
            _id: otherToken.id,
            x: lastOtherSq.x,
            y: lastOtherSq.y
          });
        }

        // Add explicit paths to result for future tasks (e.g. step-by-step animation and collision)
        result.movingPath = movingPath;
        if (compoundPath) result.compoundPath = compoundPath;

        await canvas.scene.updateEmbeddedDocuments("Token", updates);
      }
    }
  }

  static async #showTargetOrderPanel(targets) {
    return new Promise((resolve) => {
      const panel = new TargetOrderingPanel(targets, resolve);
      panel.render(true);
    });
  }

  static async #selectForcedPath(movingToken, referenceToken, movementType, distance) {
    return new Promise(async (resolve) => {
      let remainingSquares = distance;
      let path = [];
      let totalDamage = 0;
      
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
      canvas.interface.addChild(overlay);

      const drawOverlay = () => {
        overlay.clear();
        if (remainingSquares <= 0) return;

        const validSquares = this.#getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken);
        
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
        canvas.stage.off("pointerdown", onClick);
        canvas.app.view.removeEventListener("contextmenu", onRightClick);
      };

      const onClick = (event) => {
        if (remainingSquares <= 0) return;
        
        const pos = event.data.getLocalPosition(canvas.app.stage);
        const gridX = Math.floor(pos.x / gridSize);
        const gridY = Math.floor(pos.y / gridSize);

        const validSquares = this.#getValidSquares(movingToken, currentPos, movementType, path, initialPos, referenceToken);
        const isValid = validSquares.some(sq => sq.x === gridX && sq.y === gridY);
        
        if (isValid) {
          path.push({x: gridX, y: gridY});
          currentPos = {x: gridX, y: gridY};
          remainingSquares--;
          updateBanner();
          drawOverlay();
          
          if (remainingSquares <= 0) {
            cleanup();
            resolve({ path, collisions: [], totalDamage });
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
      canvas.stage.on("pointerdown", onClick);
      canvas.app.view.addEventListener("contextmenu", onRightClick);
    });
  }

  static #getValidSquares(movingToken, currentPos, movementType, existingPath, targetInitialPos, referenceToken) {
    const valid = [];
    const gridSize = canvas.scene.grid.size;
    const refPos = {
      x: Math.floor(referenceToken.center.x / gridSize),
      y: Math.floor(referenceToken.center.y / gridSize)
    };

    const currentDist = Math.max(Math.abs(currentPos.x - refPos.x), Math.abs(currentPos.y - refPos.y));

    // Adjacent squares to currentPos
    const directions = [
      {dx: 0, dy: -1}, {dx: 1, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: 1},
      {dx: 0, dy: 1}, {dx: -1, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}
    ];

    for (const dir of directions) {
      const testPos = { x: currentPos.x + dir.dx, y: currentPos.y + dir.dy };
      const testDist = Math.max(Math.abs(testPos.x - refPos.x), Math.abs(testPos.y - refPos.y));

      // Don't go back to a square we already visited in this path
      if (existingPath.some(sq => sq.x === testPos.x && sq.y === testPos.y)) continue;
      // Don't go back to initial position
      if (testPos.x === targetInitialPos.x && testPos.y === targetInitialPos.y) continue;

      let isValid = false;
      if (movementType === this.TYPES.PUSH || movementType === this.TYPES.SHOVE || movementType === this.TYPES.DRAG) {
        isValid = testDist > currentDist;
      } else if (movementType === this.TYPES.PULL) {
        isValid = testDist < currentDist;
      } else if (movementType === this.TYPES.SWEEP) {
        isValid = true; // Any adjacent is fine
      } else {
        isValid = testDist > currentDist; // Fallback to push
      }

      if (isValid) {
        valid.push(testPos);
      }
    }
    return valid;
  }
}
