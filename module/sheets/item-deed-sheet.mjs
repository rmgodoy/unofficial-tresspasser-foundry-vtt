import { BEHAVIOR_TYPES } from "../data/item-deed.mjs";
import { TrespasserItemSheet } from "./base-sheet.mjs";
import { GraphEditor } from "../components/graph-editor/graph-editor.mjs";

export const DEFAULT_PARAMS = {
  selectTarget: {
    targetMode: "creatures",
    disposition: "any",
    targetCount: 1,
    aoeType: "blast",
    aoeSize: 1,
    areaRelation: "inside",
    ignoreSelf: false,
    chooseCreatures: false
  },
  selectArea: {
    targetMode: "squares",
    targetCount: 1,
    aoeType: "blast",
    aoeSize: 1
  },
  roll: {
    expression: "",
    rollBehaviorId: "",
    usePowerSparks: false
  },
  rollAccuracy: {},
  applyDamage: {
    expression: "",
    rollBehaviorId: "",
    distribute: false
  },
  healTarget: { expression: "", rollBehaviorId: "", distribute: false },
  grantRecovery: { intensity: 1 },
  applyEffects: {
    effects: [],
    appliesWeaponEffects: false
  },
  spawnTerrain: {
    terrainUuid: "",
    terrainName: "",
    terrainImg: "",
    placement: "on_target",
    ignoreSourceSquare: false
  },
  moveTerrain: {
    terrainBehaviorId: ""
  },
  moveSource: {
    destinationMode: "distance",
    movementType: "walk",
    distance: 1
  },
  forceMoveTargets: {
    type: "push",
    distance: 1
  },
  clearTargets: {},
  executeDeed: {
    deedUuid: "",
    deedName: "",
    deedImg: ""
  }
};

export class TrespasserDeedSheet extends TrespasserItemSheet {

  /**
   * Reference to active GraphEditor instance when the Behaviors tab is active.
   * @type {GraphEditor|null}
   */
  graphEditor = null;

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

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "deed", "item-sheet"],
    position: { width: 620, height: 720 },
    actions: {
      switchTab: TrespasserDeedSheet.#onSwitchTab
    },
    form: {
      handler: TrespasserDeedSheet.#onSubmit,
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
      template: "systems/trespasser/templates/item/deed/header.hbs"
    },
    tabs: {
      template: "systems/trespasser/templates/item/deed/tabs.hbs"
    },
    details: {
      template: "systems/trespasser/templates/item/deed/details.hbs",
      scrollable: ["", ".deed-details"]
    },
    phases: {
      template: "systems/trespasser/templates/item/deed/phases.hbs",
      scrollable: ["", ".deed-phases-container"]
    },
    behaviors: {
      template: "systems/trespasser/templates/item/deed/behaviors.hbs"
    }
  };

  static TABS = {
    details:   { id: "details",   group: "primary", label: "TRESPASSER.Sheet.Tabs.Details",   icon: "list" },
    phases:    { id: "phases",    group: "primary", label: "TRESPASSER.Sheet.Tabs.Phases",    icon: "layer-group" },
    behaviors: { id: "behaviors", group: "primary", label: "TRESPASSER.Sheet.Tabs.Behaviors", icon: "diagram-project" }
  };

  tabGroups = { primary: "details" };

  /** @override */
  get title() {
    return `${game.i18n.localize("TYPES.Item.deed")}: ${this.document.name}`;
  }

  _prepareTabs(parts) {
    const tabs = {};
    for (const [id, config] of Object.entries(this.constructor.TABS)) {
      tabs[id] = {
        ...config,
        active: this.tabGroups[config.group] === id,
        cssClass: this.tabGroups[config.group] === id ? "active" : "",
        label: game.i18n.localize(config.label)
      };
    }
    return Object.values(tabs);
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

    context.config = {
      tiers: {
        light: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Light"),
        heavy: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Heavy"),
        mighty: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Mighty"),
        special: game.i18n.localize("TRESPASSER.Sheet.Item.Details.Tiers.Special")
      },
      actionTypes: {
        attack: game.i18n.localize("TRESPASSER.Sheet.Item.Details.ActionTypeChoices.Attack"),
        support: game.i18n.localize("TRESPASSER.Sheet.Item.Details.ActionTypeChoices.Support")
      },
      abilityTypes: {
        innate: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Innate"),
        melee: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Melee"),
        missile: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Missile"),
        spell: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Spell"),
        tool: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Tool"),
        unarmed: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Unarmed"),
        versatile: game.i18n.localize("TRESPASSER.Sheet.Item.Details.TypeChoices.Versatile")
      },
      versusChoices: {
        Guard: game.i18n.localize("TRESPASSER.Sheet.Combat.Guard"),
        Resist: game.i18n.localize("TRESPASSER.Sheet.Combat.Resist"),
        "10": "10"
      }
    };

    const phaseKeys = ["start", "before", "base", "hit", "spark", "after", "end"];
    context.phases = phaseKeys.map(key => {
      const phaseData = item.system.phases?.[key] ?? { description: "", skipPhase: false };
      return {
        key,
        label: game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${key.charAt(0).toUpperCase() + key.slice(1)}`),
        description: phaseData.description ?? "",
        skipPhase: phaseData.skipPhase ?? false
      };
    });

    context.graph = item.system.graph ?? { nodes: [], connections: [] };

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const selectOnFocus = this.element.querySelectorAll(".select-on-focus");
    for (const input of selectOnFocus) {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    }

    // Mount or refresh GraphEditor when Behaviors tab is active
    const graphContainer = this.element.querySelector(".deed-graph-container");
    if (graphContainer) {
      if (this.graphEditor) {
        this._graphViewportState = this.graphEditor.getViewportState();
        this.graphEditor.destroy();
      }

      const savedState = this._graphViewportState || this.document.getFlag("trespasser", "graphViewport");

      this.graphEditor = new GraphEditor(graphContainer, {
        readOnly: !this.isEditable,
        panX: savedState?.panX ?? 40,
        panY: savedState?.panY ?? 40,
        zoom: savedState?.zoom ?? 1.0,
        selectedNodeId: savedState?.selectedNodeId ?? null,
        onGraphChange: async (graphData) => {
          if (this.graphEditor) {
            this._graphViewportState = this.graphEditor.getViewportState();
          }
          await this.document.update({
            "system.graph": graphData,
            "flags.trespasser.graphViewport": this._graphViewportState
          });
        },
        onViewportChange: (viewportState) => {
          this._graphViewportState = viewportState;
        },
        onNodeSelect: (nodeData) => {
          if (this.graphEditor) {
            this._graphViewportState = this.graphEditor.getViewportState();
          }
        }
      });

      const nodes = this.document.system.graph?.nodes || [];
      const connections = this.document.system.graph?.connections || [];
      this.graphEditor.setGraph(nodes, connections);

      if (savedState?.selectedNodeId) {
        this.graphEditor.selectNode(savedState.selectedNodeId);
      }
    }
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
  _onClose(options) {
    if (this.graphEditor) {
      this.graphEditor.destroy();
      this.graphEditor = null;
    }
    super._onClose(options);
  }

  // ── Form Submission Handler ──────────────────────────────────────────────────

  static async #onSubmit(event, form, formData) {
    if (this.graphEditor) {
      this._graphViewportState = this.graphEditor.getViewportState();
      formData.object["flags.trespasser.graphViewport"] = this._graphViewportState;
    }
    await this.document.update(formData.object);
  }

  // ── Action Handlers ──────────────────────────────────────────────────────────

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      const prevTab = this.tabGroups.primary;
      this.tabGroups.primary = tab;

      // Auto-resize window width when switching to/from behaviors tab
      if (tab === "behaviors" && prevTab !== "behaviors") {
        this._previousWidth = this.position.width || 620;
        const targetWidth = Math.max(950, this._previousWidth);
        this.setPosition({ width: targetWidth });
      } else if (prevTab === "behaviors" && tab !== "behaviors") {
        const targetWidth = this._previousWidth || 620;
        this.setPosition({ width: targetWidth });
      }

      this.render();
    }
  }
}
