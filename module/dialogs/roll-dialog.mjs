
/**
 * Stylized Roll Dialog for Trespasser.
 * Uses ApplicationsV2.
 */
export class TrespasserRollDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options={}) {
    super(options);
    this.data = options.data || {};
    this.resolve = options.resolve;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "dialog", "roll-dialog"],
    position: { width: 320, height: "auto" },
    window: {
      resizable: false,
      minimizable: false,
      title: ""
    },
    actions: {
      roll: TrespasserRollDialog.#onRoll,
      cancel: TrespasserRollDialog.#onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/roll-dialog.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.dice = this.data.dice || "1d20";
    context.bonuses = this.data.bonuses || [];
    context.showCD = this.data.showCD ?? false;
    context.cd = this.data.cd || 10;
    return context;
  }

  static async #onRoll(event, target) {
    event.preventDefault();
    const modifier = parseInt(this.element.querySelector('input[name="modifier"]').value) || 0;
    const cdElement = this.element.querySelector('input[name="cd"]');
    const cd = cdElement ? (parseInt(cdElement.value) || 10) : null;
    this.resolve({ modifier, cd });
    this.close();
  }

  static async #onCancel(event, target) {
    this.resolve(null);
    this.close();
  }

  /**
   * Static helper to wait for the dialog result.
   */
  static async wait(data, options={}) {
    return new Promise((resolve) => {
      const dialog = new TrespasserRollDialog({
        data,
        resolve,
        window: {
          title: options.title || game.i18n.localize("TRESPASSER.Dialog.RollTitle")
        }
      });
      dialog.render(true);
    });
  }
}
