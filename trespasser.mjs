/**
 * Trespasser TTRPG — Foundry VTT System
 * Main entry point
 */

import { registerInitHooks } from "./module/hooks/init.mjs";
import { registerReadyHooks } from "./module/hooks/ready.mjs";
import { registerSettingsHooks } from "./module/hooks/settings.mjs";
import { registerChatHooks } from "./module/hooks/chat.mjs";
import { registerCombatHooks } from "./module/hooks/combat.mjs";
import { registerTokenHooks } from "./module/hooks/token.mjs";
import { registerActorHooks } from "./module/hooks/actor.mjs";
import { registerItemHooks } from "./module/hooks/item.mjs";
import { registerEngagementHooks } from "./module/hooks/engagement.mjs";
import { registerRegionHooks } from "./module/hooks/region.mjs";

// Register all modular lifecycle and system hooks
registerInitHooks();
registerReadyHooks();
registerSettingsHooks();
registerChatHooks();
registerCombatHooks();
registerTokenHooks();
registerActorHooks();
registerItemHooks();
registerEngagementHooks();
registerRegionHooks();
