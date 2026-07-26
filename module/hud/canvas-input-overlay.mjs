const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api || {};

/**
 * Top floating overlay banner for canvas interactive selection sessions.
 * Built using ApplicationsV2.
 */
export class CanvasInputOverlay extends (HandlebarsApplicationMixin ? HandlebarsApplicationMixin(ApplicationV2) : class {}) {
  constructor(options = {}) {
    super(options);
    this.session = options.session;
    this.overlayData = {
      title: options.title || "",
      details: options.details || "",
      icon: options.icon || "fas fa-crosshairs",
      showConfirm: options.showConfirm ?? true,
      canConfirm: options.canConfirm ?? false,
      showUndo: options.showUndo ?? false,
      canUndo: options.canUndo ?? false,
      showCancel: options.showCancel ?? true
    };
  }

  static DEFAULT_OPTIONS = {
    id: "canvas-input-overlay",
    classes: ["trespasser", "canvas-input-overlay-window"],
    tag: "div",
    window: {
      frame: false,
      title: "",
      resizable: false,
      minimizable: false
    },
    position: {
      width: "auto",
      height: "auto",
      top: 20
    },
    actions: {
      confirm: CanvasInputOverlay.#onConfirm,
      undo: CanvasInputOverlay.#onUndo,
      cancel: CanvasInputOverlay.#onCancel
    }
  };

  static PARTS = {
    banner: {
      template: "systems/trespasser/templates/hud/canvas-input-overlay.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    return {
      ...this.overlayData
    };
  }

  /**
   * Update overlay state dynamically and re-render context.
   * @param {object} newState
   */
  updateState(newState = {}) {
    Object.assign(this.overlayData, newState);
    this.render(false);
  }

  static #onConfirm(event, target) {
    event.preventDefault();
    if (this.session) this.session.confirm();
  }

  static #onUndo(event, target) {
    event.preventDefault();
    if (this.session) this.session.undo();
  }

  static #onCancel(event, target) {
    event.preventDefault();
    if (this.session) this.session.cancel();
  }
}
