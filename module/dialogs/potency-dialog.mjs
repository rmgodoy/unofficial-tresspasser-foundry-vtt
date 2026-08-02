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
    const baseLabel = game.i18n.localize("TRESPASSER.Dialog.Potency.BaseIntensity");
    html += `
      <div class="potency-effect-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--trp-border, #4a3f2f);">
        <div style="font-size: var(--fs-13); font-weight: bold; color: var(--trp-text, #ddd0aa);">
          ${eff.name} <span style="font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); font-weight: normal;">(${baseLabel}: ${baseInt})</span>
        </div>
        <div class="potency-controls" style="display: flex; align-items: center; gap: 8px;">
          <button type="button" class="potency-btn btn-minus" data-index="${idx}" style="width: 28px; height: 28px; padding: 0; line-height: 1; font-size: var(--fs-14); font-weight: bold; cursor: pointer;">-</button>
          <span class="potency-val" data-index="${idx}" style="min-width: 24px; text-align: center; font-size: var(--fs-14); font-weight: bold; color: var(--trp-gold-bright, #e8c96b);">0</span>
          <button type="button" class="potency-btn btn-plus" data-index="${idx}" style="width: 28px; height: 28px; padding: 0; line-height: 1; font-size: var(--fs-14); font-weight: bold; cursor: pointer;">+</button>
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
      const values = effectList.map(() => 0);
      const valSpans = Array.from(el.querySelectorAll(".potency-val"));
      const counterEl = el.querySelector(".potency-remaining-counter");
      const confirmBtn = el.querySelector('button[data-action="confirm"]');

      const updateUI = () => {
        const totalAllocated = values.reduce((a, b) => a + b, 0);
        const remaining = potencyPoints - totalAllocated;

        valSpans.forEach((span, i) => {
          span.textContent = values[i];
        });

        el.querySelectorAll(".btn-plus").forEach((btn) => {
          btn.disabled = remaining <= 0;
        });

        el.querySelectorAll(".btn-minus").forEach((btn, i) => {
          btn.disabled = values[i] <= 0;
        });

        if (counterEl) {
          counterEl.textContent = game.i18n.format("TRESPASSER.Dialog.Potency.Remaining", { count: remaining });
          counterEl.style.color = remaining < 0 ? "#ff5252" : "var(--trp-gold-bright, #e8c96b)";
        }

        if (confirmBtn) {
          confirmBtn.disabled = totalAllocated > potencyPoints;
        }
      };

      el.querySelectorAll(".btn-plus").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const idx = parseInt(btn.dataset.index);
          const totalAllocated = values.reduce((a, b) => a + b, 0);
          if (totalAllocated < potencyPoints) {
            values[idx]++;
            updateUI();
          }
        });
      });

      el.querySelectorAll(".btn-minus").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const idx = parseInt(btn.dataset.index);
          if (values[idx] > 0) {
            values[idx]--;
            updateUI();
          }
        });
      });

      if (dialog.element) {
        dialog.element._potencyValues = values;
      }

      updateUI();
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        default: true,
        callback: (event, button) => {
          const dialogEl = button.closest(".window-app") || button.closest(".dialog");
          const form = button.form;
          const values = dialogEl?._potencyValues || form?._potencyValues || [];
          const allocations = Array.from(values);
          const totalAllocated = allocations.reduce((a, b) => a + b, 0);

          if (totalAllocated > potencyPoints) {
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
