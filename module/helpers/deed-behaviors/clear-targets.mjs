export class ClearTargetsBehavior {
  /**
   * 8. clearTargets: Reset context.targets and canvas token targets
   * @param {object} context - Executor runtime context
   */
  static async execute(context) {
    context.targets = [];
    context.accuracyResults = [];
    if (game.user?.targets?.size > 0) {
      await game.user.updateTokenTargets([]);
    }
    if (context.currentPhaseOutputs?.notes) {
      context.currentPhaseOutputs.notes.push("Cleared target list");
    }
    return true;
  }
}
