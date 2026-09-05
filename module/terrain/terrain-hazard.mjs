import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { TERRAIN_COLORS } from "./terrain-behaviors.mjs";

/**
 * Handle slippery terrain check for a token.
 * @param {TokenDocument} tokenDoc
 * @param {Actor} actor
 * @param {RegionDocument} region
 */
export async function handleSlipperyCheck(tokenDoc, actor, region) {
  const agilityBase = actor.system.attributes?.agility ?? 0;
  const agilityBonus = actor.system.bonuses?.agility ?? 0;
  const totalAgility = agilityBase + agilityBonus;

  const isAcrobaticsTrained = actor.system.skills?.acrobatics === true;
  const acrobaticsBonus = isAcrobaticsTrained ? (actor.system.skill ?? 0) : 0;
  const totalBonus = totalAgility + acrobaticsBonus;

  const result = await TrespasserRollDialog.wait({
    dice: "1d20",
    bonuses: [
      { label: game.i18n.localize("TRESPASSER.Terms.Attribute.Agility"), value: totalAgility },
      { label: game.i18n.localize("TRESPASSER.Terms.Skill.Acrobatics"), value: acrobaticsBonus }
    ],
    showCD: true,
    cd: 10
  }, {
    title: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperyPrompt", { name: tokenDoc.name })
  });

  if (!result) return;

  const modifier = result.modifier || 0;
  const cd = result.cd || 10;

  const roll = new foundry.dice.Roll(`1d20 + ${totalBonus} + ${modifier}`);
  await roll.evaluate();

  const total = roll.total;
  const success = total >= cd;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperyPrompt", { name: tokenDoc.name })
  });

  if (success) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperySuccess", {
        name: tokenDoc.name,
        total: total
      }),
      flavor: `🧊 ${region.name}`
    });
  } else {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("TRESPASSER.Notification.Terrain.SlipperyFail", {
        name: tokenDoc.name,
        total: total
      }),
      flavor: `🧊 ${region.name}`
    });
  }
}

/**
 * Transform an obstacle into difficult terrain (rubble).
 * @param {RegionDocument} region
 */
export async function transformObstacleToRubble(region) {
  if (!region || !canvas.scene) return;
  const terrainData = region.flags?.trespasser?.terrain;
  if (!terrainData || terrainData.system.category !== "obstacle") return;
  
  const sys = terrainData.system;
  if (!sys.destructible) return;

  const newTerrainData = foundry.utils.deepClone(terrainData);
  newTerrainData.system.category = "difficult_terrain";
  const rubbleText = game.i18n.localize("TRESPASSER.Terrain.Rubble") || "Rubble";
  newTerrainData.name = `${terrainData.name} (${rubbleText})`;
  
  const color = TERRAIN_COLORS.difficult_terrain;
  const updates = {
    _id: region.id,
    name: newTerrainData.name,
    color: color,
    "flags.trespasser.terrain": newTerrainData
  };

  await canvas.scene.updateEmbeddedDocuments("Region", [updates]);
}
