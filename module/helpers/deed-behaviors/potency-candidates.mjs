import { resolveItem } from "../item-resolver.mjs";

/**
 * Check if a terrain document or UUID defines one or more linked effects.
 * @param {Item|string} terrainItemOrUuid
 * @returns {Promise<boolean>|boolean}
 */
export async function hasLinkedEffect(terrainItemOrUuid) {
  if (!terrainItemOrUuid) return false;
  let doc = terrainItemOrUuid;
  if (typeof terrainItemOrUuid === "string") {
    try {
      doc = await resolveItem(terrainItemOrUuid, { notify: false, type: "terrain" });
    } catch {
      return false;
    }
  }
  if (!doc) return false;
  const sys = doc.system;
  return Boolean(
    (sys?.linkedEffects && sys.linkedEffects.length > 0) ||
    sys?.linkedEffect?.uuid ||
    sys?.linkedEffectKey
  );
}

/**
 * Safely parse an intensity value, supporting 0 as valid.
 * @param {any} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function parseIntensity(val, fallback = 0) {
  if (val !== undefined && val !== null && val !== "" && !isNaN(Number(val))) {
    return Number(val);
  }
  return fallback;
}

/**
 * Helper to get equipped weapons from an actor.
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function getActorEquippedWeapons(actor) {
  if (!actor?.system) return [];
  const mode = actor.system.combat?.weaponMode || "main";
  const mainHandId = actor.system.equipment?.main_hand;
  const offHandId = actor.system.equipment?.off_hand;
  const weapons = [];

  if (mode === "dual") {
    const main = mainHandId ? actor.items.get(mainHandId) : null;
    const off = offHandId ? actor.items.get(offHandId) : null;
    if (main?.type === "weapon") weapons.push(main);
    if (off?.type === "weapon" && off.id !== main?.id) weapons.push(off);
  } else if (mode === "off") {
    const off = offHandId ? actor.items.get(offHandId) : null;
    if (off?.type === "weapon") weapons.push(off);
  } else {
    const main = mainHandId ? actor.items.get(mainHandId) : null;
    if (main?.type === "weapon") weapons.push(main);
  }
  return weapons;
}

/**
 * Collect all eligible effect and terrain candidates for Potency allocation across the deed graph.
 * @param {object} context
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} [phaseKey=""]
 * @returns {Promise<Array<object>>}
 */
export async function collectPotencyCandidates(context, actor, item, phaseKey = "") {
  const candidates = [];
  const graphNodes = context.executor?.system?.graph?.nodes || item?.system?.graph?.nodes || [];

  for (const node of graphNodes) {
    if (node.type === "applyEffects") {
      const rawEffects = node.params?.effects || [];
      const effects = Array.isArray(rawEffects) ? rawEffects : Object.values(rawEffects);
      for (const eff of effects) {
        if (!eff) continue;
        const effectItem = await resolveItem(eff, { notify: false, type: "effect" });
        if (!effectItem) continue;
        candidates.push({
          type: "effect",
          nodeId: node.id,
          uuid: eff.uuid,
          item: effectItem,
          name: effectItem.name,
          displayName: effectItem.name,
          img: eff.img || effectItem.img || "icons/svg/aura.svg",
          baseIntensity: parseIntensity(eff.intensity, effectItem.system?.intensity ?? 0),
          source: "deed"
        });
      }

      if (node.params?.appliesWeaponEffects && actor) {
        const weapons = getActorEquippedWeapons(actor);
        for (const weapon of weapons) {
          const wEffects = weapon.system?.effects;
          if (Array.isArray(wEffects)) {
            for (const wEff of wEffects) {
              if (!wEff) continue;
              const effectItem = await resolveItem(wEff, { notify: false, type: "effect" });
              if (!effectItem) continue;
              candidates.push({
                type: "effect",
                nodeId: node.id,
                uuid: wEff.uuid,
                item: effectItem,
                name: effectItem.name,
                displayName: `${effectItem.name} (${weapon.name})`,
                img: wEff.img || effectItem.img || "icons/svg/aura.svg",
                baseIntensity: parseIntensity(wEff.intensity, effectItem.system?.intensity ?? 0),
                source: weapon.name
              });
            }
          }
          if (phaseKey === "spark" && Array.isArray(weapon.system?.enhancementEffects)) {
            for (const wEff of weapon.system.enhancementEffects) {
              if (!wEff) continue;
              const effectItem = await resolveItem(wEff, { notify: false, type: "effect" });
              if (!effectItem) continue;
              candidates.push({
                type: "effect",
                nodeId: node.id,
                uuid: wEff.uuid,
                item: effectItem,
                name: effectItem.name,
                displayName: `${effectItem.name} (${weapon.name} Enhancement)`,
                img: wEff.img || effectItem.img || "icons/svg/aura.svg",
                baseIntensity: parseIntensity(wEff.intensity, effectItem.system?.intensity ?? 0),
                source: `${weapon.name} (Enhancement)`
              });
            }
          }
        }
      }
    } else if (node.type === "spawnTerrain") {
      if (!node.params?.terrainUuid) continue;
      const terrainItem = await resolveItem(node.params.terrainUuid, { notify: false, type: "terrain" });
      if (!terrainItem) continue;
      const hasLinked = await hasLinkedEffect(terrainItem);
      if (!hasLinked) continue;

      const defaultTerrainInt = parseIntensity(terrainItem.system?.linkedEffects?.[0]?.intensity, 1);
      const baseIntensity = parseIntensity(node.params.intensity, defaultTerrainInt);
      const terrainLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.spawnTerrain") || "Terrain";

      candidates.push({
        type: "terrain",
        nodeId: node.id,
        uuid: terrainItem.uuid,
        item: terrainItem,
        name: terrainItem.name,
        displayName: `${terrainItem.name} (${terrainLabel})`,
        img: node.params.terrainImg || terrainItem.img || "icons/svg/mountain.svg",
        baseIntensity: baseIntensity,
        source: "terrain"
      });
    }
  }

  return candidates;
}
