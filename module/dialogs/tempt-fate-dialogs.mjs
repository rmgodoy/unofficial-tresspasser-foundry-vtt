/**
 * Dialogs for Tempt Fate and Non-Combat Sparks/Shadows selection.
 * Uses ApplicationV2 and Handlebars templates.
 */

// ── Non-Combat Spark Selection Dialog ──
export class NonCombatSparkDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.sparkCount = options.sparkCount;
    this.resolve = options.resolve;
    this.actor = options.actor;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["trespasser", "dialog", "spark-picker-dialog"],
    position: { width: 420, height: "auto" },
    window: {
      resizable: false,
      minimizable: false,
      title: "Select Sparks"
    },
    actions: {
      confirm: NonCombatSparkDialog.#onConfirm,
      cancel: NonCombatSparkDialog.#onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/non-combat-spark.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const hasAfraid = this.actor?.system?.hasPlight?.("afraid");
    const hasAngry = this.actor?.system?.hasPlight?.("angry");

    const optionData = [
      { key: "canny", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkCannyLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkCannyDesc") },
      { key: "quick", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkQuickLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkQuickDesc") },
      { key: "quiet", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkQuietLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkQuietDesc") },
      { key: "safe", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkSafeLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkSafeDesc") },
      { key: "striking", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkStrikingLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.SparkStrikingDesc") }
    ];

    let disabledCount = 0;
    context.options = optionData.map(opt => {
      let disabled = false;
      let tooltip = "";

      if (hasAfraid && (opt.key === "quick" || opt.key === "striking")) {
        disabled = true;
        tooltip = game.i18n.localize("TRESPASSER.Dialog.NonCombat.AfraidTooltip");
      } else if (hasAngry && (opt.key === "canny" || opt.key === "quiet" || opt.key === "safe")) {
        disabled = true;
        tooltip = game.i18n.localize("TRESPASSER.Dialog.NonCombat.AngryTooltip");
      }

      if (disabled) disabledCount++;

      return {
        ...opt,
        disabled,
        tooltip
      };
    });

    const maxSelectable = Math.max(0, optionData.length - disabledCount);
    const targetCount = Math.min(this.sparkCount, maxSelectable);
    context.promptText = game.i18n.format("TRESPASSER.Dialog.NonCombat.SparksPrompt", { count: this.sparkCount, target: targetCount });

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element;
    const checkboxes = form.querySelectorAll('input[name="choices"]');
    const confirmBtn = form.querySelector('[data-action="confirm"]');

    const updateControls = () => {
      const checkedCount = form.querySelectorAll('input[name="choices"]:checked').length;
      const nonRestrictedCount = form.querySelectorAll('input[name="choices"]:not([data-restricted="true"])').length;
      const targetCount = Math.min(this.sparkCount, nonRestrictedCount);

      confirmBtn.disabled = checkedCount !== targetCount;
      
      checkboxes.forEach(cb => {
        if (cb.dataset.restricted === "true") {
          cb.disabled = true;
          cb.closest("label")?.classList.add("disabled");
          return;
        }
        if (!cb.checked) {
          cb.disabled = checkedCount >= targetCount;
          cb.closest("label")?.classList.toggle("disabled", checkedCount >= targetCount);
        } else {
          cb.disabled = false;
          cb.closest("label")?.classList.remove("disabled");
        }
      });
    };

    checkboxes.forEach(cb => {
      cb.addEventListener("change", updateControls);
    });

    updateControls();
  }

  static #onConfirm(event, target) {
    const chosen = Array.from(this.element.querySelectorAll('input[name="choices"]:checked')).map(el => el.value);
    this.resolve(chosen);
    this.close();
  }

  static #onCancel(event, target) {
    this.resolve(null);
    this.close();
  }

  static async wait(sparkCount, options={}) {
    return new Promise((resolve) => {
      const dialog = new NonCombatSparkDialog({
        sparkCount,
        resolve,
        ...options,
        window: {
          title: options.title || game.i18n.localize("TRESPASSER.Dialog.NonCombat.SelectSparks")
        }
      });

      const originalClose = dialog.close.bind(dialog);
      dialog.close = async function(closeOptions) {
        resolve(null);
        return originalClose(closeOptions);
      };

      dialog.render(true);
    });
  }
}

// ── Non-Combat Shadow Selection Dialog ──
// Handles both single-select (Tempt Fate radio buttons) and multi-select (GM shadows checkboxes)
export class NonCombatShadowDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.shadowCount = options.shadowCount ?? 1;
    this.singleSelect = options.singleSelect ?? (this.shadowCount === 1);
    this.resolve = options.resolve;
    this.customPrompt = options.promptText;
    this.customConfirmLabel = options.confirmLabel;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["trespasser", "dialog", "shadow-picker-dialog"],
    position: { width: 420, height: "auto" },
    window: {
      resizable: false,
      minimizable: false,
      title: "Select Shadows"
    },
    actions: {
      confirm: NonCombatShadowDialog.#onConfirm,
      cancel: NonCombatShadowDialog.#onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/non-combat-shadow.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.singleSelect = this.singleSelect;
    
    context.promptText = this.customPrompt || (this.singleSelect
      ? game.i18n.localize("TRESPASSER.Dialog.NonCombat.SingleShadowPrompt")
      : game.i18n.format("TRESPASSER.Dialog.NonCombat.MultiShadowPrompt", { count: this.shadowCount }));
    
    context.confirmLabel = this.customConfirmLabel || game.i18n.localize("TRESPASSER.Global.Action.Confirm");

    context.options = [
      { key: "costly", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowCostlyLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowCostlyDesc") },
      { key: "slow", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowSlowLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowSlowDesc") },
      { key: "loud", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowLoudLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowLoudDesc") },
      { key: "harmful", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowHarmfulLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowHarmfulDesc") },
      { key: "daunting", label: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowDauntingLabel"), desc: game.i18n.localize("TRESPASSER.Dialog.NonCombat.ShadowDauntingDesc") }
    ];
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element;
    const confirmBtn = form.querySelector('[data-action="confirm"]');
    const checkboxes = form.querySelectorAll('input[name="choices"]');

    if (this.singleSelect) {
      // Checkbox single-select mode (behaves like radio buttons visually)
      const updateControlsSingle = () => {
        const checkedBox = form.querySelector('input[name="choices"]:checked');
        confirmBtn.disabled = !checkedBox;

        checkboxes.forEach(cb => {
          const label = cb.closest("label");
          if (checkedBox) {
            if (cb === checkedBox) {
              cb.disabled = false;
              label?.classList.remove("disabled");
            } else {
              cb.disabled = true;
              label?.classList.add("disabled");
            }
          } else {
            cb.disabled = false;
            label?.classList.remove("disabled");
          }
        });
      };

      checkboxes.forEach(cb => {
        cb.addEventListener("change", () => {
          if (cb.checked) {
            checkboxes.forEach(other => {
              if (other !== cb) other.checked = false;
            });
          }
          updateControlsSingle();
        });
      });

      updateControlsSingle();
    } else {
      // Checkbox multi-select mode
      const updateControlsMulti = () => {
        const checkedCount = form.querySelectorAll('input[name="choices"]:checked').length;
        confirmBtn.disabled = checkedCount !== this.shadowCount;
        
        checkboxes.forEach(cb => {
          const label = cb.closest("label");
          if (!cb.checked) {
            cb.disabled = checkedCount >= this.shadowCount;
            label?.classList.toggle("disabled", checkedCount >= this.shadowCount);
          } else {
            cb.disabled = false;
            label?.classList.remove("disabled");
          }
        });
      };

      checkboxes.forEach(cb => {
        cb.addEventListener("change", updateControlsMulti);
      });

      updateControlsMulti();
    }
  }

  static #onConfirm(event, target) {
    const chosen = Array.from(this.element.querySelectorAll('input[name="choices"]:checked')).map(el => el.value);
    this.resolve(chosen);
    this.close();
  }

  static #onCancel(event, target) {
    this.resolve(null);
    this.close();
  }

  static async wait(shadowCount, options={}) {
    const singleSelect = options.singleSelect ?? (shadowCount === 1);
    const title = options.title || (singleSelect ? game.i18n.localize("TRESPASSER.Dialog.NonCombat.ChooseShadow") : game.i18n.localize("TRESPASSER.Dialog.NonCombat.SelectShadows"));

    return new Promise((resolve) => {
      const dialog = new NonCombatShadowDialog({
        shadowCount,
        singleSelect,
        resolve,
        promptText: options.promptText,
        confirmLabel: options.confirmLabel,
        window: {
          title: title
        }
      });

      const originalClose = dialog.close.bind(dialog);
      dialog.close = async function(closeOptions) {
        resolve(null);
        return originalClose(closeOptions);
      };

      dialog.render(true);
    });
  }
}
