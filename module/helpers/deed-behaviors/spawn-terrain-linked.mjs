import { resolveItem } from "../item-resolver.mjs";
import { SYSTEM_ID, getSystemFlag } from "../../system-id.mjs";

/**
 * Ensure the caster actor possesses the linked effect(s) configured on the terrain.
 * @param {Item} terrainItem
 * @param {Actor} actor
 * @param {object} options
 * @param {number} finalIntensity
 * @param {number} baseIntensity
 * @param {number} addedPotency
 * @param {string} behaviorId
 * @param {object} context
 */
export async function ensureCasterLinkedEffect(terrainItem, actor, options, finalIntensity, baseIntensity, addedPotency, behaviorId, context) {
  const linkedList = (terrainItem.system?.linkedEffects && terrainItem.system.linkedEffects.length > 0)
    ? terrainItem.system.linkedEffects
    : (terrainItem.system?.linkedEffect?.uuid ? [terrainItem.system.linkedEffect] : []);

  const clean = (s) => String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase();

  for (const linkedItem of linkedList) {
    const linkedUuid = linkedItem.uuid;
    if (!linkedUuid && !linkedItem.name) continue;

    const sourceEffect = linkedUuid ? await resolveItem(linkedItem, { type: "effect" }) : null;
    if (!sourceEffect) continue;

    const effectData = sourceEffect.toObject();
    delete effectData._id;
    effectData.system = effectData.system || {};
    effectData.system.intensity = finalIntensity;
    effectData.flags = foundry.utils.mergeObject(effectData.flags || {}, {
      [SYSTEM_ID]: {
        sourceEffectUuid: sourceEffect.uuid,
        linkedSource: sourceEffect.uuid
      }
    });

    let linkedDocId = null;

    if (actor.isOwner) {
      const [created] = await actor.createEmbeddedDocuments("Item", [effectData]);
      const targetDoc = created || actor.items.find(i =>
        i.type === "effect" && (
          (linkedUuid && (getSystemFlag(i, "sourceEffectUuid") === linkedUuid || getSystemFlag(i, "linkedSource") === linkedUuid || i.uuid === linkedUuid || i.id === linkedUuid)) ||
          (clean(i.name) === clean(sourceEffect.name) || clean(i.name).includes(clean(sourceEffect.name)) || clean(sourceEffect.name).includes(clean(i.name)))
        )
      );
      if (targetDoc) {
        linkedDocId = targetDoc.id;
        if (!options.linkedEffectId) options.linkedEffectId = targetDoc.id;
        if (!options.linkedEffectUuid) options.linkedEffectUuid = targetDoc.uuid;
      }
    } else {
      const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
      const res = await emitDeedActionAndWait("applyEffects", {
        actorId: actor.id,
        itemDataArray: [effectData]
      });
      const targetDoc = (Array.isArray(res) && res[0] ? actor.items.get(res[0]) : null) || actor.items.find(i =>
        i.type === "effect" && (
          (linkedUuid && (getSystemFlag(i, "sourceEffectUuid") === linkedUuid || getSystemFlag(i, "linkedSource") === linkedUuid || i.uuid === linkedUuid || i.id === linkedUuid)) ||
          (clean(i.name) === clean(sourceEffect.name) || clean(i.name).includes(clean(sourceEffect.name)) || clean(sourceEffect.name).includes(clean(i.name)))
        )
      );
      if (targetDoc) {
        linkedDocId = targetDoc.id;
        if (!options.linkedEffectId) options.linkedEffectId = targetDoc.id;
        if (!options.linkedEffectUuid) options.linkedEffectUuid = targetDoc.uuid;
      }
    }

    // Register with DeedPotencyHelper so retroactive updates can find it
    const { DeedPotencyHelper } = await import("./potency-helper.mjs");
    DeedPotencyHelper.registerAppliedEffect(context, {
      type: "terrain",
      actor: actor,
      nodeId: behaviorId,
      itemId: linkedDocId,
      uuid: linkedUuid,
      baseIntensity: baseIntensity,
      addedPotency: addedPotency,
      finalIntensity: finalIntensity,
      terrainName: terrainItem.name,
      img: terrainItem.img || "icons/svg/mountain.svg"
    });
  }
  options.skipLinkedEffectGrant = true;
}
