/**
 * summon-creature.mjs
 * Implements the summonCreature graph behavior for Behavior-Driven Deeds.
 */
import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { RangeHelper } from "../range-helper.mjs";
import { promptCreaturePlacement } from "../../targeting/targeting-summon.mjs";

export class SummonCreatureBehavior {
  /**
   * Executes the summonCreature behavior.
   * @param {object} behavior - Behavior node { id, type, params }
   * @param {object} context  - DeedExecutor runtime context
   * @param {Actor} [actor]   - Source caster actor
   * @param {Item} item       - Deed item
   * @param {string} [phaseKey=""]
   * @returns {Promise<boolean>} True if completed successfully, false if cancelled
   */
  static async execute(behavior, context, actor, item, phaseKey = "") {
    const params = behavior.params || {};
    const creatures = Array.isArray(params.creatures) ? params.creatures : [];

    if (creatures.length === 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoCreaturesConfigured") || "No creatures configured for summon.");
      return true;
    }

    const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(actor);
    const sourceElevation = sourceToken?.document?.elevation ?? (sourceToken?.elevation ?? 0);
    const sourcePos = context.sourcePosition || (sourceToken ? {
      x: sourceToken.document?.x ?? sourceToken.x,
      y: sourceToken.document?.y ?? sourceToken.y
    } : null);

    // 1. Resolve Area vs Range Mode
    const targetArea = DeedBehaviorUtils.resolveArea(context, params);
    const isAreaMode = Boolean(targetArea && Array.isArray(targetArea.squares) && targetArea.squares.length > 0);
    const areaSquares = isAreaMode ? targetArea.squares : null;

    let maxRangeSq = null;
    if (!isAreaMode) {
      const mode = params.rangeMode || "spell";
      if (mode === "melee") {
        maxRangeSq = RangeHelper.getDeedRange(sourceToken, { system: { abilityType: "melee", actionType: "attack" } }, actor, { notify: true });
      } else if (mode === "missile") {
        maxRangeSq = RangeHelper.getDeedRange(sourceToken, { system: { abilityType: "missile", actionType: "attack" } }, actor, { notify: true });
      } else if (mode === "custom") {
        maxRangeSq = Math.max(1, parseInt(params.customRange) || 1);
      } else {
        // Default: Spell
        maxRangeSq = RangeHelper.getDeedRange(sourceToken, { system: { abilityType: "spell", actionType: "attack" } }, actor, { notify: true });
      }
    }

    // 2. Resolve fresh actor dimensions and data
    const resolvedCreatures = [];
    for (const c of creatures) {
      let doc = null;
      try {
        if (c.uuid) doc = await fromUuid(c.uuid);
      } catch (e) {}

      const size = doc?.prototypeToken?.width || c.size || 1;
      const name = doc?.name || c.name || "Creature";
      const img = doc?.img || doc?.prototypeToken?.texture?.src || c.img || "icons/svg/mystery-man.svg";

      resolvedCreatures.push({
        ...c,
        name,
        img,
        size
      });
    }

    // 3. Interactive Sequential Placement Queue
    const placements = [];
    let currentIdx = 0;

    while (currentIdx < resolvedCreatures.length) {
      const creature = resolvedCreatures[currentIdx];
      const result = await promptCreaturePlacement({
        creature,
        index: currentIdx,
        total: resolvedCreatures.length,
        sourceToken,
        sourcePos,
        maxRangeSq,
        areaSquares,
        pendingPlacements: placements.slice(0, currentIdx)
      });

      if (!result) {
        ui.notifications.info(game.i18n.localize("TRESPASSER.Notification.Combat.SummonCancelled") || "Summon cancelled.");
        return false;
      }

      if (result.undo) {
        currentIdx = Math.max(0, currentIdx - 1);
        placements.pop();
        continue;
      }

      placements[currentIdx] = {
        actorUuid: creature.uuid,
        x: result.x,
        y: result.y,
        size: result.size,
        squares: result.squares,
        name: creature.name,
        elevation: sourceElevation
      };
      currentIdx++;
    }

    if (placements.length === 0) {
      return false;
    }

    // 4. Token Spawning (Directly if GM, via Socket if Player)
    let createdUuids = [];
    if (game.user.isGM) {
      const { handleSummonCreatureTokens } = await import("../socket/deed-socket-summon.mjs");
      createdUuids = await handleSummonCreatureTokens(placements);
    } else {
      const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
      createdUuids = await emitDeedActionAndWait("summonCreature", {
        placements
      });
    }

    // 5. Store Summoned Token Documents in Context
    if (!context.summonedTokens) context.summonedTokens = [];
    if (Array.isArray(createdUuids) && createdUuids.length > 0) {
      for (const uuid of createdUuids) {
        const doc = await fromUuid(uuid);
        if (doc) context.summonedTokens.push(doc);
      }
    }

    // 6. Record Chat Output Note
    const namesStr = placements.map(p => p.name).join(", ");
    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(
        game.i18n.format("TRESPASSER.Chat.Summon.Summoned", {
          names: namesStr
        }) || `Summoned ${namesStr}`
      );
    }

    return true;
  }
}
