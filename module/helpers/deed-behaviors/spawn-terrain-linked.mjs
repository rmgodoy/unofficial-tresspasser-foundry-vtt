import { resolveItem } from "../item-resolver.mjs";

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

    const existing = actor.items.find(i => {
      if (i.type !== "effect") return false;
      if (linkedUuid && (i.flags?.trespasser?.sourceEffectUuid === linkedUuid || i.flags?.trespasser?.linkedSource === linkedUuid || i.uuid === linkedUuid || i.id === linkedUuid)) return true;
      if (linkedItem.name && (clean(i.name) === clean(linkedItem.name) || clean(i.name).includes(clean(linkedItem.name)) || clean(linkedItem.name).includes(clean(i.name)))) return true;
      return false;
    });

    let linkedDocId = existing?.id || null;

    if (existing) {
      if (!options.linkedEffectId) options.linkedEffectId = existing.id;
      if (!options.linkedEffectUuid) options.linkedEffectUuid = existing.uuid;
      if (existing.system?.intensity !== finalIntensity) {
        if (actor.isOwner) {
          await existing.update({ "system.intensity": finalIntensity });
        } else {
          const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
          await emitDeedActionAndWait("applyEffects", {
            actorId: actor.id,
            itemDataArray: [{ _id: existing.id, "system.intensity": finalIntensity }]
          });
        }
      }
    } else {
      const sourceEffect = linkedUuid ? await resolveItem(linkedItem, { type: "effect" }) : null;
      if (!sourceEffect) continue;

      const effectData = sourceEffect.toObject();
      delete effectData._id;
      effectData.system = effectData.system || {};
      effectData.system.intensity = finalIntensity;
      effectData.flags = foundry.utils.mergeObject(effectData.flags || {}, {
        trespasser: {
          sourceEffectUuid: sourceEffect.uuid,
          linkedSource: sourceEffect.uuid
        }
      });

      if (actor.isOwner) {
        const [created] = await actor.createEmbeddedDocuments("Item", [effectData]);
        if (created) {
          linkedDocId = created.id;
          if (!options.linkedEffectId) options.linkedEffectId = created.id;
          if (!options.linkedEffectUuid) options.linkedEffectUuid = created.uuid;
        }
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        const res = await emitDeedActionAndWait("applyEffects", {
          actorId: actor.id,
          itemDataArray: [effectData]
        });
        if (Array.isArray(res) && res[0]) {
          linkedDocId = res[0];
          options.linkedEffectId = res[0];
        }
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
}
