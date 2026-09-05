/**
 * Register an applied effect or terrain in context so it can be retroactively updated if Potency is chosen later.
 * @param {object} context
 * @param {object} record
 */
export function registerAppliedEffect(context, record) {
  if (!context.appliedDeedEffects) context.appliedDeedEffects = [];
  context.appliedDeedEffects.push(record);
}

/**
 * Retroactively updates effects and terrains that were created prior to Potency selection.
 * @param {object} context
 */
export async function updateAlreadyApplied(context) {
  const appliedList = context.appliedDeedEffects || [];
  for (const record of appliedList) {
    if (record.type === "terrain") {
      const bonus = context.potencyAllocations?.terrainBonuses?.get(record.nodeId) || 0;
      if (bonus > (record.addedPotency || 0)) {
        const newIntensity = record.baseIntensity + bonus;
        record.addedPotency = bonus;
        record.finalIntensity = newIntensity;

        // 1. Locate and update the caster's linked effect document
        const actor = game.actors?.get(record.actor?.id) || record.actor;
        let doc = record.itemId ? actor?.items?.get(record.itemId) : null;
        if (!doc && actor) {
          doc = actor.items?.find(i =>
            i.type === "effect" && (
              (record.itemId && i.id === record.itemId) ||
              (record.uuid && (i.flags?.trespasser?.sourceEffectUuid === record.uuid || i.flags?.trespasser?.linkedSource === record.uuid)) ||
              (record.terrainName && (i.name === record.terrainName || i.name.toLowerCase().includes(record.terrainName.toLowerCase())))
            )
          );
        }

        if (doc && doc.system?.intensity !== newIntensity) {
          if (actor.isOwner) {
            await doc.update({ "system.intensity": newIntensity });
          } else {
            const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
            await emitDeedActionAndWait("applyEffects", {
              actorId: actor.id,
              itemDataArray: [{ _id: doc.id, "system.intensity": newIntensity }]
            });
          }
        }

        // 2. Update any canvas terrain regions placed during this execution
        const spawned = context.spawnedTerrains || [];
        const { TerrainHelper } = await import("../terrain-helper.mjs");
        for (const st of spawned) {
          if (st && typeof st.update === "function") {
            try {
              await st.update({ "flags.trespasser.intensity": newIntensity });
              await TerrainHelper.syncWhileInsideEffectsForRegion(st);
            } catch (e) {
              console.warn("Trespasser | Failed to sync terrain region intensity:", e);
            }
          }
        }

        // 3. Post note to chat
        if (context.currentPhaseOutputs?.notes) {
          context.currentPhaseOutputs.notes.push(
            game.i18n.format("TRESPASSER.Chat.Terrain.IntensityUpdated", {
              terrain: record.terrainName,
              intensity: newIntensity,
              potency: bonus
            })
          );
        }
      }
    } else if (record.type === "effect") {
      const bonus = context.potencyAllocations?.effectBonuses?.get(`${record.targetId}_${record.uuid}`) ??
                    context.potencyAllocations?.effectBonuses?.get(`global_${record.uuid}`) ?? 0;
      if (bonus > (record.addedPotency || 0)) {
        const newIntensity = record.baseIntensity + bonus;
        record.addedPotency = bonus;
        record.finalIntensity = newIntensity;
        const actor = game.actors?.get(record.actor?.id) || record.actor;
        let doc = record.itemId ? actor?.items?.get(record.itemId) : null;
        if (!doc && actor) {
          doc = actor.items?.find(i =>
            i.type === "effect" && (
              (record.itemId && i.id === record.itemId) ||
              (record.uuid && (i.flags?.trespasser?.sourceEffectUuid === record.uuid || i.flags?.trespasser?.linkedSource === record.uuid)) ||
              (record.name && i.name === record.name)
            )
          );
        }
        if (doc && doc.system?.intensity !== newIntensity) {
          if (actor.isOwner) {
            await doc.update({ "system.intensity": newIntensity });
          } else {
            const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
            await emitDeedActionAndWait("applyEffects", {
              actorId: actor.id,
              itemDataArray: [{ _id: doc.id, "system.intensity": newIntensity }]
            });
          }
        }
        if (context.currentPhaseOutputs?.notes) {
          context.currentPhaseOutputs.notes.push(
            game.i18n.format("TRESPASSER.Chat.Effect.IntensityUpdated", {
              effect: record.name,
              intensity: newIntensity,
              potency: bonus
            })
          );
        }
      }
    }
  }
}
