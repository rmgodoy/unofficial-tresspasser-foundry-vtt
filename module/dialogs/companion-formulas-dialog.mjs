/**
 * Companion Formulas Configuration Dialog
 * Allows GMs to configure the mathematical formulas and bound-character variables
 * that govern a companion actor's level, damage die, health, and combat attributes.
 */
export class CompanionFormulasDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  static DEFAULT_FORMULAS = {
    level: "<c.lvl>",
    skill_die: "<c.skill_die>",
    hp: "10+5*(<lvl>)",
    speed: "5",
    speed_bonus: "2",
    initiative: "<lvl>",
    accuracy: "<lvl>+<c.skill>",
    guard: "<lvl>+<c.agility>",
    resist: "<lvl>+<c.spirit>",
    prevail: "<lvl>+<c.intellect>"
  };

  /**
   * @param {Actor} actor - The companion actor document
   * @param {Object} [options={}] - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.options.window.title = game.i18n.format("TRESPASSER.Dialog.CompanionFormulas.Title", { name: actor.name });
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "dialog", "companion-formulas-dialog"],
    position: { width: 560, height: 480 },
    window: {
      resizable: true,
      minimizable: false,
      title: "TRESPASSER.Dialog.CompanionFormulas.DefaultTitle"
    },
    actions: {
      save: CompanionFormulasDialog._onSave,
      reset: CompanionFormulasDialog._onReset,
      cancel: CompanionFormulasDialog._onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/companion-formulas-dialog.hbs",
      scrollable: [".dialog-content-scrollable", ".scrollable"]
    }
  };

  /**
   * Open the formulas dialog for a companion actor.
   * @param {Actor} actor
   * @returns {Promise<CompanionFormulasDialog|null>}
   */
  static async show(actor) {
    if (!game.user.isGM) return null;
    const dialog = new this(actor);
    dialog.render(true);
    return dialog;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const formulas = sys.formulas ?? {};
    const boundChar = sys.getBoundCharacter?.() ?? null;

    context.actor = actor;
    context.boundCharacter = boundChar;
    context.boundCharacterName = boundChar?.name ?? game.i18n.localize("TRESPASSER.Sheet.Companion.NoBoundCharacter");

    // Core formula items (Level, Skill Die, HP)
    context.coreStats = [
      {
        key: "level",
        name: "formulas.level",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Level"),
        formula: formulas.level || CompanionFormulasDialog.DEFAULT_FORMULAS.level,
        currentValue: sys.level,
        placeholder: "<c.lvl>"
      },
      {
        key: "skill_die",
        name: "formulas.skill_die",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.SkillDie") || game.i18n.localize("TRESPASSER.Sheet.Combat.SkillDie"),
        formula: formulas.skill_die || formulas.damageDie || CompanionFormulasDialog.DEFAULT_FORMULAS.skill_die,
        currentValue: sys.skill_die ?? sys.damageDie,
        placeholder: "<c.skill_die>"
      },
      {
        key: "hp",
        name: "formulas.hp",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.HP"),
        formula: formulas.hp || CompanionFormulasDialog.DEFAULT_FORMULAS.hp,
        currentValue: sys.max_health,
        placeholder: "10+5*(<lvl>)"
      }
    ];

    // Combat attribute formula items
    context.combatStats = [
      {
        key: "speed",
        name: "formulas.speed",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Speed"),
        formula: formulas.speed || CompanionFormulasDialog.DEFAULT_FORMULAS.speed,
        currentValue: sys.combat?.speed ?? 5,
        placeholder: "5"
      },
      {
        key: "speed_bonus",
        name: "formulas.speed_bonus",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.SpeedBonus"),
        formula: formulas.speed_bonus || CompanionFormulasDialog.DEFAULT_FORMULAS.speed_bonus,
        currentValue: `+${sys.combat?.speed_bonus ?? 2}`,
        placeholder: "2"
      },
      {
        key: "initiative",
        name: "formulas.initiative",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Initiative"),
        formula: formulas.initiative || CompanionFormulasDialog.DEFAULT_FORMULAS.initiative,
        currentValue: sys.combat?.initiative ?? 0,
        placeholder: "<lvl>"
      },
      {
        key: "accuracy",
        name: "formulas.accuracy",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Accuracy"),
        formula: formulas.accuracy || CompanionFormulasDialog.DEFAULT_FORMULAS.accuracy,
        currentValue: sys.combat?.accuracy ?? 0,
        placeholder: "<lvl>+<c.skill>"
      },
      {
        key: "guard",
        name: "formulas.guard",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Guard"),
        formula: formulas.guard || CompanionFormulasDialog.DEFAULT_FORMULAS.guard,
        currentValue: sys.combat?.guard ?? 0,
        placeholder: "<lvl>+<c.agility>"
      },
      {
        key: "resist",
        name: "formulas.resist",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Resist"),
        formula: formulas.resist || CompanionFormulasDialog.DEFAULT_FORMULAS.resist,
        currentValue: sys.combat?.resist ?? 0,
        placeholder: "<lvl>+<c.spirit>"
      },
      {
        key: "prevail",
        name: "formulas.prevail",
        label: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.Prevail"),
        formula: formulas.prevail || CompanionFormulasDialog.DEFAULT_FORMULAS.prevail,
        currentValue: sys.combat?.prevail ?? 0,
        placeholder: "<lvl>+<c.intellect>"
      }
    ];

    // Variables reference list for quick copy / documentation
    context.variables = [
      { token: "<lvl>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarLvl") },
      { token: "<c.lvl>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCLvl") },
      { token: "<c.skill>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCSkill") },
      { token: "<c.skill_die>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCSkillDie") },
      { token: "<c.mighty>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCMighty") },
      { token: "<c.agility>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCAgility") },
      { token: "<c.intellect>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCIntellect") },
      { token: "<c.spirit>", desc: game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.VarCSpirit") }
    ];

    return context;
  }

  /**
   * Save the updated formulas to the actor document.
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onSave(event, target) {
    const form = this.element.tagName === "FORM" ? this.element : this.element.querySelector("form") || this.element;
    const formData = new foundry.applications.ux.FormDataExtended(form).object;

    const updatedFormulas = {
      level:       formData["formulas.level"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.level,
      skill_die:   formData["formulas.skill_die"]?.trim() || formData["formulas.damageDie"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.skill_die,
      damageDie:   formData["formulas.skill_die"]?.trim() || formData["formulas.damageDie"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.skill_die,
      hp:          formData["formulas.hp"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.hp,
      speed:       formData["formulas.speed"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.speed,
      speed_bonus: formData["formulas.speed_bonus"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.speed_bonus,
      initiative:  formData["formulas.initiative"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.initiative,
      accuracy:    formData["formulas.accuracy"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.accuracy,
      guard:       formData["formulas.guard"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.guard,
      resist:      formData["formulas.resist"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.resist,
      prevail:     formData["formulas.prevail"]?.trim() || CompanionFormulasDialog.DEFAULT_FORMULAS.prevail
    };

    await this.actor.update({ "system.formulas": updatedFormulas });

    ui.notifications.info(
      game.i18n.format("TRESPASSER.Notification.Companion.FormulasSaved", { name: this.actor.name })
    );

    this.close();
  }

  /**
   * Reset formulas to system defaults.
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onReset(event, target) {
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Dialog.Reset.ConfigTitle") },
      content: `<p>${game.i18n.localize("TRESPASSER.Dialog.CompanionFormulas.ResetConfirm")}</p>`,
      rejectClose: false
    });

    if (!confirm) return;

    await this.actor.update({ "system.formulas": CompanionFormulasDialog.DEFAULT_FORMULAS });

    ui.notifications.info(
      game.i18n.format("TRESPASSER.Notification.Companion.FormulasReset", { name: this.actor.name })
    );

    this.render(true);
  }

  /**
   * Cancel and close dialog.
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onCancel(event, target) {
    this.close();
  }
}
