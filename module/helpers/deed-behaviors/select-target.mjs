import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { getActiveWeapons } from "../../sheets/character/handlers-combat.mjs";
import { selectTokensInteractive } from "./select-target-interactive.mjs";

export class SelectTargetBehavior {
  /**
   * 1. selectTarget: Target mode "self", "creatures", "aoe", or "area".
   * For "creatures" mode: prompts interactive canvas selection for up to N targets.
   * For "aoe" / "area" mode: selects all valid tokens by default, or prompts interactive
   * selection to choose up to N creatures from inside the area if chooseCreatures is enabled.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, actor, item) {
    const params = behavior.params || {};
    const mode = params.targetMode || "creatures";
    const token = context.sourceToken || DeedBehaviorUtils.findToken(actor);

    if (mode === "self") {
      context.targets = token ? [token] : (actor ? [actor] : []);
      ui.notifications.info(`Targeted self: ${actor?.name || token?.name || "Self"}`);
      return true;
    }

    if (mode === "creatures") {
      const maxCount = parseInt(params.targetCount) || 1;

      if (!token) {
        ui.notifications.warn("No token found on canvas for target selection.");
        return false;
      }

      const resultTargets = await selectTokensInteractive({
        maxCount,
        sourceToken: token,
        params,
        item,
        actor,
        originOverride: context.sourcePosition || null
      });

      if (!resultTargets || resultTargets.length === 0) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = resultTargets;
      ui.notifications.info(`Targeted ${resultTargets.length} token(s).`);
      return true;
    }

    if (mode === "aoe") {
      const aoeType = params.aoeType || "blast";
      const aoeSize = parseInt(params.aoeSize) || 1;
      const deedData = {
        ...item?.system,
        targetType: aoeType,
        targetSize: aoeSize,
        range: item?.system?.range ?? null
      };

      if (!token) {
        ui.notifications.warn("No token found on canvas for AoE template placement.");
        return false;
      }

      const activeWeapons = getActiveWeapons(actor);
      const result = await TargetingHelper.placeTemplate(actor, token, deedData, activeWeapons, {
        item,
        originOverride: context.sourcePosition || null
      });
      if (!result || !result.squares) {
        ui.notifications.info("AoE template placement cancelled.");
        return false;
      }

      // Save area in context for subsequent behaviors and phases
      const isPath = (aoeType === "path" || aoeType === "close_path");
      const areaData = {
        id: behavior.id,
        squares: result.squares,
        type: aoeType,
        size: aoeSize,
        isPath
      };
      if (!context.areas) context.areas = new Map();
      context.areas.set(behavior.id, areaData);
      context.area = areaData;
      DeedBehaviorUtils.renderAreaHighlight(context);

      const gridPx = canvas.grid.size;
      const tokensInAoE = TargetingHelper.getTokensInSquares(result.squares, gridPx, {
        disposition: params.disposition,
        sourceToken: token,
        excludeTokenId: params.ignoreSelf ? token?.id : null
      });

      if (!params.chooseCreatures) {
        context.targets = tokensInAoE;
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets(tokensInAoE.map(t => t.id));
        }
        ui.notifications.info(`AoE targeted ${tokensInAoE.length} token(s).`);
        return true;
      }

      if (tokensInAoE.length === 0) {
        context.targets = [];
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets([]);
        }
        ui.notifications.info("No valid targets in AoE.");
        return true;
      }

      const maxCount = parseInt(params.targetCount) || 1;
      const resultTargets = await selectTokensInteractive({
        candidateTokens: tokensInAoE,
        maxCount,
        sourceToken: token,
        params,
        areaSquares: result.squares,
        item,
        actor,
        originOverride: context.sourcePosition || null
      });

      if (resultTargets === null) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = resultTargets;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(resultTargets.map(t => t.id));
      }
      ui.notifications.info(`Targeted ${resultTargets.length} token(s) from AoE.`);
      return true;
    }

    if (mode === "area") {
      const targetArea = DeedBehaviorUtils.resolveArea(context, params);
      if (!targetArea || !targetArea.squares || targetArea.squares.length === 0) {
        ui.notifications.warn("No selected area found for target selection.");
        return false;
      }

      const areaRelation = params.areaRelation || "inside";
      const gridPx = canvas.grid.size;
      const baseSquares = targetArea.squares;
      const targetSqMap = new Map();

      for (const sq of baseSquares) {
        if (areaRelation === "inside" || areaRelation === "insideAndAdjacent") {
          targetSqMap.set(`${sq.x},${sq.y}`, sq);
        }
        if (areaRelation === "adjacent" || areaRelation === "insideAndAdjacent") {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              const adjSq = { x: sq.x + dx * gridPx, y: sq.y + dy * gridPx };
              const key = `${adjSq.x},${adjSq.y}`;
              if (areaRelation === "adjacent") {
                const isInside = baseSquares.some(s => s.x === adjSq.x && s.y === adjSq.y);
                if (!isInside) targetSqMap.set(key, adjSq);
              } else {
                targetSqMap.set(key, adjSq);
              }
            }
          }
        }
      }

      const evalSquares = Array.from(targetSqMap.values());
      const sourceToken = token || DeedBehaviorUtils.findToken(actor);
      const selectedTargets = TargetingHelper.getTokensInSquares(evalSquares, gridPx, {
        disposition: params.disposition,
        sourceToken: sourceToken,
        excludeTokenId: params.ignoreSelf ? sourceToken?.id : null
      });

      if (!params.chooseCreatures) {
        context.targets = selectedTargets;
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets(selectedTargets.map(t => t.id));
        }
        ui.notifications.info(`Targeted ${selectedTargets.length} token(s) based on selected area (${areaRelation}).`);
        return true;
      }

      if (selectedTargets.length === 0) {
        context.targets = [];
        if (game.user.updateTokenTargets) {
          game.user.updateTokenTargets([]);
        }
        ui.notifications.info("No valid targets in selected area.");
        return true;
      }

      const maxCount = parseInt(params.targetCount) || 1;
      const resultTargets = await selectTokensInteractive({
        candidateTokens: selectedTargets,
        maxCount,
        sourceToken: token,
        params,
        areaSquares: evalSquares,
        item,
        actor,
        originOverride: context.sourcePosition || null
      });

      if (resultTargets === null) {
        ui.notifications.info("Target selection cancelled.");
        return false;
      }

      context.targets = resultTargets;
      if (game.user.updateTokenTargets) {
        game.user.updateTokenTargets(resultTargets.map(t => t.id));
      }
      ui.notifications.info(`Targeted ${resultTargets.length} token(s) from selected area (${areaRelation}).`);
      return true;
    }
  }
}

export { selectTokensInteractive };
