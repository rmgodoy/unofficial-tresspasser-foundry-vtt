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

  const baseInts = effectList.map(eff => {
    const n = Number(eff.intensity);
    return (eff.intensity !== undefined && eff.intensity !== null && eff.intensity !== "" && !isNaN(n))
      ? Math.max(0, n)
      : 0;
  });

  const currentValues = [...baseInts];

  let html = `<div class="trespasser-dialog potency-dialog">`;
  html += `<style>
    .potency-dialog input[type=number]::-webkit-inner-spin-button,
    .potency-dialog input[type=number]::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  </style>`;
  html += `<p style="font-size: var(--fs-13); margin-bottom: 10px;">${game.i18n.format("TRESPASSER.Dialog.Potency.Intro", { count: potencyPoints, target: targetName })}</p>`;
  html += `<div class="potency-effects-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">`;

  effectList.forEach((eff, idx) => {
    const baseInt = baseInts[idx];
    const baseLabel = game.i18n.localize("TRESPASSER.Dialog.Potency.BaseIntensity");
    html += `
      <div class="potency-effect-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--trp-border, #4a3f2f);">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${eff.img ? `<img src="${eff.img}" style="width: 24px; height: 24px; object-fit: cover; border-radius: 3px; border: none;" />` : ""}
          <div style="font-size: var(--fs-13); font-weight: bold; color: var(--trp-text, #ddd0aa);">
            ${eff.name} <span style="font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); font-weight: normal;">(${baseLabel}: ${baseInt})</span>
          </div>
        </div>
        <div class="potency-controls" style="display: flex; align-items: center; gap: 8px;">
          <button type="button" class="potency-btn btn-minus" data-index="${idx}" style="width: 28px; height: 28px; padding: 0; line-height: 1; font-size: var(--fs-14); font-weight: bold; cursor: pointer;">-</button>
          <input type="number" class="potency-input potency-val" data-index="${idx}" value="${baseInt}" min="${baseInt}" style="width: 44px; height: 28px; padding: 0; text-align: center; font-size: var(--fs-14); font-weight: bold; color: var(--trp-gold-bright, #e8c96b); background: rgba(0,0,0,0.3); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px; -moz-appearance: textfield;" />
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
      const inputs = Array.from(el.querySelectorAll(".potency-input"));
      const counterEl = el.querySelector(".potency-remaining-counter");
      const confirmBtn = el.querySelector('button[data-action="confirm"]');

      const updateUI = (syncInputs = true) => {
        const totalAllocated = currentValues.reduce((sum, val, i) => sum + (val - baseInts[i]), 0);
        const remaining = potencyPoints - totalAllocated;

        if (syncInputs) {
          inputs.forEach((input, i) => {
            input.value = currentValues[i];
          });
        }

        el.querySelectorAll(".btn-plus").forEach((btn) => {
          btn.disabled = remaining <= 0;
        });

        el.querySelectorAll(".btn-minus").forEach((btn) => {
          const i = parseInt(btn.dataset.index);
          btn.disabled = currentValues[i] <= baseInts[i];
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
          const totalAllocated = currentValues.reduce((sum, val, i) => sum + (val - baseInts[i]), 0);
          if (totalAllocated < potencyPoints) {
            currentValues[idx]++;
            updateUI(true);
          }
        });
      });

      el.querySelectorAll(".btn-minus").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const idx = parseInt(btn.dataset.index);
          if (currentValues[idx] > baseInts[idx]) {
            currentValues[idx]--;
            updateUI(true);
          }
        });
      });

      inputs.forEach((input) => {
        const idx = parseInt(input.dataset.index);

        const handleInputChange = (isCommit) => {
          let rawVal = parseInt(input.value);
          if (isNaN(rawVal)) {
            if (isCommit) {
              currentValues[idx] = baseInts[idx];
              input.value = currentValues[idx];
              updateUI(true);
            }
            return;
          }

          if (rawVal < baseInts[idx]) {
            rawVal = baseInts[idx];
            input.value = rawVal;
          }

          currentValues[idx] = rawVal;
          updateUI(false);
        };

        input.addEventListener("input", () => handleInputChange(false));
        input.addEventListener("change", () => handleInputChange(true));
        input.addEventListener("blur", () => handleInputChange(true));
      });

      if (dialog.element) {
        dialog.element._potencyCurrentValues = currentValues;
        dialog.element._potencyBaseInts = baseInts;
      }

      updateUI(true);
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        default: true,
        callback: (event, button) => {
          const dialogEl = button.closest(".application") || button.closest(".window-app") || button.closest(".dialog");
          if (dialogEl) {
            const inputs = dialogEl.querySelectorAll(".potency-input");
            inputs.forEach((input) => {
              const idx = parseInt(input.dataset.index);
              const val = parseInt(input.value);
              if (!isNaN(val) && val >= baseInts[idx]) {
                currentValues[idx] = val;
              }
            });
          }
          const allocations = currentValues.map((val, i) => Math.max(0, val - baseInts[i]));
          const totalAllocated = allocations.reduce((a, b) => a + b, 0);

          if (totalAllocated > potencyPoints) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Dialog.Potency.InvalidTotal", { allocated: totalAllocated, total: potencyPoints }));
            return null;
          }
          return allocations;
        }
      }
    ],
    rejectClose: false,
    close: () => null
  });

  return result;
}
