import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * QuickDeedDialog — GM-only fast deed configuration dialog.
 * Configures target mode, AoE size, defense (versus), and ability type,
 * then executes the generated deed pipeline via DeedExecutor.
 */
export class QuickDeedDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.token = options.token || canvas.tokens?.controlled[0] || null;
    this.actor = options.actor || this.token?.actor || null;
    this._config = {
      targetType: "creature",
      size: 3,
      customSize: 3,
      isCustomSize: false,
      versus: "guard",
      abilityType: "versatile"
    };
  }

  static DEFAULT_OPTIONS = {
    id: "quick-deed-dialog",
    tag: "div",
    classes: ["trespasser", "sheet", "dialog", "quick-deed-dialog"],
    position: {
      width: 440,
      height: "auto"
    },
    window: {
      title: "TRESPASSER.Dialog.QuickDeed.Title",
      resizable: false,
      minimizable: false
    },
    actions: {
      selectTargetType: QuickDeedDialog.#onSelectTargetType,
      selectSize: QuickDeedDialog.#onSelectSize,
      selectCustomSize: QuickDeedDialog.#onSelectCustomSize,
      selectVersus: QuickDeedDialog.#onSelectVersus,
      selectAbilityType: QuickDeedDialog.#onSelectAbilityType,
      confirm: QuickDeedDialog.#onConfirm,
      cancel: QuickDeedDialog.#onCancel
    }
  };

  static PARTS = {
    content: {
      template: "systems/trespasser/templates/dialogs/quick-deed-dialog.hbs"
    }
  };

  /**
   * Static helper to open the dialog for a token/actor.
   * @param {object} options
   */
  static async prompt(options = {}) {
    const dialog = new QuickDeedDialog(options);
    return dialog.render(true);
  }

  /** @override */
  async _prepareContext(options) {
    const isCreature = this._config.targetType === "creature";

    return {
      state: this._config,
      config: this._config,
      isCreature,
      targetChoices: [
        { id: "creature", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.Creature"), active: this._config.targetType === "creature" },
        { id: "blast", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.Blast"), active: this._config.targetType === "blast" },
        { id: "close_blast", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.CloseBlast"), active: this._config.targetType === "close_blast" },
        { id: "burst", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.Burst"), active: this._config.targetType === "burst" },
        { id: "melee_burst", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.MeleeBurst"), active: this._config.targetType === "melee_burst" },
        { id: "path", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.Path"), active: this._config.targetType === "path" },
        { id: "close_path", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Targets.ClosePath"), active: this._config.targetType === "close_path" }
      ],
      sizeChoices: [
        { id: "2", label: "2", active: !this._config.isCustomSize && this._config.size === 2 },
        { id: "3", label: "3", active: !this._config.isCustomSize && this._config.size === 3 },
        { id: "4", label: "4", active: !this._config.isCustomSize && this._config.size === 4 },
        { id: "6", label: "6", active: !this._config.isCustomSize && this._config.size === 6 },
        { id: "8", label: "8", active: !this._config.isCustomSize && this._config.size === 8 },
        { id: "custom", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.CustomSize"), active: this._config.isCustomSize }
      ],
      versusChoices: [
        { id: "guard", label: game.i18n.localize("TRESPASSER.Sheet.Combat.Guard"), active: this._config.versus === "guard" },
        { id: "resist", label: game.i18n.localize("TRESPASSER.Sheet.Combat.Resist"), active: this._config.versus === "resist" }
      ],
      abilityChoices: [
        { id: "versatile", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Versatile"), active: this._config.abilityType === "versatile" },
        { id: "innate", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Innate"), active: this._config.abilityType === "innate" },
        { id: "melee", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Melee"), active: this._config.abilityType === "melee" },
        { id: "missile", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Missile"), active: this._config.abilityType === "missile" },
        { id: "spell", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Spell"), active: this._config.abilityType === "spell" },
        { id: "tool", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Tool"), active: this._config.abilityType === "tool" },
        { id: "unarmed", label: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Abilities.Unarmed"), active: this._config.abilityType === "unarmed" }
      ],
      customSizeValue: this._config.customSize
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this._config.isCustomSize) {
      const input = this.element.querySelector('[name="customSizeInput"]');
      if (input) {
        input.focus();
        input.select();
        input.addEventListener("input", () => {
          const val = parseInt(input.value);
          if (!isNaN(val) && val > 0) {
            this._config.customSize = val;
          }
        });
      }
    }
  }

  static #onSelectTargetType(event, target) {
    const value = target.dataset.value;
    this._config.targetType = value;
    this.render();
  }

  static #onSelectSize(event, target) {
    const value = parseInt(target.dataset.value) || 3;
    this._config.size = value;
    this._config.isCustomSize = false;
    this.render();
  }

  static #onSelectCustomSize(event, target) {
    this._config.isCustomSize = true;
    this.render();
  }

  static #onSelectVersus(event, target) {
    const value = target.dataset.value;
    this._config.versus = value;
    this.render();
  }

  static #onSelectAbilityType(event, target) {
    const value = target.dataset.value;
    this._config.abilityType = value;
    this.render();
  }

  static async #onConfirm(event, target) {
    event.preventDefault();
    if (this._config.isCustomSize) {
      const input = this.element.querySelector('[name="customSizeInput"]');
      if (input) {
        const val = parseInt(input.value);
        if (!isNaN(val) && val > 0) {
          this._config.customSize = val;
        }
      }
    }

    const config = {
      targetType: this._config.targetType,
      size: this._config.isCustomSize ? this._config.customSize : this._config.size,
      versus: this._config.versus,
      abilityType: this._config.abilityType
    };

    await this.close();
    await QuickDeedDialog.executeQuickDeed(this.actor, this.token, config);
  }

  static async #onCancel(event, target) {
    event.preventDefault();
    await this.close();
  }

  /**
   * Build transient deed graph and execute it.
   * @param {Actor} actor
   * @param {Token} token
   * @param {object} config
   */
  static async executeQuickDeed(actor, token, config) {
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoActorSelected") || "No actor selected.");
      return;
    }

    if (TrespasserEffectsHelper.hasActorFlagOrEffect(actor, "cannotAct")) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", {
        name: actor.name || token?.name || "Target"
      }));
      return;
    }

    const isCreature = config.targetType === "creature";
    const versusCap = config.versus.charAt(0).toUpperCase() + config.versus.slice(1).toLowerCase();

    const nodes = [];
    const connections = [];

    // 1. Start node
    nodes.push({
      id: "start",
      type: "start",
      phase: "start",
      params: {},
      x: 60,
      y: 180
    });

    let lastNodeId = "start";
    let currentX = 380;

    // 2. Targeting node(s)
    if (isCreature) {
      nodes.push({
        id: "select_target",
        type: "selectTarget",
        phase: "base",
        params: {
          targetMode: "creatures",
          targetCount: 99,
          disposition: "any",
          ignoreSelf: false
        },
        x: currentX,
        y: 180
      });

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: "start",
        sourcePort: "out",
        targetId: "select_target",
        targetPort: "in",
        type: "flow"
      });
      lastNodeId = "select_target";
    } else {
      const aoeSize = Math.max(1, Number(config.size) || 1);
      nodes.push({
        id: "select_target",
        type: "selectTarget",
        phase: "base",
        params: {
          targetMode: "aoe",
          aoeType: config.targetType,
          aoeSize: aoeSize,
          disposition: "any",
          ignoreSelf: false
        },
        x: currentX,
        y: 180
      });

      connections.push({
        id: foundry.utils.randomID(),
        sourceId: "start",
        sourcePort: "out",
        targetId: "select_target",
        targetPort: "in",
        type: "flow"
      });

      lastNodeId = "select_target";
    }

    currentX += 320;

    // 3. Roll Accuracy node
    nodes.push({
      id: "roll_accuracy",
      type: "rollAccuracy",
      phase: "base",
      params: {
        actionType: "attack",
        abilityType: config.abilityType || "versatile",
        versus: versusCap,
        branchingMode: "hitThenSpark"
      },
      x: currentX,
      y: 180
    });

    connections.push({
      id: foundry.utils.randomID(),
      sourceId: lastNodeId,
      sourcePort: "out",
      targetId: "roll_accuracy",
      targetPort: "in",
      type: "flow"
    });

    const deedData = {
      name: game.i18n.localize("TRESPASSER.Dialog.QuickDeed.Title"),
      type: "deed",
      img: "systems/trespasser/assets/icons/deed.webp",
      system: {
        tier: "light",
        actionType: "attack",
        abilityType: config.abilityType || "versatile",
        versus: versusCap,
        focusCost: 0,
        phases: {
          base: { description: "", skipPhase: false },
          hit: { description: "", skipPhase: false },
          spark: { description: "", skipPhase: false },
          miss: { description: "", skipPhase: false }
        },
        graph: {
          nodes,
          connections
        },
        graphVersion: 1
      }
    };

    const transientDeed = new Item.implementation(deedData, { parent: actor });
    const { DeedExecutor } = await import("../helpers/deed-executor.mjs");
    const executor = new DeedExecutor(transientDeed, actor, {
      token: token || actor.token?.object || actor.getActiveTokens?.()[0] || null,
      apSpent: 1
    });

    await executor.execute();
  }
}
