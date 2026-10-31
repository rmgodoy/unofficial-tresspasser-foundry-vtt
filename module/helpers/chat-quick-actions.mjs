import { getRollMessageMode } from "./compat.mjs";

/**
 * Locate the active chat input element across sidebar, popouts, and floating notifications.
 * @param {HTMLElement} [container]
 * @returns {HTMLElement|null}
 */
export function findChatInputElement(container) {
  if (container instanceof HTMLElement) {
    if (container.id === "chat-message") return container;

    const direct = container.querySelector("#chat-message");
    if (direct) return direct;

    const notif = container.closest("#chat-notifications");
    if (notif) {
      const el = notif.querySelector("#chat-message");
      if (el) return el;
    }

    const form = container.closest(".chat-form") || container.closest("#chat-form");
    if (form) {
      const el = form.querySelector("#chat-message");
      if (el) return el;
    }

    const sibling = container.parentElement?.querySelector("#chat-message");
    if (sibling) return sibling;
  }

  // Floating notifications popup (used when viewing other sidebar tabs like Combat)
  const notifInput = document.querySelector("#chat-notifications #chat-message");
  if (notifInput) return notifInput;

  // Standard chat sidebar / popout input
  return document.querySelector("#chat-message");
}

/**
 * Extract the current string value from the active chat input element.
 * @param {HTMLElement} [container]
 * @returns {string}
 */
export function getChatInputValue(container) {
  const inputEl = findChatInputElement(container);
  if (!inputEl) return "";

  if (inputEl instanceof HTMLTextAreaElement || inputEl.tagName === "TEXTAREA") {
    return (inputEl.value || "").trim();
  }

  const pmEl = inputEl.querySelector?.(".ProseMirror") || (inputEl.classList?.contains("ProseMirror") ? inputEl : null);
  let text = "";
  if (pmEl && pmEl.innerText) {
    text = pmEl.innerText;
  } else if (typeof inputEl.value === "string" && inputEl.value) {
    const tmp = document.createElement("div");
    tmp.innerHTML = inputEl.value;
    text = tmp.textContent || tmp.innerText || "";
  } else if (inputEl.innerText) {
    text = inputEl.innerText;
  }

  return (text || "").replace(/\u00a0/g, " ").trim();
}

/**
 * Clear the chat message input box across ProseMirror and textarea formats.
 * @param {HTMLElement} [container]
 */
export function clearChatInput(container) {
  const el = findChatInputElement(container);
  if (!el) return;

  // 1. Textarea support (Foundry V13 / fallback)
  if (el instanceof HTMLTextAreaElement || el.tagName === "TEXTAREA") {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
    return;
  }

  // 2. ProseMirror support (Foundry V14 / V13 ProseMirror)
  let viewCleared = false;
  const pmEl = el.querySelector?.(".ProseMirror") || (el.classList?.contains("ProseMirror") ? el : null);
  if (pmEl) {
    let desc = pmEl.pmViewDesc;
    let view = null;
    while (desc) {
      if (desc.view) {
        view = desc.view;
        break;
      }
      desc = desc.parent;
    }

    if (view?.state?.doc) {
      try {
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size);
        view.dispatch(tr);
        view.focus();
        viewCleared = true;
      } catch (err) {
        console.warn("Trespasser | Failed to clear ProseMirror via view dispatch:", err);
      }
    }
  }

  if (!viewCleared && pmEl) {
    try {
      pmEl.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
    } catch {
      pmEl.innerHTML = "<p><br></p>";
    }
  }

  try {
    el.value = "";
  } catch {
    // Ignore value assignment errors on custom elements
  }

  if (ui.chat?.history) {
    ui.chat.history.pending = "";
  }
}

/**
 * Execute a damage/healing roll and post the card to chat with apply/heal buttons.
 * @param {string} rawExpression
 * @param {object} [options]
 * @param {object} [options.speaker]
 * @param {string} [options.messageMode]
 * @param {string} [options.rollMode]
 * @returns {Promise<ChatMessage>}
 */
export async function executeDamageRoll(rawExpression, { speaker, messageMode, rollMode } = {}) {
  const trimmed = rawExpression?.trim() || "";
  if (!trimmed) {
    throw new Error(game.i18n.localize("TRESPASSER.Chat.QuickActions.EmptyExpression"));
  }

  let formula = trimmed;
  let flavorTitle = "";
  if (formula.includes("#")) {
    const parts = formula.split("#");
    formula = parts[0].trim();
    flavorTitle = parts.slice(1).join("#").trim();
  }

  // Strip leading chat command prefix if present (e.g. /dmg, /heal, /damage, /hp)
  formula = formula.replace(/^\/(?:hp|dmg|damage|heal)\s*/i, "").trim();

  if (!formula) {
    throw new Error(game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
  }

  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  if (typeof roll.total !== "number" || isNaN(roll.total)) {
    throw new Error(game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
  }

  const applyDamageLabel = game.i18n.localize("TRESPASSER.Chat.Common.ApplyDamage");
  const healLabel = game.i18n.localize("TRESPASSER.Chat.Common.Heal");
  const baseTitle = game.i18n.localize("TRESPASSER.Chat.DamageCommand.Title");
  const title = flavorTitle ? `${baseTitle} — ${flavorTitle}` : baseTitle;

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

  const messageOptions = messageMode
    ? { messageMode }
    : getRollMessageMode(rollMode);

  return await roll.toMessage({
    speaker: speaker || ChatMessage.getSpeaker(),
    flavor
  }, messageOptions);
}

/**
 * Execute a simple dice roll and post to chat.
 * @param {string} rawExpression
 * @param {object} [options]
 * @param {object} [options.speaker]
 * @param {string} [options.messageMode]
 * @param {string} [options.rollMode]
 * @returns {Promise<ChatMessage>}
 */
export async function executeSimpleRoll(rawExpression, { speaker, messageMode, rollMode } = {}) {
  const trimmed = rawExpression?.trim() || "";
  if (!trimmed) {
    throw new Error(game.i18n.localize("TRESPASSER.Chat.QuickActions.EmptyExpression"));
  }

  let formula = trimmed;
  let flavor = "";
  if (formula.includes("#")) {
    const parts = formula.split("#");
    formula = parts[0].trim();
    flavor = parts.slice(1).join("#").trim();
  }

  // Strip leading roll command prefix if present (e.g. /r, /roll)
  formula = formula.replace(/^\/(?:r|roll)\s*/i, "").trim();

  if (!formula) {
    throw new Error(game.i18n.localize("TRESPASSER.Chat.QuickActions.EmptyExpression"));
  }

  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  if (typeof roll.total !== "number" || isNaN(roll.total)) {
    throw new Error(game.i18n.format("TRESPASSER.Chat.QuickActions.InvalidRoll", { error: formula }));
  }

  const messageOptions = messageMode
    ? { messageMode }
    : getRollMessageMode(rollMode);

  return await roll.toMessage({
    speaker: speaker || ChatMessage.getSpeaker(),
    flavor: flavor || undefined
  }, messageOptions);
}

/**
 * Create the DOM element containing the Damage/Heal and Roll buttons.
 * @param {HTMLElement} [parent]
 * @returns {HTMLElement}
 */
export function createQuickActionsElement(parent) {
  const container = document.createElement("div");
  container.className = "trespasser-chat-quick-actions";

  const damageLabel = game.i18n.localize("TRESPASSER.Chat.QuickActions.DamageHeal");
  const damageTooltip = game.i18n.localize("TRESPASSER.Chat.QuickActions.DamageHealTooltip");
  const rollLabel = game.i18n.localize("TRESPASSER.Chat.QuickActions.Roll");
  const rollTooltip = game.i18n.localize("TRESPASSER.Chat.QuickActions.RollTooltip");

  // Use data-quick-action instead of data-action so Foundry's _onClickNotification does not intercept it
  container.innerHTML = `
    <button type="button" class="quick-action-btn quick-damage-heal-btn" data-quick-action="damage-heal" data-tooltip="${damageTooltip}">
      <i class="fas fa-heart-pulse"></i>
      <span>${damageLabel}</span>
    </button>
    <button type="button" class="quick-action-btn quick-roll-btn" data-quick-action="roll" data-tooltip="${rollTooltip}">
      <i class="fas fa-dice-d20"></i>
      <span>${rollLabel}</span>
    </button>
  `;

  const damageBtn = container.querySelector(".quick-damage-heal-btn");
  damageBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const text = getChatInputValue(container);
    try {
      await executeDamageRoll(text);
      clearChatInput(container);
    } catch (err) {
      console.warn("Trespasser | Quick damage/heal roll failed:", err);
      ui.notifications.warn(err.message || game.i18n.localize("TRESPASSER.Chat.DamageCommand.InvalidFormula"));
    }
  });

  const rollBtn = container.querySelector(".quick-roll-btn");
  rollBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const text = getChatInputValue(container);
    try {
      await executeSimpleRoll(text);
      clearChatInput(container);
    } catch (err) {
      console.warn("Trespasser | Quick roll failed:", err);
      ui.notifications.warn(err.message || game.i18n.format("TRESPASSER.Chat.QuickActions.InvalidRoll", { error: text }));
    }
  });

  return container;
}

/**
 * Attach the quick action buttons across both the chat tab and floating notifications.
 * @param {HTMLElement|object} [context]
 */
export function attachChatQuickActions(context) {
  let root = document;
  if (context instanceof HTMLElement) {
    root = context;
  } else if (context?.[0] instanceof HTMLElement) {
    root = context[0];
  } else if (context?.element instanceof HTMLElement) {
    root = context.element;
  }

  // 1. Attach in sidebar chat form or popped out chat log
  const chatForm = root.querySelector(".chat-form") || root.querySelector("#chat-form") || document.querySelector(".chat-form") || document.querySelector("#chat-form");
  if (chatForm) {
    const chatControls = chatForm.querySelector("#chat-controls");
    let quickActions = chatForm.querySelector(":scope > .trespasser-chat-quick-actions");
    if (!quickActions) {
      quickActions = createQuickActionsElement(chatForm);
      if (chatControls) chatControls.insertAdjacentElement("beforebegin", quickActions);
      else chatForm.prepend(quickActions);
    } else if (chatControls && chatControls.previousElementSibling !== quickActions) {
      chatControls.insertAdjacentElement("beforebegin", quickActions);
    }
  }

  // 2. Attach in floating chat notifications overlay (used when on other tabs like Combat)
  const notifContainer = document.getElementById("chat-notifications");
  if (notifContainer) {
    let notifQuickActions = notifContainer.querySelector(":scope > .trespasser-chat-quick-actions");
    if (!notifQuickActions) {
      notifQuickActions = createQuickActionsElement(notifContainer);
      notifContainer.append(notifQuickActions);
    }
  }
}

/**
 * Register hooks to render chat quick action buttons in sidebar, popouts, and floating notifications.
 */
export function registerChatQuickActionsHooks() {
  Hooks.on("renderChatLog", (app, html) => {
    attachChatQuickActions(html);
  });

  Hooks.on("renderChatPopout", (app, html) => {
    attachChatQuickActions(html);
  });

  Hooks.on("renderChatInput", (chatLog, elements) => {
    attachChatQuickActions(elements);
  });

  Hooks.on("changeSidebarTab", () => {
    attachChatQuickActions();
  });
}
