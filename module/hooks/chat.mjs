import { replaceDiceInElement } from "../helpers/dice-icon-helper.mjs";
import { ReactionsHelper } from "../helpers/reactions-helper.mjs";
import { registerTenacityChatListeners } from "../helpers/tenacity-helper.mjs";
import { bindCardActionListeners } from "./chat/card-actions.mjs";
import { bindGroupCheckChatListeners, promptGroupCheckRoll } from "./chat/group-check-chat.mjs";
import { handleDungeonRollButtonClick } from "../exploration/dungeon-actions.mjs";
import { TreasureGenerator } from "../helpers/treasure-generator.mjs";

/**
 * Register chat message creation and HTML rendering hooks.
 */
export function registerChatHooks() {
  // Auto-prompt players to roll when a group check message is created
  Hooks.on("createChatMessage", (message) => {
    const flags = message.flags?.trespasser?.groupCheck;
    if (!flags || flags.status !== "pending") return;
    setTimeout(() => promptGroupCheckRoll(message.id, true), 500);
  });

  // Render chat message HTML customizations and interaction handlers
  Hooks.on("renderChatMessageHTML", (message, html, data) => {
    const root = (html instanceof HTMLElement) ? html : (html[0] ?? html);

    replaceDiceInElement(root);
    ReactionsHelper.bindChatListeners(root, message);

    // Border and background styling based on speaker
    let borderColor = "#000000";
    const speaker = message.speaker;

    if (speaker.actor || speaker.token) {
      const actor = ChatMessage.getSpeakerActor(speaker);
      if (actor && actor.type === "character") {
        const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
        if (owners.length > 0) borderColor = owners[0].color;
      }
    }

    if (borderColor) {
      root.style.border = `2px solid ${borderColor}`;
      root.style.backgroundColor = "var(--trp-bg-dark)";
    }

    registerTenacityChatListeners(root);
    bindCardActionListeners(message, root);
    bindGroupCheckChatListeners(message, root);

    // Dungeon Action Roll buttons
    root.querySelectorAll(".dungeon-action-roll-btn").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await handleDungeonRollButtonClick(btn);
      });
    });

    // Treasure Create Item button
    root.querySelectorAll(".create-treasure-item-btn").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        try {
          const rawJson = btn.dataset.treasureJson;
          if (!rawJson) return;
          const treasureData = JSON.parse(decodeURIComponent(rawJson));
          await TreasureGenerator.createTreasureItem(treasureData);
          btn.disabled = true;
          btn.innerHTML = `<i class="fa-solid fa-check"></i> ${game.i18n.localize("TRESPASSER.Global.Action.Confirm") || "Created"}`;
        } catch (err) {
          console.error("Trespasser | Failed to create treasure item from chat card:", err);
        }
      });
    });

    // Hide GM-only sections and trap warnings in chat cards for non-GM users
    if (!game.user.isGM) {
      root.querySelectorAll(".gm-only-section, .gm-trap-warning").forEach(el => el.remove());
    }
  });
}
