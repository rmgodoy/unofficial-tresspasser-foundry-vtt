import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";

/**
 * Roll a Haven attribute check.
 * @param {TrespasserHavenSheet} sheet
 * @param {Event} event
 * @param {HTMLElement} target
 */
export async function onRollAttribute(sheet, event, target) {
  const attrKey = target.dataset.attribute;
  const totals = sheet.document.system.totalAttributes;
  const attrVal = totals[attrKey] ?? 0;
  const label = game.i18n.localize(`TRESPASSER.Terms.HavenAttribute.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);
  
  const result = await TrespasserRollDialog.wait({
    dice: "1d20",
    showCD: true,
    cd: 10,
    bonuses: [
      { label, value: attrVal }
    ]
  }, { title: `${label} Check` });

  if (!result) return;

  const formula = `1d20 + ${attrVal} + ${result.modifier}`;
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const dc = result.cd ?? 10;
  const diff = roll.total - dc;
  const isHit = diff >= 0;
  const sparks = isHit ? Math.floor(diff / 5) : 0;
  const shadows = !isHit ? Math.floor(Math.abs(diff) / 5) : 0;
  const diceResult = roll.dice[0].results[0].result;

  const resultsHtml = `
    <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>VS CD ${dc}</strong>
        <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Common.Success") : game.i18n.localize("TRESPASSER.Chat.Common.Failure")}</span>
      </div>
      <div style="display:flex;gap:10px;font-size:var(--fs-11);">
        <span style="color:var(--trp-cyan);">${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</span>
        <span style="color:var(--trp-purple);">${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</span>
      </div>
    </div>
  `;

  const flavor = `
    <div class="trespasser-chat-card">
      <h3>${sheet.document.name}: ${label}</h3>
      <p><strong>${game.i18n.localize("TRESPASSER.Chat.Common.RollTotal")}</strong> ${roll.total} <span style="font-size:var(--fs-10);color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
      ${resultsHtml}
    </div>
  `;
  
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: sheet.document }),
    flavor
  });
}

/**
 * Roll a Haven skill check.
 * @param {TrespasserHavenSheet} sheet
 * @param {Event} event
 * @param {HTMLElement} target
 */
export async function onRollSkill(sheet, event, target) {
  const skillKey = target.dataset.skill;
  const trained = target.dataset.trained === "true";
  const actor = sheet.document;
  const system = actor.system;
  const totals = system.totalAttributes;
  const skillBonusValue = trained ? system.skillBonus : 0;
  const skillLabel = game.i18n.localize(`TRESPASSER.Terms.HavenSkill.${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`);

  const attributes = [
    { key: "military", label: game.i18n.localize("TRESPASSER.Terms.HavenAttribute.Military") },
    { key: "efficiency", label: game.i18n.localize("TRESPASSER.Terms.HavenAttribute.Efficiency") },
    { key: "resources", label: game.i18n.localize("TRESPASSER.Terms.HavenAttribute.Resources") },
    { key: "expertise", label: game.i18n.localize("TRESPASSER.Terms.HavenAttribute.Expertise") },
    { key: "allegiance", label: game.i18n.localize("TRESPASSER.Terms.HavenAttribute.Allegiance") },
    { key: "appeal", label: game.i18n.localize("TRESPASSER.Terms.HavenAttribute.Appeal") }
  ];

  const chosenAttr = await new Promise(resolve => {
    const dialog = new foundry.applications.api.DialogV2({
      window: { 
        title: game.i18n.format("TRESPASSER.Dialog.SkillCheck.Title", { skill: skillLabel }),
        classes: ["trespasser", "dialog", "haven-attr-picker"] 
      },
      content: `
        <div class="dialog-content">
          <p style="margin-bottom:12px;">
            ${game.i18n.localize("TRESPASSER.Dialog.SkillCheck.Prompt")}
            ${trained ? `<em>${game.i18n.format("TRESPASSER.Dialog.SkillCheck.BonusHint", { skill: system.skillBonus })}</em>` : ""}
          </p>
          <div class="trp-attr-pick">
            ${attributes.map(attr => `
              <button type="button" class="trp-attr-btn" data-action="${attr.key}">
                ${attr.label} (${totals[attr.key] ?? 0})
              </button>
            `).join("")}
          </div>
        </div>`,
      buttons: [{ action: "cancel", label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"), default: true }],
      actions: Object.fromEntries([
        ...attributes.map(attr => [attr.key, () => { resolve(attr.key); dialog.close(); }]),
        ["cancel", () => { resolve(null); dialog.close(); }]
      ])
    });
    dialog.render(true);
  });

  if ( !chosenAttr || chosenAttr === "cancel" ) return;

  const attrVal = totals[chosenAttr] ?? 0;
  const label = game.i18n.localize(`TRESPASSER.Terms.HavenAttribute.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
  
  const result = await TrespasserRollDialog.wait({
    dice: "1d20",
    showCD: true,
    cd: 10,
    bonuses: [
      { label: label, value: attrVal },
      { label: skillLabel, value: skillBonusValue }
    ]
  }, { title: `${skillLabel} Check` });

  if (!result) return;

  const formula = `1d20 + ${attrVal} + ${skillBonusValue} + ${result.modifier}`;
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const dc = result.cd ?? 10;
  const diff = roll.total - dc;
  const isHit = diff >= 0;
  const sparks = isHit ? Math.floor(diff / 5) : 0;
  const shadows = !isHit ? Math.floor(Math.abs(diff) / 5) : 0;
  const diceResult = roll.dice[0].results[0].result;

  const resultsHtml = `
    <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>VS CD ${dc}</strong>
        <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Common.Success") : game.i18n.localize("TRESPASSER.Chat.Common.Failure")}</span>
      </div>
      <div style="display:flex;gap:10px;font-size:var(--fs-11);">
        <span style="color:var(--trp-cyan);">${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</span>
        <span style="color:var(--trp-purple);">${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</span>
      </div>
    </div>
  `;

  const flavor = `
    <div class="trespasser-chat-card">
      <h3>${actor.name}: ${skillLabel} (${label})</h3>
      <p><strong>${game.i18n.localize("TRESPASSER.Chat.Common.RollTotal")}</strong> ${roll.total} <span style="font-size:var(--fs-10);color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
      ${resultsHtml}
    </div>
  `;
  
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });
}
