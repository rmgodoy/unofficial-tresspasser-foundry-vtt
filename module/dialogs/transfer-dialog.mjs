/**
 * Dialog to select a target actor for item transfer.
 */
export class TransferDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  
  constructor(item, options={}) {
    super(options);
    this.item = item;
    this.resolve = null;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["trespasser", "dialog", "transfer-dialog"],
    position: { width: 400, height: "auto" },
    window: {
      title: "TRESPASSER.Dialog.TransferTitle",
    },
    actions: {
      select: TransferDialog._onSelect
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/transfer-dialog.hbs"
    }
  };

  /**
   * Helper to show the dialog and wait for selection.
   * @param {Item} item
   * @returns {Promise<Actor|null>}
   */
  static async wait(item) {
    return new Promise(resolve => {
      const dialog = new this(item);
      dialog.resolve = resolve;
      dialog.render(true);
    });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Get all player characters owned by active users (excluding current actor)
    const activeUserIds = game.users.filter(u => u.active && !u.isGM).map(u => u.id);
    const sourceActorId = this.item.parent?.id;

    context.actors = game.actors.filter(a => {
      if (a.type !== "character") return false;
      if (a.id === sourceActorId) return false;
      // Must be owned by an active player
      return activeUserIds.some(uid => a.testUserPermission(game.users.get(uid), "OWNER"));
    }).map(a => ({
      id: a.id,
      name: a.name,
      img: a.img
    }));

    return context;
  }

  /**
   * Handle actor selection.
   * @private
   */
  static _onSelect(event, target) {
    const actorId = target.dataset.actorId;
    const actor = game.actors.get(actorId);
    this.resolve(actor);
    this.close();
  }

  /** @override */
  _onClose() {
    if (this.resolve) this.resolve(null);
  }
}
