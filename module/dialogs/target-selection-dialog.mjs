const { api } = foundry.applications;

/**
 * TargetSelectionDialog — Interactive dialog for selecting targets on canvas.
 */
export class TargetSelectionDialog extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  constructor(options = {}, resolvePromise) {
    super(options);
    this._resolve = resolvePromise;
    this._maxCount = options.count || 1;
    this._hookId = null;
  }

  static DEFAULT_OPTIONS = {
    id: "bdeed-target-selection",
    classes: ["trespasser", "sheet", "dialog", "target-selection-dialog"],
    position: { width: 340, height: "auto" },
    window: { title: "Target Selection", resizable: false, minimizable: false },
    actions: {
      confirm: TargetSelectionDialog.#onConfirm,
      cancel: TargetSelectionDialog.#onCancel
    }
  };

  static PARTS = {
    content: {
      template: "systems/trespasser/templates/dialogs/target-selection.hbs"
    }
  };

  /**
   * Prompts the user to select up to `count` targets on the canvas.
   * @param {object} options — { count: number, title: string }
   * @returns {Promise<Token[]|null>}
   */
  static async selectTargets(options = {}) {
    return new Promise((resolve) => {
      const dialog = new TargetSelectionDialog(options, resolve);
      dialog.render(true);
    });
  }

  async _prepareContext(options) {
    const targets = Array.from(game.user.targets).slice(0, this._maxCount);
    return {
      maxCount: this._maxCount,
      targets: targets.map(t => ({
        id: t.id,
        name: t.name,
        img: t.document?.texture?.src || t.actor?.img || "icons/svg/mystery-man.svg"
      })),
      targetCount: targets.length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this._hookId) {
      this._hookId = Hooks.on("targetToken", () => {
        this.render();
      });
    }
  }

  async _onClose(options) {
    if (this._hookId) {
      Hooks.off("targetToken", this._hookId);
      this._hookId = null;
    }
    if (this._resolve) {
      const res = this._resolve;
      this._resolve = null;
      res(null);
    }
    return super._onClose(options);
  }

  static #onConfirm(event, target) {
    event.preventDefault();
    const targets = Array.from(game.user.targets).slice(0, this._maxCount);
    if (this._resolve) {
      const res = this._resolve;
      this._resolve = null;
      res(targets);
    }
    this.close();
  }

  static #onCancel(event, target) {
    event.preventDefault();
    if (this._resolve) {
      const res = this._resolve;
      this._resolve = null;
      res(null);
    }
    this.close();
  }
}
