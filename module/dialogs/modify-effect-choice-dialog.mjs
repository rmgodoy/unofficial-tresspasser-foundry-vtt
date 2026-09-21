/**
 * modify-effect-choice-dialog.mjs
 * ApplicationV2 dialog for selecting which active effect/state on a target to modify or transfer.
 */

/**
 * Prompt the user to choose one or more effects from a list of candidate effects.
 * @param {object} options
 * @param {Token|Actor} options.target - The target token or actor
 * @param {Array<{ item: Item, oppositeDef: object|null, intensity: number }>} options.candidates
 * @param {string} [options.operation="invert"] - The modification operation
 * @param {boolean} [options.multiple=false] - Whether multiple effects can be selected via checkboxes
 * @param {number|null} [options.maxCount=null] - Maximum number of effects selectable (if multiple)
 * @param {string} [options.title]
 * @returns {Promise<string|string[]|null>} Returns chosen effect ID(s) or null if cancelled
 */
export async function promptModifyEffectChoice({ target, candidates, operation = "invert", multiple = false, maxCount = null, title = null, showInvertPreview = null }) {
  if (!candidates || candidates.length === 0) return multiple ? [] : null;
  if (candidates.length === 1 && !multiple && (maxCount === null || maxCount === 1)) return candidates[0].item.id;

  const targetName = target.name || game.i18n.localize("TRESPASSER.Terms.Target") || "Target";
  const isInvert = showInvertPreview !== null ? showInvertPreview : (operation === "invert");
  const dialogTitle = title || (
    isInvert
      ? game.i18n.format("TRESPASSER.Dialog.ModifyEffect.TitleInvert", { target: targetName })
      : game.i18n.format("TRESPASSER.Dialog.ModifyEffect.Title", { target: targetName })
  );

  const isMultiple = multiple || (maxCount !== null && maxCount > 1);
  const inputType = isMultiple ? "checkbox" : "radio";

  let promptText = "";
  if (isMultiple) {
    if (maxCount !== null && maxCount > 1) {
      promptText = game.i18n.format("TRESPASSER.Dialog.ModifyEffect.PromptMax", { target: targetName, count: maxCount });
    } else {
      promptText = game.i18n.format("TRESPASSER.Dialog.ModifyEffect.PromptAny", { target: targetName });
    }
  } else {
    promptText = game.i18n.format("TRESPASSER.Dialog.ModifyEffect.Prompt", { target: targetName });
  }

  let html = `
    <div class="trespasser-dialog modify-effect-choice-dialog" style="display:flex; flex-direction:column; gap:8px;">
      <p style="margin:0 0 6px 0; font-size:var(--fs-12); color:var(--trp-text-dim, #a09070);">
        ${promptText}
      </p>
      <div class="candidates-list" style="display:flex; flex-direction:column; gap:6px;">
  `;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const item = cand.item;
    const isChecked = isMultiple
      ? (maxCount !== null ? (i < maxCount ? "checked" : "") : "checked")
      : (i === 0 ? "checked" : "");
    const intLabel = cand.intensity > 0 ? ` (Int ${cand.intensity})` : "";
    const oppLabel = (isInvert && cand.oppositeDef?.name) ? ` ➔ ${cand.oppositeDef.name}` : "";

    html += `
      <label class="candidate-option-label" style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:rgba(0,0,0,0.3); border:1px solid var(--trp-border-light, #5c4f3a); border-radius:4px; cursor:pointer; font-size:var(--fs-12);">
        <input type="${inputType}" name="selectedEffectId" value="${item.id}" ${isChecked} style="margin:0; cursor:pointer;" />
        <img src="${item.img || 'systems/trespasser/assets/icons/effect.webp'}" alt="${item.name}" style="width:28px; height:28px; border:none; object-fit:contain;" />
        <div style="flex:1; display:flex; flex-direction:column;">
          <span style="font-weight:bold; color:var(--trp-gold, #c9a84c);">${item.name}${intLabel}</span>
          ${oppLabel ? `<span style="font-size:var(--fs-10); color:var(--trp-text-muted, #776655);">${game.i18n.localize("TRESPASSER.Dialog.ModifyEffect.Becomes") || "Becomes:"}${oppLabel}</span>` : ""}
        </div>
      </label>
    `;
  }

  html += `
      </div>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    window: {
      title: dialogTitle,
      width: 360,
      resizable: true
    },
    classes: ["trespasser", "dialog", "modify-effect-select"],
    content: html,
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        icon: "fas fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element || button?.form || button?.closest(".application") || button?.closest(".window-app") || document;
          if (isMultiple) {
            const checkedEls = root.querySelectorAll('input[name="selectedEffectId"]:checked');
            const ids = Array.from(checkedEls).map(el => el.value);
            return maxCount !== null && maxCount > 0 ? ids.slice(0, maxCount) : ids;
          }
          const checked = root.querySelector('input[name="selectedEffectId"]:checked');
          return checked ? checked.value : candidates[0].item.id;
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        icon: "fas fa-times",
        callback: () => null
      }
    ],
    render: (event, dialog) => {
      if (isMultiple && maxCount !== null && maxCount > 0) {
        const root = dialog?.element || document;
        const checkboxes = root.querySelectorAll('input[name="selectedEffectId"]');
        for (const cb of checkboxes) {
          cb.addEventListener("change", () => {
            const checkedCount = root.querySelectorAll('input[name="selectedEffectId"]:checked').length;
            if (checkedCount > maxCount) {
              cb.checked = false;
              ui.notifications?.warn(
                game.i18n.format("TRESPASSER.Dialog.ModifyEffect.MaxReached", { count: maxCount }) ||
                `You can select at most ${maxCount} state(s).`
              );
            }
          });
        }
      }
    },
    rejectClose: false
  });
}
