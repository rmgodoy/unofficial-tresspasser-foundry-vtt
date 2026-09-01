import { DeedBehaviorUtils } from "../helpers/deed-behaviors/deed-behavior-utils.mjs";

/**
 * ApplicationsV2 Caster Dialog for "Grant Recovery to Target".
 * Allows the caster to choose how many of their own skill dice to grant to each target individually.
 *
 * @param {object} params
 * @param {Actor} params.actor - The caster actor.
 * @param {number} params.intensity - Intensity limit per target.
 * @param {Array<Token|Actor>} params.targets - Targeted tokens or actors.
 * @param {Item} [params.item] - Deed item.
 * @returns {Promise<Map<string, { casterDice: number, target: Token|Actor }>|null>}
 */
export async function askGrantRecoveryCasterDialog({ actor, intensity = 1, targets = [], item = null }) {
  if (!targets || targets.length === 0) return new Map();

  const casterRD = actor?.system?.recovery_dice ?? 0;
  const casterSkillDie = actor?.system?.skill_die ?? "d6";
  const intVal = Math.max(1, parseInt(intensity) || 1);

  const targetList = targets.map(t => {
    const targetActor = t.actor || (t instanceof Actor ? t : null);
    const id = t.id || t.document?.id || foundry.utils.randomID();
    const name = DeedBehaviorUtils.getTokenDisplayName(t);
    const img = t.document?.texture?.src || targetActor?.img || "icons/svg/mystery-man.svg";
    const type = targetActor?.type || "creature";
    const isCharacter = type === "character";
    const targetRD = isCharacter ? (targetActor?.system?.recovery_dice ?? 0) : 0;
    const targetSkillDie = targetActor?.system?.skill_die ?? "d6";

    return {
      id,
      name,
      img,
      type,
      isCharacter,
      targetRD,
      targetSkillDie,
      target: t,
      targetActor
    };
  });

  const title = game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.CasterTitle") || "Grant Recovery";
  const intro = game.i18n.format("TRESPASSER.Dialog.GrantRecovery.CasterIntro", {
    intensity: intVal,
    casterRD,
    skillDie: casterSkillDie
  }) || `Recovery Intensity: <strong>${intVal}</strong>. Allocate your Recovery Dice (<strong>${casterRD}</strong> available, <strong>${casterSkillDie}</strong>) among targets:`;

  let targetsHtml = "";
  for (const item of targetList) {
    let typeBadge = "";
    if (item.isCharacter) {
      typeBadge = `<span style="font-size: var(--fs-10); color: var(--trp-spark, #4fc3f7); margin-left: 6px;">(${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.TypeCharacter") || "Character"} — ${item.targetRD} RD [${item.targetSkillDie}])</span>`;
    } else if (item.type === "companion") {
      typeBadge = `<span style="font-size: var(--fs-10); color: var(--trp-gold, #c9a84c); margin-left: 6px;">(${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.TypeCompanion") || "Companion"} — ${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.NoOwnRD") || "No RD"})</span>`;
    } else if (item.type === "commoner") {
      typeBadge = `<span style="font-size: var(--fs-10); color: var(--trp-text-dim, #a09070); margin-left: 6px;">(${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.TypeCommoner") || "Commoner"} — ${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.NoOwnRD") || "No RD"})</span>`;
    } else {
      typeBadge = `<span style="font-size: var(--fs-10); color: var(--trp-text-dim, #a09070); margin-left: 6px;">(${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.TypeCreature") || "Creature"} — ${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.NoOwnRD") || "No RD"})</span>`;
    }

    targetsHtml += `
      <div class="target-recovery-row" style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.25); padding: 8px 12px; border: 1px solid var(--trp-border-light, #5c4f3a); border-radius: 4px; width: 100%; box-sizing: border-box;">
        <div class="target-recovery-info" style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
          <img src="${item.img}" style="width:34px; height:34px; border-radius:3px; object-fit:cover; border:1px solid var(--trp-border, #4a3f2f); flex-shrink:0;"/>
          <div style="display:flex; flex-direction:column; overflow:hidden; flex:1; min-width:0;">
            <span style="font-size: var(--fs-13); font-weight:bold; color: var(--trp-gold-bright, #e8c96b); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
              ${item.name} ${typeBadge}
            </span>
            <span style="font-size: var(--fs-10); color: var(--trp-text-dim, #a09070); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">
              ${item.isCharacter ? (game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.CharacterHint") || "Can spend own RD up to remaining intensity.") : (game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.NonCharacterHint") || "Healed only by Caster's granted dice.")}
            </span>
          </div>
        </div>
        <div class="recovery-counter" style="display:flex; align-items:center; gap:6px; margin-left:auto; flex-shrink:0;">
          <button type="button" class="recovery-btn minus-btn" data-target-id="${item.id}" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background: var(--trp-bg-button, #3d3428); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius:3px; cursor:pointer;">
            <i class="fas fa-minus" style="font-size: var(--fs-11);"></i>
          </button>
          <span class="target-recovery-val" data-target-id="${item.id}" style="min-width:28px; text-align:center; font-size: var(--fs-14); font-weight:bold; color: var(--trp-text, #ddd0aa);">0</span>
          <input type="hidden" class="target-recovery-input" data-target-id="${item.id}" value="0" />
          <button type="button" class="recovery-btn plus-btn" data-target-id="${item.id}" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background: var(--trp-bg-button, #3d3428); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius:3px; cursor:pointer;">
            <i class="fas fa-plus" style="font-size: var(--fs-11);"></i>
          </button>
        </div>
      </div>
    `;
  }

  const html = `
    <div class="trespasser-dialog grant-recovery-dialog" style="max-height:65vh; overflow-y:auto; padding: 4px; width: 100%; box-sizing: border-box;">
      <p style="margin-bottom: 12px; font-size: var(--fs-13); color: var(--trp-text, #ddd0aa);">
        ${intro}
      </p>
      <div class="recovery-targets-list" style="display:flex; flex-direction:column; gap:8px; width: 100%; box-sizing: border-box;">
        ${targetsHtml}
      </div>
      <div class="recovery-summary" style="margin-top: 14px; padding-top: 8px; border-top: 1px dashed var(--trp-border, #4a3f2f); display:flex; justify-content:space-between; align-items:center; font-size: var(--fs-12);">
        <button type="button" class="recovery-reset-btn" style="background: rgba(146, 44, 44, 0.35); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius: 4px; padding: 4px 8px; font-size: var(--fs-11); cursor: pointer; display:flex; align-items:center; gap:4px;">
          <i class="fas fa-undo"></i> ${game.i18n.localize("TRESPASSER.Dialog.Distribution.ResetAll") || "Reset"}
        </button>
        <div>
          <span style="color: var(--trp-text-dim, #a09070);">${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.RemainingCasterRD") || "Remaining Caster RD"}:</span>
          <strong class="recovery-remaining" style="color: #e8c96b; font-size: var(--fs-14); margin-left: 4px;">${casterRD}</strong>
        </div>
      </div>
      <div class="recovery-warning" style="display:none; color: #ff5252; font-size: var(--fs-11); font-weight: bold; margin-top: 4px; text-align: right;">
        ${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.InvalidCasterTotal") || "Allocated dice exceed available Recovery Dice!"}
      </div>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    window: {
      title,
      width: 440,
      resizable: true
    },
    classes: ["trespasser", "dialog", "grant-recovery-dialog-window"],
    content: html,
    render: (event, dialog) => {
      const el = dialog.element;
      const inputs = Array.from(el.querySelectorAll(".target-recovery-input"));
      const remainingEl = el.querySelector(".recovery-remaining");
      const warningEl = el.querySelector(".recovery-warning");
      const confirmBtn = el.querySelector('button[data-action="confirm"]');
      const resetBtn = el.querySelector(".recovery-reset-btn");

      const updateTotals = () => {
        let currentSum = 0;
        inputs.forEach(inp => {
          const val = parseInt(inp.value) || 0;
          currentSum += val;
        });

        const remaining = casterRD - currentSum;
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

      const setVal = (targetId, delta) => {
        const inp = el.querySelector(`.target-recovery-input[data-target-id="${targetId}"]`);
        const valSpan = el.querySelector(`.target-recovery-val[data-target-id="${targetId}"]`);
        if (!inp || !valSpan) return;

        let current = parseInt(inp.value) || 0;
        let next = Math.max(0, current + delta);
        if (next > intVal) next = intVal;

        inp.value = next;
        valSpan.textContent = next;
        updateTotals();
      };

      el.querySelectorAll(".plus-btn").forEach(btn => {
        btn.addEventListener("click", () => setVal(btn.dataset.targetId, 1));
      });

      el.querySelectorAll(".minus-btn").forEach(btn => {
        btn.addEventListener("click", () => setVal(btn.dataset.targetId, -1));
      });

      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          inputs.forEach(inp => {
            inp.value = 0;
            const targetId = inp.dataset.targetId;
            const valSpan = el.querySelector(`.target-recovery-val[data-target-id="${targetId}"]`);
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
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm") || "Confirm",
        icon: "fas fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form;
          const map = new Map();
          const inputs = form.querySelectorAll(".target-recovery-input");
          inputs.forEach(inp => {
            const targetId = inp.dataset.targetId;
            const val = Math.max(0, parseInt(inp.value) || 0);
            const foundItem = targetList.find(t => t.id === targetId);
            if (targetId && foundItem) {
              map.set(targetId, {
                casterDice: val,
                target: foundItem.target,
                targetActor: foundItem.targetActor
              });
            }
          });
          return map;
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") || "Cancel",
        icon: "fas fa-times",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });
}

/**
 * ApplicationsV2 Target Dialog for "Grant Recovery to Target".
 * Allows the receiving Character to choose how many of their own recovery dice to spend.
 *
 * @param {object} params
 * @param {Actor} params.targetActor - Receiving character actor.
 * @param {Actor} [params.casterActor] - Granting caster actor.
 * @param {number} params.intensity - Total intensity limit.
 * @param {number} params.casterDice - Dice granted by caster.
 * @param {number} params.maxSpendable - Maximum dice target can spend.
 * @returns {Promise<number>}
 */
export async function askGrantRecoveryTargetDialog({ targetActor, casterActor, intensity = 1, casterDice = 0, maxSpendable = 0 }) {
  if (maxSpendable <= 0) return 0;

  const targetRD = targetActor.system?.recovery_dice ?? 0;
  const targetSkillDie = targetActor.system?.skill_die ?? "d6";
  const casterSkillDie = casterActor?.system?.skill_die ?? "d6";
  const casterName = casterActor?.name || game.i18n.localize("TRESPASSER.Sheet.Common.Caster") || "Caster";

  const title = game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.TargetTitle") || "Accept Recovery";
  const promptText = game.i18n.format("TRESPASSER.Dialog.GrantRecovery.TargetPrompt", {
    caster: casterName,
    casterDice,
    casterDie: casterSkillDie,
    intensity,
    maxSpendable,
    targetRD,
    targetDie: targetSkillDie
  }) || `<strong>${casterName}</strong> is granting Recovery ${intensity} and contributes <strong>${casterDice}${casterSkillDie}</strong>.<br>How many of your own Recovery Dice (<strong>${targetRD}</strong> available, <strong>${targetSkillDie}</strong>) would you like to spend? (Max ${maxSpendable}):`;

  const html = `
    <div class="trespasser-dialog grant-recovery-target-dialog" style="padding: 4px; width: 100%; box-sizing: border-box;">
      <p style="margin-bottom: 12px; font-size: var(--fs-13); color: var(--trp-text, #ddd0aa);">
        ${promptText}
      </p>
      <div class="target-recovery-row" style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.25); padding: 8px 12px; border: 1px solid var(--trp-border-light, #5c4f3a); border-radius: 4px; width: 100%; box-sizing: border-box;">
        <label style="font-size: var(--fs-13); font-weight:bold; color: var(--trp-gold-bright, #e8c96b); flex:1; margin:0;">
          ${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.SpendOwnDice") || "Spend Own Recovery Dice"}:
        </label>
        <div class="recovery-counter" style="display:flex; align-items:center; gap:6px; margin-left:auto; flex-shrink:0;">
          <button type="button" class="recovery-btn minus-btn" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background: var(--trp-bg-button, #3d3428); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius:3px; cursor:pointer;">
            <i class="fas fa-minus" style="font-size: var(--fs-11);"></i>
          </button>
          <span class="target-spend-val" style="min-width:28px; text-align:center; font-size: var(--fs-14); font-weight:bold; color: var(--trp-text, #ddd0aa);">0</span>
          <input type="hidden" class="target-spend-input" value="0" />
          <button type="button" class="recovery-btn plus-btn" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background: var(--trp-bg-button, #3d3428); border: 1px solid var(--trp-border, #4a3f2f); color: var(--trp-gold-bright, #e8c96b); border-radius:3px; cursor:pointer;">
            <i class="fas fa-plus" style="font-size: var(--fs-11);"></i>
          </button>
        </div>
      </div>
      <div style="margin-top: 8px; font-size: var(--fs-11); color: var(--trp-text-dim, #a09070); text-align: right;">
        ${game.i18n.localize("TRESPASSER.Dialog.GrantRecovery.CombinedTotal") || "Total dice to roll"}: <strong class="combined-total-label" style="color: var(--trp-gold-bright, #e8c96b);">${casterDice}</strong> / ${intensity}
      </div>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    window: {
      title,
      width: 400,
      resizable: true
    },
    classes: ["trespasser", "dialog", "grant-recovery-target-window"],
    content: html,
    render: (event, dialog) => {
      const el = dialog.element;
      const inp = el.querySelector(".target-spend-input");
      const valSpan = el.querySelector(".target-spend-val");
      const combinedLabel = el.querySelector(".combined-total-label");

      const updateVal = (delta) => {
        let current = parseInt(inp.value) || 0;
        let next = Math.max(0, current + delta);
        if (next > maxSpendable) next = maxSpendable;
        inp.value = next;
        valSpan.textContent = next;
        if (combinedLabel) {
          combinedLabel.textContent = casterDice + next;
        }
      };

      el.querySelector(".plus-btn")?.addEventListener("click", () => updateVal(1));
      el.querySelector(".minus-btn")?.addEventListener("click", () => updateVal(-1));
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm") || "Confirm",
        icon: "fas fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form;
          const inp = form.querySelector(".target-spend-input");
          return Math.max(0, Math.min(maxSpendable, parseInt(inp?.value) || 0));
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") || "Cancel",
        icon: "fas fa-times",
        callback: () => 0
      }
    ],
    rejectClose: false,
    close: () => 0
  });
}
