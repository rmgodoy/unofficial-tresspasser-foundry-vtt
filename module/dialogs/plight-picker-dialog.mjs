import { COMMON_PLIGHTS } from "../config/plight-config.mjs";

/**
 * Dialog to select a plight to add to an actor.
 */
export class PlightPickerDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  
  constructor(actor, options={}) {
    super(options);
    this.actor = actor;
    this.resolve = null;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["trespasser", "dialog", "plight-picker-dialog"],
    position: { width: 450, height: "auto" },
    window: {
      title: "TRESPASSER.Dialog.PlightPicker.Title",
    },
    actions: {
      select: PlightPickerDialog._onSelect
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/plight-picker.hbs"
    }
  };

  /**
   * Helper to show the dialog and wait for selection.
   * @param {Actor} actor The character actor
   * @returns {Promise<string|null>} Selected plightId, "custom", or null if cancelled/closed
   */
  static async wait(actor) {
    return new Promise(resolve => {
      const dialog = new this(actor);
      dialog.resolve = (value) => {
        resolve(value);
        dialog.resolve = null; // Prevent double resolve
      };
      
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async function(closeOptions) {
        if (dialog.resolve) dialog.resolve(null);
        return originalClose(closeOptions);
      };

      dialog.render(true);
    });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Check which plights are already on the actor
    const activePlightIds = new Set(
      this.actor.items
        .filter(i => i.type === "plight" && i.system.plightId)
        .map(i => i.system.plightId)
    );

    // Map common plights
    context.plights = Object.entries(COMMON_PLIGHTS).map(([key, config]) => ({
      id: key,
      label: config.label,
      description: config.description,
      icon: config.icon,
      tint: config.tint,
      disabled: activePlightIds.has(key)
    }));

    return context;
  }

  /**
   * Handle plight selection.
   * @private
   */
  static _onSelect(event, target) {
    const plightId = target.dataset.plightId;
    if (this.resolve) this.resolve(plightId);
    this.close();
  }

  /** @override */
  _onClose() {
    if (this.resolve) this.resolve(null);
  }
}
