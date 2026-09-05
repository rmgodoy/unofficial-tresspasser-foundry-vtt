import { initDiceIcons } from "../helpers/dice-icon-helper.mjs";
import { MovementOverlay } from "../canvas/movement-overlay.mjs";
import { registerChatCommands } from "../helpers/chat-commands.mjs";
import { ensureDungeonHelpers } from "../config/dungeon-config.mjs";
import { registerDungeonTrackerHooks } from "../exploration/dungeon-tracker.mjs";
import { registerTravelTrackerHooks } from "../exploration/travel-tracker.mjs";
import { registerEventClocksHooks } from "../exploration/event-clocks-tracker.mjs";

import { preloadHandlebarsTemplates } from "../init/load-templates.mjs";
import { registerTurnMarkerPatches } from "../canvas/turn-marker-patch.mjs";
import { configureTrespasserRules, registerSystemSettings } from "../settings/register-settings.mjs";
import { registerDocumentModels } from "../init/register-models.mjs";
import { registerSystemSheets } from "../init/register-sheets.mjs";
import { registerHandlebarsHelpers } from "../helpers/handlebars-helpers.mjs";
import { initializeSystemNamespace } from "../init/system-namespace.mjs";

/**
 * Register the primary system initialization hook.
 */
export function registerInitHooks() {
  Hooks.once("init", async () => {
    console.log("Trespasser | Initialising system");
    initDiceIcons();
    MovementOverlay.init();
    registerChatCommands();

    // Load partial templates
    await preloadHandlebarsTemplates();

    // Register custom document classes and DataModels
    registerDocumentModels();

    // Apply Foundry turn marker patches for phased combat
    registerTurnMarkerPatches();

    // Configure system rules and game settings
    configureTrespasserRules();
    registerSystemSettings();

    // Register Actor and Item sheets
    registerSystemSheets();

    // Handlebars helpers
    registerHandlebarsHelpers();
    ensureDungeonHelpers();

    // Exploration tracker controls
    registerDungeonTrackerHooks();
    registerTravelTrackerHooks();
    registerEventClocksHooks();

    console.log("Trespasser | System ready");

    // Expose system namespace
    initializeSystemNamespace();
  });
}
