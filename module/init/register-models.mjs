import { TrespasserActor } from "../documents/actor.mjs";
import { TrespasserCombat } from "../documents/combat.mjs";
import { TrespasserCombatTracker } from "../sheets/combat-tracker.mjs";

import { TrespasserCharacterData } from "../data/actor-character.mjs";
import { TrespasserCommonerData } from "../data/actor-commoner.mjs";
import { TrespasserCompanionData } from "../data/actor-companion.mjs";
import { TrespasserCreatureData } from "../data/actor-creature.mjs";
import { TrespasserDungeonData } from "../data/actor-dungeon.mjs";
import { TrespasserPartyData } from "../data/actor-party.mjs";
import { TrespasserHavenData } from "../data/actor-haven.mjs";
import { TrespasserRegionData } from "../data/actor-region.mjs";

import { TrespasserArmorData } from "../data/item-armor.mjs";
import { TrespasserWeaponData } from "../data/item-weapon.mjs";
import { TrespasserRationsData } from "../data/item-rations.mjs";
import { TrespasserEffectData } from "../data/item-effect.mjs";
import { TrespasserDeedData } from "../data/item-deed.mjs";
import { TrespasserFeatureData } from "../data/item-feature.mjs";
import { TrespasserTalentData } from "../data/item-talent.mjs";
import { TrespasserIncantationData } from "../data/item-incantation.mjs";
import { TrespasserAccessoryData } from "../data/item-accessory.mjs";
import { TrespasserItemData } from "../data/item-item.mjs";
import { TrespasserInjuryData } from "../data/item-injury.mjs";
import { TrespasserCallingData } from "../data/item-calling.mjs";
import { TrespasserCraftData } from "../data/item-craft.mjs";
import { TrespasserPastLifeData } from "../data/item-past-life.mjs";
import { TrespasserRoomData } from "../data/item-room.mjs";
import { TrespasserHirelingData } from "../data/item-hireling.mjs";
import { TrespasserBuildData } from "../data/item-build.mjs";
import { TrespasserStrongholdData } from "../data/item-stronghold.mjs";
import { TrespasserPlightData } from "../data/item-plight.mjs";
import { TrespasserTerrainData } from "../data/item-terrain.mjs";

/**
 * Register custom Document classes and DataModels in CONFIG.
 */
export function registerDocumentModels() {
  // Document classes
  CONFIG.Actor.documentClass = TrespasserActor;
  CONFIG.Combat.documentClass = TrespasserCombat;
  CONFIG.ui.combat = TrespasserCombatTracker;

  // Actor DataModels
  CONFIG.Actor.dataModels.character = TrespasserCharacterData;
  CONFIG.Actor.dataModels.commoner = TrespasserCommonerData;
  CONFIG.Actor.dataModels.companion = TrespasserCompanionData;
  CONFIG.Actor.dataModels.creature = TrespasserCreatureData;
  CONFIG.Actor.dataModels.dungeon = TrespasserDungeonData;
  CONFIG.Actor.dataModels.party = TrespasserPartyData;
  CONFIG.Actor.dataModels.haven = TrespasserHavenData;
  CONFIG.Actor.dataModels.region = TrespasserRegionData;

  // Item DataModels
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
  CONFIG.Item.dataModels.craft = TrespasserCraftData;
  CONFIG.Item.dataModels.past_life = TrespasserPastLifeData;
  CONFIG.Item.dataModels.room = TrespasserRoomData;
  CONFIG.Item.dataModels.hireling = TrespasserHirelingData;
  CONFIG.Item.dataModels.build = TrespasserBuildData;
  CONFIG.Item.dataModels.stronghold = TrespasserStrongholdData;
  CONFIG.Item.dataModels.plight = TrespasserPlightData;
  CONFIG.Item.dataModels.terrain = TrespasserTerrainData;
}
