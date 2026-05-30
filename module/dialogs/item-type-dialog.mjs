/**
 * Dialog to select an item type for new inventory item creation.
 */
export class ItemTypeDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  
  constructor(options={}) {
    super(options);
    this.resolve = null;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["trespasser", "dialog", "item-type-dialog"],
    position: { width: 350, height: "auto" },
    window: {
      title: "TRESPASSER.Dialog.ItemType.Title",
    },
    actions: {
      select: ItemTypeDialog._onSelect
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/item-type-dialog.hbs"
    }
  };

  /**
   * Helper to show the dialog and wait for selection.
   * @returns {Promise<string|null>} Selected item type, or null if cancelled/closed
   */
  static async wait() {
    return new Promise(resolve => {
      const dialog = new this();
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
    
    // Supported item types for character inventory
    const types = ["item", "rations", "weapon", "armor", "accessory"];
    
    context.types = types.map(t => ({
      id: t,
      label: game.i18n.localize(`TRESPASSER.App.System.Types.Item.${t}`) || t.capitalize()
    }));

    return context;
  }

  /**
   * Handle item type selection.
   * @private
   */
  static _onSelect(event, target) {
    const type = target.dataset.type;
    if (this.resolve) this.resolve(type);
    this.close();
  }

  /** @override */
  _onClose() {
    if (this.resolve) this.resolve(null);
  }
}
