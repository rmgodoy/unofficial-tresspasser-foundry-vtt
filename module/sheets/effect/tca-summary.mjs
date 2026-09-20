/**
 * TCA Summary Generator
 * Generates human-readable localized summaries for behavior blocks in Simple Mode.
 */

import { TRIGGER_LABELS, TARGET_ATTRIBUTES } from "../../effects/effects-constants.mjs";

/**
 * Returns an appropriate FontAwesome icon for an action type.
 * @param {string} action
 * @param {object} [params={}]
 * @returns {string}
 */
export function getActionIcon(action, params = {}) {
  switch (action) {
    case "modify_attribute":
      if (params.attribute === "health") return "fa-solid fa-heart-pulse";
      if (["guard", "resist", "armor", "damage_received"].includes(params.attribute)) return "fa-solid fa-shield-halved";
      return "fa-solid fa-bolt";
    case "confer_state":
      return "fa-solid fa-circle-plus";
    case "remove_state":
      return "fa-solid fa-circle-minus";
    case "modify_intensity":
      return "fa-solid fa-arrow-trend-up";
    case "set_flag":
      return "fa-solid fa-flag";
    case "force_movement":
      return "fa-solid fa-arrows-up-down-left-right";
    case "roll_check":
      return "fa-solid fa-dice-d20";
    case "grant_reaction":
      return "fa-solid fa-hand";
    case "redirect_damage":
      return "fa-solid fa-shield";
    case "chat_message":
      return "fa-solid fa-comment";
    default:
      return "fa-solid fa-wand-sparkles";
  }
}

/**
 * Generate a localized summary string for a TCA block.
 * @param {object} block - TCA behavior block
 * @param {number} [intensity=0] - Effect's current intensity
 * @returns {string} Human-readable summary
 */
export function summarizeBlock(block, intensity = 0) {
  if (!block) return "";

  // 1. Trigger part
  let triggerText = "";
  if (block.trigger === "continuous") {
    triggerText = game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Continuous");
  } else if (TRIGGER_LABELS[block.trigger]) {
    triggerText = game.i18n.localize(TRIGGER_LABELS[block.trigger]);
  } else {
    triggerText = block.trigger || "On Trigger";
  }

  // 2. Action part
  const params = block.params || {};
  let actionText = "";

  switch (block.action) {
    case "modify_attribute": {
      const attrKey = params.attribute || "health";
      const attrLabel = TARGET_ATTRIBUTES[attrKey] ? game.i18n.localize(TARGET_ATTRIBUTES[attrKey]) : attrKey;
      let mod = String(params.modifier ?? "0");
      // Replace <Int> placeholder for preview if intensity is given
      if (mod.includes("<Int>") || mod.includes("<intensity>")) {
        mod = mod.replace(/<Int>|<intensity>/gi, intensity || "INTENSITY");
      }

      if (params.applyMode === "set") {
        actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.SetIntensity")} ${attrLabel} = ${mod}`;
      } else if (attrKey === "health" && (mod.startsWith("-") || !mod.startsWith("+"))) {
        const cleanMod = mod.startsWith("-") ? mod.substring(1) : mod;
        actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Deals")} ${cleanMod} ${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Damage")}`;
      } else if (mod.startsWith("-")) {
        actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.PenaltyTo")} ${attrLabel} (${mod})`;
      } else {
        const sign = mod.startsWith("+") ? "" : "+";
        actionText = `${sign}${mod} ${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.BonusTo")} ${attrLabel}`;
      }
      break;
    }

    case "confer_state": {
      const stateName = params.stateName || "State";
      actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Apply")} ${stateName}`;
      break;
    }

    case "remove_state": {
      const targetState = params.stateName || params.stateTag || "State";
      actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Remove")} ${targetState}`;
      break;
    }

    case "modify_intensity": {
      const val = String(params.value ?? "+1");
      if (val.startsWith("-")) {
        actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.DecreaseIntensity")} ${val.substring(1)}`;
      } else if (val.startsWith("=")) {
        actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.SetIntensity")} ${val.substring(1)}`;
      } else {
        const sign = val.startsWith("+") ? val : `+${val}`;
        actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.IncreaseIntensity")} ${sign}`;
      }
      break;
    }

    case "set_flag": {
      const flagKey = params.flag || "flag";
      const flagLabelKey = `TRESPASSER.Sheet.Item.Effect.Flag.${flagKey.charAt(0).toUpperCase() + flagKey.slice(1)}`;
      const flagLabel = game.i18n.has(flagLabelKey) ? game.i18n.localize(flagLabelKey) : flagKey;
      actionText = `Flag: ${flagLabel} (${params.value ?? true})`;
      break;
    }

    case "force_movement": {
      const moveTypeKey = `TRESPASSER.Sheet.Item.Effect.Param.Move${(params.type || "push").charAt(0).toUpperCase() + (params.type || "push").slice(1)}`;
      const moveTypeLabel = game.i18n.has(moveTypeKey) ? game.i18n.localize(moveTypeKey) : (params.type || "Push");
      actionText = `${moveTypeLabel} ${params.distance || "1"} sq`;
      break;
    }

    case "roll_check": {
      const checkType = params.checkType === "prevail" ? game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.CheckPrevail") : (params.attribute || "Check");
      actionText = `${checkType} Check (DC ${params.dc || 10})`;
      break;
    }

    case "grant_reaction": {
      actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Action.GrantReaction")}: ${params.reactionLabel || "Reaction"}`;
      break;
    }

    case "redirect_damage": {
      let cap = String(params.capacity || "0");
      if (cap.includes("<Int>") || cap.includes("<intensity>")) {
        cap = cap.replace(/<Int>|<intensity>/gi, intensity || "INTENSITY");
      }
      actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Redirect")} ${cap}`;
      break;
    }

    case "chat_message": {
      const rawMsg = (params.message || "").replace(/<[^>]*>/g, "").trim();
      const preview = rawMsg.length > 30 ? `${rawMsg.substring(0, 30)}...` : rawMsg;
      actionText = `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.Reminder")}: "${preview}"`;
      break;
    }

    default:
      actionText = block.label || block.action || "Execute";
      break;
  }

  // 3. Modifiers (condition, gatedBy, cooldown)
  const metaTags = [];
  if (block.condition) {
    metaTags.push(`${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.IfCondition")} ${block.condition}`);
  }
  if (block.gatedBy) {
    metaTags.push(`${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.After")} #${block.gatedBy.substring(0, 4)}`);
  }
  if (block.cooldown && block.cooldown.uses) {
    const perSuffix = block.cooldown.per === "turn"
      ? game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.PerTurn")
      : block.cooldown.per === "combat"
      ? game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.PerCombat")
      : game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.PerRound");
    metaTags.push(`${block.cooldown.uses}${perSuffix}`);
  }

  const metaStr = metaTags.length > 0 ? ` (${metaTags.join(", ")})` : "";
  return `${triggerText} → ${actionText}${metaStr}`;
}
