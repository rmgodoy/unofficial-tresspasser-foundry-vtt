import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { DUNGEON_CONFIG } from "../config/dungeon-config.mjs";
import { TRAVEL_CONFIG } from "../config/travel-config.mjs";
import { COMMON_PLIGHTS } from "../config/plight-config.mjs";
import { TREASURE_CONFIG } from "../config/treasure-config.mjs";
import { TrespasserConfigV2 } from "../dialogs/trespasser-config-v2.mjs";

/**
 * Configure CONFIG.TRESPASSER constants and system rules.
 */
export function configureTrespasserRules() {
  CONFIG.TRESPASSER = {
    targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
    depletionDieOptions: {
      "": "TRESPASSER.Terms.Depletion.None",
      "d4": "TRESPASSER.Terms.Depletion.Crude",
      "d6": "TRESPASSER.Terms.Depletion.Fine",
      "d8": "TRESPASSER.Terms.Depletion.Superior",
      "d10": "TRESPASSER.Terms.Depletion.Excellent",
      "d12": "TRESPASSER.Terms.Depletion.Enchanted",
      "d20": "TRESPASSER.Terms.Depletion.Legendary"
    },
    actionTypeChoices: {
      "none": "TRESPASSER.Terms.ActionTypes.None",
      "action": "TRESPASSER.Terms.ActionTypes.Action",
      "reaction": "TRESPASSER.Terms.ActionTypes.Reaction"
    },
    dungeon: DUNGEON_CONFIG,
    travel: TRAVEL_CONFIG,
    plights: COMMON_PLIGHTS,
    treasure: TREASURE_CONFIG
  };
}

/**
 * Register all world and client game settings.
 */
export function registerSystemSettings() {
  game.settings.register("trespasser", "activePartyId", {
    name: "Active Party ID",
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: () => {
      game.actors.filter(a => a.type === "party").forEach(a => {
        if (a.sheet?.rendered) a.sheet.render();
      });
      if (game.trespasser?.TravelTracker?._instance) {
        game.trespasser.TravelTracker._instance.render();
      }
      if (game.trespasser?.DungeonTracker?._instance) {
        game.trespasser.DungeonTracker._instance.render();
      }
    }
  });

  game.settings.register("trespasser", "showInitiativeInChat", {
    name: "TRESPASSER.Settings.Mechanics.InitiativeChat.Name",
    hint: "TRESPASSER.Settings.Mechanics.InitiativeChat.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "restrictMovementAction", {
    name: "TRESPASSER.Settings.Mechanics.RestrictMovementAction.Name",
    hint: "TRESPASSER.Settings.Mechanics.RestrictMovementAction.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "applyEncumbranceRules", {
    name: "TRESPASSER.Settings.Mechanics.ApplyEncumbranceRules.Name",
    hint: "TRESPASSER.Settings.Mechanics.ApplyEncumbranceRules.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
  
  game.settings.register("trespasser", "enableRetreatDialog", {
    name: "TRESPASSER.Settings.Exploration.EnableRetreatDialog.Name",
    hint: "TRESPASSER.Settings.Exploration.EnableRetreatDialog.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "showCreatureDamageRolls", {
    name: "TRESPASSER.Settings.Mechanics.ShowCreatureDamageRolls.Name",
    hint: "TRESPASSER.Settings.Mechanics.ShowCreatureDamageRolls.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "hideCreatureDamageRolls", {
    name: "TRESPASSER.Settings.Mechanics.HideCreatureDamageRolls.Name",
    hint: "TRESPASSER.Settings.Mechanics.HideCreatureDamageRolls.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "showPerilInChat", {
    name: "TRESPASSER.Settings.Exploration.ShowPerilInChat.Name",
    hint: "TRESPASSER.Settings.Exploration.ShowPerilInChat.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "autoEndCombatOnRetreat", {
    name: "TRESPASSER.Settings.Exploration.AutoEndCombatOnRetreat.Name",
    hint: "TRESPASSER.Settings.Exploration.AutoEndCombatOnRetreat.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "automateTravelTracker", {
    name: "TRESPASSER.Settings.Exploration.AutomateTravelTracker.Name",
    hint: "TRESPASSER.Settings.Exploration.AutomateTravelTracker.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "restrictHUDActions", {
    name: "TRESPASSER.Settings.Mechanics.RestrictHUDActions.Name",
    hint: "TRESPASSER.Settings.Mechanics.RestrictHUDActions.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "restrictAPFocusUsage", {
    name: "TRESPASSER.Settings.Mechanics.RestrictAPFocusUsage.Name",
    hint: "TRESPASSER.Settings.Mechanics.RestrictAPFocusUsage.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "enableGroupCheckSelection", {
    name: "TRESPASSER.Settings.Exploration.EnableGroupCheckSelection.Name",
    hint: "TRESPASSER.Settings.Exploration.EnableGroupCheckSelection.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "groupCheckFullParty", {
    name: "TRESPASSER.Settings.Exploration.GroupCheckFullParty.Name",
    hint: "TRESPASSER.Settings.Exploration.GroupCheckFullParty.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "allowAllPlayersHavenEdit", {
    name: "TRESPASSER.Settings.Exploration.AllowAllPlayersHavenEdit.Name",
    hint: "TRESPASSER.Settings.Exploration.AllowAllPlayersHavenEdit.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "restrictHavenEditToLeader", {
    name: "TRESPASSER.Settings.Exploration.RestrictHavenEditToLeader.Name",
    hint: "TRESPASSER.Settings.Exploration.RestrictHavenEditToLeader.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "enforceHavenBuildingLimits", {
    name: "TRESPASSER.Settings.Exploration.EnforceHavenBuildingLimits.Name",
    hint: "TRESPASSER.Settings.Exploration.EnforceHavenBuildingLimits.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "bypassHavenBuildingLimits", {
    name: "TRESPASSER.Settings.Exploration.BypassHavenBuildingLimits.Name",
    hint: "TRESPASSER.Settings.Exploration.BypassHavenBuildingLimits.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "enforceAttackRange", {
    name: "TRESPASSER.Settings.Mechanics.EnforceAttackRange.Name",
    hint: "TRESPASSER.Settings.Mechanics.EnforceAttackRange.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("trespasser", "disregardRangeOnAttack", {
    name: "TRESPASSER.Settings.Mechanics.DisregardRangeOnAttack.Name",
    hint: "TRESPASSER.Settings.Mechanics.DisregardRangeOnAttack.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "confirmItemTransfer", {
    name: "TRESPASSER.Settings.Mechanics.ConfirmItemTransfer.Name",
    hint: "TRESPASSER.Settings.Mechanics.ConfirmItemTransfer.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "allowOutOfTurnMovement", {
    name: "TRESPASSER.Settings.Mechanics.AllowOutOfTurnMovement.Name",
    hint: "TRESPASSER.Settings.Mechanics.AllowOutOfTurnMovement.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "playerFacingInitiative", {
    name: "TRESPASSER.Settings.Mechanics.PlayerFacingInitiative.Name",
    hint: "TRESPASSER.Settings.Mechanics.PlayerFacingInitiative.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "clockSize", {
    name: "TRESPASSER.Settings.Visuals.ClockSize.Name",
    hint: "TRESPASSER.Settings.Visuals.ClockSize.Hint",
    scope: "client",
    config: false,
    type: Number,
    default: 50
  });

  game.settings.register("trespasser", "fontSizeBase", {
    name: "TRESPASSER.Settings.Visuals.FontSizeBase.Name",
    hint: "TRESPASSER.Settings.Visuals.FontSizeBase.Hint",
    scope: "client",
    config: false,
    type: Number,
    default: 14
  });

  game.settings.register("trespasser", "showStatusEffectsOnTokens", {
    name: "TRESPASSER.Settings.Visuals.ShowStatusEffectsOnTokens.Name",
    hint: "TRESPASSER.Settings.Visuals.ShowStatusEffectsOnTokens.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("trespasser", "tokenStatusIconScale", {
    name: "TRESPASSER.Settings.Visuals.TokenStatusIconScale.Name",
    hint: "TRESPASSER.Settings.Visuals.TokenStatusIconScale.Hint",
    scope: "client",
    config: false,
    type: Number,
    default: 1.0,
    onChange: () => {
      if (canvas.ready && canvas.tokens) {
        canvas.tokens.placeables.forEach(t => {
          if (t.renderFlags) t.renderFlags.set({ refreshEffects: true, refresh: true });
          else if (t.refresh) t.refresh();
        });
      }
    }
  });

  // Color Theme Settings
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

  for (const color of colorSettings) {
    game.settings.register("trespasser", color.key, {
      name: `TRESPASSER.Settings.Colors.${color.key}.Name`,
      scope: "client",
      config: false,
      type: String,
      default: color.default
    });
  }

  game.settings.register("trespasser", "eventClocks", {
    name: "TRESPASSER.App.EventClocks.Title",
    scope: "world",
    config: false,
    type: String,
    default: "[]"
  });

  game.settings.register("trespasser", "deedMigrationVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.registerMenu("trespasser", "systemConfig", {
    name: "TRESPASSER.Settings.Title",
    label: "TRESPASSER.Settings.ButtonLabel",
    hint: "TRESPASSER.Settings.Hint",
    icon: "fas fa-cogs",
    type: TrespasserConfigV2,
    restricted: false
  });
}
