import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { TERRAIN_COLORS } from "./terrain-constants.mjs";

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
  const activeBonusTotal = result.activeBonusTotal ?? totalBonus;

  const roll = new foundry.dice.Roll(`1d20 + ${activeBonusTotal} + ${modifier}`);
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
  if (!game.user.isGM) return;
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

/**
 * Post a single combined chat message summarizing terrain damage and effects.
 * @param {TokenDocument} tokenDoc
 * @param {Actor} actor
 * @param {Map} terrainDamageMap
 * @param {Map} groupedEffects
 */
export async function postMovementSummary(tokenDoc, actor, terrainDamageMap, groupedEffects) {
  const lines = [];

  for (const [, data] of terrainDamageMap) {
    lines.push(`<li><span style="color:var(--trp-red, #c44);">⚡ ${data.damage} ${game.i18n.localize("TRESPASSER.Sheet.Terrain.Fields.TerrainDamage")}</span> — ${data.name}</li>`);
  }

  for (const [, data] of groupedEffects) {
    const img = data.eff.img ? `<img src="${data.eff.img}" width="16" height="16" style="border:none; vertical-align:middle; margin-right:4px;">` : "";
    const terrains = [...data.terrainNames].join(", ");
    lines.push(`<li>${img}<strong>${data.eff.name}</strong> (${data.totalIntensity}) — ${terrains}</li>`);
  }

  const content = `<ul style="list-style:none; padding:0; margin:0;">${lines.join("")}</ul>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flavor: `🌍 ${game.i18n.format("TRESPASSER.Notification.Terrain.MovementSummary", { name: tokenDoc.name })}`
  });
}

/**
 * Applies grouped effects, terrain damage, chat notifications, and slippery checks.
 * @param {TokenDocument} tokenDoc
 * @param {Actor} actor
 * @param {Map} terrainDamageMap
 * @param {Array} effectsToApply
 * @param {RegionDocument|null} slipperyCheckRegion
 */
export async function applyTerrainDamageAndEffects(tokenDoc, actor, terrainDamageMap, effectsToApply, slipperyCheckRegion) {
  const groupedEffects = new Map();
  for (const { eff, terrainName } of effectsToApply) {
    const effInt = (eff.intensity !== undefined && eff.intensity !== null && !isNaN(Number(eff.intensity))) ? Number(eff.intensity) : 0;
    if (groupedEffects.has(eff.uuid)) {
      const existing = groupedEffects.get(eff.uuid);
      existing.totalIntensity += effInt;
      existing.terrainNames.add(terrainName);
    } else {
      groupedEffects.set(eff.uuid, {
        eff,
        totalIntensity: effInt,
        terrainNames: new Set([terrainName])
      });
    }
  }

  if (terrainDamageMap.size > 0 || groupedEffects.size > 0 || slipperyCheckRegion) {
    const tokenPlaceable = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
    if (tokenPlaceable) {
      if (tokenPlaceable.animationContexts?.size > 0) {
        const promises = Array.from(tokenPlaceable.animationContexts.values()).map(ctx => ctx.promise);
        await Promise.allSettled(promises);
      } else if (tokenPlaceable._animation) {
        await tokenPlaceable._animation;
      }
    }

    for (const [uuid, data] of groupedEffects) {
      const sourceEffect = await (await import("../helpers/item-resolver.mjs")).resolveItem({ uuid, name: data.name }, { type: "effect" });
      if (!sourceEffect) continue;
      const effectData = sourceEffect.toObject();
      effectData.system.intensity = data.totalIntensity;
      delete effectData._id;
      await Item.createDocuments([effectData], { parent: actor });
    }

    let totalDamage = 0;
    const isTenacious = Boolean(actor.system?.passiveStates?.tenacious || (actor.type === "character" && (actor.system?.health ?? 0) <= 0));
    if (terrainDamageMap.size > 0 && !isTenacious) {
      for (const [, data] of terrainDamageMap) {
        totalDamage += data.damage;
      }
      if (typeof actor.applyDamage === "function") {
        await actor.applyDamage(totalDamage);
      } else {
        const newHp = Math.max(0, (actor.system.health ?? 0) - totalDamage);
        await actor.update({ "system.health": newHp });
      }
    }

    if (terrainDamageMap.size > 0 || groupedEffects.size > 0) {
      await postMovementSummary(tokenDoc, actor, terrainDamageMap, groupedEffects);
    }

    if (slipperyCheckRegion) {
      await handleSlipperyCheck(tokenDoc, actor, slipperyCheckRegion);
    }
  }
}
