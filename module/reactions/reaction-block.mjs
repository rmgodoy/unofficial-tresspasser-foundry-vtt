import { canTakeReaction, consumeReaction } from "./reactions-tracking.mjs";
import { buildTenacityButtonHtml } from "../helpers/tenacity-helper.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Prompt user to choose which equipped armor piece to use for blocking.
 * @param {Actor} actor
 * @param {number} damage
 * @returns {Promise<Item|null>} Chosen armor item or null if cancelled
 */
export async function promptArmorChoice(actor, damage) {
  const available = actor.items.filter(i =>
    i.type === "armor" && i.system?.equipped && !i.system?.broken
  );

  if (available.length === 0) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoArmorDiceAvailable"));
    return null;
  }

  if (available.length === 1) {
    return available[0];
  }

  const optionsHtml = available.map((item, idx) => {
    const placementLabel = item.system?.placement 
      ? game.i18n.localize(`TRESPASSER.Sheet.Character.Equipments.${item.system.placement.capitalize()}`) || item.system.placement
      : "";
    const die = item.system?.armorDie || "d6";
    return `
      <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer; padding:6px; border:1px solid var(--trp-border-light, #5c4f3a); border-radius:4px; background:rgba(0,0,0,0.2);">
        <input type="radio" name="chosenArmor" value="${item.id}" ${idx === 0 ? "checked" : ""} />
        <img src="${item.img}" style="width:28px; height:28px; border:none;" />
        <div style="flex:1;">
          <strong>${item.name}</strong> <span style="font-size:var(--fs-10); color:var(--trp-text-dim, #a09070);">(${placementLabel})</span>
          <div style="font-size:var(--fs-11); color:var(--trp-gold-bright, #e8c96b);">Die: 1${die}</div>
        </div>
      </label>
    `;
  }).join("");

  const content = `
    <div class="trespasser-dialog" style="padding:5px;">
      <p style="margin-bottom:10px; font-size:var(--fs-12);">${game.i18n.format("TRESPASSER.Dialog.Combat.SelectArmorToBlock", { damage })}</p>
      ${optionsHtml}
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Chat.Combat.BlockReaction") },
    classes: ["trespasser", "dialog"],
    position: { width: 340 },
    content,
    buttons: [
      {
        action: "block",
        icon: "fas fa-shield-alt",
        label: game.i18n.localize("TRESPASSER.Global.Action.Accept"),
        default: true,
        callback: (event, button, dialog) => {
          const checked = dialog.element.querySelector('input[name="chosenArmor"]:checked');
          return checked ? checked.value : null;
        }
      },
      {
        action: "cancel",
        icon: "fas fa-times",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  if (!result) return null;
  return actor.items.get(result) || null;
}

/**
 * Execute a Block reaction for an actor.
 * @param {Actor} actor
 * @param {number} damage
 * @param {number|null} [hpBefore=null]
 * @param {HTMLElement} [buttonElement]
 * @param {ChatMessage} [message=null]
 * @returns {Promise<boolean>}
 */
export async function executeBlock(actor, damage, hpBefore = null, buttonElement = null, message = null) {
  if (!actor) return false;

  const reactionCheck = canTakeReaction(actor);
  if (!reactionCheck.allowed) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughFocusForReaction"));
    return false;
  }

  const chosenArmor = await promptArmorChoice(actor, damage);
  if (!chosenArmor) return false;

  await consumeReaction(actor);

  await chosenArmor.update({ 
    "system.broken": true 
  });

  const slot = chosenArmor.system?.placement;
  if (slot && actor.system?.combat?.equipment_snapshot?.[slot]) {
    await actor.update({ [`system.combat.equipment_snapshot.${slot}.used`]: true });
  }

  if (Array.isArray(chosenArmor.system?.effects) && chosenArmor.system.effects.length > 0) {
    await TrespasserEffectsHelper.applyEffectChat(chosenArmor.system.effects, actor, { title: chosenArmor.name });
  }

  const die = chosenArmor.system?.armorDie || "d6";
  const roll = new foundry.dice.Roll(`1${die}`);
  await roll.evaluate();

  const prevented = Math.min(Number(damage) || 0, roll.total);
  const hasHpBefore = hpBefore !== null && !isNaN(hpBefore);
  const startingHP = hasHpBefore ? Number(hpBefore) : (actor.system?.health ?? 0);
  const maxHP = actor.system?.max_health ?? startingHP;
  const netDamage = Math.max(0, (Number(damage) || 0) - prevented);
  const rawFinalHP = hasHpBefore ? (startingHP - netDamage) : Math.clamp((actor.system?.health ?? 0) + prevented, 0, maxHP);
  const finalHealth = Math.clamp(rawFinalHP, 0, maxHP);

  await actor.update({ "system.health": finalHealth }, { skipBelowZeroChat: true });

  let healthOutcomeHtml = "";
  if (rawFinalHP > 0) {
    healthOutcomeHtml = `
      <div style="color: var(--trp-green-bright, #4fc3f7); font-weight: bold; margin-top: 4px; font-size: var(--fs-12);">
        ❤️ ${actor.name}: ${finalHealth} / ${maxHP} HP
      </div>`;
  } else if (rawFinalHP === 0) {
    healthOutcomeHtml = `
      <div style="color: #ffb74d; font-weight: bold; margin-top: 4px; font-size: var(--fs-12);">
        ⚠️ ${actor.name}: 0 / ${maxHP} HP (${game.i18n.localize("TRESPASSER.Chat.Combat.Staggered") || "Staggered"})
      </div>`;
  } else if (actor.type === "character") {
    const belowZeroMsg = game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", {
      name: actor.name,
      hp: rawFinalHP
    });
    const tenacityBtn = buildTenacityButtonHtml(actor, rawFinalHP);
    healthOutcomeHtml = `
      <div style="margin-top: 6px; padding: 4px; background: rgba(0,0,0,0.3); border-radius: var(--trp-radius);">
        <div class="miss-text" style="font-weight: bold; font-size: var(--fs-11);">${belowZeroMsg}</div>
        ${tenacityBtn}
      </div>`;
  }

  const rollHtml = await roll.render();
  const chatContent = `
    <div class="trespasser-chat-card reaction-result-card" style="border-left: 3px solid var(--trp-gold, #c49d48); padding: 8px; background: rgba(0,0,0,0.4);">
      <h4 style="margin: 0 0 6px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-13); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 3px;">
        🛡️ ${game.i18n.localize("TRESPASSER.Chat.Combat.BlockReaction")}: ${actor.name}
      </h4>
      <div style="font-size: var(--fs-12); margin-top: 4px; line-height: 1.4;">
        ${game.i18n.format("TRESPASSER.Chat.Combat.BlockResultDesc", {
          actor: actor.name,
          item: chosenArmor.name,
          die: `1${die}`,
          roll: roll.total,
          prevented: prevented
        })}
      </div>
      ${healthOutcomeHtml}
      <div style="margin-top: 6px;">
        ${rollHtml}
      </div>
    </div>
  `;

  await foundry.documents.BaseChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: chatContent
  });

  if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.classList.add("reaction-btn--used");
    buttonElement.innerHTML = `🛡️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Blocked")} (-${prevented})`;
  }

  const chatMsg = message || game.messages.get(buttonElement?.closest(".message")?.dataset?.messageId);
  if (chatMsg) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(chatMsg.content, "text/html");
      const btnInDoc = doc.querySelector(`.block-reaction-btn[data-target-id="${actor.id}"]`);
      if (btnInDoc) {
        btnInDoc.setAttribute("disabled", "true");
        btnInDoc.classList.add("reaction-btn--used");
        btnInDoc.innerHTML = `🛡️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Blocked")} (-${prevented})`;
      }
      const parentRow = btnInDoc?.closest(".target-damage-row");
      const oldTenacity = parentRow?.querySelector(".target-below-zero");
      if (oldTenacity) {
        if (rawFinalHP >= 0) {
          oldTenacity.remove();
        } else {
          const newCd = 10 + Math.abs(rawFinalHP);
          const tenacityBtn = oldTenacity.querySelector(".roll-tenacity-btn");
          if (tenacityBtn) {
            tenacityBtn.setAttribute("data-cd", newCd);
            tenacityBtn.innerHTML = `<i class="fas fa-shield-heart" style="color: var(--trp-gold-bright, #e8c96b);"></i> ${game.i18n.localize("TRESPASSER.Chat.Combat.RollTenacity")} (CD ${newCd})`;
          }
          const textEl = oldTenacity.querySelector(".miss-text");
          if (textEl) {
            textEl.textContent = game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", {
              name: actor.name,
              hp: rawFinalHP
            });
          }
        }
      }
      const updates = { content: doc.body.innerHTML };
      if (game.user.isGM) {
        await chatMsg.update(updates);
      } else {
        const { TrespasserSocket } = game.trespasser || {};
        TrespasserSocket?.emit("UPDATE_CHAT_MESSAGE", { messageId: chatMsg.id, updates });
      }
    } catch (err) {
      console.error("Failed to persist block update to chat message:", err);
    }
  }

  return true;
}
