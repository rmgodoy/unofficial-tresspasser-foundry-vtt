/**
 * TCA Dialogs
 * Confirmation and choice group UI prompts for TCA behavior execution.
 */

/**
 * Resolves prompt confirmation for a single TCA block.
 * @param {Actor} actor
 * @param {Item} effectItem
 * @param {object} block
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function promptBlockConfirmation(actor, effectItem, block, context) {
  if (typeof foundry?.applications?.api?.DialogV2?.confirm !== "function") return true;

  const actionKeyMap = {
    "modify_attribute": "TRESPASSER.Sheet.Item.Effect.Action.ModifyAttribute",
    "confer_state": "TRESPASSER.Sheet.Item.Effect.Action.ConferState",
    "remove_state": "TRESPASSER.Sheet.Item.Effect.Action.RemoveState",
    "modify_intensity": "TRESPASSER.Sheet.Item.Effect.Action.ModifyIntensity",
    "set_flag": "TRESPASSER.Sheet.Item.Effect.Action.SetFlag",
    "force_movement": "TRESPASSER.Sheet.Item.Effect.Action.ForceMovement",
    "roll_check": "TRESPASSER.Sheet.Item.Effect.Action.RollCheck",
    "grant_reaction": "TRESPASSER.Sheet.Item.Effect.Action.GrantReaction",
    "redirect_damage": "TRESPASSER.Sheet.Item.Effect.Action.RedirectDamage",
    "chat_message": "TRESPASSER.Sheet.Item.Effect.Action.ChatMessage"
  };

  const actionKey = actionKeyMap[block.action];
  const localizedAction = (actionKey && game.i18n.has(actionKey)) ? game.i18n.localize(actionKey) : (block.action || "Action");
  const actionLabel = block.label || localizedAction;

  const defaultPrompt = game.i18n.has("TRESPASSER.Dialog.BlockConfirmation.DefaultPrompt")
    ? game.i18n.format("TRESPASSER.Dialog.BlockConfirmation.DefaultPrompt", { effect: effectItem.name, action: actionLabel })
    : `${effectItem.name}: ${game.i18n.localize("TRESPASSER.Global.Action.Accept")} ${actionLabel}?`;

  let promptText = block.promptText || defaultPrompt;
  if (promptText) {
    promptText = promptText
      .replace(/{actorName}/g, actor.name)
      .replace(/{effectName}/g, effectItem.name)
      .replace(/{intensity}/g, String(context.intensity ?? 0));
  }

  const content = `<div class="trespasser-dialog"><p style="font-size: var(--fs-13); margin: 0;">${promptText}</p></div>`;

  try {
    return await foundry.applications.api.DialogV2.confirm({
      window: { title: effectItem.name },
      content,
      yes: { label: game.i18n.localize("TRESPASSER.Global.Action.Accept") || "Accept", icon: "fas fa-check" },
      no: { label: game.i18n.localize("TRESPASSER.Global.Action.Decline") || "Decline", icon: "fas fa-times" },
      defaultYes: true
    });
  } catch (_) {
    return false;
  }
}

/**
 * Resolves choice group selection dialog for mutually exclusive blocks.
 * @param {Actor} actor
 * @param {Item} effectItem
 * @param {string} groupName
 * @param {object[]} blocks
 * @param {object} context
 * @returns {Promise<object|null>} The chosen block, or null if cancelled
 */
export async function promptChoiceGroup(actor, effectItem, groupName, blocks, context) {
  if (typeof foundry?.applications?.api?.DialogV2?.wait !== "function" || blocks.length <= 1) {
    return blocks[0] || null;
  }

  const optionsHtml = blocks.map((b, idx) => {
    const label = b.choiceLabel || b.label || `${b.action} (${b.id})`;
    return `
      <label class="choice-option-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; padding:6px; border:1px solid var(--trp-border-light, #5c4f3a); border-radius:4px; background:rgba(0,0,0,0.2);">
        <input type="radio" name="blockChoice" value="${b.id}" ${idx === 0 ? "checked" : ""} style="cursor:pointer;" />
        <span style="font-size: var(--fs-12);">${label}</span>
      </label>
    `;
  }).join("");

  const content = `
    <div class="trespasser-dialog choice-group-dialog" style="padding:4px;">
      <p style="font-size:var(--fs-12); margin-bottom:8px;">${game.i18n.format("TRESPASSER.Dialog.ChoiceGroup.Prompt", { effect: effectItem.name, group: groupName }) || `Choose an action for ${effectItem.name}:`}</p>
      <div class="choice-group-list">
        ${optionsHtml}
      </div>
    </div>
  `;

  try {
    const selectedId = await foundry.applications.api.DialogV2.wait({
      window: { title: `${effectItem.name} — ${groupName}` },
      classes: ["trespasser", "dialog"],
      position: { width: 340 },
      content,
      buttons: [
        {
          action: "select",
          icon: "fas fa-check",
          label: game.i18n.localize("TRESPASSER.Global.Action.Accept") || "Confirm",
          default: true,
          callback: (_event, _button, dialog) => {
            const checked = dialog.element.querySelector('input[name="blockChoice"]:checked');
            return checked ? checked.value : null;
          }
        },
        {
          action: "cancel",
          icon: "fas fa-times",
          label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") || "Cancel",
          callback: () => null
        }
      ]
    });

    if (!selectedId) return null;
    return blocks.find(b => b.id === selectedId) || null;
  } catch (_) {
    return null;
  }
}
