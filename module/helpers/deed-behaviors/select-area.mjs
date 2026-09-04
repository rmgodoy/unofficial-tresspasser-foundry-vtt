import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { getActiveWeapons } from "../../sheets/character/handlers-combat.mjs";

export class SelectAreaBehavior {
  /**
   * 1b. selectArea: Target mode "squares" or "aoe"
   * Saves the grid squares directly to context.area.
   * @param {object} behavior - { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor
   * @param {Item} item       - Deed item
   */
  static async execute(behavior, context, actor, item) {
    const params = behavior.params || {};
    const mode = params.targetMode || "squares";
    const token = context.sourceToken || DeedBehaviorUtils.findToken(actor);

    if (!token) {
      ui.notifications.warn("No token found on canvas for area selection.");
      return false;
    }

    if (mode === "squares") {
      const maxCount = parseInt(params.targetCount) || 1;
      const selectedSquares = [];

      for (let i = 0; i < maxCount; i++) {
        ui.notifications.info(`Select square ${i + 1} of ${maxCount} (Right-click canvas to finish selection early).`);

        const deedData = {
          ...item?.system,
          targetType: "blast",
          targetSize: 1,
          range: item?.system?.range ?? null
        };
        const activeWeapons = getActiveWeapons(actor);
        const result = await TargetingHelper.placeTemplate(actor, token, deedData, activeWeapons, { item });

        if (!result || !result.squares || result.squares.length === 0) {
          break;
        }

        const sq = result.squares[0];
        if (!selectedSquares.some(s => s.x === sq.x && s.y === sq.y)) {
          selectedSquares.push(sq);
        }
      }

      if (selectedSquares.length === 0) {
        ui.notifications.info("Area selection cancelled.");
        return false;
      }

      const areaData = {
        id: behavior.id,
        squares: selectedSquares,
        type: "squares",
        size: selectedSquares.length,
        isPath: false
      };
      if (!context.areas) context.areas = new Map();
      context.areas.set(behavior.id, areaData);
      context.area = areaData;
      DeedBehaviorUtils.renderAreaHighlight(context);
      ui.notifications.info(`Selected ${selectedSquares.length} square(s).`);
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
      const activeWeapons = getActiveWeapons(actor);
      const result = await TargetingHelper.placeTemplate(actor, token, deedData, activeWeapons, { item });
      if (!result || !result.squares || result.squares.length === 0) {
        ui.notifications.info("AoE area selection cancelled.");
        return false;
      }

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
      ui.notifications.info(`Selected area shape "${aoeType}" (${result.squares.length} squares).`);
      return true;
    }

    return false;
  }
}
