/**
 * graph-context-menu.mjs
 * Floating right-click context menu with category submenus for adding behavior nodes to the graph.
 */
import { BEHAVIOR_ICONS } from "./graph-node.mjs";

export const BEHAVIOR_CATEGORIES = [
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Targeting",
    icon: "fa-bullseye",
    types: ["selectTarget", "selectArea"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Rolling",
    icon: "fa-dice-d20",
    types: ["roll", "rollAccuracy"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.DamageHealing",
    icon: "fa-heart-pulse",
    types: ["applyDamage", "healTarget", "grantRecovery"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Effects",
    icon: "fa-wand-magic-sparkles",
    types: ["applyEffects"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Movement",
    icon: "fa-person-running",
    types: ["moveSource", "forceMoveTargets"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Terrain",
    icon: "fa-mountain",
    types: ["spawnTerrain", "moveTerrain"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Flow",
    icon: "fa-code-branch",
    types: ["clearTargets", "executeDeed"]
  }
];

export class GraphContextMenu {
  /**
   * Shows the context menu at specified viewport coordinates.
   * @param {object} options
   * @param {number} options.x - Screen X
   * @param {number} options.y - Screen Y
   * @param {number} options.canvasX - Canvas coordinate X
   * @param {number} options.canvasY - Canvas coordinate Y
   * @param {HTMLElement} options.parentEl - Parent container element
   * @param {Function} options.onSelect - Callback(type, canvasX, canvasY)
   */
  static show({ x, y, canvasX, canvasY, parentEl, onSelect }) {
    this.close();

    const doc = parentEl?.ownerDocument || document;
    const win = doc.defaultView || window;

    const menu = doc.createElement("div");
    menu.className = "graph-context-menu";

    // Clamp initial menu position so it doesn't spawn outside viewport
    const initialX = Math.max(10, Math.min(x, win.innerWidth - 220));
    const initialY = Math.max(10, Math.min(y, win.innerHeight - 320));
    menu.style.left = `${initialX}px`;
    menu.style.top = `${initialY}px`;

    const titleEl = doc.createElement("div");
    titleEl.className = "context-menu-title";
    titleEl.innerHTML = `<i class="fas fa-plus"></i><span>${game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.AddNode") || "Add Node"}</span>`;
    menu.appendChild(titleEl);

    const listEl = doc.createElement("div");
    listEl.className = "context-menu-list";

    let activeCategoryEl = null;
    let switchTimeout = null;
    let closeTimeout = null;

    for (const group of BEHAVIOR_CATEGORIES) {
      const categoryEl = doc.createElement("div");
      categoryEl.className = "context-menu-category-item";

      const categoryLabel = game.i18n.localize(group.categoryKey) || group.categoryKey.split(".").pop();
      const categoryIcon = group.icon || "fa-folder";

      const labelWrapper = doc.createElement("div");
      labelWrapper.className = "category-item-label";
      labelWrapper.innerHTML = `<i class="fas ${categoryIcon}"></i><span>${categoryLabel}</span>`;

      const arrowEl = doc.createElement("i");
      arrowEl.className = "fas fa-chevron-right category-arrow";

      categoryEl.appendChild(labelWrapper);
      categoryEl.appendChild(arrowEl);

      // Submenu container
      const submenuEl = doc.createElement("div");
      submenuEl.className = "context-submenu";

      for (const type of group.types) {
        const itemEl = doc.createElement("div");
        itemEl.className = "context-menu-item";
        itemEl.dataset.type = type;

        const label = game.i18n.localize(`TRESPASSER.Sheet.Deed.Behavior.Type.${type}`) || type;
        const icon = BEHAVIOR_ICONS[type] || "fa-cube";
        itemEl.innerHTML = `<i class="fas ${icon} item-icon"></i><span class="item-name">${label}</span>`;

        itemEl.addEventListener("click", (e) => {
          e.stopPropagation();
          GraphContextMenu.close();
          if (typeof onSelect === "function") {
            onSelect(type, canvasX, canvasY);
          }
        });

        submenuEl.appendChild(itemEl);
      }

      categoryEl.appendChild(submenuEl);

      const positionSubmenu = () => {
        submenuEl.classList.remove("flyout-left");
        submenuEl.style.top = "-4px";

        const rect = submenuEl.getBoundingClientRect();
        // Flip left if overflowing right viewport edge
        if (rect.right > win.innerWidth - 10) {
          submenuEl.classList.add("flyout-left");
        }

        // Adjust top if overflowing bottom viewport edge
        if (rect.bottom > win.innerHeight - 10) {
          const overflow = rect.bottom - (win.innerHeight - 10);
          submenuEl.style.top = `${-overflow - 4}px`;
        }
      };

      categoryEl.addEventListener("mouseenter", () => {
        clearTimeout(closeTimeout);

        if (activeCategoryEl === categoryEl) {
          clearTimeout(switchTimeout);
          return;
        }

        // If another submenu is open, use a small 100ms grace period so diagonal movements
        // toward the open submenu don't instantly close it
        const delay = activeCategoryEl ? 100 : 0;
        clearTimeout(switchTimeout);

        switchTimeout = setTimeout(() => {
          if (activeCategoryEl && activeCategoryEl !== categoryEl) {
            activeCategoryEl.classList.remove("active");
            activeCategoryEl.querySelector(".context-submenu")?.classList.remove("visible");
          }
          activeCategoryEl = categoryEl;
          categoryEl.classList.add("active");
          submenuEl.classList.add("visible");
          positionSubmenu();
        }, delay);
      });

      categoryEl.addEventListener("mouseleave", (e) => {
        // Only trigger close if pointer is not moving into the submenu
        if (!categoryEl.contains(e.relatedTarget)) {
          clearTimeout(switchTimeout);
          closeTimeout = setTimeout(() => {
            if (activeCategoryEl === categoryEl) {
              categoryEl.classList.remove("active");
              submenuEl.classList.remove("visible");
              activeCategoryEl = null;
            }
          }, 150);
        }
      });

      // Keep open when entering the submenu
      submenuEl.addEventListener("mouseenter", () => {
        clearTimeout(switchTimeout);
        clearTimeout(closeTimeout);
        activeCategoryEl = categoryEl;
        categoryEl.classList.add("active");
        submenuEl.classList.add("visible");
      });

      categoryEl.addEventListener("click", (e) => {
        e.stopPropagation();
        clearTimeout(switchTimeout);
        clearTimeout(closeTimeout);
        const isVisible = submenuEl.classList.contains("visible");
        listEl.querySelectorAll(".context-submenu.visible").forEach(s => s.classList.remove("visible"));
        listEl.querySelectorAll(".context-menu-category-item.active").forEach(c => c.classList.remove("active"));
        if (!isVisible) {
          activeCategoryEl = categoryEl;
          categoryEl.classList.add("active");
          submenuEl.classList.add("visible");
          positionSubmenu();
        } else {
          activeCategoryEl = null;
        }
      });

      listEl.appendChild(categoryEl);
    }

    menu.appendChild(listEl);

    // Dismiss listeners
    const onOutsideClick = (e) => {
      if (!menu.contains(e.target)) {
        GraphContextMenu.close();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        GraphContextMenu.close();
      }
    };

    const dismissTimeout = setTimeout(() => {
      win.addEventListener("pointerdown", onOutsideClick, { capture: true, once: true });
      win.addEventListener("keydown", onKeyDown, { once: true });
    }, 10);

    parentEl.appendChild(menu);
    this._currentMenu = menu;
    this._cleanDismissListeners = () => {
      clearTimeout(dismissTimeout);
      win.removeEventListener("pointerdown", onOutsideClick, { capture: true });
      win.removeEventListener("keydown", onKeyDown);
    };
  }

  /**
   * Closes any active context menu.
   */
  static close() {
    if (this._currentMenu) {
      this._currentMenu.remove();
      this._currentMenu = null;
    }
    if (this._cleanDismissListeners) {
      this._cleanDismissListeners();
      this._cleanDismissListeners = null;
    }
  }
}
