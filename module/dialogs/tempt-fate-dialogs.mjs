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
      { key: "canny", label: "Canny", desc: "You perform the task with care and attention. You retain something you expected to lose in the effort or avoid paying what seemed like a necessary cost. Banishes costly." },
      { key: "quick", label: "Quick", desc: "You accomplish in short order something that should have taken much longer, saving all-valuable time for your companions. Banishes slow." },
      { key: "quiet", label: "Quiet", desc: "You slip beneath the notice of those who might oppose your efforts. You don't draw notice from unfriendly eyes or arouse unwanted attention from the dungeon around you. Banishes loud." },
      { key: "safe", label: "Safe", desc: "Even though injury might have seemed a certainty given the task at hand, you suffer no harm doing it. Banishes harmful." },
      { key: "striking", label: "Striking", desc: "You display such impressive skill in your attempt that you influence those around you. Perhaps you inspire a watching ally or earn the favor of someone doubting your abilities. Banishes daunting." }
    ];

    let disabledCount = 0;
    context.options = optionData.map(opt => {
      let disabled = false;
      let tooltip = "";

      if (hasAfraid && (opt.key === "quick" || opt.key === "striking")) {
        disabled = true;
        tooltip = "Afraid: You cannot choose quick or striking sparks";
      } else if (hasAngry && (opt.key === "canny" || opt.key === "quiet" || opt.key === "safe")) {
        disabled = true;
        tooltip = "Angry: You cannot choose canny, quiet, or safe sparks";
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
    context.promptText = `You rolled ${this.sparkCount} spark(s). Choose exactly ${targetCount} unique spark(s) to color the outcome:`;

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
          title: options.title || "Select Sparks"
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
      ? "Choose exactly 1 shadow to apply to the outcome:"
      : `The roll generated ${this.shadowCount} shadow(s). Choose exactly ${this.shadowCount} unique shadow(s) to apply:`);
    
    context.confirmLabel = this.customConfirmLabel || game.i18n.localize("TRESPASSER.Global.Action.Confirm");

    context.options = [
      { key: "costly", label: "Costly", desc: "You lose something of material value. Maybe the treasure slipped out of your pack as you leapt, or your faithful tool was finally pushed too far." },
      { key: "slow", label: "Slow", desc: "The task took much longer than you thought, and you've lost precious time you couldn't afford to lose. The torches flicker. Your stomach rumbles." },
      { key: "loud", label: "Loud", desc: "You draw attention to yourself with a loud noise or other major disruption. If those nearby didn't know you're here, they certainly do now." },
      { key: "harmful", label: "Harmful", desc: "You hurt yourself in some fashion. Depending on what you tried, the harm could be anything from a few scratches to an injury that lingers for weeks." },
      { key: "daunting", label: "Daunting", desc: "Your effort was so humiliating that those who observed it question whether you belong here in the first place." }
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
    const title = options.title || (singleSelect ? "Choose Shadow" : "Select Shadows");

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
