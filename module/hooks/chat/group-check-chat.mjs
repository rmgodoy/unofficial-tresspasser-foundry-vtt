import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../../dialogs/roll-dialog.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../../dialogs/tempt-fate-dialogs.mjs";
import { TrespasserPartyHelper } from "../../helpers/party-helper.mjs";

/**
 * Prompt the current user to roll for any owned, unrolled actors in a pending group check.
 * @param {string} messageId - The chat message ID containing the group check flags.
 * @param {boolean} isAutoPrompt - Whether this is an automatic prompt on message creation.
 */
export async function promptGroupCheckRoll(messageId, isAutoPrompt = false) {
  const message = game.messages.get(messageId);
  if (!message) return;

  const flags = message.flags.trespasser?.groupCheck;
  if (!flags || flags.status === "completed") return;

  const { attribute, skill, dc, checkLabel, participants, results } = flags;

  // Find which participants the current user owns and hasn't rolled for
  const ownedUnrolledActors = participants.map(id => game.actors.get(id))
    .filter(actor => {
      if (!actor) return false;
      const hasRolled = results.some(r => r.actorId === actor.id);
      if (hasRolled) return false;
      
      if (game.user.isGM) {
        // Do not auto-prompt the GM
        if (isAutoPrompt) return false;
      } else {
        // Players only roll for actors they own
        if (!actor.isOwner) return false;
      }

      return true;
    });

  if (ownedUnrolledActors.length === 0) {
    if (!isAutoPrompt) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Party.NoPendingRolls") || "No pending rolls available for your owned characters.");
    }
    return;
  }

  // Roll for each owned actor
  for (const actor of ownedUnrolledActors) {
    const data = actor.system;
    const attrBase = data.attributes?.[attribute] ?? 0;
    const staticBonus = data.bonuses?.[attribute] ?? 0;
    
    const isTrained = skill && data.skills?.[skill] === true;
    const skillBonus = isTrained ? (data.skill ?? 0) : 0;
    
    const effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, attribute, "use");

    // Befuddled & Sickly checks
    let attrVal = attrBase;
    let attrBonus = staticBonus;
    let finalEffectBonus = effectBonus;
    let plightName = "";

    if ((attribute === "intellect" || attribute === "spirit") && actor.system.hasPlight?.("befuddled")) {
      plightName = "Befuddled";
    } else if ((attribute === "mighty" || attribute === "agility") && actor.system.hasPlight?.("sickly")) {
      plightName = "Sickly";
    }

    if (plightName) {
      attrVal = 0;
      attrBonus = 0;
      finalEffectBonus = 0;
      const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`);
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
    }
    
    const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, attribute);
    const diceFormula = isAdv ? "2d20kh" : "1d20";

    const rollData = {
      dice: diceFormula,
      bonuses: [
        { label: game.i18n.localize(`TRESPASSER.Terms.Attribute.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`), value: attrVal },
        { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: finalEffectBonus }
      ]
    };
    if (skillBonus > 0) rollData.bonuses.push({ label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: skillBonus });
    if (attrBonus !== 0) rollData.bonuses.push({ label: "Permanent Bonus", value: attrBonus });

    const result = await TrespasserRollDialog.wait({
      ...rollData,
      showCD: true,
      cd: dc,
      isNonCombat: false
    }, { title: `${actor.name}: ${checkLabel}` });

    if (!result) continue;

    let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
    if (attrBonus !== 0) formula += ` + ${attrBonus}`;
    if (finalEffectBonus !== 0) formula += ` + ${finalEffectBonus}`;
    if (skillBonus > 0) formula += ` + ${skillBonus}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const dieResult = roll.dice[0]?.results[0]?.result;
    const isNat20 = dieResult === 20;
    const isSuccess = roll.total >= dc || isNat20;

    const flavor = isAdv
      ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: checkLabel })
      : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: checkLabel });
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor: `${flavor}<p>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd: dc })}</p>`
    });

    await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: attribute });

    const resultObj = {
      actorId: actor.id,
      name: actor.name,
      total: roll.total,
      formula: roll.formula,
      success: isSuccess,
      isNat20,
      rollData: roll.toJSON()
    };

    const { TrespasserSocket } = game.trespasser || {};
    TrespasserSocket?.emit("GROUP_CHECK_SUBMIT_ROLL", { messageId: message.id, result: resultObj });
  }
}

/**
 * Bind group check button listeners in chat cards.
 */
export function bindGroupCheckChatListeners(message, htmlElement) {
  const rollBtn = htmlElement.querySelector(".group-check-roll-btn");
  if (rollBtn) {
    rollBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      await promptGroupCheckRoll(message.id);
    });
  }

  const forceRollBtn = htmlElement.querySelector(".group-check-force-roll-btn");
  if (forceRollBtn) {
    if (!game.user.isGM) {
      forceRollBtn.style.display = "none";
    } else {
      forceRollBtn.addEventListener("click", async (event) => {
        event.preventDefault();
      
        const flags = message.flags.trespasser?.groupCheck;
        if (!flags || flags.status === "completed") return;

        const { attribute, skill, dc, participants, results } = flags;
      
        const unrolledActors = participants.map(id => game.actors.get(id))
          .filter(actor => actor && !results.some(r => r.actorId === actor.id));

        if (unrolledActors.length === 0) {
          await game.trespasser.TrespasserPartyHelper.finalizeGroupCheck(message.id);
          return;
        }

        for (const actor of unrolledActors) {
          const data = actor.system;
          const attrBase = data.attributes?.[attribute] ?? 0;
          const staticBonus = data.bonuses?.[attribute] ?? 0;
          const isTrained = skill && data.skills?.[skill] === true;
          const skillBonus = isTrained ? (data.skill ?? 0) : 0;
          const effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, attribute, "use");
          const totalBonus = attrBase + staticBonus + skillBonus + effectBonus;
        
          const formula = `1d20 + ${totalBonus}`;
          const roll = new foundry.dice.Roll(formula);
          await roll.evaluate();

          const dieResult = roll.dice[0]?.results[0]?.result;
          const isNat20 = dieResult === 20;
          const isSuccess = roll.total >= dc || isNat20;

          const resultObj = {
            actorId: actor.id,
            name: actor.name,
            total: roll.total,
            formula: roll.formula,
            success: isSuccess,
            isNat20,
            rollData: roll.toJSON()
          };

          const { TrespasserSocket } = game.trespasser || {};
          TrespasserSocket?.emit("GROUP_CHECK_SUBMIT_ROLL", { messageId: message.id, result: resultObj });
        }
      });
    }
  }

  // Group Check Distribute Sparks button
  htmlElement.querySelectorAll(".distribute-group-sparks-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const sparkCount = parseInt(btn.dataset.sparkCount) || 1;
      
      const flags = message.flags.trespasser?.groupCheck;
      const results = flags?.results || [];
      const highestRoll = results.reduce((max, curr) => curr.total > max.total ? curr : max, results[0]);
      const actor = highestRoll ? game.actors.get(highestRoll.actorId) : null;

      if (actor && !actor.isOwner && !game.user.isGM) {
        ui.notifications.warn("Only the highest roller's owner can distribute sparks.");
        return;
      }

      const chosenSparks = await NonCombatSparkDialog.wait(sparkCount, { actor });
      if (!chosenSparks || chosenSparks.length === 0) return;

      const updatedContent = TrespasserPartyHelper.buildGroupCheckFinalHtml(
        flags.checkLabel, flags.dc, results, 
        flags.successes, flags.failures, flags.outcome,
        chosenSparks, flags.chosenShadows || []
      );

      const updates = {
        content: updatedContent,
        "flags.trespasser.groupCheck.chosenSparks": chosenSparks
      };

      if (game.user.isGM) {
        await message.update(updates);
      } else {
        const { TrespasserSocket } = game.trespasser || {};
        TrespasserSocket?.emit("UPDATE_CHAT_MESSAGE", { messageId: message.id, updates });
      }
    });
  });

  // Group Check Distribute Shadows button (GM only)
  htmlElement.querySelectorAll(".distribute-group-shadows-btn").forEach(btn => {
    if (!game.user.isGM) {
      btn.style.display = "none";
      return;
    }

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const shadowCount = parseInt(btn.dataset.shadowCount) || 1;
      const chosenShadows = await NonCombatShadowDialog.wait(shadowCount);
      if (!chosenShadows || chosenShadows.length === 0) return;

      const flags = message.flags.trespasser?.groupCheck;
      const results = flags?.results || [];

      const updatedContent = TrespasserPartyHelper.buildGroupCheckFinalHtml(
        flags.checkLabel, flags.dc, results,
        flags.successes, flags.failures, flags.outcome,
        flags.chosenSparks || [], chosenShadows
      );

      await message.update({
        content: updatedContent,
        "flags.trespasser.groupCheck.chosenShadows": chosenShadows
      });
    });
  });
}
