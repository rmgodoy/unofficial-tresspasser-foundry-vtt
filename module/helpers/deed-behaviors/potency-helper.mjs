import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { resolveItem } from "../item-resolver.mjs";

/**
 * DeedPotencyHelper — Coordinates Potency spark distribution among Deed effects and terrains with linked effects.
 */
export class DeedPotencyHelper {

  /**
   * Check if a terrain document or UUID defines one or more linked effects.
   * @param {Item|string} terrainItemOrUuid
   * @returns {Promise<boolean>|boolean}
   */
  static async hasLinkedEffect(terrainItemOrUuid) {
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
  static parseIntensity(val, fallback = 0) {
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
  static getActorEquippedWeapons(actor) {
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
  static async collectPotencyCandidates(context, actor, item, phaseKey = "") {
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
            baseIntensity: this.parseIntensity(eff.intensity, effectItem.system?.intensity ?? 0),
            source: "deed"
          });
        }

        if (node.params?.appliesWeaponEffects && actor) {
          const weapons = this.getActorEquippedWeapons(actor);
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
                  baseIntensity: this.parseIntensity(wEff.intensity, effectItem.system?.intensity ?? 0),
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
                  baseIntensity: this.parseIntensity(wEff.intensity, effectItem.system?.intensity ?? 0),
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
        const hasLinked = await this.hasLinkedEffect(terrainItem);
        if (!hasLinked) continue;

        const defaultTerrainInt = this.parseIntensity(terrainItem.system?.linkedEffects?.[0]?.intensity, 1);
        const baseIntensity = this.parseIntensity(node.params.intensity, defaultTerrainInt);
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

  /**
   * Ensure that Potency allocations are prompted and computed across all candidates.
   * Caches results in context so it runs exactly once per deed execution.
   * @param {object} context
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} [phaseKey=""]
   */
  static async ensurePotencyAllocations(context, actor, item, phaseKey = "") {
    if (context.potencyAllocationsResolved) return;

    context.potencyAllocations = context.potencyAllocations || {
      terrainBonuses: new Map(),
      effectBonuses: new Map()
    };

    // If spark choices have not yet been evaluated (e.g. node runs before rollAccuracy),
    // do NOT mark resolved so that onSparksSelected will run after the roll.
    if (!context.sparkChoices) return;

    const targetChoicesMap = context.sparkChoices?.perTarget;
    const globalPotency = context.sparkChoices?.potencyBonus || 0;
    const hasAnyPotency = globalPotency > 0 || (targetChoicesMap && Array.from(targetChoicesMap.values()).some(c => (c?.potency || 0) > 0));

    if (!hasAnyPotency) {
      context.potencyAllocationsResolved = true;
      return;
    }

    const candidates = await this.collectPotencyCandidates(context, actor, item, phaseKey);

    // Ensure any terrain/effect already applied in context is present in candidates
    if (context.appliedDeedEffects?.length > 0) {
      for (const applied of context.appliedDeedEffects) {
        if (applied.type === "terrain" && !candidates.some(c => c.nodeId === applied.nodeId)) {
          const terrainLabel = game.i18n.localize("TRESPASSER.Sheet.Deed.Behavior.Type.spawnTerrain") || "Terrain";
          candidates.push({
            type: "terrain",
            nodeId: applied.nodeId,
            uuid: applied.uuid,
            name: applied.terrainName,
            displayName: `${applied.terrainName} (${terrainLabel})`,
            img: applied.img || "icons/svg/mountain.svg",
            baseIntensity: applied.baseIntensity ?? 1,
            source: "terrain"
          });
        }
      }
    }

    if (candidates.length === 0) {
      context.potencyAllocationsResolved = true;
      return;
    }

    const { askPotencyDialog } = await import("../../dialogs/potency-dialog.mjs");
    let anyAllocated = false;

    if (targetChoicesMap && targetChoicesMap.size > 0) {
      for (const [tokenId, targetChoices] of targetChoicesMap.entries()) {
        const targetPotency = targetChoices?.potency || 0;
        if (targetPotency <= 0) continue;
        anyAllocated = true;

        const targetToken = canvas.tokens?.get(tokenId) || canvas.scene?.tokens?.get(tokenId);
        const tokenName = targetToken ? DeedBehaviorUtils.getTokenDisplayName(targetToken) : tokenId;

        let allocations = [];
        if (candidates.length > 1) {
          allocations = await askPotencyDialog(
            targetPotency,
            candidates.map(c => ({ name: c.displayName, intensity: c.baseIntensity, img: c.img })),
            tokenName
          );
          if (!allocations) {
            allocations = candidates.map((_, i) => (i === 0 ? targetPotency : 0));
          }
        } else {
          allocations = [targetPotency];
        }

        candidates.forEach((cand, idx) => {
          const bonus = allocations[idx] || 0;
          if (cand.type === "terrain") {
            const curr = context.potencyAllocations.terrainBonuses.get(cand.nodeId) || 0;
            context.potencyAllocations.terrainBonuses.set(cand.nodeId, curr + bonus);
          } else {
            const curr = context.potencyAllocations.effectBonuses.get(`${tokenId}_${cand.uuid}`) || 0;
            context.potencyAllocations.effectBonuses.set(`${tokenId}_${cand.uuid}`, curr + bonus);
          }
        });
      }
    }

    if (!anyAllocated && globalPotency > 0) {
      let allocations = [];
      if (candidates.length > 1) {
        allocations = await askPotencyDialog(
          globalPotency,
          candidates.map(c => ({ name: c.displayName, intensity: c.baseIntensity, img: c.img })),
          actor?.name || "Self"
        );
        if (!allocations) {
          allocations = candidates.map((_, i) => (i === 0 ? globalPotency : 0));
        }
      } else {
        allocations = [globalPotency];
      }

      candidates.forEach((cand, idx) => {
        const bonus = allocations[idx] || 0;
        if (cand.type === "terrain") {
          const curr = context.potencyAllocations.terrainBonuses.get(cand.nodeId) || 0;
          context.potencyAllocations.terrainBonuses.set(cand.nodeId, curr + bonus);
        } else {
          const curr = context.potencyAllocations.effectBonuses.get(`global_${cand.uuid}`) || 0;
          context.potencyAllocations.effectBonuses.set(`global_${cand.uuid}`, curr + bonus);
        }
      });
    }

    context.potencyAllocationsResolved = true;
    await this.updateAlreadyApplied(context);
  }

  /**
   * Register an applied effect or terrain in context so it can be retroactively updated if Potency is chosen later.
   * @param {object} context
   * @param {object} record
   */
  static registerAppliedEffect(context, record) {
    if (!context.appliedDeedEffects) context.appliedDeedEffects = [];
    context.appliedDeedEffects.push(record);
  }

  /**
   * Retroactively updates effects and terrains that were created prior to Potency selection.
   * @param {object} context
   */
  static async updateAlreadyApplied(context) {
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

  /**
   * Retrieve allocated potency bonus for a specific target and effect UUID.
   * @param {object} context
   * @param {string} targetId
   * @param {string} effectUuid
   * @returns {number}
   */
  static getEffectPotency(context, targetId, effectUuid) {
    return context.potencyAllocations?.effectBonuses?.get(`${targetId}_${effectUuid}`) ??
           context.potencyAllocations?.effectBonuses?.get(`global_${effectUuid}`) ?? 0;
  }

  /**
   * Retrieve allocated potency bonus for a terrain node ID.
   * @param {object} context
   * @param {string} nodeId
   * @returns {number}
   */
  static getTerrainPotency(context, nodeId) {
    return context.potencyAllocations?.terrainBonuses?.get(nodeId) ?? 0;
  }

  /**
   * Triggered immediately after sparks are selected in rollAccuracy.
   * @param {object} context
   * @param {Actor} actor
   * @param {Item} item
   * @param {string} [phaseKey=""]
   */
  static async onSparksSelected(context, actor, item, phaseKey = "") {
    await this.ensurePotencyAllocations(context, actor, item, phaseKey);
  }
}
