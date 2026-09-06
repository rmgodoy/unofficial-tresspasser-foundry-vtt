/**
 * Status Effect Intensity Dialog using Handlebars and ApplicationV2.
 * Prompts user for intensity when adding or editing a status effect from Token HUD.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class StatusIntensityDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.status = options.status || {};
    this.currentIntensity = options.currentIntensity ?? (options.isEdit ? 0 : 1);
    this.isEdit = Boolean(options.isEdit);
    this.counterInfo = options.counterInfo || null;
    this.resolve = null;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "dialog", "status-intensity-dialog"],
    position: { width: 320, height: "auto" },
    window: {
      resizable: false,
      minimizable: false,
      title: "TRESPASSER.Dialog.StatusIntensity.Title"
    },
    actions: {
      confirm: StatusIntensityDialog.#onConfirmAction,
      cancel: StatusIntensityDialog.#onCancelAction
    },
    form: {
      handler: StatusIntensityDialog.#onFormSubmit,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/status-intensity-dialog.hbs"
    }
  };

  /**
   * Helper to open the dialog and wait for user input.
   * @param {object} options
   * @param {object} options.status - The status effect definition object from TRESPASSER_STATUS_EFFECTS
   * @param {number} [options.currentIntensity] - Current intensity (if editing) or default
   * @param {boolean} [options.isEdit=false] - Whether this is an edit of an existing effect
   * @param {object|null} [options.counterInfo=null] - Optional info about opposing counter state on the actor
   * @returns {Promise<{intensity: number}|null>} Result with intensity, or null if cancelled
   */
  static async wait({ status, currentIntensity = 1, isEdit = false, counterInfo = null } = {}) {
    return new Promise((resolve) => {
      const statusName = game.i18n.localize(status.name) || status.id;
      const titleKey = isEdit
        ? "TRESPASSER.Dialog.StatusIntensity.EditTitle"
        : "TRESPASSER.Dialog.StatusIntensity.AddTitle";
      const title = game.i18n.format(titleKey, { name: statusName });

      const dialog = new this({
        status,
        currentIntensity,
        isEdit,
        counterInfo,
        window: { title }
      });

      dialog.resolve = (val) => {
        resolve(val);
        dialog.resolve = null;
      };

      const originalClose = dialog.close.bind(dialog);
      dialog.close = async function (closeOptions) {
        if (dialog.resolve) dialog.resolve(null);
        return originalClose(closeOptions);
      };

      dialog.render(true);
    });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const localizedName = game.i18n.localize(this.status.name) || this.status.id;

    context.status = this.status;
    context.statusName = localizedName;
    context.intensity = this.currentIntensity;
    context.isEdit = this.isEdit;
    context.counterInfo = this.counterInfo;

    if (this.counterInfo) {
      context.counterWarningText = game.i18n.format("TRESPASSER.Dialog.StatusIntensity.CounterWarning", {
        name: this.counterInfo.name,
        intensity: this.counterInfo.intensity
      });
    }

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Auto-focus and select all content in the intensity input
    const input = this.element.querySelector('input[name="intensity"]');
    if (input) {
      input.focus();
      input.select();
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
  }

  static async #onFormSubmit(event, form, formData) {
    const rawVal = formData.object?.intensity;
    const parsed = parseInt(rawVal, 10);
    const intensity = isNaN(parsed) ? 0 : Math.max(0, parsed);

    if (this.resolve) {
      this.resolve({ intensity });
      this.resolve = null;
    }
  }

  static async #onConfirmAction(event, target) {
    event.preventDefault();
    const input = this.element.querySelector('input[name="intensity"]');
    const rawVal = input ? input.value : this.currentIntensity;
    const parsed = parseInt(rawVal, 10);
    const intensity = isNaN(parsed) ? 0 : Math.max(0, parsed);

    if (this.resolve) {
      this.resolve({ intensity });
      this.resolve = null;
    }
    this.close();
  }

  static async #onCancelAction(event, target) {
    event.preventDefault();
    if (this.resolve) {
      this.resolve(null);
      this.resolve = null;
    }
    this.close();
  }

  /** @override */
  _onClose() {
    if (this.resolve) {
      this.resolve(null);
      this.resolve = null;
    }
  }
}
