import { DeedBehaviorUtils } from "../helpers/deed-behaviors/deed-behavior-utils.mjs";

/**
 * ApplicationsV2 Distribution dialog for Deed damage & healing behaviors.
 * Prompts the user to allocate total damage or healing among targeted creatures.
 * Uses +/- controls and starts with 0 for all targets by default.
 *
 * @param {object} params
 * @param {number} params.totalAmount - Total evaluated damage or healing.
 * @param {Array<Token|Actor>} params.targets - List of target tokens or actors.
 * @param {string} params.type - "damage" or "healing".
 * @returns {Promise<Map<string, number>|null>} Map of tokenId -> allocated value, or null if cancelled.
 */
export async function askDistributionDialog({ totalAmount, targets, type = "damage" }) {
  if (!targets || targets.length === 0) return new Map();

  // Filter valid target elements and retrieve display names
  const targetList = targets.map(t => {
    const id = t.id || t.document?.id || foundry.utils.randomID();
    const name = DeedBehaviorUtils.getTokenDisplayName(t);
    return { id, name, target: t };
  });

  // If only 1 target, assign full totalAmount without prompting
  if (targetList.length === 1) {
    const result = new Map();
    result.set(targetList[0].id, Math.max(0, totalAmount));
    return result;
  }

  const isDamage = type === "damage";
  const titleKey = isDamage ? "TRESPASSER.Dialog.Distribution.TitleDamage" : "TRESPASSER.Dialog.Distribution.TitleHealing";
  const introKey = isDamage ? "TRESPASSER.Dialog.Distribution.IntroDamage" : "TRESPASSER.Dialog.Distribution.IntroHealing";

  let html = `<div class="trespasser-dialog distribution-dialog" style="max-height:60vh; overflow-y:auto; padding: 4px;">`;
  html += `<p style="margin-bottom: 12px; font-size: var(--fs-13); color: var(--trp-text, #ddd0aa);">
    ${game.i18n.format(introKey, { total: totalAmount })}
  </p>`;

  html += `<div class="distrib-targets-list" style="display:flex; flex-direction:column; gap:8px;">`;
  for (const item of targetList) {
    html += `
      <div class="form-group target-distrib-row" style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.25); padding: 6px 10px; border: 1px solid var(--trp-border-light, #5c4f3a); border-radius: 4px;">
        <label style="font-size: var(--fs-13); font-weight:bold; color: var(--trp-gold-bright, #e8c96b); margin-right: 12px; flex: 1;">
          ${item.name}
        </label>
        <div class="distrib-counter" style="display:flex; align-items:center; gap:6px;">
          <button type="button" class="distrib-btn minus-btn" data-token-id="${item.id}" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background: var(--trp-bg-button, #3d3428); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius:3px; cursor:pointer;">
            <i class="fas fa-minus" style="font-size: var(--fs-11);"></i>
          </button>
          <span class="target-distrib-val" data-token-id="${item.id}" style="min-width:30px; text-align:center; font-size: var(--fs-14); font-weight:bold; color: var(--trp-text, #ddd0aa);">0</span>
          <input type="hidden" class="target-distrib-input" data-token-id="${item.id}" value="0" />
          <button type="button" class="distrib-btn plus-btn" data-token-id="${item.id}" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background: var(--trp-bg-button, #3d3428); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius:3px; cursor:pointer;">
            <i class="fas fa-plus" style="font-size: var(--fs-11);"></i>
          </button>
        </div>
      </div>`;
  }
  html += `</div>`;

  html += `
    <div class="distrib-summary" style="margin-top: 14px; padding-top: 8px; border-top: 1px dashed var(--trp-border, #4a3f2f); display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12);">
      <button type="button" class="distrib-reset-btn" style="background: rgba(146, 44, 44, 0.35); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius: 4px; padding: 4px 8px; font-size: var(--fs-11); cursor: pointer; display:flex; align-items:center; gap:4px;">
        <i class="fas fa-undo"></i> ${game.i18n.localize("TRESPASSER.Dialog.Distribution.ResetAll")}
      </button>
      <div>
        <span style="color: var(--trp-text-dim, #a09070);">${game.i18n.localize("TRESPASSER.Dialog.Distribution.Remaining")}:</span>
        <strong class="distrib-remaining" style="color: #e8c96b; font-size: var(--fs-14); margin-left: 4px;">${totalAmount}</strong>
      </div>
    </div>
    <div class="distrib-warning" style="display:none; color: #ff5252; font-size: var(--fs-11); font-weight: bold; margin-top: 4px; text-align: right;">
      ${game.i18n.localize("TRESPASSER.Dialog.Distribution.InvalidTotal")}
    </div>
  </div>`;

  return foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize(titleKey),
      width: 400,
      resizable: true
    },
    classes: ["trespasser", "dialog", "distribution-dialog-window"],
    content: html,
    render: (event, dialog) => {
      const el = dialog.element;
      const inputs = Array.from(el.querySelectorAll(".target-distrib-input"));
      const remainingEl = el.querySelector(".distrib-remaining");
      const warningEl = el.querySelector(".distrib-warning");
      const confirmBtn = el.querySelector('button[data-action="confirm"]');
      const resetBtn = el.querySelector(".distrib-reset-btn");

      const updateTotals = () => {
        let currentSum = 0;
        inputs.forEach(inp => {
          const val = parseInt(inp.value) || 0;
          currentSum += val;
        });

        const remaining = totalAmount - currentSum;
        if (remainingEl) {
          remainingEl.textContent = remaining;
          remainingEl.style.color = remaining < 0 ? "#ff5252" : (remaining === 0 ? "#2ecc71" : "#e8c96b");
        }

        const isInvalid = remaining < 0;
        if (warningEl) {
          warningEl.style.display = isInvalid ? "block" : "none";
        }
        if (confirmBtn) {
          confirmBtn.disabled = isInvalid;
        }
      };

      const setVal = (tokenId, delta) => {
        const inp = el.querySelector(`.target-distrib-input[data-token-id="${tokenId}"]`);
        const valSpan = el.querySelector(`.target-distrib-val[data-token-id="${tokenId}"]`);
        if (!inp || !valSpan) return;

        let current = parseInt(inp.value) || 0;
        let next = Math.max(0, current + delta);
        inp.value = next;
        valSpan.textContent = next;
        updateTotals();
      };

      el.querySelectorAll(".plus-btn").forEach(btn => {
        btn.addEventListener("click", () => setVal(btn.dataset.tokenId, 1));
      });

      el.querySelectorAll(".minus-btn").forEach(btn => {
        btn.addEventListener("click", () => setVal(btn.dataset.tokenId, -1));
      });

      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          inputs.forEach(inp => {
            inp.value = 0;
            const tokenId = inp.dataset.tokenId;
            const valSpan = el.querySelector(`.target-distrib-val[data-token-id="${tokenId}"]`);
            if (valSpan) valSpan.textContent = 0;
          });
          updateTotals();
        });
      }

      updateTotals();
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        icon: "fas fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form;
          const map = new Map();
          const inputs = form.querySelectorAll(".target-distrib-input");
          inputs.forEach(inp => {
            const tokenId = inp.dataset.tokenId;
            const val = Math.max(0, parseInt(inp.value) || 0);
            if (tokenId) map.set(tokenId, val);
          });
          return map;
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        icon: "fas fa-times",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });
}
