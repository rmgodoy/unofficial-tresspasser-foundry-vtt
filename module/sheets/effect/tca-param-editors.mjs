/**
 * TCA Action Parameter Editors
 * Generates parameter form field HTML snippets for each action type
 * in both Advanced Mode (full parameter bar) and Simple Mode (inline pill controls).
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
 * @param {string} [cls=""]
 * @returns {string}
 */
function renderSelect(name, options, selectedVal, localize = true, cls = "") {
  const classAttr = cls ? ` class="${escapeAttr(cls)}"` : "";
  let html = `<select name="${escapeAttr(name)}"${classAttr}>`;
  for (const [val, labelKey] of Object.entries(options)) {
    const label = localize && game.i18n ? game.i18n.localize(labelKey) : labelKey;
    const isSelected = String(val) === String(selectedVal) ? "selected" : "";
    html += `<option value="${escapeAttr(val)}" ${isSelected}>${escapeAttr(label)}</option>`;
  }
  html += `</select>`;
  return html;
}

/**
 * Computes a live preview badge when a formula contains <Int> or <intensity>.
 * @param {string|number} rawFormula
 * @param {number} intensity
 * @returns {string} HTML badge or empty string
 */
export function renderIntensityPreviewBadge(rawFormula, intensity = 0) {
  const str = String(rawFormula ?? "").trim();
  if (!str || (!str.toLowerCase().includes("<int>") && !str.toLowerCase().includes("<intensity>"))) {
    return "";
  }
  const resolved = str.replace(/<Int>|<intensity>/gi, String(intensity ?? 0));
  return `<span class="tca-int-preview" title="Intensity = ${escapeAttr(intensity)}">= ${escapeAttr(resolved)}</span>`;
}

/**
 * 1. Modify Attribute Params
 */
export function renderModifyAttributeParams(params = {}, config = {}, index = 0, intensity = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const attribute = params.attribute || "health";
  const modifier = params.modifier ?? "0";
  const applyMode = params.applyMode || "delta";

  const applyModeOptions = {
    "delta": "TRESPASSER.Sheet.Item.Effect.Param.ApplyDelta",
    "set": "TRESPASSER.Sheet.Item.Effect.Param.ApplySet"
  };

  return `
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Attribute")}</label>
      ${renderSelect(`${prefix}.attribute`, config.targetAttributes || {}, attribute)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.ApplyMode")}</label>
      ${renderSelect(`${prefix}.applyMode`, applyModeOptions, applyMode)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Modifier")}</label>
      <div class="tca-input-with-preview">
        <input type="text" name="${prefix}.modifier" value="${escapeAttr(modifier)}" placeholder="+1, -1d6, <Int>" />
        ${renderIntensityPreviewBadge(modifier, intensity)}
      </div>
    </div>
  `;
}

/**
 * 2. Confer State Params
 */
export function renderConferStateParams(params = {}, config = {}, index = 0, intensity = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const effects = Array.isArray(params.effects) ? params.effects : [];
  const stateName = params.stateName || "";
  const stateIntensity = params.intensity ?? "";
  const removeTags = Array.isArray(params.removeTags) ? params.removeTags.join(", ") : (params.removeTags || "");

  let chipsHtml = "";
  if (effects.length > 0) {
    const chips = effects.map((eff, effIdx) => `
      <div class="effect-chip" data-index="${effIdx}" data-behavior-index="${index}" data-uuid="${escapeAttr(eff.uuid || "")}">
        <input type="hidden" name="${prefix}.effects.${effIdx}.uuid" value="${escapeAttr(eff.uuid || "")}" />
        <input type="hidden" name="${prefix}.effects.${effIdx}.name" value="${escapeAttr(eff.name || "")}" />
        <input type="hidden" name="${prefix}.effects.${effIdx}.img" value="${escapeAttr(eff.img || "")}" />
        <img src="${eff.img || "systems/trespasser/assets/icons/skills/afflicted.webp"}" title="${escapeAttr(eff.name || "")}" />
        <span class="name">${escapeAttr(eff.name || "Effect")}</span>
        <div class="intensity-box">
          <span class="label">${game.i18n.localize("TRESPASSER.Sheet.Common.IntensityShort")}</span>
          <input type="text"
                 name="${prefix}.effects.${effIdx}.intensity"
                 value="${escapeAttr(eff.intensity ?? "1")}"
                 placeholder="1 or <Int>"
                 class="select-on-focus"
                 style="width: 50px;" />
        </div>
        <div class="controls">
          <a class="effect-edit edit" data-action="openBehaviorEffectDoc" data-uuid="${escapeAttr(eff.uuid || "")}" title="${game.i18n.localize("TRESPASSER.Sheet.Common.Edit")}"><i class="fas fa-edit"></i></a>
          <a class="remove-effect-btn remove" data-action="removeBehaviorEffect" data-behavior-index="${index}" data-effect-index="${effIdx}" title="${game.i18n.localize("TRESPASSER.Sheet.Common.Delete")}"><i class="fas fa-times"></i></a>
        </div>
      </div>
    `).join("");
    chipsHtml = `<div class="effect-chips-list">${chips}</div>`;
  }

  return `
    <div class="tca-param-item full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.ConferEffects")}</label>
      <div class="behavior-effect-drop drop-zone" data-behavior-index="${index}">
        <i class="fas fa-file-import"></i> ${game.i18n.localize("TRESPASSER.Sheet.Item.Placeholder.DropEffects")}
      </div>
      ${chipsHtml}
    </div>
    ${effects.length === 0 ? `
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.StateName")}</label>
      <input type="text" name="${prefix}.stateName" value="${escapeAttr(stateName)}" placeholder="State Name or UUID" />
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.IntensityValue")}</label>
      <div class="tca-input-with-preview">
        <input type="text" name="${prefix}.intensity" value="${escapeAttr(stateIntensity)}" placeholder="1, +1, <Int>" />
        ${renderIntensityPreviewBadge(stateIntensity, intensity)}
      </div>
    </div>
    ` : `
    <input type="hidden" name="${prefix}.stateName" value="${escapeAttr(effects[0]?.name || "")}" />
    <input type="hidden" name="${prefix}.stateId" value="${escapeAttr(effects[0]?.uuid || "")}" />
    <input type="hidden" name="${prefix}.intensity" value="${escapeAttr(effects[0]?.intensity ?? "1")}" />
    `}
    <div class="tca-param-item full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.RemoveTags")}</label>
      <input type="text" name="${prefix}.removeTags" value="${escapeAttr(removeTags)}" placeholder="e.g. stance, curse" />
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
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.StateName")}</label>
      <input type="text" name="${prefix}.stateName" value="${escapeAttr(stateName)}" placeholder="State name" />
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.StateTag")}</label>
      <input type="text" name="${prefix}.stateTag" value="${escapeAttr(stateTag)}" placeholder="#tag (e.g. stance)" />
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.ActionTarget")}</label>
      ${renderSelect(`${prefix}.target`, targetOptions, target)}
    </div>
  `;
}

/**
 * 4. Modify Intensity Params
 */
export function renderModifyIntensityParams(params = {}, config = {}, index = 0, intensity = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const value = params.value ?? "+1";

  return `
    <div class="tca-param-item full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.IntensityValue")}</label>
      <div class="tca-input-with-preview">
        <input type="text" name="${prefix}.value" value="${escapeAttr(value)}" placeholder="+1, -1, =0, +<Int>" />
        ${renderIntensityPreviewBadge(value, intensity)}
      </div>
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
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.FlagName")}</label>
      ${renderSelect(`${prefix}.flag`, flagOptions, flag)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.FlagValue")}</label>
      <input type="text" name="${prefix}.value" value="${escapeAttr(value)}" placeholder="true / false" />
    </div>
  `;
}

/**
 * 6. Force Movement Params
 */
export function renderForceMovementParams(params = {}, config = {}, index = 0, intensity = 0) {
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
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.MovementType")}</label>
      ${renderSelect(`${prefix}.type`, moveOptions, type)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Distance")}</label>
      <div class="tca-input-with-preview">
        <input type="text" name="${prefix}.distance" value="${escapeAttr(distance)}" placeholder="1, 1d6, <Int>" />
        ${renderIntensityPreviewBadge(distance, intensity)}
      </div>
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
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.CheckType")}</label>
      ${renderSelect(`${prefix}.checkType`, checkOptions, checkType)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Attribute")}</label>
      ${renderSelect(`${prefix}.attribute`, config.targetAttributes || {}, attribute)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.DC")}</label>
      <input type="text" name="${prefix}.dc" value="${escapeAttr(dc)}" placeholder="10" />
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
    <div class="tca-param-item full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.ReactionLabel")}</label>
      <input type="text" name="${prefix}.reactionLabel" value="${escapeAttr(reactionLabel)}" placeholder="e.g. Intercept, Riposte" />
    </div>
  `;
}

/**
 * 9. Redirect Damage Params
 */
export function renderRedirectDamageParams(params = {}, config = {}, index = 0, intensity = 0) {
  const prefix = `system.behaviors.${index}.params`;
  const capacity = params.capacity ?? "0";
  const mode = params.mode || "redirect";

  const modeOptions = {
    "redirect": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeRedirect",
    "reduce": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeReduce",
    "absorb": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeAbsorb"
  };

  return `
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.RedirectMode")}</label>
      ${renderSelect(`${prefix}.mode`, modeOptions, mode)}
    </div>
    <div class="tca-param-item">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Capacity")}</label>
      <div class="tca-input-with-preview">
        <input type="text" name="${prefix}.capacity" value="${escapeAttr(capacity)}" placeholder="5, 1d6, <Int>" />
        ${renderIntensityPreviewBadge(capacity, intensity)}
      </div>
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
    <div class="tca-param-item full-width">
      <label>${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.Message")}</label>
      <textarea name="${prefix}.message" rows="2" placeholder="Reminder message with {actorName}, {intensity}...">${escapeAttr(message)}</textarea>
    </div>
    <div class="tca-param-item full-width tca-checkbox-row">
      <input type="checkbox" name="${prefix}.gmOnly" ${gmOnly ? "checked" : ""} id="block-gmonly-${index}" />
      <label for="block-gmonly-${index}">${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Param.GMOnly")}</label>
    </div>
  `;
}

/**
 * Dispatches to the appropriate action renderer for Advanced Mode.
 */
export function renderParamsForAction(action, params = {}, config = {}, index = 0, intensity = 0) {
  switch (action) {
    case "modify_attribute":
      return renderModifyAttributeParams(params, config, index, intensity);
    case "confer_state":
      return renderConferStateParams(params, config, index, intensity);
    case "remove_state":
      return renderRemoveStateParams(params, config, index);
    case "modify_intensity":
      return renderModifyIntensityParams(params, config, index, intensity);
    case "set_flag":
      return renderSetFlagParams(params, config, index);
    case "force_movement":
      return renderForceMovementParams(params, config, index, intensity);
    case "roll_check":
      return renderRollCheckParams(params, config, index);
    case "grant_reaction":
      return renderGrantReactionParams(params, config, index);
    case "redirect_damage":
      return renderRedirectDamageParams(params, config, index, intensity);
    case "chat_message":
      return renderChatMessageParams(params, config, index);
    default:
      return `<p class="notes">${escapeAttr(action)}</p>`;
  }
}

/**
 * Renders ultra-compact inline controls for Simple Mode's horizontal pipeline pill.
 */
export function renderSimpleInlineParams(action, params = {}, config = {}, index = 0, intensity = 0) {
  const prefix = `system.behaviors.${index}.params`;
  switch (action) {
    case "modify_attribute": {
      const attribute = params.attribute || "health";
      const modifier = params.modifier ?? "0";
      return `
        ${renderSelect(`${prefix}.attribute`, config.targetAttributes || {}, attribute, true, "tca-simple-select")}
        <input type="text" class="tca-simple-val" name="${prefix}.modifier" value="${escapeAttr(modifier)}" placeholder="+1" />
        ${renderIntensityPreviewBadge(modifier, intensity)}
      `;
    }
    case "modify_intensity": {
      const val = params.value ?? "+1";
      return `
        <span class="tca-simple-action-name">${game.i18n.localize("TRESPASSER.Sheet.Common.Intensity")}</span>
        <input type="text" class="tca-simple-val" name="${prefix}.value" value="${escapeAttr(val)}" placeholder="+1" />
        ${renderIntensityPreviewBadge(val, intensity)}
      `;
    }
    case "confer_state": {
      const effects = Array.isArray(params.effects) ? params.effects : [];
      if (effects.length > 0) {
        const names = effects.map(e => escapeAttr(e.name)).join(", ");
        return `<span class="tca-simple-action-name">+ ${names}</span>`;
      }
      return `
        <span class="tca-simple-action-name">+</span>
        <input type="text" class="tca-simple-text" name="${prefix}.stateName" value="${escapeAttr(params.stateName || "")}" placeholder="State" />
      `;
    }
    case "remove_state": {
      const val = params.stateName || params.stateTag || "";
      const field = params.stateTag && !params.stateName ? "stateTag" : "stateName";
      return `
        <span class="tca-simple-action-name">&minus;</span>
        <input type="text" class="tca-simple-text" name="${prefix}.${field}" value="${escapeAttr(val)}" placeholder="State / Tag" />
      `;
    }
    case "redirect_damage": {
      const cap = params.capacity ?? "0";
      const modeOptions = {
        "redirect": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeRedirect",
        "reduce": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeReduce",
        "absorb": "TRESPASSER.Sheet.Item.Effect.Param.RedirectModeAbsorb"
      };
      return `
        ${renderSelect(`${prefix}.mode`, modeOptions, params.mode || "redirect", true, "tca-simple-select")}
        <input type="text" class="tca-simple-val" name="${prefix}.capacity" value="${escapeAttr(cap)}" placeholder="<Int>" />
        ${renderIntensityPreviewBadge(cap, intensity)}
      `;
    }
    case "force_movement": {
      const moveOptions = {
        "push": "TRESPASSER.Sheet.Item.Effect.Param.MovePush",
        "pull": "TRESPASSER.Sheet.Item.Effect.Param.MovePull",
        "sweep": "TRESPASSER.Sheet.Item.Effect.Param.MoveSweep",
        "teleport": "TRESPASSER.Sheet.Item.Effect.Param.MoveTeleport",
        "jump": "TRESPASSER.Sheet.Item.Effect.Param.MoveJump"
      };
      const dist = params.distance ?? "1";
      return `
        ${renderSelect(`${prefix}.type`, moveOptions, params.type || "push", true, "tca-simple-select")}
        <input type="text" class="tca-simple-val" name="${prefix}.distance" value="${escapeAttr(dist)}" placeholder="1" />
        ${renderIntensityPreviewBadge(dist, intensity)}
      `;
    }
    case "set_flag": {
      const flagOptions = {
        "immuneToDamage": "TRESPASSER.Sheet.Item.Effect.Flag.ImmuneToDamage",
        "cannotAct": "TRESPASSER.Sheet.Item.Effect.Flag.CannotAct",
        "cannotMove": "TRESPASSER.Sheet.Item.Effect.Flag.CannotMove",
        "countsAsObstacle": "TRESPASSER.Sheet.Item.Effect.Flag.CountsAsObstacle"
      };
      return `${renderSelect(`${prefix}.flag`, flagOptions, params.flag || "immuneToDamage", true, "tca-simple-select")}`;
    }
    case "roll_check": {
      const dc = params.dc ?? "10";
      return `
        <span class="tca-simple-action-name">DC</span>
        <input type="text" class="tca-simple-val" name="${prefix}.dc" value="${escapeAttr(dc)}" placeholder="10" />
      `;
    }
    case "grant_reaction": {
      return `<input type="text" class="tca-simple-text" name="${prefix}.reactionLabel" value="${escapeAttr(params.reactionLabel || "")}" placeholder="Reaction" />`;
    }
    case "chat_message": {
      return `<input type="text" class="tca-simple-text" name="${prefix}.message" value="${escapeAttr(params.message || "")}" placeholder="Message..." />`;
    }
    default:
      return `<span class="tca-simple-action-name">${escapeAttr(action)}</span>`;
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
      return { stateName: "", intensity: "1", removeTags: "", effects: [] };
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
      return { capacity: "<Int>", mode: "redirect" };
    case "chat_message":
      return { message: "" };
    default:
      return {};
  }
}
