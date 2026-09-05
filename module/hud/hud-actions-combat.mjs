import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";
import { TrespasserRollDialog }    from "../dialogs/roll-dialog.mjs";
import { getCombatant }            from "./hud-context.mjs";

/**
 * Execute Defend action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeDefend(hud) {
  const type = hud.element.querySelector('[name="defend-type"]').value;
  const costInput = hud.element.querySelector('[name="defend-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const isBoth = cost === 2;
  const durationOptions = {
    durationOperator: "OR",
    durationConditions: [{ mode: "round", value: 1 }]
  };

  const targets = isBoth ? ["guard", "resist"] : [type];

  const effectDocs = targets.map(attr => {
    const label = game.i18n.localize(attr === "guard" ? "TRESPASSER.Sheet.Combat.Guard" : "TRESPASSER.Sheet.Combat.Resist");
    return {
      name: `${game.i18n.localize("TRESPASSER.HUD.Action.Defend")} (${label})`,
      type: "effect",
      img: "icons/magic/defensive/shield-barrier-blue.webp",
      system: {
        targetAttribute: attr,
        modifier: "+2",
        isCombat: true,
        isPrevailable: false,
        type: "on-trigger",
        when: "use",
        ...durationOptions,
      },
      flags: {
        trespasser: {
          isDefend: true
        }
      }
    };
  });

  await hud._token.actor.createEmbeddedDocuments("Item", effectDocs);
  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  await TrespasserCombat.recordHUDAction(hud._token.actor, "defend");

  const guardLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Guard");
  const resistLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Resist");
  const typeLabel = isBoth
    ? `${guardLabel} & ${resistLabel}`
    : game.i18n.localize(type === "guard" ? "TRESPASSER.Sheet.Combat.Guard" : "TRESPASSER.Sheet.Combat.Resist");
  
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.DefendMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.Defend"),
      type: typeLabel,
      cost: cost
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Help action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeHelp(hud) {
  const targetId = hud.element.querySelector('[name="help-target"]').value;
  const attr = hud.element.querySelector('[name="help-attr"]').value;
  const costInput = hud.element.querySelector('[name="help-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;

  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const targetToken = canvas.tokens.get(targetId);
  if (!targetToken) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const bonus = cost; 

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));

  const attrLabel = game.i18n.localize(`TRESPASSER.Sheet.Combat.${attr.charAt(0).toUpperCase() + attr.slice(1)}`) || attr;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: `
      <div class="trespasser-chat-card">
        <h3 style="margin:0;padding-bottom:4px;border-bottom:1px solid var(--trp-gold-dim);color:var(--trp-gold-bright);">
          ${game.i18n.localize("TRESPASSER.HUD.Action.Help")}
        </h3>
        <p><strong>${hud._token.name}</strong> gives <strong>Help</strong> to <strong>${targetToken.name}</strong>.</p>
        
        <a class="apply-effect-btn apply-help-btn" 
           data-target-uuid="${targetToken.actor.uuid}"
           data-target-attribute="${attr}"
           data-modifier="+${bonus}"
           data-source-name="${hud._token.name}"
           title="${game.i18n.localize("TRESPASSER.Chat.Common.Apply")}">
          <img src="systems/trespasser/assets/icons/effect.webp" style="width:32px;height:32px;border:none;margin-right:12px;" />
          <div style="flex:1;">
            <div style="color:var(--trp-gold-light);font-weight:bold;font-size:var(--fs-16);">+${bonus} ${attrLabel}</div>
            <div style="font-size:var(--fs-11);color:var(--trp-text-dim);line-height:1.2;">Duration: Next check this round</div>
          </div>
          <i class="fas fa-hand-holding-heart"></i>
        </a>

        <p style="font-size:var(--fs-10);margin-top:8px;text-align:right;color:var(--trp-text-dim);border-top:1px solid var(--trp-border);padding-top:4px;">
          AP Spent: ${cost}
        </p>
      </div>`
  });

  await TrespasserCombat.recordHUDAction(hud._token.actor, "help");

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Prevail action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executePrevail(hud) {
  const stateSelect = hud.element.querySelector('[name="prevail-state"]');
  const extraApSelect = hud.element.querySelector('[name="prevail-extra-ap"]');
  
  if (!stateSelect || !extraApSelect) return;

  const stateId = stateSelect.value;
  const stateItem = hud._token.actor.items.get(stateId);
  if (!stateItem) return;

  const extraAP = parseInt(extraApSelect.value) || 0;
  const totalCost = 1 + extraAP;

  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < totalCost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  let intensity = stateItem.system.intensity || 0;
  if (!stateItem.system.isLasting) {
    const matchingLasting = hud._token.actor.items.find(i => 
      i.type === "effect" && 
      i.system.isLasting && 
      i.name.toLowerCase() === stateItem.name.toLowerCase()
    );
    if (matchingLasting) {
      intensity += (matchingLasting.system.intensity || 0);
    }
  }
  const defaultCD = Math.min(20, 10 + intensity);
  const prevailStat = hud._token.actor.system.combat?.prevail || 0;
  const apBonus = extraAP * 2;

  const isAdv = TrespasserEffectsHelper.hasAdvantage(hud._token.actor, "prevail");
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: defaultCD,
    bonuses: [
      { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Prevail"), value: prevailStat },
      { label: game.i18n.localize("TRESPASSER.HUD.Resource.ExtraAP"), value: apBonus }
    ]
  }, { title: game.i18n.format("TRESPASSER.Chat.Check.PrevailCheck", { name: stateItem.name }) });

  if (!result) return;

  await hud._token.actor.rollPrevail(stateId, extraAP, {
    modifier: result.modifier,
    cd: result.cd
  });
  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - totalCost));

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Take Aim action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeTakeAim(hud) {
  const costInput = hud.element.querySelector('[name="take-aim-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (combatant && restrictAPF) {
    const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    if (currentAP < cost) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
      return;
    }
  }

  const rangeBonus = cost >= 2 ? 8 : 4;

  if (combatant) {
    const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
    await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
    await combatant.setFlag("trespasser", "aimRangeBonus", rangeBonus);
  }

  if (hud._token?.actor) {
    await hud._token.actor.setFlag("trespasser", "aimRangeBonus", rangeBonus);
    await TrespasserCombat.recordHUDAction(hud._token.actor, "take-aim");
  }

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.TakeAimMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.TakeAim"),
      cost: cost,
      bonus: rangeBonus
    })
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Throw action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeThrow(hud) {
  const costInput = hud.element.querySelector('[name="throw-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const actor = hud._token.actor;
  const baseAgility = actor.system.attributes?.agility ?? 0;
  const bonusAgility = TrespasserEffectsHelper.getAttributeBonus(actor, "agility");
  const agility = baseAgility + bonusAgility;
  const range = 5 + agility + (cost - 1) * 2;

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  await TrespasserCombat.recordHUDAction(actor, "throw");

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: game.i18n.format("TRESPASSER.Chat.Action.ThrowMessage", {
      name: hud._token.name,
      action: game.i18n.localize("TRESPASSER.HUD.Action.Throw"),
      cost: cost,
      range: range
    })
  });

  hud._activePanel = null;
  hud.render();
}
