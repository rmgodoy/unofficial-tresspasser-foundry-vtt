const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api || {};

export class TargetOrderingPanel extends (HandlebarsApplicationMixin ? HandlebarsApplicationMixin(ApplicationV2) : class {}) {
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
      
      this.targets = [];
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

export async function showTargetOrderPanel(targets) {
  return new Promise((resolve) => {
    const panel = new TargetOrderingPanel(targets, resolve);
    panel.render(true);
  });
}
