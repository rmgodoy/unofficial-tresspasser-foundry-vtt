import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";
import { TrespasserRollDialog }    from "../dialogs/roll-dialog.mjs";
import { getCombatant }            from "./hud-context.mjs";

/**
 * Execute Defend action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executeDefend(hud) {
  if (TrespasserEffectsHelper.hasActorFlagOrEffect(hud._token?.actor, "cannotAct")) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", { name: hud._token?.actor?.name || hud._token?.name }));
    return;
  }
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
    duration: "round",
    durationValue: 1,
    durationOperator: "OR",
    durationConditions: [{ mode: "round", value: 1 }]
  };

  const guardLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Guard");
  const resistLabel = game.i18n.localize("TRESPASSER.Sheet.Combat.Resist");

  let effectDoc = null;

  if (isBoth) {
    effectDoc = {
      name: `${game.i18n.localize("TRESPASSER.HUD.Action.Defend")} (${guardLabel} & ${resistLabel})`,
      type: "effect",
      img: "icons/magic/defensive/shield-barrier-blue.webp",
      system: {
        isCombat: true,
        isPrevailable: false,
        type: "on-trigger",
        when: "use",
        behaviors: [
          {
            id: "defend-guard",
            label: `Defend (${guardLabel} +2)`,
            trigger: "use",
            action: "modify_attribute",
            actionTarget: "self",
            params: {
              attribute: "guard",
              modifier: "+2",
              applyMode: "delta"
            }
          },
          {
            id: "defend-resist",
            label: `Defend (${resistLabel} +2)`,
            trigger: "use",
            action: "modify_attribute",
            actionTarget: "self",
            params: {
              attribute: "resist",
              modifier: "+2",
              applyMode: "delta"
            }
          }
        ],
        ...durationOptions
      },
      flags: {
        trespasser: {
          isDefend: true
        }
      }
    };
  } else {
    const label = type === "guard" ? guardLabel : resistLabel;
    effectDoc = {
      name: `${game.i18n.localize("TRESPASSER.HUD.Action.Defend")} (${label})`,
      type: "effect",
      img: "icons/magic/defensive/shield-barrier-blue.webp",
      system: {
        targetAttribute: type,
        modifier: "+2",
        isCombat: true,
        isPrevailable: false,
        type: "on-trigger",
        when: "use",
        behaviors: [
          {
            id: `defend-${type}`,
            label: `Defend (${label} +2)`,
            trigger: "use",
            action: "modify_attribute",
            actionTarget: "self",
            params: {
              attribute: type,
              modifier: "+2",
              applyMode: "delta"
            }
          }
        ],
        ...durationOptions
      },
      flags: {
        trespasser: {
          isDefend: true
        }
      }
    };
  }

  await hud._token.actor.createEmbeddedDocuments("Item", [effectDoc]);
  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  await TrespasserCombat.recordHUDAction(hud._token.actor, "defend");

  const typeLabel = isBoth
    ? `${guardLabel} & ${resistLabel}`
    : (type === "guard" ? guardLabel : resistLabel);
  
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
  if (TrespasserEffectsHelper.hasActorFlagOrEffect(hud._token?.actor, "cannotAct")) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", { name: hud._token?.actor?.name || hud._token?.name }));
    return;
  }
  const targetId = hud.element.querySelector('[name="help-target"]')?.value;
  const attr = hud.element.querySelector('[name="help-attr"]')?.value;
  const costInput = hud.element.querySelector('[name="help-cost"]');
  const cost = costInput ? parseInt(costInput.value) : 1;

  const combatant = getCombatant(hud._token);
  if (!combatant) return;

  const targetToken = canvas.tokens.get(targetId);
  const targetActor = targetToken?.actor;
  if (!targetActor) return;

  const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  
  if (restrictAPF && currentAP < cost) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
    return;
  }

  const bonus = cost; 

  const attrLabel = game.i18n.localize(`TRESPASSER.Sheet.Combat.${attr.charAt(0).toUpperCase() + attr.slice(1)}`) || attr;
  const effectData = {
    name: `${game.i18n.localize("TRESPASSER.HUD.Action.Help")} (${attrLabel})`,
    type: "effect",
    img: "systems/trespasser/assets/icons/effect.webp",
    system: {
      targetAttribute: attr,
      modifier: `+${bonus}`,
      isCombat: true,
      isPrevailable: false,
      type: "on-trigger",
      duration: "trigger",
      durationValue: 1,
      durationOperator: "OR",
      durationConditions: [
        { mode: "trigger", value: 1 },
        { mode: "round", value: 1 }
      ],
      when: "use"
    },
    flags: {
      trespasser: {
        isHelp: true,
        helperName: hud._token.name
      }
    }
  };

  if (targetActor.isOwner) {
    await targetActor.createEmbeddedDocuments("Item", [effectData]);
  } else if (game.users.some(u => u.active && u.isGM)) {
    const { emitDeedActionAndWait } = await import("../helpers/socket/deed-socket-handler.mjs");
    await emitDeedActionAndWait("applyEffects", {
      actorId: targetActor.id,
      tokenId: targetToken.id,
      itemDataArray: [effectData]
    });
  } else {
    try {
      await targetActor.createEmbeddedDocuments("Item", [effectData]);
    } catch (err) {
      console.warn("Trespasser | Failed to apply Help effect directly without GM:", err);
    }
  }

  await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
  await TrespasserCombat.recordHUDAction(hud._token.actor, "help");
  ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Action.AppliedHelp", { target: targetToken.name }));

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: hud._token }),
    content: `
      <div class="trespasser-chat-card">
        <h3 style="margin:0;padding-bottom:4px;border-bottom:1px solid var(--trp-gold-dim);color:var(--trp-gold-bright);">
          ${game.i18n.localize("TRESPASSER.HUD.Action.Help")}
        </h3>
        <p>${game.i18n.format("TRESPASSER.Chat.Action.HelpMessage", { helper: hud._token.name, target: targetToken.name })}</p>
        
        <div class="help-effect-display" style="display:flex;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid var(--trp-gold-dim);border-radius:var(--trp-radius, 4px);margin:8px 0;">
          <img src="systems/trespasser/assets/icons/effect.webp" style="width:32px;height:32px;border:none;margin-right:12px;" />
          <div style="flex:1;">
            <div style="color:var(--trp-gold-light);font-weight:bold;font-size:var(--fs-16);">+${bonus} ${attrLabel}</div>
            <div style="font-size:var(--fs-11);color:var(--trp-text-dim);line-height:1.2;">${game.i18n.localize("TRESPASSER.Chat.Action.HelpDurationDesc")}</div>
          </div>
          <i class="fas fa-hand-holding-heart" style="color:var(--trp-gold-bright);font-size:var(--fs-16);"></i>
        </div>

        <p style="font-size:var(--fs-10);margin-top:8px;text-align:right;color:var(--trp-text-dim);border-top:1px solid var(--trp-border);padding-top:4px;">
          ${game.i18n.format("TRESPASSER.Chat.Action.APSpent", { cost })}
        </p>
      </div>`
  });

  hud._activePanel = null;
  hud.render();
}

/**
 * Execute Prevail action.
 * @param {TrespasserTokenHUD} hud
 */
export async function executePrevail(hud) {
  if (TrespasserEffectsHelper.hasActorFlagOrEffect(hud._token?.actor, "cannotAct")) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", { name: hud._token?.actor?.name || hud._token?.name }));
    return;
  }
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
  const effectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(hud._token.actor, "prevail", "use");
  const prevailStat = (hud._token.actor.system.combat?.prevail || 0) - (effectBonusEntry.value || 0);
  const apBonus = extraAP * 2;

  const isAdv = TrespasserEffectsHelper.hasAdvantage(hud._token.actor, "prevail");
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    showCD: true,
    cd: defaultCD,
    bonuses: [
      { key: "basePrevail", label: game.i18n.localize("TRESPASSER.Sheet.Combat.Prevail"), value: prevailStat, toggleable: true },
      { key: "apBonus", label: game.i18n.localize("TRESPASSER.HUD.Resource.ExtraAP"), value: apBonus, toggleable: true },
      effectBonusEntry
    ]
  }, { title: game.i18n.format("TRESPASSER.Chat.Check.PrevailCheck", { name: stateItem.name }) });

  if (!result) return;

  await hud._token.actor.rollPrevail(stateId, extraAP, {
    totalBonus: result.totalBonus,
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
  if (TrespasserEffectsHelper.hasActorFlagOrEffect(hud._token?.actor, "cannotAct")) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", { name: hud._token?.actor?.name || hud._token?.name }));
    return;
  }
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
  if (TrespasserEffectsHelper.hasActorFlagOrEffect(hud._token?.actor, "cannotAct")) {
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.CannotAct", { name: hud._token?.actor?.name || hud._token?.name }));
    return;
  }
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
