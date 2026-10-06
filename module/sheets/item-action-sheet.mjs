import { TrespasserItemSheet } from "./base-sheet.mjs";
import { mountGraphEditor, unmountGraphEditor } from "./deed/deed-graph-manager.mjs";
import { handleDeedSwitchTab } from "./deed/deed-tab-manager.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Item Sheet for Trespasser Actions.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserActionSheet extends TrespasserItemSheet {

  /**
   * Reference to active GraphEditor instance when the Behaviors tab is active.
   * @type {GraphEditor|null}
   */
  graphEditor = null;

  /**
   * Reference to active GraphPropertiesPanel instance when the Behaviors tab is active.
   * @type {GraphPropertiesPanel|null}
   */
  propertiesPanel = null;

  /**
   * Cached viewport state (pan, zoom, selected node) to persist across renders and form submissions.
   * @type {{panX: number, panY: number, zoom: number, selectedNodeId: string|null}|null}
   * @protected
   */
  _graphViewportState = null;

  /**
   * Cached previous window width when switching into the behaviors tab.
   * @type {number|null}
   * @protected
   */
  _previousWidth = null;

  /**
   * Flag indicating if the user has manually resized the window during this session.
   * @type {boolean}
   * @protected
   */
  _hasManuallyResized = false;

  /**
   * Guard flag to distinguish internal auto-resizing from user manual resizing.
   * @type {boolean}
   * @protected
   */
  _isAutoResizing = false;

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "action", "item-sheet"],
    position: { width: 560, height: 640 },
    actions: {
      switchTab: TrespasserActionSheet.#onSwitchTab
    },
    form: {
      handler: TrespasserActionSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: {
      resizable: true,
      focusElement: null
    }
  };

  static PARTS = {
    header: {
      template: "systems/trespasser/templates/item/action/header.hbs"
    },
    tabs: {
      template: "systems/trespasser/templates/item/action/tabs.hbs"
    },
    details: {
      template: "systems/trespasser/templates/item/action/details.hbs",
      scrollable: ["", ".deed-details"]
    },
    behaviors: {
      template: "systems/trespasser/templates/item/action/behaviors.hbs"
    }
  };

  static TABS = {
    details:   { id: "details",   group: "primary", label: "TRESPASSER.Sheet.Deed.Tabs.Details",   icon: "list" },
    behaviors: { id: "behaviors", group: "primary", label: "TRESPASSER.Sheet.Deed.Tabs.Behaviors", icon: "diagram-project" }
  };

  tabGroups = { primary: "details" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Item.${this.document.type}`) || "Action";
    return `${typeLabel}: ${this.document.name}`;
  }

  _prepareTabs(parts) {
    return Object.values(this._getTabs());
  }

  _getTabs() {
    const tabs = {};
    for (const [id, config] of Object.entries(this.constructor.TABS)) {
      tabs[id] = {
        ...config,
        active: this.tabGroups[config.group] === id,
        cssClass: this.tabGroups[config.group] === id ? "active" : "",
        label: game.i18n.localize(config.label)
      };
    }
    return tabs;
  }

  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;
    context.tab = context.tabs[partId] ?? { active: partId === this.tabGroups.primary };
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    context.item = item;
    context.system = item.system;
    context.editable = this.isEditable;
    context.tabs = this._getTabs();

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    context.graph = item.system.graph ?? { nodes: [], connections: [] };

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const selectOnFocus = this.element.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }

    // Intercept change events from prose-mirror
    this.element.addEventListener("change", (ev) => {
      const pm = ev.target.closest("prose-mirror");
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) {
            this.document.update({ "system.description": pm.value });
          }
        }, 0);
      }
    }, true);

    // Track manual resizing
    const resizeHandle = this.element.querySelector(".window-resize-handle");
    if (resizeHandle && !resizeHandle._actionResizeBound) {
      resizeHandle._actionResizeBound = true;
      resizeHandle.addEventListener("pointerdown", () => {
        const startW = this.position.width;
        const startH = this.position.height;
        const win = this.element.ownerDocument.defaultView || window;
        const onPointerUp = () => {
          win.removeEventListener("pointerup", onPointerUp);
          if (this.position.width !== startW || this.position.height !== startH) {
            this._hasManuallyResized = true;
          }
        };
        win.addEventListener("pointerup", onPointerUp);
      });
    }

    // Mount or refresh GraphEditor and GraphPropertiesPanel when Behaviors tab is active
    const isBehaviorsTab = this.tabGroups.primary === "behaviors";
    const graphContainer = this.element.querySelector(".deed-graph-container");
    const propertiesContainer = this.element.querySelector(".deed-graph-properties");

    if (graphContainer && propertiesContainer && isBehaviorsTab) {
      this._mountGraphEditor(graphContainer, propertiesContainer);
    } else if (!isBehaviorsTab) {
      this._unmountGraphEditor();
    }
  }

  _mountGraphEditor(graphContainer, propertiesContainer) {
    mountGraphEditor(this, graphContainer, propertiesContainer);
  }

  _unmountGraphEditor() {
    unmountGraphEditor(this);
  }

  _rebindGraphOnHostChange() {
    if (this.tabGroups.primary !== "behaviors") return;
    const graphContainer = this.element?.querySelector(".deed-graph-container");
    const propertiesContainer = this.element?.querySelector(".deed-graph-properties");
    if (graphContainer && propertiesContainer) {
      this._mountGraphEditor(graphContainer, propertiesContainer);
    }
  }

  /** @override */
  _onDetach(from, to) {
    if (super._onDetach) super._onDetach(from, to);
    this._rebindGraphOnHostChange();
  }

  /** @override */
  _onAttach(from, to) {
    if (super._onAttach) super._onAttach(from, to);
    this._rebindGraphOnHostChange();
  }

  /** @override */
  bringToFront() {
    if (!this.rendered || !this.element) return;
    try {
      return super.bringToFront();
    } catch (err) {
      if (err instanceof TypeError && err.message?.includes("focus")) {
        return;
      }
      throw err;
    }
  }

  /** @override */
  setPosition(position = {}) {
    if (!this._isAutoResizing && this.rendered) {
      if (position.width !== undefined && this.position.width !== undefined) {
        if (Math.round(position.width) !== Math.round(this.position.width)) {
          this._hasManuallyResized = true;
        }
      }
    }
    return super.setPosition(position);
  }

  /** @override */
  _onClose(options) {
    this._hasManuallyResized = false;
    this._isAutoResizing = false;
    this._previousWidth = null;
    this._unmountGraphEditor();
    super._onClose(options);
  }

  // ── Form Submission Handler ──────────────────────────────────────────────────

  static async #onSubmit(event, form, formData) {
    if (!this.isEditable) return;
    if (this.graphEditor) {
      this._graphViewportState = this.graphEditor.getViewportState();
      formData.object[`flags.${SYSTEM_ID}.graphViewport`] = this._graphViewportState;

      for (const key of Object.keys(formData.object)) {
        if (key.startsWith("system.graph.nodes.")) {
          delete formData.object[key];
        }
      }
      if (formData.object.system?.graph?.nodes) {
        delete formData.object.system.graph.nodes;
      }

      formData.object["system.graph"] = this.graphEditor.getGraph();
      formData.object["system.graphVersion"] = 1;
    }
    await this.document.update(formData.object);
  }

  // ── Action Handlers ──────────────────────────────────────────────────────────

  static async #onSwitchTab(event, target) {
    return handleDeedSwitchTab(this, event, target);
  }
}
