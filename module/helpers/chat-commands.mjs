import { isAtLeastV14, getRollMessageMode } from "./compat.mjs";

/**
 * Register chat commands for the Trespasser system.
 */
export function registerChatCommands() {
  const commandRgx = /^\/(?:hp|dmg|damage|heal)(?:\s+(.*))?$/i;

  const handleCommand = async function(command, match, chatData = {}, createOptions = {}) {
    const rawExpression = (Array.isArray(match) ? match[1] : (typeof match === "string" ? match : ""))?.trim() || "";
    if (!rawExpression) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
      return false;
    }

    try {
      const roll = new foundry.dice.Roll(rawExpression);
      await roll.evaluate();

      if (typeof roll.total !== "number" || isNaN(roll.total)) {
        throw new Error(`Invalid roll total for formula: ${rawExpression}`);
      }

      const applyDamageLabel = game.i18n.localize("TRESPASSER.Chat.Common.ApplyDamage");
      const healLabel = game.i18n.localize("TRESPASSER.Chat.Common.Heal");
      const title = game.i18n.localize("TRESPASSER.Chat.DamageCommand.Title");

      const flavor = `<div class="trespasser-chat-card damage-roll-card">
        <h3><i class="fas fa-heart-pulse"></i> ${title}</h3>
        <div class="trp-damage-actions" data-damage="${roll.total}" style="display:flex;gap:6px;margin-top:8px;">
          <button class="apply-damage-btn" data-damage="${roll.total}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
            <i class="fas fa-heart-broken"></i> ${applyDamageLabel}
          </button>
          <button class="heal-damage-btn" data-damage="${roll.total}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #27ae60;color:#2ecc71;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:var(--fs-11);">
            <i class="fas fa-heart"></i> ${healLabel}
          </button>
        </div>
      </div>`;

      const messageOptions = createOptions?.messageMode
        ? { messageMode: createOptions.messageMode }
        : getRollMessageMode(createOptions?.rollMode);

      await roll.toMessage({
        speaker: chatData?.speaker || ChatMessage.getSpeaker(),
        flavor
      }, messageOptions);
    } catch (err) {
      console.error("Trespasser | /hp command error:", err);
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
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
        rgx: commandRgx,
        fn: handleCommand
      };
    } else if (chatLogClass.MESSAGE_PATTERNS) {
      chatLogClass.MESSAGE_PATTERNS.damageRoll = commandRgx;
    }
  }

  // Also hook chatMessage as a fallback for older versions
  if (!isAtLeastV14()) {
    Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
      const match = messageText?.trim().match(commandRgx);
      if (!match) return true;
      handleCommand("damageRoll", match, chatData);
      return false;
    });
  }
}
