import { ItemExporter } from "../helpers/item-exporter.mjs";
import { TrespasserConfigV2 } from "../dialogs/trespasser-config-v2.mjs";
import { EventClocksTracker } from "../exploration/event-clocks-tracker.mjs";
import { TrespasserPartyHelper } from "../helpers/party-helper.mjs";
import { TerrainHelper } from "../helpers/terrain-helper.mjs";
import { ForcedMovementHelper } from "../helpers/forced-movement-helper.mjs";
import * as NonCombatHelper from "../helpers/non-combat-helper.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../dialogs/tempt-fate-dialogs.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";
import { executeTemptFateFlow } from "../sheets/character/handlers-tempt-fate.mjs";
import { DungeonTracker } from "../exploration/dungeon-tracker.mjs";
import { TravelTracker } from "../exploration/travel-tracker.mjs";
import { CanvasInputSession } from "../canvas/canvas-input-session.mjs";
import { CommonerGenerator } from "../helpers/commoner-generator.mjs";
import { CanvasInputOverlay } from "../hud/canvas-input-overlay.mjs";
import { TreasureGenerator } from "../helpers/treasure-generator.mjs";
import { TrespasserTreasureDialog } from "../dialogs/treasure-dialog.mjs";
import { StatusIntensityDialog } from "../dialogs/status-intensity-dialog.mjs";
import { QuickDeedDialog } from "../dialogs/quick-deed-dialog.mjs";
import { formatDiceIcons, replaceDiceInElement } from "../helpers/dice-icon-helper.mjs";
import { actorEventBus, ActorEventBus } from "../actor/actor-event-bus.mjs";
import { CombatActorMixin } from "../actor/combat-actor-mixin.mjs";
import { TrespasserCombatantData } from "../data/actor-combatant.mjs";
import { tcaEngine } from "../engine/tca-engine.mjs";
import { SYSTEM_ID, getSystemId } from "../system-id.mjs";

/**
 * Expose system utilities, helpers, and dialogs to game.trespasser and globalThis.trespasser.
 */
export function initializeSystemNamespace() {
  game.trespasser = game.trespasser || {};
  game.trespasser.SYSTEM_ID = SYSTEM_ID;
  game.trespasser.getSystemId = getSystemId;
  game.trespasser.eventBus = actorEventBus;
  game.trespasser.ActorEventBus = ActorEventBus;
  game.trespasser.CombatActorMixin = CombatActorMixin;
  game.trespasser.CombatantData = TrespasserCombatantData;
  game.trespasser.TrespasserCombatantData = TrespasserCombatantData;
  game.trespasser.tcaEngine = tcaEngine;
  game.trespasser.ItemExporter = ItemExporter;
  game.trespasser.Config = TrespasserConfigV2;
  game.trespasser.EventClocks = EventClocksTracker;
  game.trespasser.TrespasserPartyHelper = TrespasserPartyHelper;
  game.trespasser.TerrainHelper = TerrainHelper;
  game.trespasser.ForcedMovementHelper = ForcedMovementHelper;
  game.trespasser.NonCombatHelper = NonCombatHelper;
  game.trespasser.NonCombatSparkDialog = NonCombatSparkDialog;
  game.trespasser.NonCombatShadowDialog = NonCombatShadowDialog;
  game.trespasser.TrespasserSocket = TrespasserSocket;
  game.trespasser.executeTemptFateFlow = executeTemptFateFlow;
  game.trespasser.DungeonTracker = DungeonTracker;
  game.trespasser.TravelTracker = TravelTracker;
  game.trespasser.CanvasInputSession = CanvasInputSession;
  game.trespasser.CommonerGenerator = CommonerGenerator;
  game.trespasser.CanvasInputOverlay = CanvasInputOverlay;
  game.trespasser.TreasureGenerator = TreasureGenerator;
  game.trespasser.TreasureDialog = TrespasserTreasureDialog;
  game.trespasser.StatusIntensityDialog = StatusIntensityDialog;
  game.trespasser.QuickDeedDialog = QuickDeedDialog;
  game.trespasser.generateTreasure = (options) => TreasureGenerator.rollTreasure(options);
  game.trespasser.formatDiceIcons = formatDiceIcons;
  game.trespasser.replaceDiceInElement = replaceDiceInElement;
  game.trespasser.openTreasureDialog = (options) => TrespasserTreasureDialog.open(options);
  game.trespasser.migrateWorldDeeds = (options) => import("../helpers/migration-deed.mjs").then(m => m.migrateWorldDeeds(options));
  game.trespasser.migrateCompendiumDeeds = (packId, options) => import("../helpers/migration-deed.mjs").then(m => m.migrateCompendiumDeeds(packId, options));
  game.trespasser.migrateCompendiumEffects = (packId, options) => import("../helpers/migration-effect.mjs").then(m => m.migrateCompendiumEffects(packId, options));

  globalThis.trespasser = game.trespasser;
}
