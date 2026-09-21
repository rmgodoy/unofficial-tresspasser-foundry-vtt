import { TreasureGenerator } from "../helpers/treasure-generator.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * ApplicationsV2 Treasure Generator Dialog for Trespasser RPG.
 */
export class TrespasserTreasureDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options = {}) {
    super(options);
    this.count = options.count || 1;
    this.recipientMode = options.recipientMode || "world";
    this.whisper = options.whisper ?? true;
    this.results = [];
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "dialog", "treasure-generator-dialog"],
    position: { width: 480, height: "auto" },
    window: {
      resizable: true,
      minimizable: false,
      title: "TRESPASSER.Dialog.TreasureGenerator.Title"
    },
    actions: {
      generate: TrespasserTreasureDialog._onGenerate,
      createSingle: TrespasserTreasureDialog._onCreateSingle,
      createAll: TrespasserTreasureDialog._onCreateAll,
      clear: TrespasserTreasureDialog._onClear,
      close: TrespasserTreasureDialog._onClose
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/treasure-dialog.hbs"
    }
  };

  /**
   * Retrieves the active party actor if configured.
   * @returns {Actor|null}
   */
  get activeParty() {
    const activePartyId = game.settings.get(SYSTEM_ID, "activePartyId");
    if (activePartyId) {
      const party = game.actors.get(activePartyId);
      if (party) return party;
    }
    return game.actors.find(a => a.type === "party") || null;
  }

  /**
   * Retrieves the currently selected character actor (from canvas token or user's character).
   * @returns {Actor|null}
   */
  get selectedActor() {
    const controlled = canvas.tokens?.controlled || [];
    const charToken = controlled.find(t => t.actor?.type === "character");
    if (charToken) return charToken.actor;
    if (game.user.character?.type === "character") return game.user.character;
    return null;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.count = this.count;
    context.recipientMode = this.recipientMode;
    context.whisper = this.whisper;
    context.results = this.results;
    context.activeParty = this.activeParty;
    context.selectedActor = this.selectedActor;

    const totalVal = this.results.reduce((acc, r) => acc + (r.value || 0), 0);
    context.totalValue = totalVal;
    context.totalValueLabel = game.i18n.format("TRESPASSER.Terms.Treasure.ValueXP", { value: totalVal });

    return context;
  }

  /**
   * Resolves the target actor based on recipient mode.
   * @param {string} mode
   * @returns {Actor|null}
   */
  _resolveTargetActor(mode) {
    if (mode === "party") return this.activeParty;
    if (mode === "selected") return this.selectedActor;
    return null;
  }

  /**
   * Read form input state from the DOM.
   */
  _syncFormState() {
    if (!this.element) return;
    const countInput = this.element.querySelector('input[name="count"]');
    if (countInput) {
      this.count = Math.max(1, Math.min(20, parseInt(countInput.value) || 1));
    }
    const recipientSelect = this.element.querySelector('select[name="recipientMode"]');
    if (recipientSelect) {
      this.recipientMode = recipientSelect.value;
    }
    const whisperCheck = this.element.querySelector('input[name="whisper"]');
    if (whisperCheck) {
      this.whisper = whisperCheck.checked;
    }
  }

  static async _onGenerate(event, target) {
    event.preventDefault();
    this._syncFormState();

    const targetActor = this._resolveTargetActor(this.recipientMode);
    const newResults = [];

    for (let i = 0; i < this.count; i++) {
      const res = await TreasureGenerator.rollTreasure({
        whisperToGM: this.whisper,
        displayChat: true,
        createItem: false,
        targetActor
      });
      newResults.push(res);
    }

    this.results = [...newResults, ...this.results];
    this.render();
  }

  static async _onCreateSingle(event, target) {
    event.preventDefault();
    this._syncFormState();
    const index = parseInt(target.dataset.index);
    const res = this.results[index];
    if (!res) return;

    const targetActor = this._resolveTargetActor(this.recipientMode);
    await TreasureGenerator.createTreasureItem(res, targetActor);
  }

  static async _onCreateAll(event, target) {
    event.preventDefault();
    this._syncFormState();
    if (!this.results.length) return;

    const targetActor = this._resolveTargetActor(this.recipientMode);
    for (const res of this.results) {
      await TreasureGenerator.createTreasureItem(res, targetActor);
    }

    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Treasure.BulkCreated", {
      count: this.results.length
    }));
  }

  static async _onClear(event, target) {
    event.preventDefault();
    this.results = [];
    this.render();
  }

  static async _onClose(event, target) {
    event.preventDefault();
    this.close();
  }

  /**
   * Helper to open the dialog as a singleton or new window.
   */
  static open(options = {}) {
    const dlg = new TrespasserTreasureDialog(options);
    dlg.render(true);
    return dlg;
  }
}
