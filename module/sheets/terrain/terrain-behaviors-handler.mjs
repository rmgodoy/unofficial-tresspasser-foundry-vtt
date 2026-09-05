import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * terrain-behaviors-handler.mjs
 * Behavior and linked effect handlers for Terrain item sheets.
 */

/**
 * Handle dropping an effect/state item onto a behavior row's effect drop zone.
 * @param {Item} item - Terrain document
 * @param {DragEvent} event
 */
export async function handleDropBehaviorEffect(item, event) {
  event.preventDefault();
  const zone = event.currentTarget.closest("[data-behavior-index]");
  if (!zone) return;
  const index = parseInt(zone.dataset.behaviorIndex);
  if (isNaN(index)) return;

  let data;
  try {
    data = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }

  if (data.type !== "Item") return;

  const droppedItem = await resolveItem(data);
  if (!droppedItem) return;

  if (droppedItem.type !== "effect" && droppedItem.type !== "state") {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnlyEffects"));
    return;
  }

  const behaviors = foundry.utils.deepClone(item.system.behaviors) || [];
  if (!behaviors[index]) return;

  const b = behaviors[index];
  let effects = Array.isArray(b.effects) ? [...b.effects] : [];
  if (effects.length === 0 && b.effectUuid) {
    effects.push({
      uuid: b.effectUuid,
      name: b.effectName || "",
      img: b.effectImg || "",
      intensity: b.effectIntensity || "1"
    });
  }

  // Check duplicate
  if (effects.some(e => e.uuid === droppedItem.uuid || e.name === droppedItem.name)) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: droppedItem.name }));
    return;
  }

  effects.push({
    uuid: droppedItem.uuid,
    name: droppedItem.name,
    img: droppedItem.img,
    intensity: String(droppedItem.system?.intensity ?? "0")
  });

  behaviors[index].effects = effects;
  behaviors[index].effectUuid = effects[0].uuid;
  behaviors[index].effectName = effects[0].name;
  behaviors[index].effectImg = effects[0].img;
  behaviors[index].effectIntensity = effects[0].intensity;

  await item.update({ "system.behaviors": behaviors });
}

/**
 * Handle dropping an effect/state item onto the Linked Effects drop zone.
 * @param {Item} item - Terrain document
 * @param {DragEvent} event
 */
export async function handleDropLinkedEffect(item, event) {
  event.preventDefault();
  let data;
  try {
    data = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }

  if (data.type !== "Item") return;

  const droppedItem = await resolveItem(data);
  if (!droppedItem) return;

  if (droppedItem.type !== "effect" && droppedItem.type !== "state") {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropDeedsOnlyEffects"));
    return;
  }

  let linkedList = Array.isArray(item.system.linkedEffects) ? [...item.system.linkedEffects] : [];
  if (linkedList.length === 0 && item.system.linkedEffect?.uuid) {
    linkedList.push({
      uuid: item.system.linkedEffect.uuid,
      name: item.system.linkedEffect.name || "",
      img: item.system.linkedEffect.img || "",
      intensity: "1"
    });
  }

  if (linkedList.some(e => e.uuid === droppedItem.uuid || e.name === droppedItem.name)) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: droppedItem.name }));
    return;
  }

  linkedList.push({
    uuid: droppedItem.uuid,
    name: droppedItem.name,
    img: droppedItem.img,
    intensity: String(droppedItem.system?.intensity ?? "0")
  });

  await item.update({
    "system.linkedEffects": linkedList,
    "system.linkedEffect": {
      uuid: linkedList[0].uuid,
      name: linkedList[0].name,
      img: linkedList[0].img
    },
    "system.linkedEffectKey": linkedList[0].uuid
  });
}

/**
 * Adds a new default terrain behavior.
 * @param {Item} item
 */
export async function addTerrainBehavior(item) {
  const behaviors = foundry.utils.deepClone(item.system.behaviors) || [];
  behaviors.push({
    trigger: "onEnter",
    action: "applyEffect",
    effects: [],
    effectUuid: "",
    effectName: "",
    effectImg: "",
    effectIntensity: "1",
    forcedMovementType: "",
    forcedMovementDistance: "0",
    forcedMovementDirection: "away_from_origin",
    damageFormula: "",
    script: "",
    onlyOnFirstEntry: true
  });
  await item.update({ "system.behaviors": behaviors });
}

/**
 * Removes a behavior from the terrain item at index.
 * @param {Item} item
 * @param {number} index
 */
export async function removeTerrainBehavior(item, index) {
  if (isNaN(index)) return;
  const behaviors = foundry.utils.deepClone(item.system.behaviors) || [];
  behaviors.splice(index, 1);
  await item.update({ "system.behaviors": behaviors });
}

/**
 * Removes a linked effect from the terrain item at index.
 * @param {Item} item
 * @param {number} effectIndex
 */
export async function removeTerrainLinkedEffect(item, effectIndex) {
  let linkedList = Array.isArray(item.system.linkedEffects) ? foundry.utils.deepClone(item.system.linkedEffects) : [];
  
  if (isNaN(effectIndex) || linkedList.length === 0) {
    linkedList = [];
  } else {
    linkedList.splice(effectIndex, 1);
  }

  const first = linkedList[0] || { uuid: "", name: "", img: "" };
  await item.update({
    "system.linkedEffects": linkedList,
    "system.linkedEffect": {
      uuid: first.uuid || "",
      name: first.name || "",
      img: first.img || ""
    },
    "system.linkedEffectKey": first.uuid || ""
  });
}

/**
 * Removes a specific effect from a behavior.
 * @param {Item} item
 * @param {number} behaviorIndex
 * @param {number} effectIndex
 */
export async function removeTerrainBehaviorEffect(item, behaviorIndex, effectIndex) {
  if (isNaN(behaviorIndex) || isNaN(effectIndex)) return;

  const behaviors = foundry.utils.deepClone(item.system.behaviors) || [];
  if (!behaviors[behaviorIndex]) return;

  let effects = Array.isArray(behaviors[behaviorIndex].effects) ? behaviors[behaviorIndex].effects : [];
  effects.splice(effectIndex, 1);
  behaviors[behaviorIndex].effects = effects;

  if (effects.length > 0) {
    behaviors[behaviorIndex].effectUuid = effects[0].uuid;
    behaviors[behaviorIndex].effectName = effects[0].name;
    behaviors[behaviorIndex].effectImg = effects[0].img;
    behaviors[behaviorIndex].effectIntensity = effects[0].intensity;
  } else {
    behaviors[behaviorIndex].effectUuid = "";
    behaviors[behaviorIndex].effectName = "";
    behaviors[behaviorIndex].effectImg = "";
    behaviors[behaviorIndex].effectIntensity = "1";
  }

  await item.update({ "system.behaviors": behaviors });
}

/**
 * Toggles intensity synchronization between fixed and deed potency for an effect.
 * @param {Item} item
 * @param {number} behaviorIndex
 * @param {number} effectIndex
 */
export async function toggleTerrainBehaviorEffectSync(item, behaviorIndex, effectIndex) {
  if (isNaN(behaviorIndex) || isNaN(effectIndex)) return;

  const behaviors = foundry.utils.deepClone(item.system.behaviors) || [];
  if (!behaviors[behaviorIndex]?.effects?.[effectIndex]) return;

  const eff = behaviors[behaviorIndex].effects[effectIndex];
  const current = String(eff.intensity || "").trim();
  if (current.toLowerCase().includes("<int>")) {
    eff.intensity = "1";
  } else {
    eff.intensity = "<Int>";
  }

  await item.update({ "system.behaviors": behaviors });
}
