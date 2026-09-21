/**
 * TCA Action Parameter Editors
 * Generates parameter form field HTML snippets for each action type.
 */

/**
 * Escapes HTML attributes safely.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Helper to generate a <select> with options.
 * @param {string} name
 * @param {Record<string, string>} options
 * @param {string} selectedVal
 * @param {boolean} [localize=true]
 * @returns {string}
 */
function renderSelect(name, options, selectedVal, localize = true) {
  let html = `<select name="${escapeAttr(name)}">`;
  for (const [val, labelKey] of Object.entries(options)) {
    const label = localize && game.i18n ? game.i18n.localize(labelKey) : labelKey;
    const isSelected = String(val) === String(selectedVal) ? "selected" : "";
    html += `<option value="${escapeAttr(val)}" ${isSelected}>${escapeAttr(label)}</option>`;
  }
  html += `</select>`;
  return html;
}

/**
 * 1. Modify Attribute Params
 */
export function renderModifyAttributeParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const attribute = params.attribute || "health";
  const modifier = params.modifier ?? "0";
  const applyMode = params.applyMode || "delta";

  const applyModeOptions = {
    "delta": "TRESPASSER.Sheet.Item.Effect.Param.ApplyDelta",
    "set": "TRESPASSER.Sheet.Item.Effect.Param.ApplySet"
  };

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Attribute")}</label>
      ${renderSelect(`${prefix}.attribute`, config.targetAttributes || {}, attribute)}
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Modifier")}</label>
      <input type="text" name="${prefix}.modifier" value="${escapeAttr(modifier)}" placeholder="e.g. +1, -1d6, <Int>" />
    </div>
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.ApplyMode")}</label>
      ${renderSelect(`${prefix}.applyMode`, applyModeOptions, applyMode)}
    </div>
  `;
}

/**
 * 2. Confer State Params
 */
export function renderConferStateParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const stateName = params.stateName || "";
  const intensity = params.intensity ?? "";
  const removeTags = params.removeTags || "";

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.StateName")}</label>
      <input type="text" name="${prefix}.stateName" value="${escapeAttr(stateName)}" placeholder="State Name or Item UUID" />
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.IntensityValue")}</label>
      <input type="text" name="${prefix}.intensity" value="${escapeAttr(intensity)}" placeholder="e.g. 1, +1, <Int>" />
    </div>
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.RemoveTags")}</label>
      <input type="text" name="${prefix}.removeTags" value="${escapeAttr(removeTags)}" placeholder="e.g. stance, curse (comma-separated)" />
    </div>
  `;
}

/**
 * 3. Remove State Params
 */
export function renderRemoveStateParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const stateName = params.stateName || "";
  const stateTag = params.stateTag || "";
  const target = params.target || "self";

  const targetOptions = {
    "self": "TRESPASSER.Sheet.Item.Effect.ActionTargetSelf",
    "target": "TRESPASSER.Sheet.Item.Effect.ActionTargetTarget"
  };

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.StateName")}</label>
      <input type="text" name="${prefix}.stateName" value="${escapeAttr(stateName)}" placeholder="Name of State to remove" />
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.StateTag")}</label>
      <input type="text" name="${prefix}.stateTag" value="${escapeAttr(stateTag)}" placeholder="or Tag (e.g. stance)" />
    </div>
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.ActionTarget")}</label>
      ${renderSelect(`${prefix}.target`, targetOptions, target)}
    </div>
  `;
}

/**
 * 4. Modify Intensity Params
 */
export function renderModifyIntensityParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const value = params.value ?? "+1";

  return `
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.IntensityValue")}</label>
      <input type="text" name="${prefix}.value" value="${escapeAttr(value)}" placeholder="e.g. +1, -1, =0, +<Int>" />
    </div>
  `;
}

/**
 * 5. Set Flag Params
 */
export function renderSetFlagParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const flag = params.flag || "immuneToDamage";
  const value = params.value ?? true;

  const flagOptions = {
    "immuneToDamage": "TRESPASSER.Sheet.Item.Effect.Flag.ImmuneToDamage",
    "cannotAct": "TRESPASSER.Sheet.Item.Effect.Flag.CannotAct",
    "cannotMove": "TRESPASSER.Sheet.Item.Effect.Flag.CannotMove",
    "countsAsObstacle": "TRESPASSER.Sheet.Item.Effect.Flag.CountsAsObstacle"
  };

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.FlagName")}</label>
      ${renderSelect(`${prefix}.flag`, flagOptions, flag)}
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.FlagValue")}</label>
      <input type="text" name="${prefix}.value" value="${escapeAttr(value)}" placeholder="true, false, or custom string" />
    </div>
  `;
}

/**
 * 6. Force Movement Params
 */
export function renderForceMovementParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const type = params.type || "push";
  const distance = params.distance ?? "1";

  const moveOptions = {
    "push": "TRESPASSER.Sheet.Item.Effect.Param.MovePush",
    "pull": "TRESPASSER.Sheet.Item.Effect.Param.MovePull",
    "sweep": "TRESPASSER.Sheet.Item.Effect.Param.MoveSweep",
    "teleport": "TRESPASSER.Sheet.Item.Effect.Param.MoveTeleport",
    "jump": "TRESPASSER.Sheet.Item.Effect.Param.MoveJump"
  };

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.MovementType")}</label>
      ${renderSelect(`${prefix}.type`, moveOptions, type)}
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Distance")}</label>
      <input type="text" name="${prefix}.distance" value="${escapeAttr(distance)}" placeholder="Squares (e.g. 1, 1d6, <Int>)" />
    </div>
  `;
}

/**
 * 7. Roll Check Params
 */
export function renderRollCheckParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const checkType = params.checkType || "prevail";
  const attribute = params.attribute || "agility";
  const dc = params.dc ?? "10";

  const checkOptions = {
    "prevail": "TRESPASSER.Sheet.Item.Effect.Param.CheckPrevail",
    "attribute": "TRESPASSER.Sheet.Item.Effect.Param.CheckAttribute"
  };

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.CheckType")}</label>
      ${renderSelect(`${prefix}.checkType`, checkOptions, checkType)}
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Attribute")}</label>
      ${renderSelect(`${prefix}.attribute`, config.targetAttributes || {}, attribute)}
    </div>
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.DC")}</label>
      <input type="text" name="${prefix}.dc" value="${escapeAttr(dc)}" placeholder="10 or formula" />
    </div>
  `;
}

/**
 * 8. Grant Reaction Params
 */
export function renderGrantReactionParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const reactionLabel = params.reactionLabel || "";

  return `
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.ReactionLabel")}</label>
      <input type="text" name="${prefix}.reactionLabel" value="${escapeAttr(reactionLabel)}" placeholder="e.g. Intercept, Riposte" />
    </div>
  `;
}

/**
 * 9. Redirect Damage Params
 */
export function renderRedirectDamageParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const capacity = params.capacity ?? "0";
  const mode = params.mode || "redirect";

  const modeOptions = {
    "redirect": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeRedirect",
    "reduce": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeReduce",
    "absorb": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeAbsorb"
  };

  return `
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Capacity")}</label>
      <input type="text" name="${prefix}.capacity" value="${escapeAttr(capacity)}" placeholder="e.g. 5, 1d6, <Int>" />
    </div>
    <div class="field-row">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.RedirectMode")}</label>
      ${renderSelect(`${prefix}.mode`, modeOptions, mode)}
    </div>
  `;
}

/**
 * 10. Chat Message Params
 */
export function renderChatMessageParams(params = {}, config = {}, index = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const message = params.message || "";
  const gmOnly = Boolean(params.gmOnly);

  return `
    <div class="field-row full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Message")}</label>
      <textarea name="${prefix}.message" rows="2" placeholder="Reminder message with {actorName}, {intensity}...">${escapeAttr(message)}</textarea>
    </div>
    <div class="field-row checkbox-row full-width">
      <input type="checkbox" name="${prefix}.gmOnly" ${gmOnly ? "checked" : ""} id="block-gmonly-${index}" />
      <label for="block-gmonly-${index}">${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.GMOnly")}</label>
    </div>
  `;
}

/**
 * Dispatches to the appropriate action renderer.
 * @param {string} action
 * @param {object} params
 * @param {object} config
 * @param {number} index
 * @returns {string} HTML snippet
 */
export function renderParamsForAction(action, params = {}, config = {}, index = 0) {
  switch (action) {
    case "modify_attribute":
      return renderModifyAttributeParams(params, config, index);
    case "confer_state":
      return renderConferStateParams(params, config, index);
    case "remove_state":
      return renderRemoveStateParams(params, config, index);
    case "modify_intensity":
      return renderModifyIntensityParams(params, config, index);
    case "set_flag":
      return renderSetFlagParams(params, config, index);
    case "force_movement":
      return renderForceMovementParams(params, config, index);
    case "roll_check":
      return renderRollCheckParams(params, config, index);
    case "grant_reaction":
      return renderGrantReactionParams(params, config, index);
    case "redirect_damage":
      return renderRedirectDamageParams(params, config, index);
    case "chat_message":
      return renderChatMessageParams(params, config, index);
    default:
      return `<p class="notes" style="font-size: var(--fs-11); color: var(--trp-text-dim);">${escapeAttr(action)}</p>`;
  }
}

/**
 * Returns sensible default parameter structures for each action type.
 * @param {string} action
 * @returns {object}
 */
export function getDefaultParamsForAction(action) {
  switch (action) {
    case "set_flag":
      return { flag: "immuneToDamage", value: true };
    case "modify_attribute":
      return { attribute: "guard", modifier: "+<Int>", applyMode: "delta" };
    case "confer_state":
      return { stateName: "", intensity: "1", removeTags: "" };
    case "remove_state":
      return { stateName: "", stateTag: "" };
    case "modify_intensity":
      return { value: "+1" };
    case "force_movement":
      return { type: "push", distance: "1" };
    case "roll_check":
      return { checkType: "prevail", attribute: "mighty", dc: null };
    case "grant_reaction":
      return { reactionLabel: "" };
    case "redirect_damage":
      return { target: "" };
    case "chat_message":
      return { message: "" };
    default:
      return {};
  }
}

