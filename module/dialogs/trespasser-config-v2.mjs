import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Trespasser Configuration - ApplicationsV2
 */
export class TrespasserConfigV2 extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options={}) {
    super(options);
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "dialog", "config-v2"],
    position: { width: 560, height: 600 },
    window: {
      resizable: true,
      minimizable: true,
      title: "TRESPASSER.Settings.Title"
    },
    actions: {
      reset: TrespasserConfigV2._onReset,
      save: TrespasserConfigV2._onSubmit,
      runDeedMigration: TrespasserConfigV2._onRunDeedMigration,
      runEffectMigration: TrespasserConfigV2._onRunEffectMigration
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/trespasser-config.hbs"
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "mechanics", label: "TRESPASSER.Settings.Tabs.Mechanics", icon: "fas fa-cog" },
        { id: "exploration", label: "TRESPASSER.Settings.Tabs.Exploration", icon: "fas fa-map" },
        { id: "visuals", label: "TRESPASSER.Settings.Tabs.Visuals", icon: "fas fa-eye" }
      ],
      initial: "mechanics"
    }
  };

  /** @override */
  tabGroups = {
    primary: game.user.isGM ? "mechanics" : "visuals"
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tabGroups = this.tabGroups;
    
    // Primary settings
    context.settings = {
      showInitiativeInChat: game.settings.get(SYSTEM_ID, "showInitiativeInChat"),
      applyEncumbranceRules: game.settings.get(SYSTEM_ID, "applyEncumbranceRules"),
      restrictMovementAction: game.settings.get(SYSTEM_ID, "restrictMovementAction"),
      restrictHUDActions: game.settings.get(SYSTEM_ID, "restrictHUDActions"),
      restrictAPFocusUsage: game.settings.get(SYSTEM_ID, "restrictAPFocusUsage"),
      enableGroupCheckSelection: game.settings.get(SYSTEM_ID, "enableGroupCheckSelection"),
      allowAllPlayersHavenEdit: game.settings.get(SYSTEM_ID, "allowAllPlayersHavenEdit"),
      enforceHavenBuildingLimits: game.settings.get(SYSTEM_ID, "enforceHavenBuildingLimits"),
      enforceAttackRange: game.settings.get(SYSTEM_ID, "enforceAttackRange"),
      enforceHandEquipLimits: game.settings.get(SYSTEM_ID, "enforceHandEquipLimits"),
      allowOutOfTurnMovement: game.settings.get(SYSTEM_ID, "allowOutOfTurnMovement"),
      showCreatureDamageRolls: game.settings.get(SYSTEM_ID, "showCreatureDamageRolls"),
      playerFacingInitiative: game.settings.get(SYSTEM_ID, "playerFacingInitiative"),
      confirmItemTransfer: game.settings.get(SYSTEM_ID, "confirmItemTransfer"),
      enableRetreatDialog: game.settings.get(SYSTEM_ID, "enableRetreatDialog"),
      showPerilInChat: game.settings.get(SYSTEM_ID, "showPerilInChat"),
      autoEndCombatOnRetreat: game.settings.get(SYSTEM_ID, "autoEndCombatOnRetreat"),
      clockSize: game.settings.get(SYSTEM_ID, "clockSize"),
      fontSizeBase: game.settings.get(SYSTEM_ID, "fontSizeBase"),
      showStatusEffectsOnTokens: game.settings.get(SYSTEM_ID, "showStatusEffectsOnTokens"),
      tokenStatusIconScale: game.settings.get(SYSTEM_ID, "tokenStatusIconScale"),
      showTargetPreviewInfo: game.settings.get(SYSTEM_ID, "showTargetPreviewInfo"),
      automateTravelTracker: game.settings.get(SYSTEM_ID, "automateTravelTracker")
    };

    // Color settings
    const colorKeys = [
      "colorBgDark", "colorBgPanel", "colorBgInput", "colorBgHeader", "colorBgSelect",
      "colorBorder", "colorBorderLight", "colorGold", "colorGoldDim", "colorGoldBright",
      "colorRed", "colorRedDim", "colorText", "colorTextDim", "colorTextBright",
      "colorGreen", "colorGreenBright", "colorPurple", "colorBlue", "colorLightGreen",
      "colorCyan", "colorSpark", "colorShadow", "colorShadowGold", "colorShadowDark", "colorScrollbar",
      "colorBgOverlay", "colorGoldOverlay", "colorRedOverlay", "colorGreenOverlay"
    ];

    context.colors = colorKeys.map(key => ({
      key,
      value: game.settings.get(SYSTEM_ID, key),
      label: `TRESPASSER.Settings.Colors.${key}.Name`
    }));

    context.isGM = game.user.isGM;

    // Prepare tabs context
    context.tabs = Object.entries(this.constructor.TABS).reduce((obj, [name, group]) => {
      obj[name] = group.tabs
        .filter(tab => context.isGM || tab.id === "visuals")
        .map(tab => {
          tab.active = this.tabGroups[name] === tab.id;
          tab.cssClass = tab.active ? "active" : "";
          return tab;
        });
      return obj;
    }, {});

    return context;
  }



  _onRender(context, options) {
    super._onRender(context, options);
    
    // Sync color picker with text input
    const html = this.element;
    html.querySelectorAll('input[type="color"]').forEach(picker => {
        picker.addEventListener('input', ev => {
            const textInput = html.querySelector(`input[name="${picker.name}_text"]`);
            if (textInput) textInput.value = ev.currentTarget.value;
        });
    });

    html.querySelectorAll('.color-text').forEach(textInput => {
        textInput.addEventListener('change', ev => {
            const pickerName = textInput.name.replace('_text', '');
            const picker = html.querySelector(`input[name="${pickerName}"]`);
            if (picker) picker.value = ev.currentTarget.value;
        });
    });

    // Handle form submission
    html.addEventListener("submit", event => {
        event.preventDefault();
        this.constructor._onSubmit.call(this, event);
    });
  }

  /**
   * Handle form submission to save settings
   * @param {Event} event 
   */
  static async _onSubmit(event) {
    const formData = new foundry.applications.ux.FormDataExtended(this.element).object;
    
    // Handle standard settings
    for ( let [key, val] of Object.entries(formData) ) {
        // Skip the _text inputs used for display
        if ( key.endsWith("_text") ) continue;
        
        const setting = game.settings.settings.get(`${SYSTEM_ID}.${key}`);
        if ( setting ) {
            // Only allow GMs to save world-scoped settings; everyone can save client-scoped
            if ( setting.scope !== "world" || game.user.isGM ) {
                await game.settings.set(SYSTEM_ID, key, val);
            }
        }
    }

    // Apply changes immediately
    game.trespasser.applySystemSettings?.();

    // Sync status effects on all tokens immediately if canvas is ready
    if ( canvas.ready && TrespasserEffectsHelper?.syncActorTokenEffects ) {
      for ( const token of canvas.tokens.placeables ) {
        if ( token.actor ) {
          await TrespasserEffectsHelper.syncActorTokenEffects(token.actor);
        }
      }
    }

    ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Save.Config"));
  }

  static async _onReset(event, target) {
    // In ApplicationV2, 'this' in action handlers is bound to the instance
    const app = this;
    const confirm = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("TRESPASSER.Dialog.Reset.ConfigTitle") },
        content: `<p>${game.i18n.localize("TRESPASSER.Dialog.Reset.ConfigContent")}</p>`,
        rejectClose: false
    });

    if ( !confirm ) return;

    // Reset all settings to defaults
    const settingsToReset = [
        "showInitiativeInChat", "applyEncumbranceRules", "restrictMovementAction", "restrictHUDActions", 
        "restrictAPFocusUsage", "enableGroupCheckSelection", "allowAllPlayersHavenEdit",
        "enforceHavenBuildingLimits", "enforceAttackRange", "enforceHandEquipLimits", "allowOutOfTurnMovement", "playerFacingInitiative", 
        "showCreatureDamageRolls", "enableRetreatDialog", "showPerilInChat", "autoEndCombatOnRetreat", "confirmItemTransfer",
        "automateTravelTracker",
        "clockSize", "fontSizeBase", "showStatusEffectsOnTokens", "tokenStatusIconScale", "showTargetPreviewInfo",
        "colorBgDark", "colorBgPanel", "colorBgInput", "colorBgHeader", "colorBgSelect",
        "colorBorder", "colorBorderLight", "colorGold", "colorGoldDim", "colorGoldBright",
        "colorRed", "colorRedDim", "colorText", "colorTextDim", "colorTextBright",
        "colorGreen", "colorGreenBright", "colorPurple", "colorBlue", "colorLightGreen",
        "colorCyan", "colorSpark", "colorShadow", "colorShadowGold", "colorShadowDark", "colorScrollbar",
        "colorBgOverlay", "colorGoldOverlay", "colorRedOverlay", "colorGreenOverlay"
    ];

    for ( const key of settingsToReset ) {
        const setting = game.settings.settings.get(`${SYSTEM_ID}.${key}`);
        if ( !setting ) continue;
        
        // Only reset if it's client-scoped OR the user is a GM
        if ( setting.scope !== "world" || game.user.isGM ) {
            const def = setting.default;
            await game.settings.set(SYSTEM_ID, key, def);
        }
    }

    app.render(true);
    game.trespasser.applySystemSettings?.();
    ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Reset.Config"));
  }

  static async _onRunDeedMigration(event, target) {
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Settings.DeedMigration.Name") },
      content: `<p>${game.i18n.localize("TRESPASSER.Settings.DeedMigration.ConfirmContent")}</p>`,
      rejectClose: false
    });

    if (!confirm) return;

    ui.notifications.info(game.i18n.localize("TRESPASSER.Settings.DeedMigration.Running"));
    const { migrateWorldDeeds, migrateCompendiumDeeds } = await import("../helpers/migration-deed.mjs");
    await migrateWorldDeeds({ force: true });
    await migrateCompendiumDeeds(`${SYSTEM_ID}.trespasser-content`, { force: true });
    ui.notifications.info(game.i18n.localize("TRESPASSER.Settings.DeedMigration.Success"));
  }

  static async _onRunEffectMigration(event, target) {
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Settings.EffectMigration.Name") },
      content: `<p>${game.i18n.localize("TRESPASSER.Settings.EffectMigration.ConfirmContent")}</p>`,
      rejectClose: false
    });

    if (!confirm) return;

    ui.notifications.info(game.i18n.localize("TRESPASSER.Settings.EffectMigration.Running"));
    const { migrateCompendiumEffects } = await import("../helpers/migration-effect.mjs");
    const count = await migrateCompendiumEffects(`${SYSTEM_ID}.trespasser-content`, { force: true });
    ui.notifications.info(game.i18n.format("TRESPASSER.Settings.EffectMigration.Success", { count }));
  }
}
