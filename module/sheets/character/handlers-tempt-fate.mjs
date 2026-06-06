import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserRollDialog }    from "../../dialogs/roll-dialog.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../../dialogs/tempt-fate-dialogs.mjs";
import { evaluateAndShowRoll } from "./handlers-rolls.mjs";

export async function promptAttributeSelection(actor, skillKey) {
  const attr = actor.system.attributes;
  const bonuses = actor.system.bonuses;
  const skill = actor.system.skill || 0;
  const label = skillKey.charAt(0).toUpperCase() + skillKey.slice(1);
  const isTrained = actor.system.skills?.[skillKey] === true;
  const skillBonus = isTrained ? skill : 0;

  const formatAttrBtn = (key, lbl) => {
    let base = attr[key] ?? 0;
    let bon = bonuses[key] ?? 0;
    let eff = TrespasserEffectsHelper.getAttributeBonus(actor, key, "use");

    let isSuppressed = false;
    if ((key === "intellect" || key === "spirit") && actor.system.hasPlight?.("befuddled")) {
      isSuppressed = true;
    } else if ((key === "mighty" || key === "agility") && actor.system.hasPlight?.("sickly")) {
      isSuppressed = true;
    }

    if (isSuppressed) {
      base = 0;
      bon = 0;
      eff = 0;
    }

    const total = base + bon + eff;
    return `<button class="trp-attr-btn" data-attr="${key}" style="width:100%;padding:8px;background:var(--trp-bg-panel);border:1px solid var(--trp-border);border-radius:4px;color:var(--trp-gold);cursor:pointer;font-family:var(--trp-font-header);font-weight:bold;transition:all 0.15s;text-align:center;">${lbl} (${total})</button>`;
  };

  return new Promise((resolve) => {
    let resolved = false;

    foundry.applications.api.DialogV2.wait({
      window: {
        title: `Tempt Fate: Choose Attribute`,
        width: 400
      },
      classes: ["trespasser", "dialog"],
      content: `
        <div class="dialog-content" style="display:flex;flex-direction:column;gap:12px;padding:12px;">
          <p style="font-size:var(--fs-12);color:var(--trp-text-dim);margin:0 0 4px;">
            Choose an attribute to roll with your ${label} check.
          </p>
          <div class="trp-attr-pick" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${formatAttrBtn("mighty", game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty"))}
            ${formatAttrBtn("agility", game.i18n.localize("TRESPASSER.Terms.Attribute.Agility"))}
            ${formatAttrBtn("intellect", game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect"))}
            ${formatAttrBtn("spirit", game.i18n.localize("TRESPASSER.Terms.Attribute.Spirit"))}
          </div>
        </div>`,
      buttons: [
        {
          action: "cancel",
          label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
          callback: () => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }
        }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        // Style cancel button
        const cancelBtn = el.querySelector('button[data-action="cancel"]');
        if (cancelBtn) {
          cancelBtn.style.flex = "1";
          cancelBtn.style.background = "transparent";
          cancelBtn.style.color = "var(--trp-text-dim)";
          cancelBtn.style.border = "1px solid var(--trp-border)";
          cancelBtn.style.padding = "8px";
          cancelBtn.style.borderRadius = "4px";
          cancelBtn.style.cursor = "pointer";
        }

        el.querySelectorAll(".trp-attr-btn").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            if (resolved) return;
            resolved = true;
            const chosenAttr = ev.currentTarget.dataset.attr;
            dialog.close();
            resolve(chosenAttr);
          });
        });
      },
      rejectClose: false
    }).then(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

export async function executeTemptFateFlow(actor, skillKey, cd, originalMsgId) {
  // 1. Choose Shadow using the generic NonCombatShadowDialog with generic labels
  const chosenTemptShadows = await NonCombatShadowDialog.wait(1, {
    singleSelect: true,
    title: game.i18n.localize("TRESPASSER.Dialog.ChooseShadow") || "Choose Shadow",
    promptText: "Choose a shadow to add to your attempt. The shadow is applied to your result even on a success."
  });
  if (!chosenTemptShadows || chosenTemptShadows.length === 0) return;
  const chosenTemptShadow = chosenTemptShadows[0];

  // 2. Choose Attribute
  const chosenAttr = await promptAttributeSelection(actor, skillKey);
  if (!chosenAttr) return;

  // 3. Roll Modifier Dialog
  const skillLabel = skillKey.charAt(0).toUpperCase() + skillKey.slice(1);
  const isTrained = actor.system.skills?.[skillKey] === true;
  const skillBonus = isTrained ? (actor.system.skill || 0) : 0;
  const attrVal = actor.system.attributes?.[chosenAttr] ?? 0;

  // Suppressions (Befuddled / Sickly)
  let isSuppressed = false;
  if ((chosenAttr === "intellect" || chosenAttr === "spirit") && actor.system.hasPlight?.("befuddled")) {
    isSuppressed = true;
  } else if ((chosenAttr === "mighty" || chosenAttr === "agility") && actor.system.hasPlight?.("sickly")) {
    isSuppressed = true;
  }

  let finalAttrVal = attrVal;
  let finalSkillBonus = skillBonus;
  let attrBonus = actor.system.bonuses?.[chosenAttr] ?? 0;
  let effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, chosenAttr, "use");

  if (isSuppressed) {
    finalAttrVal = 0;
    attrBonus = 0;
    effectBonus = 0;
    const plightName = (chosenAttr === "intellect" || chosenAttr === "spirit") ? "Befuddled" : "Sickly";
    const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.capitalize()}`);
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, chosenAttr);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const rollData = {
    dice: diceFormula,
    bonuses: [
      { label: game.i18n.localize(`TRESPASSER.Terms.Attribute.${chosenAttr.capitalize()}`), value: finalAttrVal },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: finalSkillBonus },
      { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
    ],
    showCD: true,
    cd: cd
  };
  if (attrBonus !== 0) {
    rollData.bonuses.push({ label: "Permanent Bonus", value: attrBonus });
  }

  const result = await TrespasserRollDialog.wait(rollData, { title: `Tempt Fate: ${skillLabel} Check` });
  if (!result) return;

  // 4. Perform Roll
  let formula = `${diceFormula} + ${finalAttrVal} + ${result.modifier}`;
  if (attrBonus !== 0) formula += ` + ${attrBonus}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (finalSkillBonus > 0) formula += ` + ${finalSkillBonus}`;

  const roll = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: skillLabel }) + ` (${chosenAttr})`
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck",    { name: actor.name, skill: skillLabel }) + ` (${chosenAttr})`;

  // We evaluate and show the roll passing options: isNonCombat: true, isTemptFate: true, and temptShadow!
  await evaluateAndShowRoll(roll, flavor, cd, { actor }, {
    isNonCombat: true,
    isTemptFate: true,
    temptShadow: chosenTemptShadow,
    skillKey
  });

  // 5. Update the original chat message to remove the Tempt Fate button
  const originalMsg = game.messages.get(originalMsgId);
  if (originalMsg) {
    if (originalMsg.isOwner) {
      const originalFlags = foundry.utils.deepClone(originalMsg.flags.trespasser || {});
      originalFlags.hasTemptedFate = true;

      const parser = new DOMParser();
      const doc = parser.parseFromString(originalMsg.content, "text/html");
      const container = doc.querySelector(".tempt-fate-container");
      container?.remove();

      await originalMsg.update({
        content: doc.body.innerHTML,
        "flags.trespasser": originalFlags
      });
    } else {
      const { TrespasserSocket } = game.trespasser || {};
      TrespasserSocket?.emit("REMOVE_TEMPT_FATE_BUTTON", { messageId: originalMsgId });
    }
  }
}

export async function handleRemoveTemptFateButton(data) {
  if (!game.user.isGM) return;
  const { messageId } = data;
  const originalMsg = game.messages.get(messageId);
  if (originalMsg) {
    const originalFlags = foundry.utils.deepClone(originalMsg.flags.trespasser || {});
    originalFlags.hasTemptedFate = true;

    const parser = new DOMParser();
    const doc = parser.parseFromString(originalMsg.content, "text/html");
    const container = doc.querySelector(".tempt-fate-container");
    container?.remove();

    await originalMsg.update({
      content: doc.body.innerHTML,
      "flags.trespasser": originalFlags
    });
  }
}
