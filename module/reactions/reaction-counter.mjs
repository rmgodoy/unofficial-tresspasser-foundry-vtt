import { canTakeReaction, consumeReaction } from "./reactions-tracking.mjs";

/**
 * Execute a Counter reaction for a defending actor.
 * Rolls N x weaponDie and deals damage to attacker.
 * @param {Actor} defenderActor
 * @param {Actor} attackerActor
 * @param {number} sparks
 * @param {string} weaponDie
 * @param {HTMLElement} [buttonElement]
 * @param {ChatMessage} [message=null]
 * @param {object} [options={}]
 * @returns {Promise<boolean>}
 */
export async function executeCounter(defenderActor, attackerActor, sparks, weaponDie = "d6", buttonElement = null, message = null, options = {}) {
  if (!defenderActor || !attackerActor || sparks <= 0) return false;

  const reactionCheck = canTakeReaction(defenderActor);
  if (!reactionCheck.allowed) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughFocusForReaction"));
    return false;
  }

  await consumeReaction(defenderActor);

  const formula = `${sparks}${weaponDie}`;
  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const targetTokenId = options.attackerTokenId || attackerActor.token?.id || null;
  if (attackerActor.isOwner) {
    await attackerActor.applyDamage(roll.total);
  } else {
    const { emitDeedActionAndWait } = await import("../helpers/socket/deed-socket-handler.mjs");
    await emitDeedActionAndWait("applyDamage", {
      actorId: attackerActor.id,
      tokenId: targetTokenId,
      damage: roll.total
    });
  }

  const rollHtml = await roll.render();
  const chatContent = `
    <div class="trespasser-chat-card reaction-result-card" style="border-left: 3px solid #ff5252; padding: 8px; background: rgba(0,0,0,0.4);">
      <h4 style="margin: 0 0 6px 0; color: #ff5252; font-size: var(--fs-13); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 3px;">
        ⚔️ ${game.i18n.localize("TRESPASSER.Chat.Combat.CounterReaction")}: ${defenderActor.name}
      </h4>
      <div style="font-size: var(--fs-12); margin-top: 4px; line-height: 1.4;">
        ${game.i18n.format("TRESPASSER.Chat.Combat.CounterResultDesc", {
          defender: defenderActor.name,
          attacker: attackerActor.name,
          formula: formula,
          damage: roll.total
        })}
      </div>
      <div style="margin-top: 6px;">
        ${rollHtml}
      </div>
    </div>
  `;

  await foundry.documents.BaseChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defenderActor }),
    content: chatContent
  });

  if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.classList.add("reaction-btn--used");
    buttonElement.innerHTML = `⚔️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Countered")} (${roll.total})`;
  }

  const chatMsg = message || game.messages.get(buttonElement?.closest(".message")?.dataset?.messageId);
  if (chatMsg) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(chatMsg.content, "text/html");
      const defTokenId = options.defenderTokenId;
      const btnInDoc = (defTokenId ? doc.querySelector(`.counter-reaction-btn[data-defender-token-id="${defTokenId}"]`) : null)
        || doc.querySelector(`.counter-reaction-btn[data-defender-id="${defenderActor.id}"]`);
      if (btnInDoc) {
        btnInDoc.setAttribute("disabled", "true");
        btnInDoc.classList.add("reaction-btn--used");
        btnInDoc.innerHTML = `⚔️ ${game.i18n.localize("TRESPASSER.Chat.Combat.Countered")} (${roll.total})`;
      }
      const updates = { content: doc.body.innerHTML };
      if (game.user.isGM) {
        await chatMsg.update(updates);
      } else {
        const { TrespasserSocket } = game.trespasser || {};
        TrespasserSocket?.emit("UPDATE_CHAT_MESSAGE", { messageId: chatMsg.id, updates });
      }
    } catch (err) {
      console.error("Failed to persist counter update to chat message:", err);
    }
  }

  return true;
}
