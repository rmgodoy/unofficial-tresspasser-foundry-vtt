/**
 * Trespasser TTRPG — Foundry VTT System
 * Main entry point
 */

import { TrespasserCharacterData } from "./module/data/actor-character.mjs";
import { TrespasserCreatureData }  from "./module/data/actor-creature.mjs";
import { TrespasserArmorData }     from "./module/data/item-armor.mjs";
import { TrespasserWeaponData }    from "./module/data/item-weapon.mjs";
import { TrespasserRationsData }   from "./module/data/item-rations.mjs";
import { TrespasserEffectData }    from "./module/data/item-effect.mjs";
import { TrespasserDeedData }      from "./module/data/item-deed.mjs";
import { TrespasserFeatureData }   from "./module/data/item-feature.mjs";
import { TrespasserTalentData }    from "./module/data/item-talent.mjs";
import { TrespasserIncantationData } from "./module/data/item-incantation.mjs";
import { TrespasserItemData }        from "./module/data/item-item.mjs";
import { TrespasserAccessoryData }   from "./module/data/item-accessory.mjs";
import { TrespasserInjuryData }      from "./module/data/item-injury.mjs";
import { TrespasserCallingData }    from "./module/data/item-calling.mjs";
import { TrespasserActor }         from "./module/documents/actor.mjs";
import { TrespasserCombat }        from "./module/documents/combat.mjs";
import { TrespasserEffectsHelper } from "./module/helpers/effects-helper.mjs";
import { DurationHelper }          from "./module/helpers/duration-helper.mjs";
import { TrespasserCharacterSheet } from "./module/sheets/actor-character-sheet.mjs";
import { TrespasserCreatureSheet }  from "./module/sheets/actor-creature-sheet.mjs";
import { TrespasserArmorSheet }     from "./module/sheets/item-armor-sheet.mjs";
import { TrespasserWeaponSheet }    from "./module/sheets/item-weapon-sheet.mjs";
import { TrespasserRationsSheet }   from "./module/sheets/item-rations-sheet.mjs";
import { TrespasserEffectSheet }    from "./module/sheets/item-effect-sheet.mjs";
import { TrespasserDeedSheet }      from "./module/sheets/item-deed-sheet.mjs";
import { TrespasserFeatureSheet }   from "./module/sheets/item-feature-sheet.mjs";
import { TrespasserTalentSheet }    from "./module/sheets/item-talent-sheet.mjs";
import { TrespasserIncantationSheet } from "./module/sheets/item-incantation-sheet.mjs";
import { TrespasserItemSheet }        from "./module/sheets/item-item-sheet.mjs";
import { TrespasserAccessorySheet }   from "./module/sheets/item-accessory-sheet.mjs";
import { TrespasserInjurySheet }      from "./module/sheets/item-injury-sheet.mjs";
import { TrespasserCallingSheet }     from "./module/sheets/item-calling-sheet.mjs";
import { TrespasserCraftData }      from "./module/data/item-craft.mjs";
import { TrespasserCraftSheet }     from "./module/sheets/item-craft-sheet.mjs";
import { TrespasserPastLifeData }  from "./module/data/item-past-life.mjs";
import { TrespasserPastLifeSheet } from "./module/sheets/item-past-life-sheet.mjs";
import { ItemExporter }            from "./module/helpers/item-exporter.mjs";
import { TrespasserCombatTracker } from "./module/sheets/combat-tracker.mjs";
import { TrespasserConfigV2 } from "./module/dialogs/trespasser-config-v2.mjs";
import { TrespasserTokenHUD }      from "./module/hud/token-hud.mjs";

// ── Party imports ────────────────────────────────────────────────────────────
import { TrespasserPartyData }    from "./module/data/actor-party.mjs";
import { TrespasserPartySheet }   from "./module/sheets/actor-party-sheet.mjs";

// ── Dungeon Exploration imports ──────────────────────────────────────────────
import { TrespasserDungeonData }   from "./module/data/actor-dungeon.mjs";
import { TrespasserRoomData }      from "./module/data/item-room.mjs";
import { DUNGEON_CONFIG, ensureDungeonHelpers } from "./module/config/dungeon-config.mjs";
import { TrespasserDungeonSheet }  from "./module/sheets/actor-dungeon-sheet.mjs";
import { TrespasserRoomSheet }     from "./module/sheets/item-room-sheet.mjs";
import { registerDungeonTrackerHooks } from "./module/exploration/dungeon-tracker.mjs";
import { TrespasserHavenData }   from "./module/data/actor-haven.mjs";
import { TrespasserHirelingData } from "./module/data/item-hireling.mjs";
import { TrespasserHavenSheet }   from "./module/sheets/actor-haven-sheet.mjs";
import { TrespasserHirelingSheet } from "./module/sheets/item-hireling-sheet.mjs";
import { TrespasserBuildData } from "./module/data/item-build.mjs";
import { TrespasserBuildSheet } from "./module/sheets/item-build-sheet.mjs";
import { TrespasserStrongholdData } from "./module/data/item-stronghold.mjs";
import { TrespasserStrongholdSheet } from "./module/sheets/item-stronghold-sheet.mjs";
import { registerHavenTrackerHooks } from "./module/exploration/haven-tracker.mjs";

Hooks.once("init", async () => {
  console.log("Trespasser | Initialising system");

  // Load partial templates
  await foundry.applications.handlebars.loadTemplates([
    "systems/trespasser/templates/actor/parts/deed-list.hbs",
    "systems/trespasser/templates/actor/parts/combat-effects.hbs",
    "systems/trespasser/templates/actor/parts/clock.hbs",
    "systems/trespasser/templates/item/parts/effect-chip.hbs",
    "systems/trespasser/templates/item/parts/effects-list.hbs",
    "systems/trespasser/templates/item/parts/deeds-list.hbs",
    "systems/trespasser/templates/combat/combat-tracker.hbs",
    // Party template
    "systems/trespasser/templates/actor/party-sheet.hbs",
    // Dungeon exploration templates
    "systems/trespasser/templates/dungeon/dungeon-tabs.hbs",
    "systems/trespasser/templates/dungeon/dungeon-overview.hbs",
    "systems/trespasser/templates/dungeon/dungeon-rooms.hbs",
    "systems/trespasser/templates/dungeon/dungeon-log.hbs",
    "systems/trespasser/templates/dungeon/dungeon-notes.hbs",
    "systems/trespasser/templates/exploration/dungeon-tracker.hbs",
    "systems/trespasser/templates/exploration/haven-tracker.hbs",
    "systems/trespasser/templates/item/room-sheet.hbs"
  ]);

  // Register custom document classes
  CONFIG.Actor.documentClass = TrespasserActor;
  CONFIG.Combat.documentClass = TrespasserCombat;
  CONFIG.ui.combat = TrespasserCombatTracker;

  CONFIG.TRESPASSER = {
    targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
    depletionDieOptions: {
      "": "TRESPASSER.Item.DepletionChoices.None",
      "d4": "TRESPASSER.Item.DepletionChoices.Crude",
      "d6": "TRESPASSER.Item.DepletionChoices.Normal",
      "d8": "TRESPASSER.Item.DepletionChoices.Fine",
      "d10": "TRESPASSER.Item.DepletionChoices.Excellent",
      "d12": "TRESPASSER.Item.DepletionChoices.Enchanted",
      "d20": "TRESPASSER.Item.DepletionChoices.Legendary"
    },
    actionTypeChoices: {
      "none": "TRESPASSER.Item.ActionTypeChoices.none",
      "action": "TRESPASSER.Item.ActionTypeChoices.action",
      "reaction": "TRESPASSER.Item.ActionTypeChoices.reaction"
    },
    // Dungeon exploration config
    dungeon: DUNGEON_CONFIG
  };

  // Register settings
  game.settings.register("trespasser", "showInitiativeInChat", {
    name: "TRESPASSER.Config.ShowInitiativeInChat",
    hint: "TRESPASSER.Config.ShowInitiativeInChatHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "restrictMovementAction", {
    name: "TRESPASSER.Config.RestrictMovementAction",
    hint: "TRESPASSER.Config.RestrictMovementActionHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "restrictHUDActions", {
    name: "TRESPASSER.Config.RestrictHUDActions",
    hint: "TRESPASSER.Config.RestrictHUDActionsHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "restrictAPFocusUsage", {
    name: "TRESPASSER.Config.RestrictAPFocusUsage",
    hint: "TRESPASSER.Config.RestrictAPFocusUsageHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "groupCheckFullParty", {
    name: "TRESPASSER.Config.GroupCheckFullParty",
    hint: "TRESPASSER.Config.GroupCheckFullPartyHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "restrictHavenEditToLeader", {
    name: "TRESPASSER.Config.RestrictHavenEditToLeader",
    hint: "TRESPASSER.Config.RestrictHavenEditToLeaderHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "bypassHavenBuildingLimits", {
    name: "TRESPASSER.Config.BypassHavenBuildingLimits",
    hint: "TRESPASSER.Config.BypassHavenBuildingLimitsHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "clockSize", {
    name: "TRESPASSER.Config.ClockSize",
    hint: "TRESPASSER.Config.ClockSizeHint",
    scope: "world",
    config: false,
    type: Number,
    default: 50
  });

  game.settings.register("trespasser", "fontSizeBase", {
    name: "TRESPASSER.Config.FontSizeBase",
    hint: "TRESPASSER.Config.FontSizeBaseHint",
    scope: "client",
    config: false,
    type: Number,
    default: 14
  });

  // ── Color Theme Settings ──
  const colorSettings = [
    { key: "colorBgDark", default: "#1a1714" },
    { key: "colorBgPanel", default: "#23201c" },
    { key: "colorBgInput", default: "#2e2a24" },
    { key: "colorBgHeader", default: "#1e1b17" },
    { key: "colorBgSelect", default: "#3a3228" },
    { key: "colorBorder", default: "#4a3f2f" },
    { key: "colorBorderLight", default: "#5c4f3a" },
    { key: "colorGold", default: "#c9a84c" },
    { key: "colorGoldDim", default: "#a88840" },
    { key: "colorGoldBright", default: "#e8c96b" },
    { key: "colorRed", default: "#ff5252" },
    { key: "colorRedDim", default: "#922c2c" },
    { key: "colorText", default: "#ddd0aa" },
    { key: "colorTextDim", default: "#a09070" },
    { key: "colorTextBright", default: "#f5eccc" },
    { key: "colorGreen", default: "#2d5a2d" },
    { key: "colorGreenBright", default: "#4a8a4a" },
    { key: "colorPurple", default: "#9575cd" },
    { key: "colorBlue", default: "#3f51b5" },
    { key: "colorLightGreen", default: "#8bc34a" },
    { key: "colorCyan", default: "#4fc3f7" },
    { key: "colorSpark", default: "#4fc3f7" },
    { key: "colorShadow", default: "#9575cd" },
    { key: "colorShadowGold", default: "#c9a84c" },
    { key: "colorShadowDark", default: "#000000" },
    { key: "colorBgOverlay", default: "#000000" },
    { key: "colorGoldOverlay", default: "#c9a84c" },
    { key: "colorRedOverlay", default: "#ff5252" },
    { key: "colorGreenOverlay", default: "#2d5a2d" },
    { key: "colorScrollbar", default: "#782e22" }
  ];

  for ( const color of colorSettings ) {
    game.settings.register("trespasser", color.key, {
      name: `TRESPASSER.Config.${color.key}`,
      scope: "client",
      config: false,
      type: String,
      default: color.default
    });
  }

  // Register data models
  CONFIG.Actor.dataModels.character = TrespasserCharacterData;
  CONFIG.Actor.dataModels.creature = TrespasserCreatureData;
  CONFIG.Actor.dataModels.dungeon  = TrespasserDungeonData;
  CONFIG.Actor.dataModels.party    = TrespasserPartyData;
  CONFIG.Actor.dataModels.haven    = TrespasserHavenData;

  CONFIG.Item.dataModels.armor = TrespasserArmorData;
  CONFIG.Item.dataModels.weapon = TrespasserWeaponData;
  CONFIG.Item.dataModels.rations = TrespasserRationsData;
  CONFIG.Item.dataModels.effect = TrespasserEffectData;
  CONFIG.Item.dataModels.deed = TrespasserDeedData;
  CONFIG.Item.dataModels.feature = TrespasserFeatureData;
  CONFIG.Item.dataModels.talent = TrespasserTalentData;
  CONFIG.Item.dataModels.incantation = TrespasserIncantationData;
  CONFIG.Item.dataModels.accessory = TrespasserAccessoryData;
  CONFIG.Item.dataModels.item = TrespasserItemData;
  CONFIG.Item.dataModels.injury = TrespasserInjuryData;
  CONFIG.Item.dataModels.calling = TrespasserCallingData;
  CONFIG.Item.dataModels.craft   = TrespasserCraftData;
  CONFIG.Item.dataModels.past_life = TrespasserPastLifeData;
  CONFIG.Item.dataModels.room    = TrespasserRoomData;
  CONFIG.Item.dataModels.hireling = TrespasserHirelingData;
  CONFIG.Item.dataModels.build = TrespasserBuildData;
  CONFIG.Item.dataModels.stronghold = TrespasserStrongholdData;

  // Sheets
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Trespasser Character Sheet",
  });
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserCreatureSheet, {
    types: ["creature"],
    makeDefault: true,
    label: "Trespasser Creature Sheet",
  });
  // Dungeon sheet (AppV2 — coexists with AppV1 sheets)
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserDungeonSheet, {
    types: ["dungeon"],
    makeDefault: true,
    label: "Trespasser Dungeon Sheet",
  });
  // Party sheet (AppV2)
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserPartySheet, {
    types: ["party"],
    makeDefault: true,
    label: "Trespasser Party Sheet",
  });
  // Haven sheet (AppV2)
  foundry.documents.collections.Actors.registerSheet("trespasser", TrespasserHavenSheet, {
    types: ["haven"],
    makeDefault: true,
    label: "Trespasser Haven Sheet",
  });

  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserArmorSheet, {
    types: ["armor"],
    makeDefault: true,
    label: "Trespasser Armor Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserWeaponSheet, {
    types: ["weapon"],
    makeDefault: true,
    label: "Trespasser Weapon Sheet",
  });

  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserRationsSheet, {
    types: ["rations"],
    makeDefault: true,
    label: "Trespasser Rations Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserEffectSheet, {
    types: ["effect"],
    makeDefault: true,
    label: "Trespasser Effect Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserDeedSheet, {
    types: ["deed"],
    makeDefault: true,
    label: "Trespasser Deed Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserFeatureSheet, {
    types: ["feature"],
    makeDefault: true,
    label: "Trespasser Feature Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserTalentSheet, {
    types: ["talent"],
    makeDefault: true,
    label: "Trespasser Talent Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserIncantationSheet, {
    types: ["incantation"],
    makeDefault: true,
    label: "Trespasser Incantation Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserAccessorySheet, {
    types: ["accessory"],
    makeDefault: true,
    label: "Trespasser Accessory Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "Trespasser Item Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserInjurySheet, {
    types: ["injury"],
    makeDefault: true,
    label: "Trespasser Injury Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserCallingSheet, {
    types: ["calling"],
    makeDefault: true,
    label: "Trespasser Calling Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserCraftSheet, {
    types: ["craft"],
    makeDefault: true,
    label: "Trespasser Craft Sheet",
  });
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserPastLifeSheet, {
    types: ["past_life"],
    makeDefault: true,
    label: "Trespasser Past Life Sheet",
  });
  // Room sheet (AppV2 — coexists with AppV1 sheets)
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserRoomSheet, {
    types: ["room"],
    makeDefault: true,
    label: "Trespasser Room Sheet",
  });
  // Hireling sheet (AppV2)
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserHirelingSheet, {
    types: ["hireling"],
    makeDefault: true,
    label: "Trespasser Hireling Sheet",
  });
  // Building sheet (AppV2)
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserBuildSheet, {
    types: ["build"],
    makeDefault: true,
    label: "Trespasser Building Sheet",
  });
  // Stronghold sheet (AppV2)
  foundry.documents.collections.Items.registerSheet("trespasser", TrespasserStrongholdSheet, {
    types: ["stronghold"],
    makeDefault: true,
    label: "Trespasser Stronghold Sheet",
  });


  // Handlebars helpers
  Handlebars.registerHelper("trespasserChecked", (value) => (value ? "checked" : ""));
  Handlebars.registerHelper("trespasserGt", (a, b) => a > b);
  Handlebars.registerHelper("gt", (a, b) => a > b);
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
  Handlebars.registerHelper("ne", (a, b) => a !== b);
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));
  Handlebars.registerHelper("capitalize", (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  Handlebars.registerHelper("concat", (...args) => args.slice(0, -1).join(""));
  Handlebars.registerHelper("lookup", (obj, key) => obj?.[key]);
  Handlebars.registerHelper("unless", Handlebars.helpers.unless);
  Handlebars.registerHelper("times", (n, block) => {
    let result = "";
    for (let i = 0; i < n; i++) result += block.fn(i);
    return result;
  });
  Handlebars.registerHelper("math", (lvalue, operator, rvalue) => {
    lvalue = parseFloat(lvalue);
    rvalue = parseFloat(rvalue);
    return {
      "+": lvalue + rvalue,
      "-": lvalue - rvalue,
      "*": lvalue * rvalue,
      "/": lvalue / rvalue,
      "%": lvalue % rvalue
    }[operator];
  });
  Handlebars.registerHelper('sum', function(a, b) {
    return a + b;
  });

  // Dungeon Handlebars helpers (registers "eq" only if not already present)
  ensureDungeonHelpers();

  // Dungeon tracker scene control button
  registerDungeonTrackerHooks();

  // Haven tracker scene control button
  registerHavenTrackerHooks();

  console.log("Trespasser | System ready");

  // Expose system namespace
  game.trespasser = game.trespasser || {};
  game.trespasser.ItemExporter = ItemExporter;
  game.trespasser.Config = TrespasserConfigV2;
});

/**
 * Socket handling for Token Action HUD / Help action
 */
Hooks.once("ready", () => {
  // Initialize Token Action HUD
  game.trespasser.tokenHUD = new TrespasserTokenHUD();

  // Function to apply settings to CSS variables
  game.trespasser.applySystemSettings = () => {
    const clockSize = game.settings.get("trespasser", "clockSize") || 50;
    document.documentElement.style.setProperty('--trp-clock-size', `${clockSize}px`);

    const fontSize = game.settings.get("trespasser", "fontSizeBase") || 16;
    document.documentElement.style.setProperty('--trp-font-size-base', `${fontSize}px`);

    // Apply colors
    const colors = [
      { key: "colorBgDark", var: "--trp-bg-dark" },
      { key: "colorBgPanel", var: "--trp-bg-panel" },
      { key: "colorBgInput", var: "--trp-bg-input" },
      { key: "colorBgHeader", var: "--trp-bg-header" },
      { key: "colorBgSelect", var: "--trp-bg-select" },
      { key: "colorBorder", var: "--trp-border" },
      { key: "colorBorderLight", var: "--trp-border-light" },
      { key: "colorGold", var: "--trp-gold" },
      { key: "colorGoldDim", var: "--trp-gold-dim" },
      { key: "colorGoldBright", var: "--trp-gold-bright" },
      { key: "colorRed", var: "--trp-red" },
      { key: "colorRedDim", var: "--trp-red-dim" },
      { key: "colorText", var: "--trp-text" },
      { key: "colorTextDim", var: "--trp-text-dim" },
      { key: "colorTextBright", var: "--trp-text-bright" },
      { key: "colorGreen", var: "--trp-green" },
      { key: "colorGreenBright", var: "--trp-green-bright" },
      { key: "colorPurple", var: "--trp-purple" },
      { key: "colorBlue", var: "--trp-blue" },
      { key: "colorLightGreen", var: "--trp-light-green" },
      { key: "colorCyan", var: "--trp-cyan" },
      { key: "colorSpark", var: "--trp-spark" },
      { key: "colorShadow", var: "--trp-shadow" },
      { key: "colorShadowGold", var: "--trp-shadow-gold" },
      { key: "colorShadowDark", var: "--trp-shadow-dark" },
      { key: "colorBgOverlay", var: "--trp-bg-overlay" },
      { key: "colorGoldOverlay", var: "--trp-gold-overlay" },
      { key: "colorRedOverlay", var: "--trp-red-overlay" },
      { key: "colorGreenOverlay", var: "--trp-green-overlay" },
      { key: "colorScrollbar", var: "--trp-scrollbar" }
    ];

    for ( const c of colors ) {
      const val = game.settings.get("trespasser", c.key);
      document.documentElement.style.setProperty(c.var, val);
      
      // Update variables that need alpha (hex to rgba conversion would be better here, 
      // but for now we'll just append hex alpha).
      if ( c.key === "colorShadowGold" ) {
        document.documentElement.style.setProperty('--trp-shadow-gold', `${val}66`);
      } else if ( c.key === "colorShadowDark" ) {
        document.documentElement.style.setProperty('--trp-shadow-dark', `${val}80`);
      } else if ( c.key.endsWith("Overlay") ) {
        // Overlay colors get ~10% opacity (1a in hex)
        // Background overlay gets ~25% opacity (40 in hex)
        const alpha = c.key === "colorBgOverlay" ? "40" : "1a";
        document.documentElement.style.setProperty(c.var, `${val}${alpha}`);
      }
    }
  };

  // Initial application
  game.trespasser.applySystemSettings();

  // Listen for changes
  Hooks.on("closeSettingsConfig", () => {
    game.trespasser.applySystemSettings();
  });

  // Also listen for specific setting changes if they happen via API
  // Foundry 12+ has a more specific way, but closeSettingsConfig is safe for most cases.
  // We can also use the refresh event if needed.

  // Prevent default turn marker from being added to tokens, since we are implementing our own turn marker system
  if (foundry.canvas.placeables.tokens?.TokenTurnMarker) {
    foundry.canvas.placeables.tokens.TokenTurnMarker.prototype.draw = async function() {
      return; 
    };
  }

  if (game.combat) {
    game.combat.updateTurnMarkers(game.combat.flags.trespasser.activePhase);
  }
});

/**
 * Prevent players from controlling Haven tokens, even if they have ownership.
 */
// Variable to track the last valid (non-Haven) selection
let _lastValidControlledTokens = [];

/**
 * Prevent players from controlling Haven tokens, even if they have ownership.
 * If they try to select it, we immediately release it and restore their previous character selection.
 */
Hooks.on("controlToken", (token, controlled) => {
  if (controlled) {
    if (token.actor?.type === "haven" && !game.user.isGM) {
      token.release();
      // Restore the previous valid selection
      if (_lastValidControlledTokens.length) {
        _lastValidControlledTokens.forEach(t => {
          if (!t._destroyed) t.control({ releaseOthers: false });
        });
      }
    } else {
      // Capture the current selection after this control cycle finishes
      setTimeout(() => {
        const current = canvas.tokens?.controlled || [];
        if (current.length > 0 && !current.some(t => t.actor?.type === "haven")) {
          _lastValidControlledTokens = [...current];
        } else if (current.length === 0) {
          _lastValidControlledTokens = [];
        }
      }, 0);
    }
  }
});

Hooks.on("preUpdateActor", (actor, updateData, options, userId) => {
  // Sync prototype token name for base actors if name changes
  if (updateData.name && !actor.isToken) {
    updateData.prototypeToken = updateData.prototypeToken || {};
    updateData.prototypeToken.name = updateData.name;
  }
});

/* ─── Stronghold Benefit Syncing ─── */
Hooks.on("createItem", (item, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.parent?.type === "haven" && item.type === "stronghold") {
    console.log("Trespasser | Global Hook - createItem (Stronghold)");
    item.parent.system.syncStrongholdBenefit(item);
  }
});

Hooks.on("updateItem", (item, delta, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.parent?.type === "haven" && item.type === "stronghold") {
     console.log("Trespasser | Global Hook - updateItem (Stronghold)");
     item.parent.system.syncStrongholdBenefit(item, delta);
  }
});

Hooks.on("deleteItem", (item, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.parent?.type === "haven" && item.type === "stronghold") {
     console.log("Trespasser | Global Hook - deleteItem (Stronghold)");
     item.parent.system.syncStrongholdBenefit(item, { deleted: true });
  }
});

Hooks.on("renderChatMessageHTML", (message, html, data) => {
  // Determine color based on speaker instead of just author
  let borderColor = "#000000";
  const speaker = message.speaker;

  if (speaker.actor || speaker.token) {
    const actor = ChatMessage.getSpeakerActor(speaker);
    if (actor) {
      if (actor.type === "character") {
        // Use the owner's color for characters if possible
        const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
        if (owners.length > 0) borderColor = owners[0].color;
      }
    }
  }

  if (borderColor) {
    html.style.border = `2px solid ${borderColor}`;
    html.style.backgroundColor = "var(--trp-bg-dark)";
  }

  html.querySelectorAll(".apply-effect-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const uuid = btn.dataset.uuid;
      const itemIntensity = parseInt(btn.dataset.intensity);
      if (!uuid) return;

      const sourceItem = await fromUuid(uuid);
      if (!sourceItem) {
        ui.notifications.error(game.i18n.localize("TRESPASSER.Dialog.ItemNotFound"));
        return;
      }

      const baseIntensity = !isNaN(itemIntensity) ? itemIntensity : (sourceItem.system.intensity || 0);

      const tokens = canvas.tokens.controlled;
      if (tokens.length === 0) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTargetsAbort"));
        return;
      }

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const itemData = sourceItem.toObject();
        itemData.system.intensity = baseIntensity;
        delete itemData._id;

        await foundry.documents.BaseItem.create(itemData, { parent: actor });
        ui.notifications.info(game.i18n.format("TRESPASSER.Chat.AppliedEffect", { name: sourceItem.name, target: actor.name }));
      }
    });
  });

  html.querySelectorAll(".apply-help-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const targetUuid = btn.dataset.targetUuid;
      const attr = btn.dataset.targetAttribute;
      const mod = btn.dataset.modifier;
      const sourceName = btn.dataset.sourceName;

      const doc = await fromUuid(targetUuid);
      const targetActor = doc?.actor || doc;
      if (!targetActor) return;

      const effectData = {
        name: game.i18n.format("TRESPASSER.Chat.HelpFrom", { name: sourceName }),
        type: "effect",
        img: "system/trespasser/assets/icons/effects.png",
        system: {
          targetAttribute: attr,
          modifier: mod,
          isCombat: true,
          isPrevailable: false,
          type: "on-trigger",
          duration: "trigger",
          durationValue: 1,
          durationOperator: "OR",
          durationConditions: [
            { mode: "trigger", value: 1 },
            { mode: "round", value: 1 }
          ],
          when: "use"
        }
      };

      await targetActor.createEmbeddedDocuments("Item", [effectData]);
      ui.notifications.info(game.i18n.format("TRESPASSER.Chat.AppliedHelp", { name: targetActor.name }));
    });
  });

  // ── Apply Damage button ───────────────────────────────────────────────────
  html.querySelectorAll(".apply-damage-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rawDamage = parseInt(btn.dataset.damage);
      if (isNaN(rawDamage)) return;

      // Prefer controlled tokens; fall back to targeted tokens
      let tokens = canvas.tokens.controlled;
      if (tokens.length === 0) tokens = Array.from(game.user.targets);
      if (tokens.length === 0) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTargetsAbort"));
        return;
      }

      // Identify attacker from message speaker
      const messageId = btn.closest(".message")?.dataset.messageId;
      const message = game.messages.get(messageId);
      const attackerSpeaker = message?.speaker;
      const attacker = attackerSpeaker?.actor ? game.actors.get(attackerSpeaker.actor) : null;

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        // Reduction from Damage Received effects on the target — rolled async for dice/token support
        const reduction = await TrespasserEffectsHelper.evaluateDamageBonus(actor, "damage_received");
        // reduction is stored as a negative modifier (e.g. -2 means take 2 less damage)
        // getAttributeBonus returns the sum, so subtract it from incoming damage
        const finalDamage = Math.max(0, rawDamage + reduction); // reduction is expected to be negative

        const newHP = Math.max(0, (actor.system.health ?? 0) - finalDamage);
        await actor.update({ "system.health": newHP });

        // Trigger damage-received effects
        await TrespasserEffectsHelper.triggerEffects(actor, "damage-received");

        // Trigger damage-dealt effects on the attacker
        if (attacker) {
          await TrespasserEffectsHelper.triggerEffects(attacker, "damage-dealt");
        }

        const msg = reduction !== 0
          ? game.i18n.format("TRESPASSER.Chat.TookDamageReduction", { name: actor.name, damage: finalDamage, raw: rawDamage, reduction: Math.abs(reduction) })
          : game.i18n.format("TRESPASSER.Chat.TookDamage", { name: actor.name, damage: finalDamage });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trespasser-chat-card"><p>${msg}</p></div>`
        });
      }
    });
  });

  // ── Heal Damage button ────────────────────────────────────────────────────
  html.querySelectorAll(".heal-damage-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const healAmount = parseInt(btn.dataset.damage);
      if (isNaN(healAmount)) return;

      let tokens = canvas.tokens.controlled;
      if (tokens.length === 0) tokens = Array.from(game.user.targets);
      if (tokens.length === 0) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoTargetsAbort"));
        return;
      }

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const newHP = Math.min(actor.system.max_health ?? actor.system.health, (actor.system.health ?? 0) + healAmount);
        await actor.update({ "system.health": newHP });

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trespasser-chat-card"><p>${game.i18n.format("TRESPASSER.Chat.HealedAmount", { name: actor.name, amount: healAmount })}</p></div>`
        });
      }
    });
  });
});

Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  if (changed.flags?.trespasser?.activePhase !== undefined) {
    combat.updateTurnMarkers(changed.flags.trespasser.activePhase);
  }
});

Hooks.on("updateCombatant", (combatant, changed, options, userId) => {
  if (!game.combat) return;
  const isDefeatedChanged = changed.defeated !== undefined;
  const isAPChanged = changed.flags?.trespasser?.actionPoints !== undefined;
  if (isDefeatedChanged || isAPChanged) {
    const activePhase = game.combat.getFlag("trespasser", "activePhase");
    game.combat.updateTurnMarkers(activePhase);
  }
});

Hooks.on("deleteCombat", async (combat) => {
  for (const c of combat.combatants) {
    if (c.actor) {
      await TrespasserEffectsHelper.triggerEffects(c.actor, "end-of-combat");
      
      // Remove effects where combat-end triggers expiry (compound or legacy "combat" duration)
      const toRemove = c.actor.items.filter(i => {
        if (i.type !== "effect") return false;
        return DurationHelper.shouldExpire(i) || i.system.duration === "combat";
      });
      for (const eff of toRemove) {
        await eff.delete();
      }
    }
  }
});

// Token IDs currently undergoing a Trespasser undo — used to bypass movement hooks
globalThis._trespasserUndoSet = new Set();

/**
 * Calculate total distance moved from native token document movement history.
 * @param {TokenDocument} tokenDoc
 * @returns {number}
 * @private
 */
function _calculateTokenMovementDistance(tokenDoc) {
  const history = tokenDoc.movementHistory;
  if ( !history || history.length < 2 ) return 0;
  let totalDistance = 0;
  for ( let i = 0; i < history.length - 1; i++ ) {
    const start = history[i];
    const end = history[i+1];
    const distRaw = canvas.grid.measurePath([start, end]).distance;
    totalDistance += Math.round(distRaw / canvas.dimensions.distance);
  }
  return totalDistance;
}

/**
 * Handle token movement restrictions in combat.
 */
Hooks.on("preUpdateToken", (tokenDoc, changed, options, userId) => {
  // Only enforce if position changes
  if (changed.x === undefined && changed.y === undefined) return;
  // Bypass enforcement for undo operations
  if (globalThis._trespasserUndoSet.has(tokenDoc.id)) return;
  if (!game.combat || !game.combat.active || !game.combat.started) return;
  
  const combatant = game.combat.combatants.find(c => c.tokenId === tokenDoc.id);
  if (!combatant) return;

  const activePhase = game.combat.getFlag("trespasser", "activePhase");
  
  // If it's not this token's phase, block non-GMs; GM repositioning is allowed but not tracked
  if (combatant.initiative !== activePhase) {
      if (!game.user.isGM) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NotYourPhase"));
          return false;
      }
      return; // GM reposition out of phase — don't track
  }

  // GMs bypass the action/limit checks but their in-phase moves are tracked
  const restrictMovement = game.settings.get("trespasser", "restrictMovementAction");
  if (game.user.isGM || !restrictMovement) {
    options.trespasserTrack = true;
    return;
  }

  const moveActionTaken = combatant.getFlag("trespasser", "moveActionTaken") ?? false;
  if (!moveActionTaken) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.MoveActionRequired"));
      return false;
  }

  const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
  const movementUsed = _calculateTokenMovementDistance(tokenDoc);
  const isVaulting = combatant.getFlag("trespasser", "isVaulting") ?? false;
  
  // Calculate distance of the proposed move
  const start  = { x: tokenDoc.x,             y: tokenDoc.y };
  const end    = { x: changed.x ?? tokenDoc.x, y: changed.y ?? tokenDoc.y };
  const distRaw = canvas.grid.measurePath([start, end]).distance;
  const dist    = Math.round(distRaw / canvas.dimensions.distance);

  if (isVaulting) {
      const startPos = combatant.getFlag("trespasser", "vaultStartPos") || start;
      const dx = end.x - startPos.x;
      const dy = end.y - startPos.y;
      const isStraight = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
      
      if (!isStraight) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.VaultStraightLine"));
          return false;
      }
  }

  if ((movementUsed + dist) > movementAllowed) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.MovementLimitExceeded"));
      return false;
  }

  options.trespasserTrack = true;
  options.trespasserMoveDist = dist;
  options.trespasserIsFirstMove = (movementUsed === 0);
});

Hooks.on("updateToken", async (tokenDoc, changed, options, userId) => {
  if (game.user.id !== userId) return;
  
  // Sync token name back to actor name if it's unlinked
  if (changed.name && !tokenDoc.isLinked && tokenDoc.actor) {
    if (tokenDoc.actor.name !== changed.name) {
      await tokenDoc.actor.update({ name: changed.name });
    }
  }

  // Only position changes from here on
  if (changed.x === undefined && changed.y === undefined) return;
  if (!game.combat || !game.combat.active || !game.combat.started) return;

  const combatant = game.combat.combatants.find(c => c.tokenId === tokenDoc.id);
  if (!combatant) return;

  const activePhase = game.combat.getFlag("trespasser", "activePhase");
  if (combatant.initiative !== activePhase) return;

  // Sync flags with native movement history
  const totalDist = _calculateTokenMovementDistance(tokenDoc);
  
  await combatant.update({
    "flags.trespasser.movementUsed": totalDist,
    "flags.trespasser.movementHistory": tokenDoc.movementHistory,
    "flags.trespasser.hasMovedThisTurn": totalDist > 0,
    "flags.trespasser.isVaulting": false
  });

  // Trigger movement effects if this was a valid tracked move (not an undo)
  if (options.trespasserTrack && combatant.actor) {
    const dist = options.trespasserMoveDist || 0;
    
    // 1. First move of the turn trigger
    if (options.trespasserIsFirstMove && dist > 0) {
      await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-first-move");
    }

    // 2. Continuous movement trigger (once per square)
    for (let i = 0; i < dist; i++) {
      await TrespasserEffectsHelper.triggerEffects(combatant.actor, "on-move");
    }
  }

  // Re-render the HUD so the Undo button appears immediately after moving
  game.trespasser?.tokenHUD?.render();
});

/**
 * Feature linked item application when an item is created.
 */
Hooks.on("createItem", async (item, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = item.parent;
  if (!actor || actor.constructor.name !== "TrespasserActor") return;

  if (item.type === "feature") {
    const effects = item.system.effects || [];
    const deeds = item.system.deeds || [];
    if (effects.length > 0) await actor._applyLinkedItems(effects);
    if (deeds.length > 0) await actor._applyLinkedItems(deeds);
  } else if (item.type === "accessory" && item.system.equipped) {
    const sys = item.system;
    if (sys.talents?.length > 0)  await actor._applyLinkedItems(sys.talents);
    if (sys.features?.length > 0) await actor._applyLinkedItems(sys.features);
    if (sys.deeds?.length > 0)    await actor._applyLinkedItems(sys.deeds);
    if (sys.effects?.length > 0)  await actor._applyLinkedItems(sys.effects, { continuousOnly: true });
  } else if (item.type === "injury") {
    // Apply all effects listed on the injury — these cannot be prevailed against
    const effects = item.system.effects || [];
    if (effects.length > 0) {
      await actor._applyLinkedItems(effects, { continuousOnly: false, fromInjury: true, injuryId: item.id });
    }
  }
});

/**
 * Feature linked item removal when an item is deleted.
 */
Hooks.on("deleteItem", async (item, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = item.parent;
  if (!actor || actor.constructor.name !== "TrespasserActor") return;

  if (item.type === "feature") {
    const effects = item.system.effects || [];
    const deeds = item.system.deeds || [];
    if (effects.length > 0) await actor._removeLinkedItems(effects, item.id);
    if (deeds.length > 0) await actor._removeLinkedItems(deeds, item.id);
  } else if (item.type === "accessory") {
    const sys = item.system;
    if (sys.talents?.length > 0)  await actor._removeLinkedItems(sys.talents, item.id);
    if (sys.features?.length > 0) await actor._removeLinkedItems(sys.features, item.id);
    if (sys.deeds?.length > 0)    await actor._removeLinkedItems(sys.deeds, item.id);
    if (sys.effects?.length > 0)  await actor._removeLinkedItems(sys.effects, item.id);
  } else if (item.type === "injury") {
    // Remove all effect items on this actor that were stamped with this injury's ID
    const toRemove = actor.items.filter(
      i => (i.type === "effect") &&
           i.flags?.trespasser?.injuryId === item.id
    );
    for (const eff of toRemove) {
      await eff.delete();
    }
  }
});

/**
 * Update linked items if the Feature's link arrays change.
 */
Hooks.on("updateItem", async (item, changed, options, userId) => {
  if (game.user.id !== userId) return;
  const actor = item.parent;
  if (!actor || actor.constructor.name !== "TrespasserActor") return;

  if (item.type === "feature" && ("system" in changed)) {
    if ("effects" in changed.system || "deeds" in changed.system) {
       const effects = item.system.effects || [];
       const deeds = item.system.deeds || [];
       if (effects.length > 0) await actor._applyLinkedItems(effects);
       if (deeds.length > 0) await actor._applyLinkedItems(deeds);
    }
  } else if (item.type === "accessory" && item.system.equipped && ("system" in changed)) {
    const sys = item.system;
    if ("talents" in changed.system)  await actor._applyLinkedItems(sys.talents || []);
    if ("features" in changed.system) await actor._applyLinkedItems(sys.features || []);
    if ("deeds" in changed.system)    await actor._applyLinkedItems(sys.deeds || []);
    if ("effects" in changed.system)  await actor._applyLinkedItems(sys.effects || [], { continuousOnly: true });
  } else if (item.type === "injury" && ("system" in changed) && "effects" in changed.system) {
    // Re-apply whenever the injury's effects list changes
    const effects = item.system.effects || [];
    if (effects.length > 0) {
      await actor._applyLinkedItems(effects, { continuousOnly: false, fromInjury: true, injuryId: item.id });
    }
  }
});

/**
 * Assign default icons to items based on type if they use the default foundry icon.
 */
Hooks.on("preCreateItem", (item, createData, options, userId) => {
  const actor = item.parent;
  if (actor && (item.type === "effect")) {
    const system = item.system;
    let intensityToApply = system.intensity || 0;

    // 1. Handle Counter States
    const counterStates = system.counterStates || [];
    let wasCountered = false;
    if (counterStates.length > 0) {
      const counterNames = new Set(counterStates.map(cs => cs.name));
      const existingCounters = actor.items.filter(i => 
        (i.type === "effect") && 
        counterNames.has(i.name)
      );

      for (const counter of existingCounters) {
        wasCountered = true;
        if (intensityToApply <= 0) break;
        const counterIntensity = counter.system.intensity || 0;

        if (counterIntensity > intensityToApply) {
          counter.update({ "system.intensity": counterIntensity - intensityToApply });
          intensityToApply = 0;
        } else {
          intensityToApply -= counterIntensity;
          counter.delete();
        }
      }
    }

    // 2. If intensity reduced to 0 by counters, cancel creation
    if (wasCountered && intensityToApply <= 0) return false;

    // 3. Handle Summing with existing effect of same name
    const existing = actor.items.find(i => i.type === item.type && i.name === item.name);
    if (existing) {
      const currentIntensity = existing.system.intensity || 0;
      existing.update({ "system.intensity": currentIntensity + intensityToApply });
      return false; // Cancel creation of the new item
    }

    // 4. Update the item being created with the final intensity (if modified by counters)
    if (intensityToApply !== system.intensity) {
      item.updateSource({ "system.intensity": intensityToApply });
    }
  }

  if (item.type === "injury") {
    item.updateSource({ img: "systems/trespasser/assets/icons/injury.webp" });
  }
  if (item.img === "icons/svg/item-bag.svg") {
    let iconPath = "icons/svg/item-bag.svg";
    switch (item.type) {
      case "armor":
        iconPath = "systems/trespasser/assets/icons/armor.webp";
        break;
      case "weapon":
        iconPath = "systems/trespasser/assets/icons/weapon.webp";
        break;
      case "accessory":
        iconPath = "systems/trespasser/assets/icons/item.webp";
        break;
      case "rations":
        iconPath = "systems/trespasser/assets/icons/food.webp";
        break;
      case "effect":
        iconPath = "systems/trespasser/assets/icons/effect.webp";
        break;
      case "deed":
        iconPath = "systems/trespasser/assets/icons/deed.webp";
        break;
      case "incantation":
        iconPath = "systems/trespasser/assets/icons/incantation.webp";
        break;
      case "feature":
        iconPath = "systems/trespasser/assets/icons/feature.webp";
        break;
      case "talent":
        iconPath = "systems/trespasser/assets/icons/talent.webp";
        break;
      case "calling":
        iconPath = "systems/trespasser/assets/icons/calling_craft.webp";
        break;
      case "craft":
        iconPath = "systems/trespasser/assets/icons/calling_craft.webp";
        break;
      case "past_life":
        iconPath = "systems/trespasser/assets/icons/pesant.webp";
        break;
      case "room":
        iconPath = "systems/trespasser/assets/icons/room.webp";
        break;
      case "item":
        iconPath = "systems/trespasser/assets/icons/item.webp"
        break;
      case "hireling":
        iconPath = "systems/trespasser/assets/icons/pesant.webp";
        break;
      case "build":
        iconPath = "systems/trespasser/assets/icons/building.webp";
        break;
      case "stronghold":
        iconPath = "systems/trespasser/assets/icons/stronghold.webp";
        break;
    }
    item.updateSource({ img: iconPath });
  }
});

/**
 * Update placeholder icon when subType changes.
 */
Hooks.on("preUpdateItem", (item, changed, options, userId) => {
  if (changed.system?.subType && item.type === "item") {
    const isDefault = [
        "systems/trespasser/assets/icons/item.png",
        "systems/trespasser/assets/icons/tool.png",
        "systems/trespasser/assets/icons/resources.png",
        "systems/trespasser/assets/icons/ligth_sources.png",
        "systems/trespasser/assets/icons/bombs.png",
        "systems/trespasser/assets/icons/oils.png",
        "systems/trespasser/assets/icons/powders.png",
        "systems/trespasser/assets/icons/potions.png",
        "systems/trespasser/assets/icons/scrolls.png",
        "systems/trespasser/assets/icons/esoteric.png",
        "systems/trespasser/assets/icons/artifacts.png",
        "systems/trespasser/assets/icons/misellaneous.png",
        "icons/svg/item-bag.svg"
    ].includes(item.img);

    if (isDefault) {
        const subType = changed.system.subType;
        let iconPath = "systems/trespasser/assets/icons/item.png";
        if (subType === "tool") iconPath = "systems/trespasser/assets/icons/tool.png";
        else if (subType === "resource") iconPath = "systems/trespasser/assets/icons/resources.png";
        else if (subType === "light_source") iconPath = "systems/trespasser/assets/icons/ligth_sources.png";
        else if (subType === "bombs") iconPath = "systems/trespasser/assets/icons/bombs.png";
        else if (subType === "oils") iconPath = "systems/trespasser/assets/icons/oils.png";
        else if (subType === "powders") iconPath = "systems/trespasser/assets/icons/powders.png";
        else if (subType === "potions") iconPath = "systems/trespasser/assets/icons/potions.png";
        else if (subType === "scrolls") iconPath = "systems/trespasser/assets/icons/scrolls.png";
        else if (subType === "esoteric") iconPath = "systems/trespasser/assets/icons/esoteric.png";
        else if (subType === "artifacts") iconPath = "systems/trespasser/assets/icons/artifacts.png";
        else if (subType === "miscellaneous") iconPath = "systems/trespasser/assets/icons/misellaneous.png";

        changed.img = iconPath;
    }
  }
});

/**
 * Add export/import buttons to the items directory.
 */
Hooks.on("renderItemDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  // Handle both legacy jQuery and new V13 HTMLElement
  const $html = $(html);
  let header = $html.find(".header-actions");

  // Fallback for different structures or AppV2
  if (!header.length && app.element) {
    header = $(app.element).find(".header-actions");
  }

  if (!header.length) {
    // Some V13 themes or versions might use different classes
    header = $html.find(".directory-header .actions, header .actions, nav.header-actions");
  }

  if (!header.length) {
    console.warn("Trespasser | Could not find header actions container in ItemDirectory", $html);
    return;
  }

  // Create buttons only if they don't exist
  if ($html.find(".export-all-items").length) return;

  const exportBtn = $(`<button class="export-all-items"><i class="fas fa-file-export"></i> Export All</button>`);
  const importBtn = $(`<button class="import-all-items"><i class="fas fa-file-import"></i> Import All</button>`);

  exportBtn.on("click", (ev) => {
    ev.preventDefault();
    ItemExporter.exportAll();
  });

  importBtn.on("click", (ev) => {
    ev.preventDefault();
    ItemExporter.importData();
  });

  header.append(exportBtn);
  header.append(importBtn);
});


/**
 * Add Trespasser Configuration button to the settings sidebar.
 */
Hooks.on("renderSettings", (app, html, data) => {
  if (!game.user.isGM) return;

  const $html = $(html);
  const configBtn = $(`<button type="button" class="trespasser-config-btn">
    <i class="fas fa-cogs"></i> Trespasser Configuration
  </button>`);

  configBtn.on("click", ev => {
    ev.preventDefault();
    new game.trespasser.Config().render(true);
  });

  const setupBtn = $html.find('button[data-app="configure"]');
  if (setupBtn.length) {
    setupBtn.before(configBtn);
  } else {
    // Fallback if the button is not found (e.g. AppV2 or different structure)
    const container = $html.find(".settings-sidebar, #settings-game, #settings-access");
    if (container.length) {
      container.first().prepend(configBtn);
    }
  }
});


/**
 * Hook into the Combat Tracker render to inject the phased initiative UI.
 * This is needed because Foundry V13 CombatTracker (ApplicationV2) doesn't
 * allow template override via defaultOptions.
 */
Hooks.on("renderCombatTracker", async (app, html, data) => {
  const combat = game.combat;
  if (!combat) return;

  const activePhase = combat.getFlag("trespasser", "activePhase");
  const combatInfo  = combat.getFlag("trespasser", "combatInfo") || {};

  const PHASES = [
    { id: 40, label: game.i18n.localize("TRESPASSER.Phase.Early"), css: "early", combatants: [] },
    { id: 30, label: game.i18n.localize("TRESPASSER.Phase.Enemy"), css: "enemy", combatants: [] },
    { id: 20, label: game.i18n.localize("TRESPASSER.Phase.Late"), css: "late", combatants: [] },
    { id: 10, label: game.i18n.localize("TRESPASSER.Phase.Extra"), css: "extra", combatants: [] },
    { id: 0,  label: game.i18n.localize("TRESPASSER.Phase.End"), css: "end", combatants: [] }
  ];

  for (const combatant of combat.combatants) {
    if (!combatant.visible && !game.user.isGM) continue;
    const phaseId = combatant.initiative ?? 0;
    const phase   = PHASES.find(p => p.id === phaseId);
    if (phase) {
      const ap      = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      const focus   = combatant.actor?.system.combat?.focus ?? 0;
      phase.combatants.push({ combatant, ap, focus, activePhase });
    }
  }

  const activePhasesData = PHASES.filter(p => p.combatants.length > 0);

  // Build the HTML for the phased tracker
  function buildIcons(filled, cssClass) {
    const totalSlots = Math.max(3, filled);
    return Array.from({ length: totalSlots }, (_, i) => {
      const isFilled = i < filled;
      return `<div class="${cssClass}-icon${isFilled ? " active" : ""}"></div>`;
    }).join("");
  }

  function buildPhaseHTML(phaseData) {
    const isActive = phaseData.id === activePhase;
    const nextBtn  = (isActive && game.user.isGM)
      ? `<button class="next-phase-btn trp-next-phase" title="${game.i18n.localize("TRESPASSER.Phase.Next")}">${game.i18n.localize("TRESPASSER.Phase.NextPhase")}</button>`
      : "";

    const combatantsHTML = phaseData.combatants.map(({ combatant, ap, focus }) => {
      const isDefeated = combatant.defeated;
      const isHidden   = combatant.token?.hidden ?? combatant.hidden;
      const isTargeted = game.user.targets.has(combatant.token?.object);

      const isFinished = ap <= 0 || isDefeated;
      const isActv     = phaseData.id === activePhase && !isFinished;
      const name       = combatant.token?.name ?? combatant.name;
      const img        = combatant.token?.texture?.src ?? combatant.img;
      const owner      = combatant.testUserPermission(game.user, "OWNER");
      const cls        = [isActv ? "active" : "", isFinished ? "finished" : ""].filter(Boolean).join(" ");

      return `
        <li class="combatant ${cls}" data-combatant-id="${combatant.id}">
          <div class="avatar-container">
            <img class="token-image" src="${img}" title="${name}"/>
          </div>
          <div class="combatant-info flexcol">
            <div class="token-name"><h4>${name}</h4></div>
            <div class="combatant-status flexrow">
              <a class="combatant-control ${isHidden ? "active" : ""}" data-action="toggleHidden" title="${game.i18n.localize("COMBAT.ToggleVis")}">
                <i class="fas ${isHidden ? "fa-eye-slash" : "fa-eye"}"></i>
              </a>
              <a class="combatant-control ${isDefeated ? "active" : ""}" data-action="toggleDefeated" title="${game.i18n.localize("COMBAT.ToggleDead")}">
                <i class="fas fa-skull"></i>
              </a>
              <a class="combatant-control ${isTargeted ? "active" : ""}" data-action="toggleTarget" title="${game.i18n.localize("COMBAT.ToggleTarget")}">
                <i class="fas fa-bullseye"></i>
              </a>
            </div>
          </div>
          <div class="stats-area flexcol">`
             + (focus > 0 ? `<div class="focus-display flexrow"><span class="focus-number">${focus}</span></div>` : "")
            + `<div class="ap-display flexrow">
              <div class="ap-indicator flexrow">${buildIcons(ap, "ap")}</div>
            </div>
          </div>
        </li>
      `.trim();
    }).join("");

    return `
      <li class="phase-group ${phaseData.css}${isActive ? " active" : ""}">
        <div class="phase-header flexrow">
          <div class="header-left flexrow">
            <h4>${phaseData.label}</h4>
          </div>
          ${nextBtn}
        </div>
        <ol class="combatants-list">
          ${combatantsHTML}
        </ol>
      </li>
    `.trim();
  }

  const footerHTML = `
    <footer class="combat-info-footer">
      <div class="info-row">
        <div class="left-info">
          <span class="peril-text">
            ${game.i18n.localize("TRESPASSER.Peril")}: ${combatInfo.perilTotal ?? 0}
            <span class="peril-label">(${combatInfo.perilLabel ?? "Low"})</span>
          </span>
          <span class="deeds-usage">${combatInfo.heavy ?? 0}H / ${combatInfo.mighty ?? 0}M</span>
        </div>
        <div class="right-info">
          <span class="panic-label">Panic: ${combatInfo.panicLevel ?? 0}</span>
          <span class="init-dc-label">Init DC: ${combatInfo.enemyMaxInit ?? "-"}</span>
        </div>
      </div>
    </footer>
  `.trim();

  // Get the root element - in V13 html may be the element itself
  const root = (html instanceof HTMLElement) ? html : (html[0] ?? html);

  // Try multiple selectors to find the combat log ol element
  const log = root.querySelector("#combat-log")
    ?? root.querySelector("ol.directory-list")
    ?? root.querySelector("ol");

  if (log) {
    log.innerHTML = activePhasesData.map(buildPhaseHTML).join("");
  } else {
    console.warn("Trespasser | Could not find combat log element to inject phases. Root:", root);
  }

  // Replace default navigation controls (|< < X > >|) with a single "Next Phase" button
  if (game.user.isGM) {
    // Remove existing footer if present, then append new one
    root.querySelector(".combat-info-footer")?.remove();
    const section = root.closest("section") ?? root.querySelector("section") ?? root;
    const footerEl = document.createElement("div");
    footerEl.innerHTML = footerHTML;
    section.appendChild(footerEl.firstElementChild);
  }


  // Wire up event listeners using native DOM
  root.querySelectorAll(".trp-next-phase").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      game.combat?.nextPhase();
    });
  });

  root.querySelectorAll(".ap-icon.active").forEach(sq => {
    sq.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".combatant");
      const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
      if (!combatant || !combatant.testUserPermission(game.user, "OWNER")) return;

      const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      const newAP = Math.max(0, currentAP - 1);
      await combatant.setFlag("trespasser", "actionPoints", newAP);
    });
  });

  root.querySelectorAll(".combatant-control[data-action]").forEach(el => {
    el.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = el.closest(".combatant");
      const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
      if (!combatant) return;

      const action = el.dataset.action;
      switch (action) {
        case "toggleHidden":
          if (!game.user.isGM && !combatant.testUserPermission(game.user, "OWNER")) return;
          const t = combatant.token;
          if (t) return t.update({ hidden: !t.hidden });
          return combatant.update({ hidden: !combatant.hidden });
        case "toggleDefeated":
          if (!game.user.isGM && !combatant.testUserPermission(game.user, "OWNER")) return;
          return app._onToggleDefeatedStatus(combatant);
        case "toggleTarget":
          const token = combatant.token?.object;
          if (!token) return;
          return token.setTarget(!token.isTargeted, { releaseOthers: false });
      }
    });
  });
});
