import {
  CREATURE_ROLES_LIST,
  CREATURE_TEMPLATES_LIST,
  getCreatureCalculatedStats
} from "../config/creature-tables.mjs";

/**
 * Creature Configuration Dialog (ApplicationV2)
 * Allows GMs to configure base statistics, templates, and roles following the rulebook tables.
 */
export class TrespasserCreatureConfigDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  /**
   * Static helper to instantiate and render the dialog.
   * @param {Actor} actor - Creature actor to configure.
   * @returns {Promise<boolean>} Resolves true if applied, false if cancelled.
   */
  static async wait(actor) {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (val) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };
      const dialog = new TrespasserCreatureConfigDialog(actor, safeResolve);
      dialog.render(true);
    });
  }

  constructor(actor, resolve, options = {}) {
    super(options);
    this.actor = actor;
    this.resolve = resolve;

    this.selectedTemplate = actor.system.template || "normal";
    this.selectedRole = actor.system.role || "guardian";
    this.selectedLevel = Math.max(0, Math.min(9, actor.system.level ?? 1));
  }

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "dialog", "creature-config-dialog"],
    position: { width: 420, height: "auto" },
    window: {
      resizable: true,
      minimizable: false,
      title: ""
    },
    actions: {
      apply: TrespasserCreatureConfigDialog._onApply,
      cancel: TrespasserCreatureConfigDialog._onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/creature-config-dialog.hbs"
    }
  };

  /** @override */
  get title() {
    return game.i18n.format("TRESPASSER.Dialog.CreatureConfig.Title", { name: this.actor.name });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const roles = CREATURE_ROLES_LIST.map(role => ({
      value: role,
      label: game.i18n.localize(`TRESPASSER.Sheet.Creatures.Roles.${role.capitalize()}`),
      selected: role === this.selectedRole
    }));

    const templates = CREATURE_TEMPLATES_LIST.map(tmpl => ({
      value: tmpl,
      label: game.i18n.localize(`TRESPASSER.Sheet.Creatures.Templates.${tmpl.capitalize()}`),
      selected: tmpl === this.selectedTemplate
    }));

    const levels = Array.from({ length: 10 }, (_, i) => ({
      value: i,
      label: `${game.i18n.localize("TRESPASSER.Sheet.Header.Level")} ${i}`,
      selected: i === this.selectedLevel
    }));

    const calculatedStats = getCreatureCalculatedStats(this.selectedRole, this.selectedLevel, this.selectedTemplate);
    const threatRating = this.selectedTemplate === "underling" ? "1/4" : (this.selectedTemplate === "paragon" ? "2x" : (this.selectedTemplate === "tyrant" ? "4x" : "1x"));

    context.actorName = this.actor.name;
    context.roles = roles;
    context.templates = templates;
    context.levels = levels;
    context.selectedRole = this.selectedRole;
    context.selectedTemplate = this.selectedTemplate;
    context.selectedLevel = this.selectedLevel;

    context.roleDescription = `TRESPASSER.Dialog.CreatureConfig.Roles.${this.selectedRole.capitalize()}Desc`;
    context.templateRuleKey = `TRESPASSER.Dialog.CreatureConfig.Templates.${this.selectedTemplate.capitalize()}Rule`;

    context.stats = calculatedStats;
    context.threatRating = threatRating;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    const templateSelect = html.querySelector('select[name="config-template"]');
    const roleSelect = html.querySelector('select[name="config-role"]');
    const levelSelect = html.querySelector('select[name="config-level"]');

    if (templateSelect) {
      templateSelect.addEventListener("change", (ev) => {
        this.selectedTemplate = ev.currentTarget.value;
        this.render();
      });
    }

    if (roleSelect) {
      roleSelect.addEventListener("change", (ev) => {
        this.selectedRole = ev.currentTarget.value;
        this.render();
      });
    }

    if (levelSelect) {
      levelSelect.addEventListener("change", (ev) => {
        this.selectedLevel = parseInt(ev.currentTarget.value, 10) || 0;
        this.render();
      });
    }
  }

  /** @override */
  async close(options = {}) {
    this.resolve(false);
    return super.close(options);
  }

  /**
   * Apply calculated statistics to the Creature Actor.
   */
  static async _onApply(event, button) {
    const dialog = this;
    const stats = getCreatureCalculatedStats(dialog.selectedRole, dialog.selectedLevel, dialog.selectedTemplate);

    await dialog.actor.update({
      "system.role": dialog.selectedRole,
      "system.template": dialog.selectedTemplate,
      "system.level": dialog.selectedLevel,
      "system.health": stats.health,
      "system.max_health": stats.max_health,
      "system.guard": stats.guard,
      "system.resist": stats.resist,
      "system.initiative": stats.initiative,
      "system.accuracy": stats.accuracy,
      "system.speed": stats.speed,
      "system.prevail": stats.prevail
    });

    ui.notifications.info(game.i18n.format("TRESPASSER.Dialog.CreatureConfig.AppliedNotification", {
      name: dialog.actor.name
    }));

    dialog.resolve(true);
    await dialog.close();
  }

  /**
   * Cancel and close dialog.
   */
  static async _onCancel(event, button) {
    const dialog = this;
    dialog.resolve(false);
    await dialog.close();
  }
}
