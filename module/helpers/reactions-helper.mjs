/**
 * ReactionsHelper — Manages reactions, focus tracking, blocking, and countering.
 * Facade coordinating tracking, block reactions, and counter reactions.
 */

import {
  getReactionCount,
  canTakeReaction,
  consumeReaction
} from "../reactions/reactions-tracking.mjs";

import {
  promptArmorChoice,
  executeBlock
} from "../reactions/reaction-block.mjs";

import {
  executeCounter
} from "../reactions/reaction-counter.mjs";

export {
  getReactionCount,
  canTakeReaction,
  consumeReaction,
  promptArmorChoice,
  executeBlock,
  executeCounter
};

export class ReactionsHelper {
  static getReactionCount(actor, combat = game.combat) {
    return getReactionCount(actor, combat);
  }

  static canTakeReaction(actor, combat = game.combat) {
    return canTakeReaction(actor, combat);
  }

  static async consumeReaction(actor, combat = game.combat) {
    return consumeReaction(actor, combat);
  }

  static async promptArmorChoice(actor, damage) {
    return promptArmorChoice(actor, damage);
  }

  static async executeBlock(actor, damage, hpBefore = null, buttonElement = null, message = null) {
    return executeBlock(actor, damage, hpBefore, buttonElement, message);
  }

  static async executeCounter(defenderActor, attackerActor, sparks, weaponDie = "d6", buttonElement = null, message = null, options = {}) {
    return executeCounter(defenderActor, attackerActor, sparks, weaponDie, buttonElement, message, options);
  }

  /**
   * Bind click event listeners for reaction buttons in rendered chat message HTML.
   * @param {HTMLElement} htmlElement
   * @param {ChatMessage} message
   */
  static bindChatListeners(htmlElement, message) {
    if (!htmlElement) return;

    // ── Block Reaction Button ──
    const blockBtns = htmlElement.querySelectorAll('[data-action="block-reaction"]');
    for (const btn of blockBtns) {
      const targetActorId = btn.dataset.targetId;
      const targetTokenId = btn.dataset.tokenId;
      const targetToken = targetTokenId ? (canvas.tokens?.get(targetTokenId) || game.scenes?.current?.tokens.get(targetTokenId)) : null;
      const targetActor = targetToken?.actor || game.actors.get(targetActorId);
      if (!targetActor || !targetActor.isOwner) {
        btn.style.display = "none";
        continue;
      }

      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        btn.disabled = true;
        const damage = parseInt(btn.dataset.damage) || 0;
        const hpBefore = btn.dataset.hpBefore !== undefined ? parseInt(btn.dataset.hpBefore) : null;
        const success = await ReactionsHelper.executeBlock(targetActor, damage, hpBefore, btn, message);
        if (!success) {
          btn.disabled = false;
        }
      });
    }

    // ── Counter Reaction Button ──
    const counterBtns = htmlElement.querySelectorAll('[data-action="counter-reaction"]');
    for (const btn of counterBtns) {
      const defenderId = btn.dataset.defenderId;
      const defenderTokenId = btn.dataset.defenderTokenId;
      const attackerId = btn.dataset.attackerId;
      const attackerTokenId = btn.dataset.attackerTokenId;

      const defenderToken = defenderTokenId ? (canvas.tokens?.get(defenderTokenId) || game.scenes?.current?.tokens.get(defenderTokenId)) : null;
      const defenderActor = defenderToken?.actor || game.actors.get(defenderId);

      const attackerToken = attackerTokenId ? (canvas.tokens?.get(attackerTokenId) || game.scenes?.current?.tokens.get(attackerTokenId)) : null;
      const attackerActor = attackerToken?.actor || game.actors.get(attackerId);

      if (!defenderActor || !defenderActor.isOwner || !attackerActor) {
        btn.style.display = "none";
        continue;
      }

      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        btn.disabled = true;
        const sparks = parseInt(btn.dataset.sparks) || 0;
        const weaponDie = btn.dataset.weaponDie || "d6";
        const success = await ReactionsHelper.executeCounter(defenderActor, attackerActor, sparks, weaponDie, btn, message, {
          attackerTokenId: attackerToken?.id || attackerTokenId,
          defenderTokenId: defenderToken?.id || defenderTokenId
        });
        if (!success) {
          btn.disabled = false;
        }
      });
    }
  }
}
