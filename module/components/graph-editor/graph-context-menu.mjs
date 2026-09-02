/**
 * graph-context-menu.mjs
 * Floating right-click context menu for adding behavior nodes to the graph.
 */

export const BEHAVIOR_CATEGORIES = [
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Targeting",
    types: ["selectTarget", "selectArea"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Rolling",
    types: ["roll", "rollAccuracy"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.DamageHealing",
    types: ["applyDamage", "healTarget", "grantRecovery"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Effects",
    types: ["applyEffects"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Movement",
    types: ["moveSource", "forceMoveTargets"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Terrain",
    types: ["spawnTerrain", "moveTerrain"]
  },
  {
    categoryKey: "TRESPASSER.Sheet.Deed.Behavior.Category.Flow",
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

    const menu = document.createElement("div");
    menu.className = "graph-context-menu";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const titleEl = document.createElement("div");
    titleEl.className = "context-menu-title";
    titleEl.innerHTML = `<i class="fas fa-plus"></i> ${game.i18n.localize("TRESPASSER.Sheet.Deed.Graph.AddNode") || "Add Node"}`;
    menu.appendChild(titleEl);

    for (const group of BEHAVIOR_CATEGORIES) {
      const groupEl = document.createElement("div");
      groupEl.className = "context-menu-group";

      const groupHeader = document.createElement("div");
      groupHeader.className = "context-menu-group-label";
      groupHeader.textContent = game.i18n.localize(group.categoryKey) || group.categoryKey.split(".").pop();
      groupEl.appendChild(groupHeader);

      for (const type of group.types) {
        const itemEl = document.createElement("div");
        itemEl.className = "context-menu-item";
        itemEl.dataset.type = type;

        const label = game.i18n.localize(`TRESPASSER.Sheet.Deed.Behavior.Type.${type}`) || type;
        itemEl.innerHTML = `<span class="item-name">${label}</span>`;

        itemEl.addEventListener("click", (e) => {
          e.stopPropagation();
          GraphContextMenu.close();
          if (typeof onSelect === "function") {
            onSelect(type, canvasX, canvasY);
          }
        });

        groupEl.appendChild(itemEl);
      }

      menu.appendChild(groupEl);
    }

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

    setTimeout(() => {
      window.addEventListener("pointerdown", onOutsideClick, { capture: true, once: true });
      window.addEventListener("keydown", onKeyDown, { once: true });
    }, 10);

    parentEl.appendChild(menu);
    this._currentMenu = menu;
  }

  /**
   * Closes any active context menu.
   */
  static close() {
    if (this._currentMenu) {
      this._currentMenu.remove();
      this._currentMenu = null;
    }
  }
}
