import { TrespasserCharacterSheet } from "../sheets/actor-character-sheet.mjs";
import { TrespasserCommonerSheet } from "../sheets/actor-commoner-sheet.mjs";
import { TrespasserCompanionSheet } from "../sheets/actor-companion-sheet.mjs";
import { TrespasserCreatureSheet } from "../sheets/actor-creature-sheet.mjs";
import { TrespasserDungeonSheet } from "../sheets/actor-dungeon-sheet.mjs";
import { TrespasserPartySheet } from "../sheets/actor-party-sheet.mjs";
import { TrespasserHavenSheet } from "../sheets/actor-haven-sheet.mjs";
import { TrespasserRegionSheet } from "../sheets/actor-region-sheet.mjs";

import { TrespasserArmorSheet } from "../sheets/item-armor-sheet.mjs";
import { TrespasserWeaponSheet } from "../sheets/item-weapon-sheet.mjs";
import { TrespasserRationsSheet } from "../sheets/item-rations-sheet.mjs";
import { TrespasserEffectSheet } from "../sheets/item-effect-sheet.mjs";
import { TrespasserPlightSheet } from "../sheets/item-plight-sheet.mjs";
import { TrespasserDeedSheet } from "../sheets/item-deed-sheet.mjs";
import { TrespasserFeatureSheet } from "../sheets/item-feature-sheet.mjs";
import { TrespasserTalentSheet } from "../sheets/item-talent-sheet.mjs";
import { TrespasserIncantationSheet } from "../sheets/item-incantation-sheet.mjs";
import { TrespasserItemSheet } from "../sheets/item-item-sheet.mjs";
import { TrespasserAccessorySheet } from "../sheets/item-accessory-sheet.mjs";
import { TrespasserInjurySheet } from "../sheets/item-injury-sheet.mjs";
import { TrespasserCallingSheet } from "../sheets/item-calling-sheet.mjs";
import { TrespasserCraftSheet } from "../sheets/item-craft-sheet.mjs";
import { TrespasserPastLifeSheet } from "../sheets/item-past-life-sheet.mjs";
import { TrespasserTerrainSheet } from "../sheets/item-terrain-sheet.mjs";
import { TrespasserRoomSheet } from "../sheets/item-room-sheet.mjs";
import { TrespasserHirelingSheet } from "../sheets/item-hireling-sheet.mjs";
import { TrespasserBuildSheet } from "../sheets/item-build-sheet.mjs";
import { TrespasserStrongholdSheet } from "../sheets/item-stronghold-sheet.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Unregister default core sheets and register Trespasser Actor and Item sheets.
 */
export function registerSystemSheets() {
  // Actor Sheets
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Trespasser Character Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserCommonerSheet, {
    types: ["commoner"],
    makeDefault: true,
    label: "Trespasser Commoner Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserCompanionSheet, {
    types: ["companion"],
    makeDefault: true,
    label: "Trespasser Companion Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserCreatureSheet, {
    types: ["creature"],
    makeDefault: true,
    label: "Trespasser Creature Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserDungeonSheet, {
    types: ["dungeon"],
    makeDefault: true,
    label: "Trespasser Dungeon Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserPartySheet, {
    types: ["party"],
    makeDefault: true,
    label: "Trespasser Party Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserHavenSheet, {
    types: ["haven"],
    makeDefault: true,
    label: "Trespasser Haven Sheet",
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, TrespasserRegionSheet, {
    types: ["region"],
    makeDefault: true,
    label: "Trespasser Region Sheet",
  });

  // Item Sheets
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);

  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserArmorSheet, {
    types: ["armor"],
    makeDefault: true,
    label: "Trespasser Armor Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserWeaponSheet, {
    types: ["weapon"],
    makeDefault: true,
    label: "Trespasser Weapon Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserRationsSheet, {
    types: ["rations"],
    makeDefault: true,
    label: "Trespasser Rations Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserEffectSheet, {
    types: ["effect"],
    makeDefault: true,
    label: "Trespasser Effect Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserPlightSheet, {
    types: ["plight"],
    makeDefault: true,
    label: "Trespasser Plight Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserDeedSheet, {
    types: ["deed"],
    makeDefault: true,
    label: "Trespasser Deed Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserFeatureSheet, {
    types: ["feature"],
    makeDefault: true,
    label: "Trespasser Feature Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserTalentSheet, {
    types: ["talent"],
    makeDefault: true,
    label: "Trespasser Talent Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserIncantationSheet, {
    types: ["incantation"],
    makeDefault: true,
    label: "Trespasser Incantation Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserAccessorySheet, {
    types: ["accessory"],
    makeDefault: true,
    label: "Trespasser Accessory Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "Trespasser Item Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserInjurySheet, {
    types: ["injury"],
    makeDefault: true,
    label: "Trespasser Injury Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserCallingSheet, {
    types: ["calling"],
    makeDefault: true,
    label: "Trespasser Calling Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserCraftSheet, {
    types: ["craft"],
    makeDefault: true,
    label: "Trespasser Craft Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserPastLifeSheet, {
    types: ["past_life"],
    makeDefault: true,
    label: "Trespasser Past Life Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserTerrainSheet, {
    types: ["terrain"],
    makeDefault: true,
    label: "Trespasser Terrain Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserRoomSheet, {
    types: ["room"],
    makeDefault: true,
    label: "Trespasser Room Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserHirelingSheet, {
    types: ["hireling"],
    makeDefault: true,
    label: "Trespasser Hireling Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserBuildSheet, {
    types: ["build"],
    makeDefault: true,
    label: "Trespasser Building Sheet",
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, TrespasserStrongholdSheet, {
    types: ["stronghold"],
    makeDefault: true,
    label: "Trespasser Stronghold Sheet",
  });
}
