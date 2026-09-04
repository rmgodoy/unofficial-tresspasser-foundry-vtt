import { TrespasserCombat } from "../documents/combat.mjs";
import { buildTenacityButtonHtml } from "./tenacity-helper.mjs";

/**
 * ReactionsHelper — Manages reactions, focus tracking, blocking, and countering.
 */
export class ReactionsHelper {

  /**
   * Get the reaction count for an actor in the current combat round.
   * @param {Actor} actor
   * @param {Combat} [combat=game.combat]
   * @returns {number}
   */
  static getReactionCount(actor, combat = game.combat) {
    if (!actor) return 0;
    if (combat && combat.combatants) {
      const combatant = TrespasserCombat.getPhaseCombatant(actor, combat);
      if (combatant) {
        return combatant.getFlag("trespasser", "reactionCount") || 0;
      }
    }
    return 0;
  }

  /**
   * Determine if an actor can take a reaction (checking focus if count > 0).
   * 1st reaction of round: free (cost = 0).
   * 2nd+ reaction of round: costs 1 focus.
   * @param {Actor} actor
   * @param {Combat} [combat=game.combat]
   * @returns {{ allowed: boolean, cost: number, currentFocus: number }}
   */
  static canTakeReaction(actor, combat = game.combat) {
    if (!actor) return { allowed: false, cost: 0, currentFocus: 0 };

    // Creatures do not have focus. It is up to the GM to decide when they can or cannot use reactions,
    // so the focus limitation is only for actors that have focus (e.g. characters/commoners).
    const hasFocus = actor.type !== "creature" && actor.system?.combat?.focus !== undefined;
    if (!hasFocus) {
      return { allowed: true, cost: 0, currentFocus: 0 };
    }

    const count = ReactionsHelper.getReactionCount(actor, combat);
    const cost = count > 0 ? 1 : 0;
    const currentFocus = actor.system?.combat?.focus ?? 0;

    if (cost > 0 && currentFocus < cost) {
      return { allowed: false, cost, currentFocus };
    }
    return { allowed: true, cost, currentFocus };
  }

  /**
   * Consume reaction count and focus for an actor taking a reaction.
   * @param {Actor} actor
   * @param {Combat} [combat=game.combat]
   * @returns {Promise<boolean>}
   */
  static async consumeReaction(actor, combat = game.combat) {
    const check = ReactionsHelper.canTakeReaction(actor, combat);
    if (!check.allowed) return false;

    if (check.cost > 0 && actor.type !== "creature" && actor.system?.combat?.focus !== undefined) {
      const newFocus = Math.max(0, check.currentFocus - check.cost);
      await actor.update({ "system.combat.focus": newFocus });
    }

    if (combat && combat.combatants) {
      const combatant = TrespasserCombat.getPhaseCombatant(actor, combat);
      if (combatant) {
        const currentCount = combatant.getFlag("trespasser", "reactionCount") || 0;
        await combatant.setFlag("trespasser", "reactionCount", currentCount + 1);
      }
    }

    return true;
  }

  /**
   * Prompt user to choose which equipped armor piece to use for blocking.
   * @param {Actor} actor
   * @param {number} damage
   * @returns {Promise<Item|null>} Chosen armor item or null if cancelled
   */
  static async promptArmorChoice(actor, damage) {
    const available = actor.items.filter(i =>
      i.type === "armor" && i.system.equipped && !i.system.broken
    );

    if (available.length === 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoArmorDiceAvailable"));
      return null;
    }

    if (available.length === 1) {
      return available[0];
    }

    // Build radio options for DialogV2
    const optionsHtml = available.map((item, idx) => {
      const placementLabel = item.system.placement 
        ? game.i18n.localize(`TRESPASSER.Sheet.Character.Equipments.${item.system.placement.capitalize()}`) || item.system.placement
        : "";
      const die = item.system.armorDie || "d6";
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
   * Prompts for armor choice, rolls armor die, recovers HP directly, and marks armor die as lost.
   * Accurately accounts for hpBefore to prevent overhealing or invalid zero-clipping when damage drops HP below 0.
   * @param {Actor} actor
   * @param {number} damage
   * @param {number|null} [hpBefore=null]
   * @param {HTMLElement} [buttonElement]
   * @returns {Promise<boolean>}
   */
  static async executeBlock(actor, damage, hpBefore = null, buttonElement = null, message = null) {
    if (!actor) return false;

    // 1. Check if reaction allowed
    const reactionCheck = ReactionsHelper.canTakeReaction(actor);
    if (!reactionCheck.allowed) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughFocusForReaction"));
      return false;
    }

    // 2. Prompt user to choose armor
    const chosenArmor = await ReactionsHelper.promptArmorChoice(actor, damage);
    if (!chosenArmor) return false;

    // 3. Consume reaction / focus
    await ReactionsHelper.consumeReaction(actor);

    // 4. Mark armor as used/broken
    await chosenArmor.update({ 
      "system.broken": true 
    });

    const slot = chosenArmor.system.placement;
    if (slot && actor.system?.combat?.equipment_snapshot?.[slot]) {
      await actor.update({ [`system.combat.equipment_snapshot.${slot}.used`]: true });
    }

    if (Array.isArray(chosenArmor.system.effects) && chosenArmor.system.effects.length > 0) {
      await TrespasserEffectsHelper.applyEffectChat(chosenArmor.system.effects, actor, { title: chosenArmor.name });
    }

    // 5. Roll armor die
    const die = chosenArmor.system.armorDie || "d6";
    const roll = new foundry.dice.Roll(`1${die}`);
    await roll.evaluate();

    // 6. Calculate true net damage and new HP using hpBefore
    const prevented = Math.min(Number(damage) || 0, roll.total);
    const hasHpBefore = hpBefore !== null && !isNaN(hpBefore);
    const startingHP = hasHpBefore ? Number(hpBefore) : (actor.system.health ?? 0);
    const maxHP = actor.system.max_health ?? startingHP;
    const netDamage = Math.max(0, (Number(damage) || 0) - prevented);
    const rawFinalHP = hasHpBefore ? (startingHP - netDamage) : Math.clamp((actor.system.health ?? 0) + prevented, 0, maxHP);
    const finalHealth = Math.clamp(rawFinalHP, 0, maxHP);

    await actor.update({ "system.health": finalHealth }, { skipBelowZeroChat: true });

    // 7. Determine health outcome note
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

    // 8. Post Block Chat Message
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

    // 9. Disable button and update original card
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

  /**
   * Execute a Counter reaction for a defending actor.
   * Rolls N x weaponDie and deals damage to attacker.
   * @param {Actor} defenderActor
   * @param {Actor} attackerActor
   * @param {number} sparks
   * @param {string} weaponDie
   * @param {HTMLElement} [buttonElement]
   * @returns {Promise<boolean>}
   */
  static async executeCounter(defenderActor, attackerActor, sparks, weaponDie = "d6", buttonElement = null, message = null) {
    if (!defenderActor || !attackerActor || sparks <= 0) return false;

    // 1. Check if reaction allowed
    const reactionCheck = ReactionsHelper.canTakeReaction(defenderActor);
    if (!reactionCheck.allowed) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughFocusForReaction"));
      return false;
    }

    // 2. Consume reaction / focus
    await ReactionsHelper.consumeReaction(defenderActor);

    // 3. Roll counter damage formula: N<wd>
    const formula = `${sparks}${weaponDie}`;
    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    // 4. Apply damage to attacker
    if (attackerActor.isOwner) {
      await attackerActor.applyDamage(roll.total);
    } else {
      const { emitDeedActionAndWait } = await import("./socket/deed-socket-handler.mjs");
      await emitDeedActionAndWait("applyDamage", { actorId: attackerActor.id, damage: roll.total });
    }

    // 5. Post Counter Chat Message
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

    // 6. Disable button and persist update
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
        const btnInDoc = doc.querySelector(`.counter-reaction-btn[data-defender-id="${defenderActor.id}"]`);
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
      const targetActor = game.actors.get(targetActorId);
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
      const attackerId = btn.dataset.attackerId;
      const defenderActor = game.actors.get(defenderId);
      const attackerActor = game.actors.get(attackerId);

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
        const success = await ReactionsHelper.executeCounter(defenderActor, attackerActor, sparks, weaponDie, btn, message);
        if (!success) {
          btn.disabled = false;
        }
      });
    }
  }
}
