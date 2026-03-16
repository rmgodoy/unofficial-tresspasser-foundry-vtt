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
      title: "TRESPASSER.Config.Title"
    },
    actions: {
      reset: TrespasserConfigV2._onReset,
      save: TrespasserConfigV2._onSubmit
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
        { id: "mechanics", label: "TRESPASSER.Config.Tabs.Mechanics", icon: "fas fa-cog" },
        { id: "exploration", label: "TRESPASSER.Config.Tabs.Exploration", icon: "fas fa-map" },
        { id: "visuals", label: "TRESPASSER.Config.Tabs.Visuals", icon: "fas fa-eye" }
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
      showInitiativeInChat: game.settings.get("trespasser", "showInitiativeInChat"),
      restrictMovementAction: game.settings.get("trespasser", "restrictMovementAction"),
      restrictHUDActions: game.settings.get("trespasser", "restrictHUDActions"),
      restrictAPFocusUsage: game.settings.get("trespasser", "restrictAPFocusUsage"),
      groupCheckFullParty: game.settings.get("trespasser", "groupCheckFullParty"),
      restrictHavenEditToLeader: game.settings.get("trespasser", "restrictHavenEditToLeader"),
      bypassHavenBuildingLimits: game.settings.get("trespasser", "bypassHavenBuildingLimits"),
      clockSize: game.settings.get("trespasser", "clockSize"),
      fontSizeBase: game.settings.get("trespasser", "fontSizeBase")
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
      value: game.settings.get("trespasser", key),
      label: `TRESPASSER.Config.${key}`
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
    const formData = new FormDataExtended(this.element).object;
    
    // Handle standard settings
    for ( let [key, val] of Object.entries(formData) ) {
        // Skip the _text inputs used for display
        if ( key.endsWith("_text") ) continue;
        
        const setting = game.settings.settings.get(`trespasser.${key}`);
        if ( setting ) {
            // Only allow GMs to save world-scoped settings; everyone can save client-scoped
            if ( setting.scope !== "world" || game.user.isGM ) {
                await game.settings.set("trespasser", key, val);
            }
        }
    }

    // Apply changes immediately
    game.trespasser.applySystemSettings?.();

    ui.notifications.info(game.i18n.localize("TRESPASSER.Config.SavedNotice"));
  }

  static async _onReset(event, target) {
    // In ApplicationV2, 'this' in action handlers is bound to the instance
    const app = this;
    const confirm = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("TRESPASSER.Config.ResetConfirmTitle") },
        content: "<p>" + game.i18n.localize("TRESPASSER.Config.ResetConfirmContent") + "</p>",
        rejectClose: false
    });

    if ( !confirm ) return;

    // Reset all settings to defaults
    const settingsToReset = [
        "showInitiativeInChat", "restrictMovementAction", "restrictHUDActions", 
        "restrictAPFocusUsage", "groupCheckFullParty", "restrictHavenEditToLeader",
        "bypassHavenBuildingLimits", "clockSize", "fontSizeBase",
        "colorBgDark", "colorBgPanel", "colorBgInput", "colorBgHeader", "colorBgSelect",
        "colorBorder", "colorBorderLight", "colorGold", "colorGoldDim", "colorGoldBright",
        "colorRed", "colorRedDim", "colorText", "colorTextDim", "colorTextBright",
        "colorGreen", "colorGreenBright", "colorPurple", "colorBlue", "colorLightGreen",
        "colorCyan", "colorSpark", "colorShadow", "colorShadowGold", "colorShadowDark", "colorScrollbar",
        "colorBgOverlay", "colorGoldOverlay", "colorRedOverlay", "colorGreenOverlay"
    ];

    for ( const key of settingsToReset ) {
        const setting = game.settings.settings.get(`trespasser.${key}`);
        if ( !setting ) continue;
        
        // Only reset if it's client-scoped OR the user is a GM
        if ( setting.scope !== "world" || game.user.isGM ) {
            const def = setting.default;
            await game.settings.set("trespasser", key, def);
        }
    }

    app.render(true);
    game.trespasser.applySystemSettings?.();
    ui.notifications.info(game.i18n.localize("TRESPASSER.Config.ResetNotice"));
  }
}
