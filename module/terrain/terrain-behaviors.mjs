import { ForcedMovementHelper } from "../helpers/forced-movement-helper.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { handleSlipperyCheck, transformObstacleToRubble } from "./terrain-hazard.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";

export { handleSlipperyCheck, transformObstacleToRubble };

export const TERRAIN_COLORS = {
  difficult_terrain: "#8B4513", 
  obstacle: "#696969",        
  wall: "#000000",            
  field: "#228B22",           
  light_cloud: "#D3D3D3",     
  heavy_cloud: "#708090"      
};

/**
 * Get the display color for a terrain item or data, falling back to category default.
 * @param {Item|Object} terrainItemOrData 
 * @returns {string} Hex color string.
 */
export function getRegionColor(terrainItemOrData) {
  if (!terrainItemOrData) return "#8B4513";
  const sys = terrainItemOrData.system || terrainItemOrData;
  return sys.regionColor || TERRAIN_COLORS[sys.category] || "#8B4513";
}

/**
 * Safely evaluates an intensity string or formula to a numeric integer.
 * @param {string|number} str
 * @param {number} [defaultValue=1]
 * @returns {number}
 */
export function evaluateIntensityValue(str, defaultValue = 1) {
  if (typeof str === "number") return Math.max(0, Math.round(str));
  if (!str || typeof str !== "string") return defaultValue;
  const cleaned = str.trim();
  if (/^-?\d+$/.test(cleaned)) return Math.max(0, parseInt(cleaned, 10));
  try {
    if (/^[0-9+\-*/().\s,maxmin]+$/i.test(cleaned)) {
      const roll = new foundry.dice.Roll(cleaned);
      if (roll.isDeterministic) {
        roll.evaluateSync();
        return Math.max(0, Math.round(roll.total));
      }
    }
  } catch (e) {
    console.warn("Trespasser | Failed to evaluate intensity expression:", cleaned, e);
  }
  return Math.max(0, parseInt(cleaned, 10) || defaultValue);
}

/**
 * Get the dynamic intensity from the terrain's linked effect on the caster.
 * @param {RegionDocument} terrainRegion
 * @returns {number}
 */
export function getLinkedIntensity(terrainRegion) {
  const flags = terrainRegion.flags?.trespasser;
  if (!flags) return 0;

  const terrainSys = flags.terrain?.system;
  const linkedKey = flags.linkedEffectId || terrainSys?.linkedEffect?.uuid || terrainSys?.linkedEffectKey;
  const linkedUuid = flags.linkedEffectUuid;
  const linkedName = terrainSys?.linkedEffect?.name;
  const casterActorId = flags.casterActorId || flags.centerActorId || terrainSys?.centerActorId;
  const casterActorUuid = flags.casterActorUuid;

  const clean = (s) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim().toLowerCase();

  for (const key of [linkedUuid, linkedKey]) {
    if (key) {
      try {
        const directDoc = fromUuidSync(key);
        if (directDoc && directDoc.type === "effect") {
          const intVal = Number(directDoc.system?.intensity);
          return isNaN(intVal) ? 0 : intVal;
        }
      } catch {}
    }
  }

  const isMatchingEffect = (i) => {
    if (i.type !== "effect") return false;
    if (linkedKey && (i.id === linkedKey || i.uuid === linkedKey || i.flags?.trespasser?.sourceEffectUuid === linkedKey || i.flags?.trespasser?.linkedSource === linkedKey)) return true;
    if (linkedUuid && (i.id === linkedUuid || i.uuid === linkedUuid || i.flags?.trespasser?.sourceEffectUuid === linkedUuid || i.flags?.trespasser?.linkedSource === linkedUuid)) return true;

    const iClean = clean(i.name);
    if (linkedName) {
      const lClean = clean(linkedName);
      if (iClean === lClean || (lClean.length > 3 && (iClean.includes(lClean) || lClean.includes(effClean)))) return true;
    }

    if (terrainSys?.linkedEffects?.length > 0) {
      for (const le of terrainSys.linkedEffects) {
        if (le.uuid && (i.id === le.uuid || i.uuid === le.uuid || i.flags?.trespasser?.sourceEffectUuid === le.uuid || i.flags?.trespasser?.linkedSource === le.uuid)) return true;
        if (le.name) {
          const leClean = clean(le.name);
          if (iClean === leClean || (leClean.length > 3 && (iClean.includes(leClean) || leClean.includes(iClean)))) return true;
        }
      }
    }
    return false;
  };

  let casterActor = null;
  if (casterActorUuid) {
    try {
      const doc = fromUuidSync(casterActorUuid);
      casterActor = doc?.actor || (doc?.documentName === "Actor" ? doc : null);
    } catch {}
  }
  if (!casterActor && casterActorId) {
    casterActor = game.actors?.get(casterActorId) || canvas.tokens?.get(casterActorId)?.actor || canvas.scene?.tokens?.get(casterActorId)?.actor;
  }

  if (casterActor) {
    const effect = casterActor.items.find(isMatchingEffect);
    if (effect) {
      const intVal = Number(effect.system?.intensity);
      return isNaN(intVal) ? 0 : intVal;
    }
  }

  const candidates = [];
  if (canvas.scene?.tokens) {
    for (const t of canvas.scene.tokens) {
      if (t.actor && !candidates.includes(t.actor)) candidates.push(t.actor);
    }
  }
  for (const a of (game.actors || [])) {
    if (!candidates.includes(a)) candidates.push(a);
  }

  for (const actor of candidates) {
    const effect = actor.items.find(isMatchingEffect);
    if (effect) {
      const intVal = Number(effect.system?.intensity);
      return isNaN(intVal) ? 0 : intVal;
    }
  }

  return 0;
}

/**
 * Resolve the <Int> placeholder in a string using the terrain's linked effect intensity.
 * @param {string} str
 * @param {RegionDocument} terrainRegion
 * @returns {string}
 */
export function resolveIntPlaceholder(str, terrainRegion) {
  if (!str || typeof str !== "string") return str || "0";
  if (!str.includes("<Int>") && !str.includes("<int>")) return str;

  const intensity = getLinkedIntensity(terrainRegion);
  return str.replace(/<Int>/gi, String(intensity));
}

/**
 * Build behavior execution context from a region.
 * @param {RegionDocument} region
 * @returns {object}
 */
export function buildBehaviorContext(region) {
  const flags = region.flags?.trespasser || {};
  const casterActorId = flags.casterActorId;
  return {
    casterActor: casterActorId ? game.actors.get(casterActorId) : null,
    linkedIntensity: getLinkedIntensity(region),
    pathSquares: flags.pathSquares || []
  };
}

/**
 * Apply an effect from terrain to an actor.
 * @param {Actor} actor
 * @param {object} eff
 * @param {string} terrainName
 */
export async function applyEffect(actor, eff, terrainName) {
  const sourceEffect = await resolveItem(eff, { type: "effect" });
  if (!sourceEffect) return;

  const effectData = sourceEffect.toObject();
  effectData.system.intensity = (eff.intensity !== undefined && eff.intensity !== null && eff.intensity !== "" && !isNaN(Number(eff.intensity)))
    ? Number(eff.intensity)
    : (sourceEffect.system?.intensity ?? 0);
  delete effectData._id;
  await Item.createDocuments([effectData], { parent: actor });

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("TRESPASSER.Notification.Terrain.EffectApplied", {
      name: actor.name,
      effect: eff.name,
      terrain: terrainName
    }),
    flavor: `🌍 ${terrainName}`
  });
}

/**
 * Execute a single terrain behavior action.
 * @param {object} behavior
 * @param {Actor} actor
 * @param {RegionDocument} terrainRegion
 * @param {object} [context]
 */
export async function executeBehavior(behavior, actor, terrainRegion, context = {}) {
  const { casterActor } = context;

  switch (behavior.action) {
    case "applyEffect": {
      if (!actor) return;
      const effList = (behavior.effects && behavior.effects.length > 0)
        ? behavior.effects
        : (behavior.effectUuid ? [{ uuid: behavior.effectUuid, name: behavior.effectName, img: behavior.effectImg, intensity: behavior.effectIntensity }] : []);

      if (effList.length === 0) return;

      const toCreate = [];
      for (const eff of effList) {
        if (!eff.uuid) continue;
        const sourceEffect = await resolveItem(eff, { type: "effect" });
        if (!sourceEffect) continue;
        const effectData = sourceEffect.toObject();
        const rawIntensity = resolveIntPlaceholder(eff.intensity || "1", terrainRegion);
        const intensity = evaluateIntensityValue(rawIntensity, 0);
        effectData.system.intensity = intensity;
        effectData.flags = effectData.flags || {};
        effectData.flags.trespasser = Object.assign(effectData.flags.trespasser || {}, {
          sourceRegionId: terrainRegion.id,
          sourceEffectUuid: eff.uuid,
          sourceIntensityFormula: eff.intensity || "1",
          sourceLinkedEffectUuid: terrainRegion.flags?.trespasser?.linkedEffectId || terrainRegion.flags?.trespasser?.terrain?.system?.linkedEffect?.uuid || null
        });
        delete effectData._id;
        toCreate.push(effectData);
      }

      if (toCreate.length > 0) {
        await Item.createDocuments(toCreate, { parent: actor });
        const effectNames = toCreate.map(e => e.name).join(", ");
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: game.i18n.format("TRESPASSER.Notification.Terrain.EffectApplied", {
            name: actor.name,
            effect: effectNames,
            terrain: terrainRegion.name
          }),
          flavor: `🌍 ${terrainRegion.name}`
        });
      }
      break;
    }

    case "forcedMovement": {
      const distStr = resolveIntPlaceholder(behavior.forcedMovementDistance, terrainRegion);
      const distance = evaluateIntensityValue(distStr, 0);
      if (distance <= 0) return;

      const token = actor.token?.object ||
        canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
      if (!token) return;

      await ForcedMovementHelper.executeForcedMovement(
        null, [token],
        behavior.forcedMovementType, distance,
        {
          direction: behavior.forcedMovementDirection,
          terrainRegion,
          pathSquares: terrainRegion.flags?.trespasser?.pathSquares
        }
      );
      break;
    }

    case "damage": {
      if (!actor) return;
      let formula = resolveIntPlaceholder(behavior.damageFormula, terrainRegion);
      const resolveActor = casterActor || actor;
      formula = TrespasserEffectsHelper.replacePlaceholders(formula, resolveActor);
      if (!formula) return;

      const roll = new foundry.dice.Roll(formula);
      await roll.evaluate();

      if (typeof actor.applyDamage === "function") {
        await actor.applyDamage(roll.total);
      } else {
        const currentHp = actor.system.health ?? 0;
        const newHp = Math.max(0, currentHp - roll.total);
        await actor.update({ "system.health": newHp });
      }

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `🌍 ${terrainRegion.name} — ${game.i18n.localize("TRESPASSER.Sheet.Terrain.Fields.TerrainDamage")}`
      });
      break;
    }

    case "script": {
      if (behavior.script) {
        try {
          const fn = new Function("actor", "terrain", "region", "context", behavior.script);
          await fn(actor, terrainRegion.flags?.trespasser?.terrain, terrainRegion, context);
        } catch (e) {
          console.error("Trespasser | Terrain script error", e);
        }
      }
      break;
    }
  }
}
