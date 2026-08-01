import { CanvasInputOverlay } from "../hud/canvas-input-overlay.mjs";

/**
 * Manages an interactive canvas input session (selecting target, AoE, movement, forced movement, etc.).
 * Coordinates PIXI canvas graphics, standard pointer events, ESC listener, and top AppV2 banner overlay.
 */
export class CanvasInputSession {
  /** @type {CanvasInputSession|null} Active session instance */
  static activeSession = null;

  /**
   * Start a canvas input session.
   * @param {object} config
   * @param {string} [config.title]
   * @param {string} [config.details]
   * @param {string} [config.icon]
   * @param {boolean} [config.showConfirm=true]
   * @param {boolean} [config.canConfirm=false]
   * @param {boolean} [config.showUndo=false]
   * @param {boolean} [config.canUndo=false]
   * @param {boolean} [config.showCancel=true]
   * @param {Function} [config.onPointerMove] Callback: (event, session) => void
   * @param {Function} [config.onClick] Callback: (event, session) => void
   * @param {Function} [config.onConfirm] Callback: (session) => any
   * @param {Function} [config.onUndo] Callback: (session) => void
   * @param {Function} [config.onCancel] Callback: (session) => void
   * @returns {Promise<any>} Resolves with result on confirm, or null on cancel.
   */
  static async start(config = {}) {
    if (this.activeSession) {
      this.activeSession.cancel();
    }

    const session = new CanvasInputSession(config);
    this.activeSession = session;
    return session._init();
  }

  constructor(config) {
    this.config = config;
    this.overlay = null;
    this.graphics = new PIXI.Graphics();
    this.resolvePromise = null;
    this.isCompleted = false;

    /** @type {Map<string, string>} Saved token eventMode values keyed by token id */
    this._savedTokenEventModes = new Map();

    this._onPointerMoveBound = this._onPointerMove.bind(this);
    this._onClickBound = this._onClick.bind(this);
    this._onKeyDownBound = this._onKeyDown.bind(this);
  }

  async _init() {
    return new Promise(async (resolve) => {
      this.resolvePromise = resolve;

      // Disable token interactivity so clicks pass through to canvas.stage
      // This allows clicking on squares occupied by tokens (critical for GM usage)
      this._disableTokenInteractivity();

      // Add PIXI graphics layer to canvas interface
      if (canvas.interface) {
        canvas.interface.addChild(this.graphics);
      }

      // Add canvas pointer listeners (left-click only, right-click remains free for panning)
      if (canvas.stage) {
        canvas.stage.on("pointermove", this._onPointerMoveBound);
        canvas.stage.on("pointerdown", this._onClickBound);
      }
      document.addEventListener("keydown", this._onKeyDownBound);

      // Create overlay AppV2 window
      this.overlay = new CanvasInputOverlay({
        session: this,
        title: this.config.title || "",
        details: this.config.details || "",
        icon: this.config.icon,
        showConfirm: this.config.showConfirm ?? true,
        canConfirm: this.config.canConfirm ?? false,
        showUndo: this.config.showUndo ?? false,
        canUndo: this.config.canUndo ?? false,
        showCancel: this.config.showCancel ?? true
      });

      await this.overlay.render(true);
    });
  }

  /**
   * Update overlay header state (title, details, button states).
   * @param {object} newState
   */
  updateOverlay(newState = {}) {
    if (this.overlay) {
      this.overlay.updateState(newState);
    }
  }

  _onPointerMove(event) {
    if (this.isCompleted) return;
    if (typeof this.config.onPointerMove === "function") {
      this.config.onPointerMove(event, this);
    }
  }

  _onClick(event) {
    if (this.isCompleted) return;
    // Filter for left-click only (button 0 or undefined for touch events)
    if (event.data && event.data.button !== 0 && event.data.button !== undefined) return;
    if (typeof this.config.onClick === "function") {
      this.config.onClick(event, this);
    }
  }

  _onKeyDown(event) {
    if (event.key === "Escape") {
      this.cancel();
    }
  }

  async confirm() {
    if (this.isCompleted) return;
    this.isCompleted = true;
    let result = true;
    if (typeof this.config.onConfirm === "function") {
      result = await this.config.onConfirm(this);
    }
    this._cleanup();
    if (this.resolvePromise) this.resolvePromise(result);
  }

  undo() {
    if (this.isCompleted) return;
    if (typeof this.config.onUndo === "function") {
      this.config.onUndo(this);
    }
  }

  cancel() {
    if (this.isCompleted) return;
    this.isCompleted = true;
    if (typeof this.config.onCancel === "function") {
      this.config.onCancel(this);
    }
    this._cleanup();
    if (this.resolvePromise) this.resolvePromise(null);
  }

  _cleanup() {
    if (CanvasInputSession.activeSession === this) {
      CanvasInputSession.activeSession = null;
    }

    // Restore token interactivity before removing listeners
    this._restoreTokenInteractivity();

    if (canvas.stage) {
      canvas.stage.off("pointermove", this._onPointerMoveBound);
      canvas.stage.off("pointerdown", this._onClickBound);
    }
    document.removeEventListener("keydown", this._onKeyDownBound);

    if (this.graphics) {
      if (this.graphics.parent) this.graphics.parent.removeChild(this.graphics);
      this.graphics.destroy();
      this.graphics = null;
    }

    if (this.overlay) {
      this.overlay.close();
      this.overlay = null;
    }
  }

  /**
   * Disable PIXI interactivity on all canvas tokens so pointer events pass
   * through to canvas.stage. Saves each token's previous eventMode for restore.
   * @protected
   */
  _disableTokenInteractivity() {
    this._savedTokenEventModes.clear();
    const tokens = canvas.tokens?.placeables ?? [];
    for (const token of tokens) {
      this._savedTokenEventModes.set(token.id, token.eventMode ?? "static");
      token.eventMode = "none";
    }
  }

  /**
   * Restore PIXI interactivity on all canvas tokens to their saved values.
   * @protected
   */
  _restoreTokenInteractivity() {
    const tokens = canvas.tokens?.placeables ?? [];
    for (const token of tokens) {
      const saved = this._savedTokenEventModes.get(token.id);
      if (saved !== undefined) {
        token.eventMode = saved;
      }
    }
    this._savedTokenEventModes.clear();
  }
}
