import { resolveItem } from "../item-resolver.mjs";

export class ExecuteDeedBehavior {
  /**
   * 9. executeDeed: Execute another auxiliary deed document as a sub-routine.
   * Runs as a free sub-action (0 AP, 0 Focus, 0 Uses deduction) and presents its own phase chat cards.
   * Safeguarded against circular/recursive calls.
   * Clears canvas targets before and after execution so sub-deeds retain independent targets.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   */
  static async execute(behavior, context, actor) {
    const params = behavior.params || {};
    const deedUuid = params.deedUuid;
    if (!deedUuid) {
      ui.notifications.warn("No auxiliary Deed linked for executeDeed behavior.");
      return true;
    }

    let subDeedItem = await resolveItem(deedUuid, { type: "deed", notify: false });
    if (!subDeedItem && actor) {
      subDeedItem = actor.items?.get(deedUuid) || actor.items?.find(i => i.uuid === deedUuid || i.id === deedUuid);
    }

    if (!subDeedItem) {
      ui.notifications.error(
        game.i18n.format("TRESPASSER.Notification.Apply.CouldNotCreateItem", { name: deedUuid })
      );
      return true;
    }

    // Safeguard against circular calls / stack overflow
    const callStack = context.callStack || new Set();
    if (callStack.has(subDeedItem.id) || callStack.size >= 10) {
      ui.notifications.warn(`Circular deed execution detected: "${subDeedItem.name}" is already in the call stack.`);
      return true;
    }

    callStack.add(subDeedItem.id);

    // Clear canvas targets so sub-deed starts with clean target selection
    if (game.user?.targets?.size > 0) {
      await game.user.updateTokenTargets([]);
    }

    try {
      const { DeedExecutor } = await import("../deed-executor.mjs");
      const subExecutor = new DeedExecutor(subDeedItem, actor, {
        isSubDeed: true,
        callStack,
        sourcePosition: context.sourcePosition || null
      });
      await subExecutor.execute();
    } catch (err) {
      console.error("[ExecuteDeedBehavior] Error executing sub-deed:", err);
    } finally {
      callStack.delete(subDeedItem.id);
      if (game.user?.targets?.size > 0) {
        await game.user.updateTokenTargets([]);
      }
    }

    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push(`Executed auxiliary deed "${subDeedItem.name}"`);
    }

    return true;
  }
}
