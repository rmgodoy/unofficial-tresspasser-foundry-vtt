import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { ModifyEffectsBehavior } from "./modify-effects.mjs";
import { resolveItem } from "../item-resolver.mjs";
import { promptModifyEffectChoice } from "../../dialogs/modify-effect-choice-dialog.mjs";
import { selectTokensInteractive } from "./select-target-interactive.mjs";
import { SYSTEM_ID } from "../../system-id.mjs";

/**
 * TransferStateBehavior — Executes transferring or copying active states/effects between
 * actors (Self -> Targets, Targets -> Self, or between Targets).
 */
export class TransferStateBehavior {

  /**
   * Execute transferState behavior node.
   * @param {object} behavior - Behavior node data { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey="base"] - Current execution phase
   * @returns {Promise<boolean>}
   */
  static async execute(behavior, context, actor, item, phaseKey = "base") {
    const params = behavior.params || {};
    const transferMode = params.transferMode || "targetToSelf"; // "selfToTarget" | "targetToSelf" | "targetToTarget"
    const effectFilter = params.effectFilter || "all";
    const specificStateId = params.specificStateId || "";
    const choiceMode = params.choiceMode || "choose_count";
    const choiceCount = Math.max(1, Number(params.choiceCount ?? 1));
    const intensityMode = params.intensityMode || "full"; // "full" | "delta"
    const intensityDelta = Number(params.intensityDelta ?? 1);
    const keepOnSource = Boolean(params.keepOnSource);
    const invertOnTransfer = Boolean(params.invertOnTransfer);
    const referencedNodeId = params.referencedNodeId || "";

    const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(actor);
    const validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);

    if (!context.transferredEffects) context.transferredEffects = new Map();
    if (!context.transferredEffectsByNode) context.transferredEffectsByNode = new Map();
    if (!context.modifiedEffects) context.modifiedEffects = new Map();

    const nodeRecordMap = context.transferredEffectsByNode.get(behavior.id) || new Map();
    context.transferredEffectsByNode.set(behavior.id, nodeRecordMap);

    // Build pairs of [originTokenOrActor, destTokenOrActor]
    const transferPairs = await this._resolveTransferPairs(transferMode, sourceToken, actor, validTargets, item, behavior, context);
    if (transferPairs.length === 0) return true;

    for (const { origin, destination } of transferPairs) {
      const originActor = origin?.actor ?? (origin instanceof Actor ? origin : null);
      const destActor = destination?.actor ?? (destination instanceof Actor ? destination : null);
      if (!originActor || !destActor) continue;

      const originName = DeedBehaviorUtils.getTokenDisplayName(origin);
      const destName = DeedBehaviorUtils.getTokenDisplayName(destination);

      const candidates = await ModifyEffectsBehavior._gatherCandidateEffects(
        originActor,
        origin,
        effectFilter,
        specificStateId,
        referencedNodeId,
        context
      );

      if (candidates.length === 0) {
        if (context.currentPhaseOutputs?.notes && effectFilter !== "referenced") {
          context.currentPhaseOutputs.notes.push(
            game.i18n.format("TRESPASSER.Chat.TransferState.NoEligibleStates", { origin: originName })
          );
        }
        continue;
      }

      const selectedCandidates = await this._selectCandidates({
        candidates,
        choiceMode,
        choiceCount,
        origin,
        originActor,
        invertOnTransfer,
        behaviorId: behavior.id,
        phaseKey,
        context
      });

      for (const candidate of selectedCandidates) {
        await this._transferSingleEffect({
          originActor,
          originToken: origin,
          destActor,
          destToken: destination,
          candidate,
          intensityMode,
          intensityDelta,
          keepOnSource,
          invertOnTransfer,
          context,
          phaseKey,
          behaviorId: behavior.id,
          originName,
          destName
        });
      }
    }

    return true;
  }

  /**
   * Resolves origin and destination entities based on transferMode.
   * @private
   */
  static async _resolveTransferPairs(transferMode, sourceToken, sourceActor, validTargets, item, behavior, context) {
    const pairs = [];
    const selfEntity = sourceToken || sourceActor;

    if (transferMode === "selfToTarget") {
      if (!selfEntity || !validTargets || validTargets.length === 0) return pairs;
      for (const target of validTargets) {
        pairs.push({ origin: selfEntity, destination: target });
      }
      return pairs;
    }

    if (transferMode === "targetToSelf") {
      if (!selfEntity || !validTargets || validTargets.length === 0) return pairs;
      for (const target of validTargets) {
        pairs.push({ origin: target, destination: selfEntity });
      }
      return pairs;
    }

    if (transferMode === "targetToAnother" || transferMode === "anotherToTarget" || transferMode === "bidirectional") {
      const primaryTarget = validTargets?.[0];
      if (!primaryTarget) return pairs;

      const chosen = await selectTokensInteractive({
        maxCount: 1,
        sourceToken: sourceToken || DeedBehaviorUtils.findToken(sourceActor),
        item,
        actor: sourceActor,
        activeNodeId: behavior.id,
        runtimeContext: context
      });

      const secondTarget = chosen?.[0];
      if (!secondTarget) return pairs;

      if (transferMode === "targetToAnother") {
        pairs.push({ origin: primaryTarget, destination: secondTarget });
      } else if (transferMode === "anotherToTarget") {
        pairs.push({ origin: secondTarget, destination: primaryTarget });
      } else if (transferMode === "bidirectional") {
        const name1 = DeedBehaviorUtils.getTokenDisplayName(primaryTarget);
        const name2 = DeedBehaviorUtils.getTokenDisplayName(secondTarget);
        const direction = await this._promptDirectionChoice(name1, name2);
        if (direction === "forward") {
          pairs.push({ origin: primaryTarget, destination: secondTarget });
        } else if (direction === "reverse") {
          pairs.push({ origin: secondTarget, destination: primaryTarget });
        }
      }
      return pairs;
    }

    if (transferMode === "targetToTarget") {
      if (!validTargets || validTargets.length === 0) return pairs;
      if (validTargets.length >= 2) {
        pairs.push({ origin: validTargets[0], destination: validTargets[1] });
      } else {
        const primaryTarget = validTargets[0];
        const chosen = await selectTokensInteractive({
          maxCount: 1,
          sourceToken: sourceToken || DeedBehaviorUtils.findToken(sourceActor),
          item,
          actor: sourceActor,
          activeNodeId: behavior.id,
          runtimeContext: context
        });
        const secondTarget = chosen?.[0];
        if (secondTarget) {
          pairs.push({ origin: primaryTarget, destination: secondTarget });
        }
      }
      return pairs;
    }

    return pairs;
  }

  /**
   * Prompts the player to choose direction of transfer when in bidirectional mode.
   * @private
   */
  static async _promptDirectionChoice(targetName, otherName) {
    return foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("TRESPASSER.Dialog.TransferState.ChooseDirectionTitle") || "Choose Transfer Direction",
        width: 380,
        resizable: false
      },
      classes: ["trespasser", "dialog", "transfer-direction-dialog"],
      content: `
        <div style="font-size:var(--fs-12); padding:6px 0; color:var(--trp-text-dim, #a09070);">
          ${game.i18n.format("TRESPASSER.Dialog.TransferState.ChooseDirectionPrompt", { target: targetName, other: otherName }) || "Choose the direction of state transfer:"}
        </div>
      `,
      buttons: [
        {
          action: "forward",
          label: `${targetName} ➔ ${otherName}`,
          icon: "fas fa-arrow-right",
          default: true,
          callback: () => "forward"
        },
        {
          action: "reverse",
          label: `${otherName} ➔ ${targetName}`,
          icon: "fas fa-arrow-left",
          callback: () => "reverse"
        },
        {
          action: "cancel",
          label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") || "Cancel",
          icon: "fas fa-times",
          callback: () => null
        }
      ],
      rejectClose: false
    });
  }

  /**
   * Prompts or resolves candidate effects to transfer.
   * @private
   */
  static async _selectCandidates({ candidates, choiceMode, choiceCount = 1, origin, originActor, invertOnTransfer = false, behaviorId, phaseKey, context }) {
    if (choiceMode === "all_matching") {
      return candidates;
    }

    if (choiceMode === "choose_any" || choiceMode === "choose_multiple") {
      const choiceKey = `transferState_${behaviorId}_${origin.id || originActor.id}_${phaseKey}`;
      if (!context.modalChoices) context.modalChoices = new Map();
      let chosenIds = context.modalChoices.get(choiceKey);

      if (!chosenIds) {
        chosenIds = await promptModifyEffectChoice({
          target: origin,
          candidates,
          operation: "transfer",
          showInvertPreview: invertOnTransfer,
          multiple: true,
          maxCount: null,
          title: game.i18n.format("TRESPASSER.Dialog.TransferState.Title", { target: origin.name || originActor.name })
        });
        if (chosenIds) context.modalChoices.set(choiceKey, chosenIds);
      }

      if (Array.isArray(chosenIds)) {
        return candidates.filter(c => chosenIds.includes(c.item.id));
      } else if (chosenIds) {
        return candidates.filter(c => c.item.id === chosenIds);
      }
      return [];
    }

    // choose_count / choose_one (specific count, default 1)
    if (choiceCount <= 1 && candidates.length === 1) return [candidates[0]];

    const isMulti = choiceCount > 1;
    const choiceKey = `transferState_${behaviorId}_${origin.id || originActor.id}_${phaseKey}`;
    if (!context.modalChoices) context.modalChoices = new Map();
    let chosenIds = context.modalChoices.get(choiceKey);

    if (!chosenIds) {
      chosenIds = await promptModifyEffectChoice({
        target: origin,
        candidates,
        operation: "transfer",
        showInvertPreview: invertOnTransfer,
        multiple: isMulti,
        maxCount: choiceCount,
        title: game.i18n.format("TRESPASSER.Dialog.TransferState.Title", { target: origin.name || originActor.name })
      });
      if (chosenIds) context.modalChoices.set(choiceKey, chosenIds);
    }

    if (Array.isArray(chosenIds)) {
      return candidates.filter(c => chosenIds.includes(c.item.id)).slice(0, choiceCount);
    } else if (chosenIds) {
      const match = candidates.find(c => c.item.id === chosenIds);
      return match ? [match] : [];
    }
    return [];
  }

  /**
   * Transfers a single effect from origin actor to destination actor.
   * @private
   */
  static async _transferSingleEffect({
    originActor,
    originToken,
    destActor,
    destToken,
    candidate,
    intensityMode,
    intensityDelta,
    keepOnSource,
    invertOnTransfer,
    context,
    phaseKey,
    behaviorId,
    originName,
    destName
  }) {
    const effectItem = candidate.item;
    const currentOriginInt = Number(effectItem.system?.intensity ?? 1);
    const transferAmount = intensityMode === "delta"
      ? Math.max(1, Math.min(currentOriginInt, intensityDelta))
      : currentOriginInt;

    const remainingOriginInt = currentOriginInt - transferAmount;
    const shouldDeleteFromOrigin = !keepOnSource && remainingOriginInt <= 0;
    const shouldUpdateOrigin = !keepOnSource && remainingOriginInt > 0;

    // Resolve effect on destination
    let destEffectData = null;
    let effectDisplayName = effectItem.name;

    if (invertOnTransfer && candidate.oppositeDef) {
      const oppDef = candidate.oppositeDef;
      effectDisplayName = oppDef.name;
      let oppItemDoc = null;
      if (oppDef.uuid || oppDef.compendiumId) {
        oppItemDoc = await resolveItem(oppDef.uuid || oppDef.compendiumId, { type: "effect" });
      }

      if (oppItemDoc) {
        destEffectData = oppItemDoc.toObject();
      } else {
        destEffectData = {
          name: oppDef.name,
          type: "effect",
          img: oppDef.img || effectItem.img,
          system: {
            ...effectItem.system,
            intensity: transferAmount
          }
        };
      }
      destEffectData.system = destEffectData.system || {};
      destEffectData.system.intensity = transferAmount;
    } else {
      destEffectData = effectItem.toObject();
      delete destEffectData._id;
      destEffectData.system = destEffectData.system || {};
      destEffectData.system.intensity = transferAmount;
    }

    // Check if destination already has this effect
    const statusEffectId = effectItem.getFlag?.(SYSTEM_ID, "statusEffectId")
      || effectItem.getFlag?.("trespasser", "statusEffectId")
      || (invertOnTransfer && candidate.oppositeDef?.oppositeId)
      || null;

    const existingOnDest = destActor.items.find(i => {
      if (i.type !== "effect") return false;
      if (statusEffectId) {
        const destStatusId = i.getFlag?.(SYSTEM_ID, "statusEffectId") || i.getFlag?.("trespasser", "statusEffectId");
        if (destStatusId === statusEffectId) return true;
      }
      return i.name?.toLowerCase()?.trim() === effectDisplayName?.toLowerCase()?.trim();
    });

    let resultingDestItem = null;

    // Determine ownership
    const canDirectlyUpdate = originActor.isOwner && destActor.isOwner;

    if (canDirectlyUpdate) {
      // 1. Modify origin
      if (shouldDeleteFromOrigin) {
        await effectItem.delete();
      } else if (shouldUpdateOrigin) {
        await effectItem.update({ "system.intensity": remainingOriginInt });
      }

      // 2. Modify destination
      if (existingOnDest) {
        const newDestInt = Number(existingOnDest.system?.intensity ?? 1) + transferAmount;
        await existingOnDest.update({ "system.intensity": newDestInt });
        resultingDestItem = existingOnDest;
      } else {
        const created = await destActor.createEmbeddedDocuments("Item", [destEffectData]);
        resultingDestItem = created[0] || null;
      }
    } else {
      // Execute via GM socket
      const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
      const res = await emitDeedActionAndWait("transferState", {
        originActorId: originActor.id,
        destActorId: destActor.id,
        originItemId: effectItem.id,
        shouldDeleteFromOrigin,
        shouldUpdateOrigin,
        remainingOriginInt,
        existingDestItemId: existingOnDest?.id || null,
        newDestIntensity: existingOnDest ? (Number(existingOnDest.system?.intensity ?? 1) + transferAmount) : null,
        createDestItemData: existingOnDest ? null : destEffectData
      });
      resultingDestItem = res?.destItemId ? destActor.items.get(res.destItemId) : null;
    }

    // Register records in context for referencing
    const destKey = destToken?.id || destActor.id;
    const effectRecord = {
      targetToken: destToken,
      targetActor: destActor,
      itemDoc: resultingDestItem,
      itemId: resultingDestItem?.id || null,
      name: effectDisplayName,
      intensity: transferAmount
    };

    context.transferredEffects.set(destKey, effectRecord);
    context.transferredEffectsByNode.get(behaviorId)?.set(destKey, effectRecord);
    context.modifiedEffects.set(destKey, effectRecord);

    const noteText = game.i18n.format(
      keepOnSource ? "TRESPASSER.Chat.TransferState.Copied" : "TRESPASSER.Chat.TransferState.Transferred",
      {
        effect: effectDisplayName,
        intensity: transferAmount,
        origin: originName,
        destination: destName
      }
    );

    if (noteText && context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(noteText);
    }
  }
}
