import { TrespasserActor } from "../../documents/actor.mjs";
import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { buildTenacityButtonHtml } from "../../helpers/tenacity-helper.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../../dialogs/tempt-fate-dialogs.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * Resolve which tokens a chat-card action button should affect.
 * @param {HTMLElement} btn
 * @returns {Array<Token>}
 */
export function resolveCardTargets(btn) {
  const ids = (btn.dataset.targetIds ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length) {
    const tokens = ids.map(id => canvas.tokens.get(id)).filter(Boolean);
    if (!tokens.length) ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.RecordedTargetsGone"));
    return tokens;
  }
  const isCommandCard = btn.closest(".damage-roll-card") !== null;
  const controlled = canvas.tokens.controlled;
  const targeted = Array.from(game.user.targets);

  if (isCommandCard) {
    if (controlled.length) return controlled;
    if (targeted.length) return targeted;
  } else {
    if (targeted.length) return targeted;
    if (controlled.length) return controlled;
  }

  ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoTargets"));
  return [];
}

/**
 * Bind damage, healing, effect, sparks, shadows, and tempt fate listeners on chat messages.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function bindCardActionListeners(message, html) {
  // Apply Effect button
  html.querySelectorAll(".apply-effect-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const uuid = btn.dataset.uuid;
      const itemIntensity = parseInt(btn.dataset.intensity);
      if (!uuid) return;

      const sourceItem = await resolveItem({ uuid, name: btn.dataset.name }, { type: "effect" });
      if (!sourceItem) return;

      const baseIntensity = !isNaN(itemIntensity) ? itemIntensity : (sourceItem.system.intensity || 0);

      const tokens = resolveCardTargets(btn);
      if (tokens.length === 0) return;

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const itemData = sourceItem.toObject();
        itemData.system.intensity = baseIntensity;
        delete itemData._id;

        await foundry.documents.BaseItem.create(itemData, { parent: actor });
        ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Effect.Applied", { effect: sourceItem.name, target: actor.name }));
      }
    });
  });

  // Apply Help button
  html.querySelectorAll(".apply-help-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const targetUuid = btn.dataset.targetUuid;
      const attr = btn.dataset.targetAttribute;
      const mod = btn.dataset.modifier;
      const sourceName = btn.dataset.sourceName;

      const doc = await fromUuid(targetUuid);
      const targetActor = doc?.actor || doc;
      if (!targetActor) return;

      const effectData = {
        name: game.i18n.format("TRESPASSER.Chat.Action.HelpFrom", { name: targetActor.name, helper: sourceName }),
        type: "effect",
        img: "system/trespasser/assets/icons/effect.webp",
        system: {
          targetAttribute: attr,
          modifier: mod,
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
        }
      };

      await targetActor.createEmbeddedDocuments("Item", [effectData]);
      ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Action.AppliedHelp", { target: targetActor.name }));
    });
  });

  // Apply Damage button
  html.querySelectorAll(".apply-damage-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rawDamage = parseInt(btn.dataset.damage);
      if (isNaN(rawDamage)) return;

      const tokens = resolveCardTargets(btn);
      if (tokens.length === 0) return;

      const messageId = btn.closest(".message")?.dataset.messageId;
      const msg = game.messages.get(messageId);
      const attackerSpeaker = msg?.speaker;
      const attacker = attackerSpeaker?.actor ? game.actors.get(attackerSpeaker.actor) : null;

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const reduction = await TrespasserEffectsHelper.evaluateDamageBonus(actor, "damage_received");
        const finalDamage = Math.max(0, rawDamage + reduction);

        const currentHP = actor.system.health ?? 0;
        const rawNewHP = currentHP - finalDamage;
        const newHP = Math.max(0, rawNewHP);
        await actor.update({ "system.health": newHP }, { skipBelowZeroChat: true });

        await TrespasserEffectsHelper.triggerEffects(actor, "damage-received");

        if (attacker) {
          await TrespasserEffectsHelper.triggerEffects(attacker, "damage-dealt");
        }

        let chatMsg = reduction !== 0
          ? game.i18n.format("TRESPASSER.Chat.Combat.TookDamageReduction", { name: actor.name, total: finalDamage, reduced: Math.abs(reduction) })
          : game.i18n.format("TRESPASSER.Chat.Combat.TookDamage", { name: actor.name, total: finalDamage });

        let buttonHtml = "";
        if (actor.type === "character" && rawNewHP < 0) {
          const belowZeroMsg = game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", { name: actor.name, hp: rawNewHP });
          chatMsg += `<p class="miss-text">${belowZeroMsg}</p>`;
          buttonHtml = buildTenacityButtonHtml(actor, rawNewHP);
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trespasser-chat-card"><p>${chatMsg}</p>${buttonHtml}</div>`
        });
      }
    });
  });

  // Heal Damage button
  html.querySelectorAll(".heal-damage-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rawHeal = parseInt(btn.dataset.damage);
      if (isNaN(rawHeal)) return;

      const tokens = resolveCardTargets(btn);
      if (tokens.length === 0) return;

      const messageId = btn.closest(".message")?.dataset.messageId;
      const msg = game.messages.get(messageId);
      const healerSpeaker = msg?.speaker;
      const healer = healerSpeaker?.actor ? game.actors.get(healerSpeaker.actor) : null;

      const healGivenBonus = healer ? await TrespasserEffectsHelper.evaluateDamageBonus(healer, "heal_given", "d4", { toMessage: false }) : 0;

      for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        const healReceivedBonus = await TrespasserEffectsHelper.evaluateDamageBonus(actor, "heal_received", "d4", { toMessage: false });
        const totalBonus = healGivenBonus + healReceivedBonus;
        const finalHeal = Math.max(0, rawHeal + totalBonus);

        if (typeof actor.applyHealing === "function") {
          await actor.applyHealing(finalHeal, { sourceActor: healer });
        } else {
          const newHP = Math.min(actor.system.max_health ?? actor.system.health, (actor.system.health ?? 0) + finalHeal);
          await actor.update({ "system.health": newHP });
          await TrespasserEffectsHelper.triggerEffects(actor, "heal-received");
          if (healer) {
            await TrespasserEffectsHelper.triggerEffects(healer, "heal-given");
          }
        }

        const chatMsg = totalBonus !== 0
          ? game.i18n.format("TRESPASSER.Chat.Combat.HealedAmountBonus", { name: actor.name, total: finalHeal, bonus: totalBonus })
          : game.i18n.format("TRESPASSER.Chat.Combat.HealedAmount", { name: actor.name, amount: finalHeal });

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trespasser-chat-card"><p>${chatMsg}</p></div>`
        });
      }
    });
  });

  // Distribute Sparks button
  html.querySelectorAll(".distribute-sparks-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const messageEl = btn.closest(".message");
      const messageId = messageEl?.dataset.messageId;
      const msg = game.messages.get(messageId);
      if (!msg) return;

      const actorId = btn.dataset.actorId;
      const actor = actorId ? game.actors.get(actorId) : null;

      if (actor && !actor.isOwner && !game.user.isGM) {
        ui.notifications.warn("Only the character's owner can distribute sparks.");
        return;
      }

      const sparkCount = parseInt(btn.dataset.sparkCount) || 1;
      const chosenSparks = await NonCombatSparkDialog.wait(sparkCount, { actor });
      if (!chosenSparks || chosenSparks.length === 0) return;

      const flags = foundry.utils.deepClone(msg.flags.trespasser || {});
      flags.chosenSparks = chosenSparks;

      const parser = new DOMParser();
      const doc = parser.parseFromString(msg.flavor || msg.content, "text/html");
      const btnEl = doc.querySelector(".distribute-sparks-btn");
      if (btnEl) {
        let sparkResults = `<div class="spark-results"><strong>${game.i18n.localize("TRESPASSER.Chat.Combat.SparksLabel")}</strong><ul>`;
        for (const spark of chosenSparks) {
          sparkResults += `<li><span style="color:var(--trp-spark);"><i class="fas fa-sun"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Spark" + spark.capitalize() + "Label")}</span></li>`;
        }
        sparkResults += `</ul></div>`;
        const tempDiv = doc.createElement("div");
        tempDiv.innerHTML = sparkResults;
        btnEl.replaceWith(tempDiv.firstChild);
      }

      const updates = {
        flavor: doc.body.innerHTML,
        "flags.trespasser": flags
      };

      if (game.user.isGM) {
        await msg.update(updates);
      } else {
        const { TrespasserSocket } = game.trespasser || {};
        TrespasserSocket?.emit("UPDATE_CHAT_MESSAGE", { messageId: msg.id, updates });
      }
    });
  });

  // Distribute Shadows button (GM only)
  html.querySelectorAll(".distribute-shadows-btn").forEach(btn => {
    if (!game.user.isGM) {
      btn.style.display = "none";
      return;
    }

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const messageEl = btn.closest(".message");
      const messageId = messageEl?.dataset.messageId;
      const msg = game.messages.get(messageId);
      if (!msg) return;

      const shadowCount = parseInt(btn.dataset.shadowCount) || 1;
      const chosenShadows = await NonCombatShadowDialog.wait(shadowCount);
      if (!chosenShadows || chosenShadows.length === 0) return;

      const flags = foundry.utils.deepClone(msg.flags.trespasser || {});
      const plightShadows = flags.plightShadows || [];
      const finalShadows = [...chosenShadows, ...plightShadows];
      flags.chosenShadows = finalShadows;

      const parser = new DOMParser();
      const doc = parser.parseFromString(msg.flavor || msg.content, "text/html");
      const btnEl = doc.querySelector(".distribute-shadows-btn");
      if (btnEl) {
        let shadowResults = `<div class="shadow-results"><strong>${game.i18n.localize("TRESPASSER.Chat.Combat.ShadowsLabel")}</strong><ul>`;
        for (const shadow of finalShadows) {
          shadowResults += `<li><span style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Shadow" + shadow.capitalize() + "Label")}</span></li>`;
        }
        shadowResults += `</ul></div>`;
        const tempDiv = doc.createElement("div");
        tempDiv.innerHTML = shadowResults;
        btnEl.replaceWith(tempDiv.firstChild);
      }

      await msg.update({
        flavor: doc.body.innerHTML,
        "flags.trespasser": flags
      });
    });
  });

  // Tempt Fate Button Event Listener
  html.querySelectorAll(".tempt-fate-btn").forEach(btn => {
    const skillKey = btn.dataset.skillKey;
    const actorId = btn.dataset.actorId;
    
    let activeChar = game.user.character;
    if (!activeChar) {
      const controlled = canvas.tokens?.controlled || [];
      const controlledChar = controlled.find(t => t.actor?.type === "character")?.actor;
      activeChar = controlledChar || game.actors.find(a => a.type === "character" && a.isOwner);
    }
    
    const isTrained = activeChar?.system?.skills?.[skillKey] === true;
    const canSee = game.user.isGM || isTrained;
    
    if (!canSee) {
      btn.style.display = "none";
    } else {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        let actingActor = activeChar;
        if (game.user.isGM) {
          const controlled = canvas.tokens?.controlled || [];
          const controlledChar = controlled.find(t => t.actor?.type === "character")?.actor;
          actingActor = controlledChar || game.actors.get(actorId);
        }
        
        if (!actingActor) return ui.notifications.warn("No active character found to Tempt Fate.");
        
        const messageId = btn.closest(".message")?.dataset.messageId;
        await game.trespasser.executeTemptFateFlow(actingActor, skillKey, parseInt(btn.dataset.cd), messageId);
      });
    }
  });
}
