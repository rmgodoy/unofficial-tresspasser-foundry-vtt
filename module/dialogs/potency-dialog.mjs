/**
 * Dialog to allocate Potency spark points among multiple applied effects.
 *
 * @param {number} potencyPoints - Number of potency points to allocate.
 * @param {Array<object>} effectList - List of effect objects ({ name, intensity }).
 * @param {string} targetName - Name of the target token/actor.
 * @returns {Promise<number[]|null>} - Array of allocated potency bonus per effect index, or null if cancelled.
 */
export async function askPotencyDialog(potencyPoints, effectList, targetName) {
  if (!effectList || effectList.length <= 1 || potencyPoints <= 0) {
    return effectList ? effectList.map((_, i) => (i === 0 ? potencyPoints : 0)) : [];
  }

  let html = `<div class="trespasser-dialog potency-dialog">`;
  html += `<p style="font-size: var(--fs-13); margin-bottom: 10px;">${game.i18n.format("TRESPASSER.Dialog.Potency.Intro", { count: potencyPoints, target: targetName })}</p>`;
  html += `<div class="potency-effects-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">`;

  effectList.forEach((eff, idx) => {
    const baseInt = eff.intensity || 1;
    const baseLabel = game.i18n.localize("TRESPASSER.Item.Effect.BaseIntensity") || "Base Intensity";
    html += `
      <div class="potency-effect-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--trp-border, #4a3f2f);">
        <div style="font-size: var(--fs-13); font-weight: bold; color: var(--trp-text, #ddd0aa);">
          ${eff.name} <span style="font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); font-weight: normal;">(${baseLabel}: ${baseInt})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="number" name="potency-${idx}" value="0" min="0" max="${potencyPoints}" class="potency-input" data-index="${idx}" style="width: 50px; text-align: center; font-size: var(--fs-13);" />
        </div>
      </div>`;
  });

  html += `</div>`;
  html += `<div class="potency-remaining-counter" style="font-size: var(--fs-12); font-weight: bold; color: var(--trp-gold-bright, #e8c96b); text-align: right;">
    ${game.i18n.format("TRESPASSER.Dialog.Potency.Remaining", { count: potencyPoints })}
  </div>`;
  html += `</div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.Potency.Title") },
    classes: ["trespasser", "dialog"],
    content: html,
    render: (event, dialog) => {
      const el = dialog.element;
      const inputs = Array.from(el.querySelectorAll(".potency-input"));
      const counterEl = el.querySelector(".potency-remaining-counter");

      const updateCounter = () => {
        const allocated = inputs.reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
        const remaining = potencyPoints - allocated;
        if (counterEl) {
          counterEl.textContent = game.i18n.format("TRESPASSER.Dialog.Potency.Remaining", { count: remaining });
          if (remaining < 0) {
            counterEl.style.color = "#ff5252";
          } else {
            counterEl.style.color = "var(--trp-gold-bright, #e8c96b)";
          }
        }
      };

      inputs.forEach(input => {
        input.addEventListener("input", updateCounter);
        input.addEventListener("change", updateCounter);
      });
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        default: true,
        callback: (event, button) => {
          const form = button.form;
          const inputs = Array.from(form.querySelectorAll(".potency-input"));
          const allocations = inputs.map(input => parseInt(input.value) || 0);
          const totalAllocated = allocations.reduce((a, b) => a + b, 0);

          if (totalAllocated !== potencyPoints) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Dialog.Potency.InvalidTotal", { allocated: totalAllocated, total: potencyPoints }));
            return null;
          }
          return allocations;
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  return result;
}
