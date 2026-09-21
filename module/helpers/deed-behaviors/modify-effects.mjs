import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { resolveItem } from "../item-resolver.mjs";
import { STATUS_EFFECT_COUNTERS, TRESPASSER_STATUS_EFFECTS } from "../../config/status-effects.mjs";
import { promptModifyEffectChoice } from "../../dialogs/modify-effect-choice-dialog.mjs";
import { SYSTEM_ID } from "../../system-id.mjs";

/**
 * ModifyEffectsBehavior — Executes modifications to active states/effects on targets
 * (inverting to opposite state, increasing/decreasing intensity, removing, or setting intensity).
 */
export class ModifyEffectsBehavior {

  /**
   * Execute modifyEffects behavior node.
   * @param {object} behavior - Behavior node data { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey="base"] - Current execution phase
   * @returns {Promise<boolean>}
   */
  static async execute(behavior, context, actor, item, phaseKey = "base") {
    const params = behavior.params || {};
    const operation = params.operation || "invert"; // "invert" | "increase" | "decrease" | "remove" | "setIntensity"
    const effectFilter = params.effectFilter || "hasOpposite";
    const specificStateId = params.specificStateId || "";
    const choiceMode = params.choiceMode || "choose_count";
    const choiceCount = Math.max(1, Number(params.choiceCount ?? 1));
    const intensityDelta = Number(params.intensityDelta ?? 1);
    const referencedNodeId = params.referencedNodeId || "";

    let validTargets = [];
    if (params.targetScope === "self" || params.targetScope === "source") {
      const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(actor);
      validTargets = sourceToken ? [sourceToken] : (actor ? [actor] : []);
    } else {
      validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    }

    if (!validTargets || validTargets.length === 0) return true;

    if (!context.modifiedEffects) context.modifiedEffects = new Map();
    if (!context.modifiedEffectsByNode) context.modifiedEffectsByNode = new Map();

    const nodeRecordMap = context.modifiedEffectsByNode.get(behavior.id) || new Map();
    context.modifiedEffectsByNode.set(behavior.id, nodeRecordMap);

    for (const targetToken of validTargets) {
      const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);
      const candidates = await this._gatherCandidateEffects(targetActor, targetToken, effectFilter, specificStateId, referencedNodeId, context);

      if (candidates.length === 0) {
        if (context.currentPhaseOutputs?.notes && effectFilter !== "referenced") {
          context.currentPhaseOutputs.notes.push(
            game.i18n.format("TRESPASSER.Chat.ModifyEffect.NoEligibleStates", { target: tokenName })
          );
        }
        continue;
      }

      let selectedCandidates = [];

      if (choiceMode === "all_matching") {
        selectedCandidates = candidates;
      } else if (choiceMode === "choose_any" || choiceMode === "choose_multiple") {
        let chosenIds = null;
        const choiceKey = `modifyEffect_${behavior.id}_${targetToken.id || targetActor.id}_${phaseKey}`;
        if (!context.modalChoices) context.modalChoices = new Map();
        chosenIds = context.modalChoices.get(choiceKey);

        if (!chosenIds) {
          chosenIds = await promptModifyEffectChoice({
            target: targetToken,
            candidates,
            operation,
            multiple: true,
            maxCount: null
          });
          if (chosenIds) context.modalChoices.set(choiceKey, chosenIds);
        }

        if (Array.isArray(chosenIds)) {
          selectedCandidates = candidates.filter(c => chosenIds.includes(c.item.id));
        } else if (chosenIds) {
          selectedCandidates = candidates.filter(c => c.item.id === chosenIds);
        }
      } else {
        // choose_count / choose_one (specific number, default 1)
        if (choiceCount <= 1 && candidates.length === 1) {
          selectedCandidates = [candidates[0]];
        } else {
          const isMulti = choiceCount > 1;
          let chosenIds = null;
          const choiceKey = `modifyEffect_${behavior.id}_${targetToken.id || targetActor.id}_${phaseKey}`;
          if (!context.modalChoices) context.modalChoices = new Map();
          chosenIds = context.modalChoices.get(choiceKey);

          if (!chosenIds) {
            chosenIds = await promptModifyEffectChoice({
              target: targetToken,
              candidates,
              operation,
              multiple: isMulti,
              maxCount: choiceCount
            });
            if (chosenIds) context.modalChoices.set(choiceKey, chosenIds);
          }

          if (Array.isArray(chosenIds)) {
            selectedCandidates = candidates.filter(c => chosenIds.includes(c.item.id)).slice(0, choiceCount);
          } else if (chosenIds) {
            const match = candidates.find(c => c.item.id === chosenIds) || candidates[0];
            if (match) selectedCandidates = [match];
          }
        }
      }

      for (const candidate of selectedCandidates) {
        await this._applyModifyEffect({
          targetActor,
          targetToken,
          candidate,
          operation,
          intensityDelta,
          context,
          phaseKey,
          behaviorId: behavior.id,
          tokenName
        });
      }
    }

    return true;
  }

  /**
   * Identifies if an effect has an opposite counterpart and resolves opposite effect metadata.
   * @param {Item} effectItem
   * @returns {Promise<{ oppositeId: string, name: string, compendiumId?: string, uuid?: string, img?: string }|null>}
   */
  static async findOppositeDef(effectItem) {
    if (!effectItem || effectItem.type !== "effect") return null;

    const statusId = effectItem.flags?.[SYSTEM_ID]?.statusEffectId || effectItem.flags?.trespasser?.statusEffectId || effectItem.name?.toLowerCase()?.trim();
    let counterKey = STATUS_EFFECT_COUNTERS[statusId];

    if (!counterKey) {
      const lowerName = effectItem.name?.toLowerCase()?.trim();
      counterKey = STATUS_EFFECT_COUNTERS[lowerName];
    }

    if (counterKey) {
      const canonical = TRESPASSER_STATUS_EFFECTS.find(e => e.id === counterKey);
      if (canonical) {
        return {
          oppositeId: canonical.id,
          name: game.i18n.localize(canonical.name) || canonical.id,
          compendiumId: canonical.compendiumId,
          uuid: canonical.compendiumId ? `Compendium.trespasser.trespasser-content.Item.${canonical.compendiumId}` : null,
          img: canonical.img
        };
      }
    }

    // Check custom counterStates on effect item
    const customCounters = effectItem.system?.counterStates || [];
    if (customCounters.length > 0) {
      const firstCounter = customCounters[0];
      return {
        oppositeId: firstCounter.uuid || firstCounter.id || firstCounter.name,
        name: firstCounter.name,
        uuid: firstCounter.uuid,
        img: firstCounter.img
      };
    }

    return null;
  }

  /**
   * Gathers candidate active effects from a target actor based on filter rules.
   * @private
   */
  static async _gatherCandidateEffects(targetActor, targetToken, filter, specificStateId, referencedNodeId, context) {
    const candidates = [];

    // Case 1: Referenced previous modified effect
    if (filter === "referenced" || referencedNodeId) {
      const targetKey = targetToken?.id || targetActor?.id;
      let prevRecord = null;
      if (referencedNodeId && context.modifiedEffectsByNode?.has(referencedNodeId)) {
        prevRecord = context.modifiedEffectsByNode.get(referencedNodeId).get(targetKey);
      } else if (context.modifiedEffects?.has(targetKey)) {
        prevRecord = context.modifiedEffects.get(targetKey);
      }

      const itemRef = prevRecord?.resultingItem || prevRecord?.itemDoc;
      if (itemRef?.id) {
        const liveItem = targetActor.items.get(itemRef.id);
        if (liveItem) {
          const oppositeDef = await this.findOppositeDef(liveItem);
          candidates.push({
            item: liveItem,
            oppositeDef,
            intensity: Number(liveItem.system?.intensity ?? 1)
          });
          return candidates;
        }
      }
    }

    const effectItems = targetActor.items.filter(i => i.type === "effect");

    for (const eff of effectItems) {
      const intensity = Number(eff.system?.intensity ?? 1);
      const oppositeDef = await this.findOppositeDef(eff);

      if (filter === "hasOpposite") {
        if (!oppositeDef) continue;
      } else if (filter === "specific") {
        if (specificStateId) {
          const effSource = eff.flags?.core?.sourceId || eff.id;
          const statusId = eff.flags?.[SYSTEM_ID]?.statusEffectId || eff.name?.toLowerCase();
          const match = effSource === specificStateId || eff.id === specificStateId || statusId === specificStateId.toLowerCase();
          if (!match) continue;
        }
      }

      candidates.push({
        item: eff,
        oppositeDef,
        intensity
      });
    }

    return candidates;
  }

  /**
   * Applies the modification operation (invert, increase, decrease, remove, setIntensity).
   * @private
   */
  static async _applyModifyEffect({
    targetActor,
    targetToken,
    candidate,
    operation,
    intensityDelta,
    context,
    phaseKey,
    behaviorId,
    tokenName
  }) {
    const effectItem = candidate.item;
    const currentIntensity = Number(effectItem.system?.intensity ?? 1);
    const targetKey = targetToken?.id || targetActor.id;

    let resultingItem = effectItem;
    let noteText = "";

    if (operation === "invert") {
      const oppDef = candidate.oppositeDef;
      if (!oppDef) return;

      const targetIntensity = currentIntensity + (phaseKey === "spark" || phaseKey === "hit" ? intensityDelta : 0);
      let oppItemDoc = null;

      if (oppDef.uuid || oppDef.compendiumId) {
        oppItemDoc = await resolveItem(oppDef.uuid || oppDef.compendiumId, { type: "effect" });
      }

      let newEffectData = null;
      if (oppItemDoc) {
        newEffectData = oppItemDoc.toObject();
      } else {
        newEffectData = {
          name: oppDef.name,
          type: "effect",
          img: oppDef.img || effectItem.img,
          system: {
            ...effectItem.system,
            intensity: targetIntensity
          }
        };
      }
      newEffectData.system = newEffectData.system || {};
      newEffectData.system.intensity = targetIntensity;

      if (targetActor.isOwner) {
        await effectItem.delete();
        const created = await targetActor.createEmbeddedDocuments("Item", [newEffectData]);
        resultingItem = created[0] || null;
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        const res = await emitDeedActionAndWait("modifyEffects", {
          actorId: targetActor.id,
          operation: "invert",
          deleteItemId: effectItem.id,
          createItemData: newEffectData
        });
        resultingItem = res?.createdId ? targetActor.items.get(res.createdId) : null;
      }

      noteText = game.i18n.format("TRESPASSER.Chat.ModifyEffect.Inverted", {
        oldEffect: effectItem.name,
        newEffect: newEffectData.name,
        intensity: targetIntensity,
        target: tokenName
      });

    } else if (operation === "increase") {
      const newIntensity = currentIntensity + intensityDelta;

      if (targetActor.isOwner) {
        await effectItem.update({ "system.intensity": newIntensity });
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("modifyEffects", {
          actorId: targetActor.id,
          operation: "update",
          itemId: effectItem.id,
          updates: { "system.intensity": newIntensity }
        });
      }

      noteText = game.i18n.format("TRESPASSER.Chat.ModifyEffect.Increased", {
        effect: effectItem.name,
        delta: intensityDelta,
        newIntensity,
        target: tokenName
      });

    } else if (operation === "decrease") {
      const newIntensity = currentIntensity - intensityDelta;

      if (newIntensity <= 0) {
        if (targetActor.isOwner) {
          await effectItem.delete();
        } else {
          const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
          await emitDeedActionAndWait("modifyEffects", {
            actorId: targetActor.id,
            operation: "delete",
            itemId: effectItem.id
          });
        }
        resultingItem = null;
        noteText = game.i18n.format("TRESPASSER.Chat.ModifyEffect.RemovedByReduction", {
          effect: effectItem.name,
          target: tokenName
        });
      } else {
        if (targetActor.isOwner) {
          await effectItem.update({ "system.intensity": newIntensity });
        } else {
          const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
          await emitDeedActionAndWait("modifyEffects", {
            actorId: targetActor.id,
            operation: "update",
            itemId: effectItem.id,
            updates: { "system.intensity": newIntensity }
          });
        }
        noteText = game.i18n.format("TRESPASSER.Chat.ModifyEffect.Decreased", {
          effect: effectItem.name,
          delta: intensityDelta,
          newIntensity,
          target: tokenName
        });
      }

    } else if (operation === "remove") {
      if (targetActor.isOwner) {
        await effectItem.delete();
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("modifyEffects", {
          actorId: targetActor.id,
          operation: "delete",
          itemId: effectItem.id
        });
      }
      resultingItem = null;
      noteText = game.i18n.format("TRESPASSER.Chat.ModifyEffect.Removed", {
        effect: effectItem.name,
        target: tokenName
      });

    } else if (operation === "setIntensity") {
      const newIntensity = intensityDelta;
      if (targetActor.isOwner) {
        await effectItem.update({ "system.intensity": newIntensity });
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("modifyEffects", {
          actorId: targetActor.id,
          operation: "update",
          itemId: effectItem.id,
          updates: { "system.intensity": newIntensity }
        });
      }
      noteText = game.i18n.format("TRESPASSER.Chat.ModifyEffect.SetIntensity", {
        effect: effectItem.name,
        intensity: newIntensity,
        target: tokenName
      });
    }

    // Register modified effect in context for referencing
    const effectRecord = {
      targetToken,
      targetActor,
      itemDoc: resultingItem,
      itemId: resultingItem?.id || null,
      name: resultingItem?.name || effectItem.name,
      intensity: resultingItem?.system?.intensity ?? 0
    };

    context.modifiedEffects.set(targetKey, effectRecord);
    context.modifiedEffectsByNode.get(behaviorId)?.set(targetKey, effectRecord);

    if (noteText && context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(noteText);
    }
  }
}
