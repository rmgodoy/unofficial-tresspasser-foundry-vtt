import { isAtLeastV14 } from "./compat.mjs";
import { TreasureGenerator } from "./treasure-generator.mjs";
import { executeDamageRoll } from "./chat-quick-actions.mjs";

/**
 * Register chat commands for the Trespasser system.
 */
export function registerChatCommands() {
  const damageCommandRgx = /^\/(?:hp|dmg|damage|heal)(?:\s+(.*))?$/i;
  const treasureCommandRgx = /^\/(?:treasure|tesouro)(?:\s+(\d+))?$/i;

  const handleDamageCommand = async function(command, match, chatData = {}, createOptions = {}) {
    const rawExpression = (Array.isArray(match) ? match[1] : (typeof match === "string" ? match : ""))?.trim() || "";
    if (!rawExpression) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
      return false;
    }

    try {
      await executeDamageRoll(rawExpression, {
        speaker: chatData?.speaker,
        ...createOptions
      });
    } catch (err) {
      console.error("Trespasser | /hp command error:", err);
      ui.notifications.warn(err.message || game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
    }

    return false;
  };

  const handleTreasureCommand = async function(command, match, chatData = {}, createOptions = {}) {
    const rawCount = (Array.isArray(match) ? match[1] : (typeof match === "string" ? match : ""))?.trim() || "1";
    const count = Math.max(1, Math.min(20, parseInt(rawCount) || 1));

    try {
      for (let i = 0; i < count; i++) {
        await TreasureGenerator.rollTreasure({
          displayChat: true,
          chatData,
          createOptions
        });
      }
    } catch (err) {
      console.error("Trespasser | /treasure command error:", err);
    }

    return false;
  };

  // Register in ChatLog.CHAT_COMMANDS without referencing deprecated globalThis.ChatLog
  const chatLogClass = foundry.applications?.sidebar?.tabs?.ChatLog
    || CONFIG.ui?.chat;

  if (chatLogClass) {
    if (isAtLeastV14() || chatLogClass.CHAT_COMMANDS) {
      chatLogClass.CHAT_COMMANDS = chatLogClass.CHAT_COMMANDS || {};
      chatLogClass.CHAT_COMMANDS.damageRoll = {
        rgx: damageCommandRgx,
        fn: handleDamageCommand
      };
      chatLogClass.CHAT_COMMANDS.treasureRoll = {
        rgx: treasureCommandRgx,
        fn: handleTreasureCommand
      };
    } else if (chatLogClass.MESSAGE_PATTERNS) {
      chatLogClass.MESSAGE_PATTERNS.damageRoll = damageCommandRgx;
      chatLogClass.MESSAGE_PATTERNS.treasureRoll = treasureCommandRgx;
    }
  }

  // Also hook chatMessage as a fallback for older versions
  if (!isAtLeastV14()) {
    Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
      const dmgMatch = messageText?.trim().match(damageCommandRgx);
      if (dmgMatch) {
        handleDamageCommand("damageRoll", dmgMatch, chatData);
        return false;
      }
      const trMatch = messageText?.trim().match(treasureCommandRgx);
      if (trMatch) {
        handleTreasureCommand("treasureRoll", trMatch, chatData);
        return false;
      }
      return true;
    });
  }
}
